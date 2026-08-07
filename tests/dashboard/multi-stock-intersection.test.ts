import { describe, expect, it } from "vitest";
import {
  exactIntersection,
  nearIntersection,
} from "../../apps/dashboard/app/etfs/multi-stock-intersection";

describe("strict ETF multi-stock intersection", () => {
  const index = {
    NVDA: [
      { etfTicker: "SOXX", weight: 0.08, holdingRank: 1 },
      { etfTicker: "SMH", weight: 0.1, holdingRank: 1 },
    ],
    AMD: [
      { etfTicker: "SOXX", weight: 0.04, holdingRank: 4 },
      { etfTicker: "SMH", weight: 0.06, holdingRank: 3 },
    ],
    AVGO: [{ etfTicker: "SMH", weight: 0.05, holdingRank: 2 }],
  };

  it("returns only ETFs containing every selected ticker", () => {
    const results = exactIntersection(["nvda", "AMD"], index);
    expect(results.map((result) => result.etfTicker)).toEqual(["SMH", "SOXX"]);
    expect(results.every((result) => result.matched.length === 2)).toBe(true);
  });

  it("never presents an OR match as exact", () => {
    expect(exactIntersection(["NVDA", "AMD", "AVGO"], index)).toEqual([
      {
        etfTicker: "SMH",
        matched: [
          { ticker: "NVDA", etfTicker: "SMH", weight: 0.1, holdingRank: 1 },
          { ticker: "AMD", etfTicker: "SMH", weight: 0.06, holdingRank: 3 },
          { ticker: "AVGO", etfTicker: "SMH", weight: 0.05, holdingRank: 2 },
        ],
        combinedWeight: 0.21000000000000002,
        minimumWeight: 0.05,
        maximumWeight: 0.1,
      },
    ]);
  });

  it("keeps 2-of-3 results in a separate near-match set", () => {
    const near = nearIntersection(["NVDA", "AMD", "AVGO"], index);
    expect(near).toHaveLength(1);
    expect(near[0]?.etfTicker).toBe("SOXX");
    expect(near[0]?.missing).toEqual(["AVGO"]);
  });
});
