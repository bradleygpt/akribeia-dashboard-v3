import { describe, expect, it } from "vitest";
import {
  holdingsSignals,
  holdingsSimilarity,
  weightedHoldingsOverlap,
} from "../../apps/dashboard/app/etfs/holdings-discovery";

describe("ETF holdings discovery", () => {
  const semis = [
    { ticker: "NVDA", weight: 0.4 },
    { ticker: "AMD", weight: 0.3 },
    { ticker: "AVGO", weight: 0.3 },
  ];
  const broad = [
    { ticker: "NVDA", weight: 0.05 },
    { ticker: "AMD", weight: 0.02 },
    { ticker: "MSFT", weight: 0.05 },
    { ticker: "AAPL", weight: 0.05 },
  ];

  it("uses the deterministic sum of shared minimum weights", () => {
    expect(weightedHoldingsOverlap(semis, broad)).toBeCloseTo(0.07);
  });

  it("distinguishes same-theme baskets by overlap and concentration", () => {
    const result = holdingsSimilarity(semis, broad);
    expect(result.sharedHoldings).toBe(2);
    expect(result.weightedOverlap).toBeCloseTo(0.07);
    expect(result.concentrationDifference).toBeGreaterThan(0.5);
    expect(result.distinctHoldingsPercentage).toBeGreaterThan(0.4);
  });

  it("emits descriptive concentration and freshness signals only", () => {
    expect(holdingsSignals(semis, "partial")).toEqual(
      expect.arrayContaining(["High stock exposure", "Concentrated basket", "Holdings partial"]),
    );
    expect(holdingsSignals([], "unavailable")).toEqual(["Holdings unavailable"]);
  });
});
