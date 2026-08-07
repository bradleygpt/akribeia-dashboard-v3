import type { ResearchRow } from "../research-data";

export interface DirectoryEtfReference {
  shortName?: string;
  totalAssets?: number | null;
  currentPrice?: number | null;
  momentum_1m?: number | null;
  momentum_3m?: number | null;
  momentum_12m?: number | null;
}

export interface DirectoryLookthroughReference {
  name?: string;
  price?: number | null;
  aum?: number | null;
  asset_class?: string;
}

export interface ExpandedEtfReference {
  ticker: string;
  fundName: string;
  issuer: string | null;
  assetClass: string;
  category: string | null;
  sector: string | null;
  industryOrTheme: string | null;
  strategyType: string | null;
  leverageInverse: boolean;
  activePassive: "active" | "passive" | null;
  singleStock: boolean;
  scoredStatus: "scored" | "reference-only";
  holdingsStatus: "complete" | "partial" | "unavailable";
  holdingsSource: string | null;
  holdingsAsOf: string | null;
  numberHoldings: number | null;
  top10Weight: number | null;
  top25Weight: number | null;
  largestHolding: string | null;
  largestHoldingWeight: number | null;
  dataFreshnessStatus: string;
  source: string;
  sourceAsOf: string;
  sourceRetrievedAt: string;
}

export interface EtfDirectoryRow {
  ticker: string;
  name: string;
  description: string;
  local: ResearchRow | null;
  reference: DirectoryEtfReference | null;
  lookthrough: DirectoryLookthroughReference | null;
  expanded: ExpandedEtfReference | null;
}

export function buildEtfDirectory(
  rows: readonly ResearchRow[],
  references: Readonly<Record<string, DirectoryEtfReference>> = {},
  lookthrough: Readonly<Record<string, DirectoryLookthroughReference>> = {},
  descriptions: Readonly<Record<string, string>> = {},
  expanded: Readonly<Record<string, ExpandedEtfReference>> = {},
): EtfDirectoryRow[] {
  const local = new Map(rows.map((row) => [row.ticker, row]));
  const tickers = new Set([
    ...local.keys(),
    ...Object.keys(references),
    ...Object.keys(lookthrough),
    ...Object.keys(descriptions),
    ...Object.keys(expanded),
  ]);

  return [...tickers]
    .map((ticker) => ({
      ticker,
      name:
        local.get(ticker)?.name ??
        lookthrough[ticker]?.name ??
        references[ticker]?.shortName ??
        ticker,
      description: descriptions[ticker] ?? "",
      local: local.get(ticker) ?? null,
      reference: references[ticker] ?? null,
      lookthrough: lookthrough[ticker] ?? null,
      expanded: expanded[ticker] ?? null,
    }))
    .toSorted((left, right) => left.ticker.localeCompare(right.ticker));
}

export function formatUsdMagnitude(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "Unavailable";
  const magnitude = Math.abs(value);
  if (magnitude >= 1_000_000_000_000) return `$${(value / 1_000_000_000_000).toFixed(2)}T`;
  if (magnitude >= 1_000_000_000) return `$${(value / 1_000_000_000).toFixed(1)}B`;
  if (magnitude >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (magnitude >= 1_000) return `$${(value / 1_000).toFixed(1)}K`;
  return `$${value.toFixed(0)}`;
}

export function formatEtfPercent(
  value: number | null,
  sourceUnit: "ratio" | "percentage-points",
  digits = 1,
): string {
  if (value === null || !Number.isFinite(value)) return "Unavailable";
  const percentage = sourceUnit === "ratio" ? value * 100 : value;
  return `${percentage > 0 ? "+" : ""}${percentage.toFixed(digits)}%`;
}
