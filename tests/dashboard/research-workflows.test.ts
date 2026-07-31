import { describe, expect, it } from "vitest";
import {
  buildSectorResearch,
  loadResearchUniverse,
  V2_SCREENER_CONFIG,
} from "../../apps/dashboard/app/research-data.js";
import {
  filterResearchRows,
  matchesResearchPreset,
  type ResearchFilters,
} from "../../apps/dashboard/app/research-filtering.js";
import { computeRiskMetrics, normalizeRadarAxes } from "../../apps/dashboard/app/research-risk.js";
import {
  comparisonQuery,
  normalizeComparisonTickers,
  toggleComparisonTicker,
} from "../../apps/dashboard/app/research-comparison.js";
import { handleQuoteApi } from "../../apps/dashboard/worker/quote-api.js";
import { handleResearchReferenceApi } from "../../apps/dashboard/worker/research-reference-api.js";

const baseFilters: ResearchFilters = {
  query: "",
  assetType: "all",
  sectors: [],
  ratings: [],
  fairValueVerdicts: [],
  underBuyPoint: false,
  metricRanges: {},
  minimumScore: 0,
  minimumMarketCapB: 0,
  preset: "all",
  model: "equal",
  watchlistOnly: false,
  sort: "score-desc",
};

describe("Wave 2 research universe", () => {
  it("retains the complete no-floor stock and ETF population", () => {
    const universe = loadResearchUniverse();
    expect(universe.total).toBe(1361);
    expect(universe.stocks).toBe(1291);
    expect(universe.etfs).toBe(70);
    expect(new Set(universe.rows.map(({ ticker }) => ticker)).size).toBe(1361);
  });

  it("applies advanced filters without mutating or narrowing the source", () => {
    const universe = loadResearchUniverse();
    const results = filterResearchRows(
      universe.rows,
      {
        ...baseFilters,
        query: "apple",
        assetType: "stock",
        sector: "Technology",
        minimumMarketCapB: 10,
      },
      new Set(),
    );
    expect(results.map(({ ticker }) => ticker)).toContain("AAPL");
    expect(universe.rows).toHaveLength(1361);
  });

  it("implements all named quick-screen predicates over preserved values", () => {
    const universe = loadResearchUniverse();
    for (const preset of ["conviction", "value", "quality", "momentum", "buyPoint"] as const) {
      const matching = universe.rows.filter((row) => matchesResearchPreset(row, preset));
      expect(matching.length, `${preset} should return a non-empty cohort`).toBeGreaterThan(0);
      expect(matching.every((row) => !row.isEtf)).toBe(true);
    }
  });

  it("reproduces every V2 metadata-defined preset with simultaneous filters", () => {
    const universe = loadResearchUniverse();
    expect(Object.keys(V2_SCREENER_CONFIG.preset_screens)).toHaveLength(9);
    for (const [name, preset] of Object.entries(V2_SCREENER_CONFIG.preset_screens)) {
      const matching = filterResearchRows(
        universe.rows.filter(({ isEtf }) => !isEtf),
        {
          ...baseFilters,
          ratings: preset.rating_filter,
          fairValueVerdicts: preset.fair_value_filter,
          metricRanges: preset.metric_filters,
        },
        new Set(),
      );
      expect(matching.length, `${name} should return a non-empty cohort`).toBeGreaterThan(0);
    }
  });

  it("preserves V2 range-filter null behavior and deterministic null-last sorting", () => {
    const universe = loadResearchUniverse();
    const filtered = filterResearchRows(
      universe.rows,
      {
        ...baseFilters,
        ratings: ["Strong Buy", "Buy"],
        metricRanges: { trailingPE: [1, 15], profitMargins: [5, 100] },
        sort: "valuation-asc",
      },
      new Set(),
    );
    expect(filtered.length).toBeGreaterThan(0);
    expect(
      filtered.every(
        (row) =>
          (["Strong Buy", "Buy"].includes(row.rating) &&
            (row.raw.trailingPE === null ||
              (row.raw.trailingPE >= 1 && row.raw.trailingPE <= 15))) ??
          false,
      ),
    ).toBe(true);
    const firstNull = filtered.findIndex(({ fairValuePremium }) => fairValuePremium === null);
    if (firstNull >= 0) {
      expect(
        filtered.slice(firstNull).every(({ fairValuePremium }) => fairValuePremium === null),
      ).toBe(true);
    }
  });

  it("reconciles sector membership to all 1,291 stocks", () => {
    const sectors = buildSectorResearch();
    expect(sectors.reduce((sum, sector) => sum + sector.count, 0)).toBe(1291);
    expect(sectors.every(({ averageScore }) => averageScore !== null)).toBe(true);
    expect(sectors.some(({ sector }) => sector === "Technology")).toBe(true);
  });
});

describe("V2-compatible security risk metrics", () => {
  it("fails closed when there are fewer than 30 valid closes", () => {
    expect(computeRiskMetrics(Array.from({ length: 29 }, (_, index) => 100 + index))).toBeNull();
  });

  it("normalizes the five authoritative axes to 0–1 with higher-is-better direction", () => {
    const axes = normalizeRadarAxes(
      ["Valuation", "Growth", "Profitability", "Momentum", "EPS Revisions"],
      {
        Valuation: 12,
        Growth: 6,
        Profitability: 0,
        Momentum: 15,
        "EPS Revisions": null,
      },
    );
    expect(axes.map(({ normalized }) => normalized)).toEqual([1, 0.5, 0, 1, null]);
    expect(axes.every(({ direction }) => direction === "higher-is-better")).toBe(true);
  });

  it("returns finite price-only metrics and an observed drawdown", () => {
    const closes = Array.from({ length: 260 }, (_, index) => {
      const trend = 100 * 1.0007 ** index;
      return trend * (1 + Math.sin(index / 8) * 0.018);
    });
    const metrics = computeRiskMetrics(closes);
    expect(metrics).not.toBeNull();
    expect(metrics?.volatilityPercent).toBeGreaterThan(0);
    expect(metrics?.maxDrawdownPercent).toBeGreaterThan(0);
    expect(Number.isFinite(metrics?.sharpe ?? Number.NaN)).toBe(true);
  });
});

describe("security comparison state", () => {
  it("preserves insertion order, prevents duplicates and enforces the four-name maximum", () => {
    const rows = loadResearchUniverse().rows;
    expect(
      normalizeComparisonTickers(
        [" aapl ", "MSFT", "AAPL", "NO_SUCH", "NVDA", "AMZN", "META"],
        rows,
      ),
    ).toEqual(["AAPL", "MSFT", "NVDA", "AMZN"]);
    expect(toggleComparisonTicker(["AAPL", "MSFT", "NVDA", "AMZN"], "META")).toEqual([
      "AAPL",
      "MSFT",
      "NVDA",
      "AMZN",
    ]);
    expect(toggleComparisonTicker(["AAPL", "MSFT"], "AAPL")).toEqual(["MSFT"]);
  });

  it("produces deterministic restorable comparison state", () => {
    expect(comparisonQuery(["MSFT", "AAPL"], "v_heavy")).toBe("compare=MSFT%2CAAPL&model=v_heavy");
    expect(comparisonQuery([], "equal")).toBe("");
  });
});

describe("Wave 2 bounded API adapters", () => {
  it("returns quote history, price and V2-compatible cache headers", async () => {
    const timestamps = Array.from({ length: 40 }, (_, index) => 1_700_000_000 + index * 86_400);
    const daily = {
      chart: {
        result: [
          {
            timestamp: timestamps,
            indicators: {
              quote: [
                {
                  close: timestamps.map((_, index) => 100 + index),
                  high: timestamps.map((_, index) => 101 + index),
                  low: timestamps.map((_, index) => 99 + index),
                  volume: timestamps.map(() => 1000),
                },
              ],
            },
            meta: {
              regularMarketPrice: 139,
              chartPreviousClose: 138,
              regularMarketDayHigh: 140,
              regularMarketDayLow: 137,
              regularMarketVolume: 123456,
            },
          },
        ],
      },
    };
    const intraday = {
      chart: {
        result: [
          {
            timestamp: [1_700_000_000, 1_700_000_060],
            indicators: {
              quote: [{ close: [138, 139], high: [139, 140], low: [137, 138], volume: [10, 20] }],
            },
            meta: {},
          },
        ],
      },
    };
    const fetcher: typeof fetch = async (input) =>
      new Response(JSON.stringify(String(input).includes("interval=1m") ? intraday : daily), {
        status: 200,
      });

    const response = await handleQuoteApi(
      new Request("https://akribeia.test/api/v3/quote?ticker=AAPL&range=1y"),
      { fetcher, now: new Date("2026-07-30T12:00:00Z") },
    );
    expect(response?.status).toBe(200);
    expect(response?.headers.get("cache-control")).toBe(
      "public, s-maxage=120, stale-while-revalidate=900",
    );
    const body = (await response?.json()) as {
      ok: boolean;
      ticker: string;
      price: number;
      history: { close: number[] };
    };
    expect(body.ok).toBe(true);
    expect(body.ticker).toBe("AAPL");
    expect(body.price).toBe(139);
    expect(body.history.close).toHaveLength(40);
  });

  it("rejects invalid tickers before reaching an upstream source", async () => {
    const response = await handleQuoteApi(
      new Request("https://akribeia.test/api/v3/quote?ticker=%3Cscript%3E"),
    );
    expect(response?.status).toBe(400);
  });

  it("proxies only allowlisted pinned V2 research datasets", async () => {
    const rejected = await handleResearchReferenceApi(
      new Request("https://akribeia.test/api/v3/research-reference?dataset=secrets"),
    );
    expect(rejected?.status).toBe(400);

    const accepted = await handleResearchReferenceApi(
      new Request("https://akribeia.test/api/v3/research-reference?dataset=risk-radar"),
      {
        fetcher: async () =>
          new Response(JSON.stringify({ risks: [], status: "fresh" }), { status: 200 }),
        now: new Date("2026-07-30T12:00:00Z"),
      },
    );
    expect(accepted?.status).toBe(200);
    const body = (await accepted?.json()) as {
      ok: boolean;
      source: { v2AppCommit: string };
    };
    expect(body.ok).toBe(true);
    expect(body.source.v2AppCommit).toBe("b477349a8691fdc5000641a6ae2893dbbfae2de6");
  });
});
