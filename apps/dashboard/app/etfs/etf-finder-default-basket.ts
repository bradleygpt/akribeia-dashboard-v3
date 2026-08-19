import type { ResearchRow } from "../research-data";
import { scoreForModel } from "../research-filtering";

// Governing D4 rule (2026-08-18): the ETF Finder default basket is up to 25
// dynamically selected Growth Momentum securities currently rated Buy,
// Strong Buy, or Strong Buy+. Eligibility comes first, ranking second, and
// fewer than 25 qualifying names returns fewer than 25 — never lower-grade
// filler.
//
// Data-contract mapping: the written spec says "Growth Momentum screener";
// the active V2 data contract carries that screener as the Momentum Heavy
// preset (`byPreset.m_heavy`), whose rating strings are the exact literals
// asserted below. There is no separate "Growth Momentum" field.
export const GROWTH_MOMENTUM_MODEL = "m_heavy" as const;

export const ETF_FINDER_MAX_STOCKS = 25;

// Exact rating literals from the active data contract. Anything else —
// Hold, Sell, Strong Sell, or an unknown/unrecognized grade — is ineligible,
// so a contract drift fails closed to a smaller basket rather than admitting
// unreviewed names.
export const ETF_FINDER_ELIGIBLE_RATINGS: ReadonlySet<string> = new Set([
  "Buy",
  "Strong Buy",
  "Strong Buy+",
]);

export interface DefaultFinderBasket {
  tickers: string[];
  eligibleCount: number;
  stockUniverseCount: number;
  excludedByGrade: number;
}

export function defaultFinderBasket(rows: readonly ResearchRow[]): DefaultFinderBasket {
  const stocks = rows.filter(({ isEtf }) => !isEtf);
  const eligible = stocks
    .map((row) => {
      const score = scoreForModel(row, GROWTH_MOMENTUM_MODEL);
      return { ticker: row.ticker, composite: score.composite, rating: score.rating };
    })
    .filter(
      (candidate): candidate is { ticker: string; composite: number; rating: string } =>
        candidate.composite !== null && ETF_FINDER_ELIGIBLE_RATINGS.has(candidate.rating),
    )
    .toSorted(
      (left, right) => right.composite - left.composite || left.ticker.localeCompare(right.ticker),
    );

  return {
    tickers: eligible.slice(0, ETF_FINDER_MAX_STOCKS).map(({ ticker }) => ticker),
    eligibleCount: eligible.length,
    stockUniverseCount: stocks.length,
    excludedByGrade: stocks.length - eligible.length,
  };
}
