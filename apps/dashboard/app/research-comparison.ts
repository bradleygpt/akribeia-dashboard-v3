import type { ResearchRow } from "./research-data";

export const MAX_SECURITY_COMPARISON = 4;

export function normalizeComparisonTickers(
  values: readonly string[],
  rows: readonly ResearchRow[],
): string[] {
  const supported = new Set(rows.map(({ ticker }) => ticker));
  const normalized: string[] = [];
  for (const value of values) {
    const ticker = value.trim().toUpperCase();
    if (!ticker || normalized.includes(ticker) || !supported.has(ticker)) continue;
    normalized.push(ticker);
    if (normalized.length === MAX_SECURITY_COMPARISON) break;
  }
  return normalized;
}

export function toggleComparisonTicker(current: readonly string[], ticker: string): string[] {
  if (current.includes(ticker)) return current.filter((value) => value !== ticker);
  return current.length >= MAX_SECURITY_COMPARISON ? [...current] : [...current, ticker];
}

export function comparisonQuery(tickers: readonly string[], model: string): string {
  const parameters = new URLSearchParams();
  if (tickers.length > 0) parameters.set("compare", tickers.join(","));
  if (model !== "equal") parameters.set("model", model);
  return parameters.toString();
}
