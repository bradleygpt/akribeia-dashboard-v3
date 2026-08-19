import { describe, expect, it } from "vitest";
import {
  ETF_FINDER_ELIGIBLE_RATINGS,
  ETF_FINDER_MAX_STOCKS,
  GROWTH_MOMENTUM_MODEL,
  defaultFinderBasket,
} from "../../apps/dashboard/app/etfs/etf-finder-default-basket";
import { loadResearchUniverse } from "../../apps/dashboard/app/research-data";
import type { ResearchRow } from "../../apps/dashboard/app/research-data";

function stock(ticker: string, composite: number | null, rating: string): ResearchRow {
  return {
    ticker,
    name: ticker,
    sector: "Technology",
    industry: "Test",
    isEtf: false,
    marketCapB: 10,
    price: 100,
    fairValue: null,
    fairValueVerdict: null,
    fairValuePremium: null,
    buyPoint: null,
    buyPointDistance: null,
    buyPointSignal: null,
    composite: null,
    rating: "Hold",
    pillars: {},
    grades: {},
    raw: {},
    presets: {
      [GROWTH_MOMENTUM_MODEL]: { composite, rating },
    },
  };
}

function etf(ticker: string): ResearchRow {
  return { ...stock(ticker, 9.9, "Strong Buy+"), isEtf: true, sector: "ETF" };
}

describe("D4 governing rule: eligibility first, ranking second, capacity 25", () => {
  it("admits exactly Buy, Strong Buy, and Strong Buy+ and fails closed on everything else", () => {
    const rows = [
      stock("BUY", 5, "Buy"),
      stock("SBUY", 6, "Strong Buy"),
      stock("SBUYP", 7, "Strong Buy+"),
      stock("HOLD", 9.9, "Hold"),
      stock("SELL", 9.8, "Sell"),
      stock("SSELL", 9.7, "Strong Sell"),
      stock("WEIRD", 9.6, "BUY"), // wrong case = unrecognized grade
      stock("UNKNOWN", 9.5, "Speculative"),
      stock("NOSCORE", null, "Buy"),
    ];
    const basket = defaultFinderBasket(rows);
    expect(basket.tickers).toEqual(["SBUYP", "SBUY", "BUY"]);
    expect(basket.eligibleCount).toBe(3);
    expect(basket.stockUniverseCount).toBe(9);
    expect(basket.excludedByGrade).toBe(6);
  });

  it("caps at exactly 25 when more than 25 qualify and keeps composite-desc order", () => {
    const rows = Array.from({ length: 40 }, (_, index) =>
      stock(`E${String(index).padStart(2, "0")}`, 100 - index, "Buy"),
    );
    const basket = defaultFinderBasket(rows);
    expect(basket.tickers).toHaveLength(25);
    expect(basket.eligibleCount).toBe(40);
    expect(basket.tickers[0]).toBe("E00");
    expect(basket.tickers[24]).toBe("E24");
  });

  it("returns exactly 25 when exactly 25 qualify", () => {
    const rows = Array.from({ length: 25 }, (_, index) =>
      stock(`Q${String(index).padStart(2, "0")}`, 50 - index, "Strong Buy"),
    ).concat(Array.from({ length: 10 }, (_, index) => stock(`H${index}`, 99, "Hold")));
    const basket = defaultFinderBasket(rows);
    expect(basket.tickers).toHaveLength(25);
    expect(basket.eligibleCount).toBe(25);
  });

  it("returns fewer than 25 without lower-grade filler when fewer qualify", () => {
    const rows = [
      stock("A", 9, "Strong Buy+"),
      stock("B", 8, "Buy"),
      stock("C", 7, "Strong Buy"),
      stock("HOLD1", 9.9, "Hold"),
      stock("HOLD2", 9.8, "Hold"),
    ];
    const basket = defaultFinderBasket(rows);
    expect(basket.tickers).toEqual(["A", "B", "C"]);
    expect(basket.tickers).toHaveLength(3);
    expect(basket.tickers).not.toContain("HOLD1");
  });

  it("returns an honest empty basket when zero names qualify", () => {
    const rows = [stock("H1", 9, "Hold"), stock("S1", 8, "Sell"), etf("SPY")];
    const basket = defaultFinderBasket(rows);
    expect(basket.tickers).toEqual([]);
    expect(basket.eligibleCount).toBe(0);
    expect(basket.stockUniverseCount).toBe(2);
  });

  it("preserves the intended ranking: filtering never reorders eligible names", () => {
    const eligibleOnly = [stock("X1", 9, "Buy"), stock("X2", 8, "Buy"), stock("X3", 7, "Buy")];
    const withIneligible = [
      stock("HOLDTOP", 10, "Hold"),
      eligibleOnly[1],
      stock("SELLMID", 8.5, "Sell"),
      eligibleOnly[0],
      eligibleOnly[2],
    ];
    expect(defaultFinderBasket(withIneligible).tickers).toEqual(
      defaultFinderBasket(eligibleOnly).tickers,
    );
  });

  it("is dynamic and deterministic: same rows → same basket, changed rows → changed basket", () => {
    const rows = [stock("AAA", 5, "Buy"), stock("BBB", 6, "Strong Buy")];
    expect(defaultFinderBasket(rows)).toEqual(defaultFinderBasket(rows));
    const changed = [...rows, stock("CCC", 9, "Strong Buy+")];
    expect(defaultFinderBasket(changed).tickers[0]).toBe("CCC");
    expect(defaultFinderBasket(rows).tickers).not.toContain("CCC");
  });

  it("excludes ETFs from the stock basket", () => {
    const basket = defaultFinderBasket([etf("SPY"), stock("OK", 5, "Buy")]);
    expect(basket.tickers).toEqual(["OK"]);
    expect(basket.stockUniverseCount).toBe(1);
  });
});

describe("D4 against the live governed universe", () => {
  const universe = loadResearchUniverse();
  const basket = defaultFinderBasket(universe.rows);

  it("derives the current basket from the governed screener with no hard-coded tickers", () => {
    expect(basket.stockUniverseCount).toBe(1290);
    expect(basket.eligibleCount).toBeGreaterThan(0);
    expect(basket.tickers.length).toBe(Math.min(basket.eligibleCount, ETF_FINDER_MAX_STOCKS));
    expect(basket.tickers.length).toBeLessThanOrEqual(25);
    // Every basket member genuinely carries an eligible Growth Momentum grade.
    const byTicker = new Map(universe.rows.map((row) => [row.ticker, row]));
    for (const ticker of basket.tickers) {
      const row = byTicker.get(ticker);
      expect(row?.isEtf).toBe(false);
      const rating = row?.presets[GROWTH_MOMENTUM_MODEL]?.rating ?? row?.rating;
      expect(ETF_FINDER_ELIGIBLE_RATINGS.has(rating ?? "")).toBe(true);
    }
  });

  it("can never contain the excluded MCW identity", () => {
    expect(basket.tickers).not.toContain("MCW");
    // Defense in depth: even a stale row set with an eligible-looking MCW row
    // cannot enter through the governed loader, which excludes it upstream.
    expect(universe.rows.some(({ ticker }) => ticker === "MCW")).toBe(false);
  });

  it("counts excluded-by-grade names honestly", () => {
    expect(basket.excludedByGrade).toBe(basket.stockUniverseCount - basket.eligibleCount);
    expect(basket.excludedByGrade).toBeGreaterThan(1000);
  });
});
