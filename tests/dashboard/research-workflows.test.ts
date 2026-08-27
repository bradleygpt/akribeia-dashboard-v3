import { GOVERNED_TOTAL, GOVERNED_STOCKS, floor0Row } from "../observation-fixture";
import { describe, expect, it } from "vitest";
import {
  buildSectorResearch,
  loadResearchUniverse,
  V2_SCREENER_CONFIG,
} from "../../apps/dashboard/app/research-data.js";
import {
  filterResearchRows,
  matchesResearchPreset,
  scoreForModel,
  type ResearchFilters,
} from "../../apps/dashboard/app/research-filtering.js";
import { hasCompleteStockModelEvidence } from "../../apps/dashboard/app/etfs/stock-model-evidence.js";
import { computeRiskMetrics, normalizeRadarAxes } from "../../apps/dashboard/app/research-risk.js";
import {
  comparisonQuery,
  normalizeComparisonTickers,
  toggleComparisonTicker,
} from "../../apps/dashboard/app/research-comparison.js";
import { handleQuoteApi } from "../../apps/dashboard/worker/quote-api.js";
import { handleResearchReferenceApi } from "../../apps/dashboard/worker/research-reference-api.js";
import { handleSecurityReferenceApi } from "../../apps/dashboard/worker/security-reference-api.js";
import { parseSectorSort } from "../../apps/dashboard/app/sectors/sector-explorer.js";
import { resolveMetadataProtocol } from "../../apps/dashboard/app/metadata-origin.js";

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
  it("uses HTTP for loopback metadata assets without weakening forwarded HTTPS", () => {
    expect(resolveMetadataProtocol("127.0.0.1:8797", null)).toBe("http");
    expect(resolveMetadataProtocol("localhost:8797", null)).toBe("http");
    expect(resolveMetadataProtocol("akribeia.example", null)).toBe("https");
    expect(resolveMetadataProtocol("127.0.0.1:8797", "https")).toBe("https");
  });

  it("preserves hyphenated sector sort keys and their direction", () => {
    expect(parseSectorSort("market-cap-ascending")).toEqual(["market-cap", "ascending"]);
    expect(parseSectorSort("market-cap-descending")).toEqual(["market-cap", "descending"]);
    expect(parseSectorSort("score-descending")).toEqual(["score", "descending"]);
  });

  it("retains the complete no-floor stock and ETF population", () => {
    const universe = loadResearchUniverse();
    expect(universe.total).toBe(GOVERNED_TOTAL);
    expect(universe.stocks).toBe(GOVERNED_STOCKS);
    expect(universe.etfs).toBe(70);
    expect(new Set(universe.rows.map(({ ticker }) => ticker)).size).toBe(GOVERNED_TOTAL);
  });

  it("fails closed for SPY stock-model grades while preserving an evidenced equity", () => {
    const universe = loadResearchUniverse();
    const spy = universe.rows.find(({ ticker }) => ticker === "SPY");
    const aapl = universe.rows.find(({ ticker }) => ticker === "AAPL");

    expect(spy).toBeDefined();
    expect(spy?.raw.forwardPE).toBeNull();
    expect(spy?.raw.revenueGrowth).toBeNull();
    expect(spy?.raw.grossMargins).toBeNull();
    expect(typeof spy?.raw.momentum_1m).toBe("number");
    expect(spy?.raw.analyst_mean_target_upside).toBeNull();
    expect(spy?.grades.Valuation).toBe("B-");
    expect(hasCompleteStockModelEvidence(spy!)).toBe(false);
    expect(scoreForModel(spy!, "equal")).toEqual({
      composite: null,
      rating: "Not applicable (ETF)",
    });

    const aaplSource = floor0Row("AAPL");
    expect(aapl).toBeDefined();
    expect(aaplSource).toBeDefined();
    expect(aapl?.raw.forwardPE).toBe(aaplSource?.raw?.forwardPE);
    expect(aapl?.raw.revenueGrowth).toBe(aaplSource?.raw?.revenueGrowth);
    expect(aapl?.raw.grossMargins).toBe(aaplSource?.raw?.grossMargins);
    expect(aapl?.raw.momentum_1m).toBe(aaplSource?.raw?.momentum_1m);
    expect(aapl?.raw.analyst_mean_target_upside).toBe(aaplSource?.raw?.analyst_mean_target_upside);
    expect(hasCompleteStockModelEvidence(aapl!)).toBe(true);
    expect(scoreForModel(aapl!, "equal")).toEqual({
      composite: aaplSource?.byPreset?.equal?.c ?? null,
      rating: aaplSource?.byPreset?.equal?.r ?? null,
    });
  });

  it("sorts numeric values numerically, keeps nulls last, and stabilizes ties by ticker", () => {
    const universe = loadResearchUniverse();
    const byPrice = filterResearchRows(
      universe.rows,
      { ...baseFilters, sort: "price-asc" },
      new Set(),
    );
    const numericPrices = byPrice
      .map(({ price }) => price)
      .filter((price): price is number => price !== null);

    expect(numericPrices).toEqual(numericPrices.toSorted((left, right) => left - right));
    const firstNullPrice = byPrice.findIndex(({ price }) => price === null);
    expect(firstNullPrice === -1 ? byPrice.length : firstNullPrice).toBeGreaterThanOrEqual(
      numericPrices.length,
    );

    const aapl = universe.rows.find(({ ticker }) => ticker === "AAPL")!;
    const msft = universe.rows.find(({ ticker }) => ticker === "MSFT")!;
    const ties = filterResearchRows(
      [
        { ...aapl, ticker: "ZZZ", price: 100 },
        { ...msft, ticker: "AAA", price: 100 },
      ],
      { ...baseFilters, sort: "price-desc" },
      new Set(),
    );

    expect(ties.map(({ ticker }) => ticker)).toEqual(["AAA", "ZZZ"]);
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
    expect(universe.rows).toHaveLength(GOVERNED_TOTAL);
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

  it("reconciles sector membership to all 1,290 governed stocks", () => {
    const sectors = buildSectorResearch();
    expect(sectors.reduce((sum, sector) => sum + sector.count, 0)).toBe(GOVERNED_STOCKS);
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
              regularMarketTime: 1_700_000_000,
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
      priceSource: string;
      priceAsOf: string;
      history: { close: number[] };
    };
    expect(body.ok).toBe(true);
    expect(body.ticker).toBe("AAPL");
    expect(body.price).toBe(139);
    expect(body.priceSource).toBe("live");
    expect(body.priceAsOf).toBe("2023-11-14T22:13:20.000Z");
    expect(body.history.close).toHaveLength(40);
  });

  it("labels a daily-close quote fallback as as_of rather than live", async () => {
    const timestamp = 1_700_000_000;
    const daily = {
      chart: {
        result: [
          {
            timestamp: [timestamp],
            indicators: { quote: [{ close: [125], high: [126], low: [124], volume: [1000] }] },
            meta: {},
          },
        ],
      },
    };
    const response = await handleQuoteApi(
      new Request("https://akribeia.test/api/v3/quote?ticker=AAPL&range=1y"),
      {
        fetcher: async (input) =>
          new Response(
            JSON.stringify(
              String(input).includes("interval=1m") ? { chart: { result: [] } } : daily,
            ),
          ),
        now: new Date("2026-08-04T12:00:00Z"),
      },
    );
    const body = (await response?.json()) as {
      price: number;
      priceSource: string;
      priceAsOf: string;
    };
    expect(body.price).toBe(125);
    expect(body.priceSource).toBe("as_of");
    expect(body.priceAsOf).toBe("2023-11-14");
  });

  it("does not publish a daily close through the batched live-price overlay", async () => {
    const response = await handleQuoteApi(
      new Request("https://akribeia.test/api/v3/quotes?tickers=AAPL"),
      {
        fetcher: async () =>
          new Response(
            JSON.stringify({
              chart: {
                result: [
                  {
                    timestamp: [1_700_000_000],
                    indicators: { quote: [{ close: [125] }] },
                    meta: {},
                  },
                ],
              },
            }),
          ),
      },
    );
    const body = (await response?.json()) as {
      ok: boolean;
      requested: number;
      available: number;
      prices: Record<string, number>;
    };
    expect(response?.status).toBe(503);
    expect(body).toMatchObject({ ok: false, requested: 1, available: 0, prices: {} });
  });

  it("validates and proxies immutable per-security V2 shards", async () => {
    const invalid = await handleSecurityReferenceApi(
      new Request("https://akribeia.test/api/v3/security-reference?ticker=%2Fetc%2Fpasswd"),
    );
    expect(invalid?.status).toBe(400);

    const response = await handleSecurityReferenceApi(
      new Request("https://akribeia.test/api/v3/security-reference?ticker=aapl&kind=detail"),
      {
        fetcher: async (input) => {
          expect(String(input)).toContain(
            "akribeia-data@9f2d2322fc52847e435dbb6a83137712788f5b52/data/detail/floor0/AAPL.json",
          );
          return new Response(JSON.stringify({ pillar_detail: {} }), { status: 200 });
        },
        now: new Date("2026-07-30T12:00:00Z"),
      },
    );
    expect(response?.status).toBe(200);
    const body = (await response?.json()) as { ok: boolean; source: { bulkDataCommit: string } };
    expect(body.ok).toBe(true);
    expect(body.source.bulkDataCommit).toBe("9f2d2322fc52847e435dbb6a83137712788f5b52");

    const quarterly = await handleSecurityReferenceApi(
      new Request("https://akribeia.test/api/v3/security-reference?ticker=AAPL&kind=quarterly"),
      {
        fetcher: async (input) => {
          expect(String(input)).toContain(
            "raw.githubusercontent.com/bradleygpt/akribeia-data/9f2d2322fc52847e435dbb6a83137712788f5b52/data/quarterly.json",
          );
          return new Response(
            JSON.stringify({
              deep_generated_at: "2026-07-30",
              AAPL: [{ date: "2026-06-30", revenueGrowth: 0.1 }],
              MSFT: [{ date: "2026-06-30", revenueGrowth: 0.2 }],
            }),
          );
        },
      },
    );
    const quarterlyBody = (await quarterly?.json()) as {
      payload: { quarters: unknown[]; deepGeneratedAt: string };
    };
    expect(quarterlyBody.payload.quarters).toHaveLength(1);
    expect(quarterlyBody.payload.deepGeneratedAt).toBe("2026-07-30");

    const nonFiniteQuarterly = await handleSecurityReferenceApi(
      new Request("https://akribeia.test/api/v3/security-reference?ticker=AAPL&kind=quarterly"),
      {
        fetcher: async () =>
          new Response(
            '{"deep_generated_at":"2026-07-30","AAPL":[{"date":"2026-06-30","mcapB":NaN,"note":"NaN remains text"}]}',
          ),
      },
    );
    const nonFiniteBody = (await nonFiniteQuarterly?.json()) as {
      payload: { quarters: Array<{ mcapB: number | null; note: string }> };
      source: { nonFiniteTokensMappedToNull: number };
    };
    expect(nonFiniteBody.payload.quarters[0]).toMatchObject({
      mcapB: null,
      note: "NaN remains text",
    });
    expect(nonFiniteBody.source.nonFiniteTokensMappedToNull).toBe(1);
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
    expect(body.source.v2AppCommit).toBe("538ec29b41172d7b44c96e67a7346f96c41ebede");

    const indexCandidates = await handleResearchReferenceApi(
      new Request("https://akribeia.test/api/v3/research-reference?dataset=index-add-candidates"),
      {
        fetcher: async () =>
          new Response(JSON.stringify({ sp500_candidates: [], ndx_candidates: [] }), {
            status: 200,
          }),
      },
    );
    expect(indexCandidates?.status).toBe(200);

    for (const [dataset, filename] of [
      ["macro-forecasts", "macro_forecasts.json"],
      ["macro-rotation", "macro_rotation.json"],
      ["strategies-holdings-performance", "strategies_holdings_perf.json"],
      ["strategy-rationale", "strategy_rationale.json"],
    ] as const) {
      const response = await handleResearchReferenceApi(
        new Request(`https://akribeia.test/api/v3/research-reference?dataset=${dataset}`),
        {
          fetcher: async (input) => {
            expect(String(input)).toContain(
              `538ec29b41172d7b44c96e67a7346f96c41ebede/public/data/${filename}`,
            );
            return new Response(JSON.stringify({ generated_at: "2026-07-28" }));
          },
        },
      );
      expect(response?.status).toBe(200);
    }
  });
});
