export interface IndexedHolding {
  etfTicker: string;
  weight: number;
  holdingRank: number;
}

export interface ExactIntersectionResult {
  etfTicker: string;
  matched: Array<{ ticker: string; weight: number; holdingRank: number }>;
  combinedWeight: number;
  minimumWeight: number;
  maximumWeight: number;
}

export interface NearIntersectionResult {
  etfTicker: string;
  matched: Array<{ ticker: string; weight: number; holdingRank: number }>;
  missing: string[];
}

export type InvertedHoldingsIndex = Readonly<Record<string, readonly IndexedHolding[]>>;

export function normalizeTicker(input: string): string {
  return input.trim().toUpperCase().replaceAll(".", "-");
}

export function exactIntersection(
  selectedTickers: readonly string[],
  index: InvertedHoldingsIndex,
): ExactIntersectionResult[] {
  const selected = [...new Set(selectedTickers.map(normalizeTicker).filter(Boolean))];
  if (selected.length === 0) return [];
  const byEtf = new Map<string, Map<string, IndexedHolding>>();
  for (const ticker of selected) {
    for (const holding of index[ticker] ?? []) {
      const holdings = byEtf.get(holding.etfTicker) ?? new Map<string, IndexedHolding>();
      holdings.set(ticker, holding);
      byEtf.set(holding.etfTicker, holdings);
    }
  }
  return [...byEtf.entries()]
    .filter(([, holdings]) => holdings.size === selected.length)
    .map(([etfTicker, holdings]) => {
      const matched = selected.map((ticker) => ({ ticker, ...holdings.get(ticker)! }));
      const weights = matched.map(({ weight }) => weight);
      return {
        etfTicker,
        matched,
        combinedWeight: weights.reduce((sum, weight) => sum + weight, 0),
        minimumWeight: Math.min(...weights),
        maximumWeight: Math.max(...weights),
      };
    })
    .toSorted(
      (left, right) =>
        right.minimumWeight - left.minimumWeight ||
        right.combinedWeight - left.combinedWeight ||
        left.etfTicker.localeCompare(right.etfTicker),
    );
}

export function nearIntersection(
  selectedTickers: readonly string[],
  index: InvertedHoldingsIndex,
): NearIntersectionResult[] {
  const selected = [...new Set(selectedTickers.map(normalizeTicker).filter(Boolean))];
  const byEtf = new Map<string, Map<string, IndexedHolding>>();
  for (const ticker of selected) {
    for (const holding of index[ticker] ?? []) {
      const holdings = byEtf.get(holding.etfTicker) ?? new Map<string, IndexedHolding>();
      holdings.set(ticker, holding);
      byEtf.set(holding.etfTicker, holdings);
    }
  }
  return [...byEtf.entries()]
    .filter(([, holdings]) => holdings.size > 0 && holdings.size < selected.length)
    .map(([etfTicker, holdings]) => ({
      etfTicker,
      matched: [...holdings.entries()].map(([ticker, holding]) => ({ ticker, ...holding })),
      missing: selected.filter((ticker) => !holdings.has(ticker)),
    }))
    .toSorted(
      (left, right) =>
        right.matched.length - left.matched.length || left.etfTicker.localeCompare(right.etfTicker),
    );
}
