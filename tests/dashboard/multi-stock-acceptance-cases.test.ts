import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  exactIntersection,
  nearIntersection,
} from "../../apps/dashboard/app/etfs/multi-stock-intersection";

const artifact = JSON.parse(
  readFileSync(
    new URL("../../apps/dashboard/public/data/etf-holdings-normalized.json", import.meta.url),
    "utf8",
  ),
) as {
  invertedIndex: Record<string, Array<{ etfTicker: string; weight: number; holdingRank: number }>>;
};

const cases = [
  ["semiconductors", ["NVDA", "AMD"], ["NVDA", "AVGO"], ["NVDA", "AMD", "AVGO"]],
  ["software", ["MSFT", "ORCL"], ["MSFT", "AMZN"], ["MSFT", "AMZN", "GOOGL"]],
  ["banks", ["JPM", "BAC"], ["JPM", "BAC", "WFC"]],
  ["energy", ["XOM", "CVX"], ["XOM", "CVX", "COP"]],
  ["aerospace-defense", ["LMT", "RTX"], ["LMT", "RTX", "NOC"]],
  ["industrials", ["CAT", "DE"], ["CAT", "DE", "HON"]],
  ["utilities", ["NEE", "DUK"], ["NEE", "DUK", "SO"]],
  ["biotechnology", ["MRNA", "REGN"], ["MRNA", "REGN", "VRTX"]],
] as const;

describe("ETF multi-stock acceptance cases", () => {
  for (const [industry, ...baskets] of cases) {
    it(`${industry} never returns a false exact match`, () => {
      for (const basket of baskets) {
        const exact = exactIntersection(basket, artifact.invertedIndex);
        expect(exact.every((result) => result.matched.length === basket.length)).toBe(true);
        expect(
          exact.every((result) => result.matched.every(({ ticker }) => basket.includes(ticker))),
        ).toBe(true);
        const near = nearIntersection(basket, artifact.invertedIndex);
        expect(near.every((result) => result.matched.length < basket.length)).toBe(true);
      }
    });
  }
});
