export interface Holding {
  ticker: string;
  weight: number;
}

export interface HoldingsSimilarity {
  weightedOverlap: number;
  sharedHoldings: number;
  commonTop10: number;
  uniqueHoldings: number;
  distinctHoldingsPercentage: number;
  concentrationDifference: number;
}

function normalizedMap(holdings: readonly Holding[]): Map<string, number> {
  return new Map(
    holdings
      .filter(({ ticker, weight }) => ticker.length > 0 && Number.isFinite(weight) && weight >= 0)
      .map(({ ticker, weight }) => [ticker.trim().toUpperCase(), weight]),
  );
}

export function weightedHoldingsOverlap(
  left: readonly Holding[],
  right: readonly Holding[],
): number {
  const a = normalizedMap(left);
  const b = normalizedMap(right);
  let overlap = 0;
  for (const [ticker, weight] of a) overlap += Math.min(weight, b.get(ticker) ?? 0);
  return overlap;
}

export function holdingsSimilarity(
  left: readonly Holding[],
  right: readonly Holding[],
): HoldingsSimilarity {
  const a = normalizedMap(left);
  const b = normalizedMap(right);
  const shared = [...a.keys()].filter((ticker) => b.has(ticker));
  const union = new Set([...a.keys(), ...b.keys()]);
  const top10 = (items: readonly Holding[]) =>
    new Set(
      [...items]
        .filter(({ ticker, weight }) => ticker && Number.isFinite(weight))
        .toSorted((x, y) => y.weight - x.weight || x.ticker.localeCompare(y.ticker))
        .slice(0, 10)
        .map(({ ticker }) => ticker.trim().toUpperCase()),
    );
  const commonTop10 = [...top10(left)].filter((ticker) => top10(right).has(ticker)).length;
  const top = (items: readonly Holding[]) =>
    [...items]
      .filter(({ weight }) => Number.isFinite(weight) && weight >= 0)
      .toSorted((x, y) => y.weight - x.weight)
      .slice(0, 10)
      .reduce((sum, item) => sum + item.weight, 0);
  return {
    weightedOverlap: weightedHoldingsOverlap(left, right),
    sharedHoldings: shared.length,
    commonTop10,
    uniqueHoldings: union.size - shared.length,
    distinctHoldingsPercentage: union.size === 0 ? 0 : (union.size - shared.length) / union.size,
    concentrationDifference: Math.abs(top(left) - top(right)),
  };
}

export function holdingsSignals(
  holdings: readonly Holding[],
  status: "complete" | "partial" | "unavailable",
): string[] {
  if (status === "unavailable") return ["Holdings unavailable"];
  const valid = holdings.filter(({ weight }) => Number.isFinite(weight) && weight >= 0);
  if (valid.length === 0)
    return [status === "partial" ? "Holdings partial" : "Holdings unavailable"];
  const largest = Math.max(...valid.map(({ weight }) => weight));
  const top10 = valid
    .toSorted((left, right) => right.weight - left.weight)
    .slice(0, 10)
    .reduce((sum, item) => sum + item.weight, 0);
  const signals: string[] = [];
  if (largest >= 0.25) signals.push("High stock exposure", "Single-stock dominance risk");
  if (top10 >= 0.65) signals.push("Concentrated basket");
  if (valid.length >= 50 && top10 < 0.35) signals.push("Broad diversified exposure");
  if (valid.length >= 20 && largest <= 0.1) signals.push("Equal-weight exposure");
  if (status === "partial") signals.push("Holdings partial");
  return signals.length > 0 ? signals : ["Reference holdings"];
}
