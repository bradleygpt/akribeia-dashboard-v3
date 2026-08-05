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

export interface EtfDirectoryRow {
  ticker: string;
  name: string;
  description: string;
  local: ResearchRow | null;
  reference: DirectoryEtfReference | null;
  lookthrough: DirectoryLookthroughReference | null;
}

export function buildEtfDirectory(
  rows: readonly ResearchRow[],
  references: Readonly<Record<string, DirectoryEtfReference>> = {},
  lookthrough: Readonly<Record<string, DirectoryLookthroughReference>> = {},
  descriptions: Readonly<Record<string, string>> = {},
): EtfDirectoryRow[] {
  const local = new Map(rows.map((row) => [row.ticker, row]));
  const tickers = new Set([
    ...local.keys(),
    ...Object.keys(references),
    ...Object.keys(lookthrough),
    ...Object.keys(descriptions),
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
