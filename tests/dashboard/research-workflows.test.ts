import { describe, expect, it } from "vitest";
import {
  buildSectorResearch,
  loadResearchUniverse,
} from "../../apps/dashboard/app/research-data.js";
import {
  filterResearchRows,
  matchesResearchPreset,
  type ResearchFilters,
} from "../../apps/dashboard/app/research-filtering.js";
import { computeRiskMetrics } from "../../apps/dashboard/app/research-risk.js";
import { handleQuoteApi } from "../../apps/dashboard/worker/quote-api.js";
import { handleResearchReferenceApi } from "../../apps/dashboard/worker/research-reference-api.js";

const baseFilters: ResearchFilters = {
  query: "",
  assetType: "all",
  sector: "all",
  rating: "all",
  fairValue: "all",
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
