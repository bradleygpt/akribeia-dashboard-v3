import { describe, expect, it } from "vitest";
import {
  computeFearGreed,
  computeMacroHealth,
  computeMarketBreadth,
  creditCalm,
  ismIsStale,
} from "../../apps/dashboard/app/market-health.js";
import type { UniverseDisplayRow } from "../../apps/dashboard/app/v2-universe.js";

function row(
  ticker: string,
  rating: string,
  above50Sma: number,
  above200Sma: number,
  momentum1m: number,
  momentum3m: number,
): UniverseDisplayRow {
  return {
    ticker,
    name: ticker,
    sector: "Technology",
    industry: "Software",
    marketCapB: 10,
    composite: 8,
    rating,
    isEtf: false,
    momentum1m,
    momentum3m,
    above50Sma,
    above200Sma,
  };
}

describe("V2 Market Health calculations", () => {
  it("preserves the V2 breadth weights and rating bands", () => {
    const breadth = computeMarketBreadth([
      row("A", "Strong Buy", 1, 1, 1, 1),
      row("B", "Buy", 1, -1, 1, -1),
      row("C", "Hold", -1, 1, 1, -1),
      row("D", "Sell", -1, -1, -1, -1),
    ]);

    expect(breadth).toEqual({
      pctAbove50Sma: 50,
      pctAbove200Sma: 50,
      pctPositive1m: 75,
      pctPositive3m: 25,
      buyPct: 50,
      sellPct: 25,
      breadthScore: 50,
    });
  });

  it("preserves the V2 Fear & Greed composition and thresholds", () => {
    const result = computeFearGreed(
      80,
      {
        pctAbove50Sma: 50,
        pctAbove200Sma: 50,
        pctPositive1m: 75,
        pctPositive3m: 25,
        buyPct: 50,
        sellPct: 25,
        breadthScore: 50,
      },
      -5,
      30,
    );

    expect(result.score).toBe(64.3);
    expect(result.classification).toBe("Greed");
  });

  it("preserves the V2 macro and credit formulas", () => {
    const macro = computeMacroHealth(
      {
        ism_composite: 53.9,
        unemployment_current: 4.2,
        gdp_latest_qoq_annualized: 2.4,
        cpi_current: 2.4,
      },
      0.45,
      2.87,
    );

    expect(creditCalm(2.87)).toBeCloseTo(94.82, 2);
    expect(macro?.score).toBe(74);
    expect(macro?.label).toBe("Moderate Growth");
    expect(macro?.components["Credit (HY OAS)"]).toBe(95);
  });

  it("retains the V2 ISM prior-month staleness rule", () => {
    const now = new Date("2026-07-30T12:00:00Z");

    expect(ismIsStale("2026-06", now)).toBe(false);
    expect(ismIsStale("2026-05", now)).toBe(true);
  });
});
