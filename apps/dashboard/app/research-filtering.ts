import {
  V2_SCREENER_CONFIG,
  type ResearchAssetType,
  type ResearchPreset,
  type ResearchRow,
} from "./research-data";
import { hasCompleteStockModelEvidence } from "./etfs/stock-model-evidence";

export type ResearchSort =
  | "score-desc"
  | "score-asc"
  | "ticker-desc"
  | "ticker-asc"
  | "sector-desc"
  | "sector-asc"
  | "rating-desc"
  | "rating-asc"
  | "price-desc"
  | "price-asc"
  | "fair-value-desc"
  | "fair-value-asc"
  | "valuation-desc"
  | "valuation-asc"
  | "buy-point-price-desc"
  | "buy-point-price-asc"
  | "buy-point-desc"
  | "buy-point-asc"
  | "pillar-valuation-desc"
  | "pillar-valuation-asc"
  | "pillar-growth-desc"
  | "pillar-growth-asc"
  | "pillar-profitability-desc"
  | "pillar-profitability-asc"
  | "pillar-momentum-desc"
  | "pillar-momentum-asc"
  | "pillar-eps-desc"
  | "pillar-eps-asc"
  | "market-cap-desc"
  | "market-cap-asc";

export interface ResearchFilters {
  query: string;
  assetType: ResearchAssetType;
  sectors: string[];
  ratings: string[];
  fairValueVerdicts: string[];
  underBuyPoint: boolean;
  metricRanges: Record<string, [number, number]>;
  minimumScore: number;
  minimumMarketCapB: number;
  preset: ResearchPreset;
  model: string;
  watchlistOnly: boolean;
  sort: ResearchSort;
}

export function scoreForModel(
  row: ResearchRow,
  model: string,
): { composite: number | null; rating: string } {
  if (row.isEtf && !hasCompleteStockModelEvidence(row)) {
    return { composite: null, rating: "Not applicable (ETF)" };
  }

  return row.presets[model] ?? { composite: row.composite, rating: row.rating };
}

export function matchesResearchPreset(row: ResearchRow, preset: ResearchPreset): boolean {
  if (preset === "all") return true;
  if (row.isEtf) return false;
  if (preset === "conviction") {
    return (
      row.composite !== null &&
      row.composite >= 8 &&
      ["Strong Buy+", "Strong Buy", "Buy"].includes(row.rating)
    );
  }
  if (preset === "value") {
    return (
      row.fairValuePremium !== null &&
      row.fairValuePremium <= 0 &&
      (row.pillars.Valuation ?? Number.NEGATIVE_INFINITY) >= 7
    );
  }
  if (preset === "quality") {
    return (
      (row.pillars.Profitability ?? Number.NEGATIVE_INFINITY) >= 7 &&
      (row.pillars.Growth ?? Number.NEGATIVE_INFINITY) >= 7
    );
  }
  if (preset === "momentum") {
    return (
      (row.raw.momentum_3m ?? Number.NEGATIVE_INFINITY) > 0 &&
      (row.pillars.Momentum ?? Number.NEGATIVE_INFINITY) >= 8
    );
  }
  return row.buyPointDistance !== null && row.buyPointDistance <= 0;
}

export function metricValue(row: ResearchRow, key: string): number | null {
  if (key === "marketCapB") return row.marketCapB;
  if (key === "currentPrice") return row.price;
  return row.raw[key] ?? null;
}

const percentageMetrics = new Set(
  Object.values(V2_SCREENER_CONFIG.filterable_metrics)
    .flat()
    .filter(({ type }) => type === "pct_range")
    .map(({ key }) => key),
);

function compareNullable(
  left: number | string | null,
  right: number | string | null,
  direction: "asc" | "desc",
): number {
  if (left === null && right === null) return 0;
  if (left === null) return 1;
  if (right === null) return -1;
  const comparison =
    typeof left === "number" && typeof right === "number"
      ? left - right
      : String(left).localeCompare(String(right), "en-US", { sensitivity: "base" });
  return direction === "asc" ? comparison : -comparison;
}

function sortableValue(row: ResearchRow, column: string, model: string): number | string | null {
  switch (column) {
    case "score":
      return scoreForModel(row, model).composite;
    case "ticker":
      return row.ticker;
    case "sector":
      return row.isEtf ? "ETF" : row.sector;
    case "rating":
      return scoreForModel(row, model).rating;
    case "price":
      return row.price;
    case "fair-value":
      return row.fairValue;
    case "valuation":
      return row.fairValuePremium;
    case "buy-point-price":
      return row.buyPoint;
    case "buy-point":
      return row.buyPointDistance;
    case "pillar-valuation":
      return row.pillars.Valuation ?? null;
    case "pillar-growth":
      return row.pillars.Growth ?? null;
    case "pillar-profitability":
      return row.pillars.Profitability ?? null;
    case "pillar-momentum":
      return row.pillars.Momentum ?? null;
    case "pillar-eps":
      return row.pillars["EPS Revisions"] ?? null;
    case "market-cap":
      return row.marketCapB;
    default:
      return null;
  }
}

export function filterResearchRows(
  rows: readonly ResearchRow[],
  filters: ResearchFilters,
  watchlist: ReadonlySet<string>,
): ResearchRow[] {
  const query = filters.query.trim().toLocaleLowerCase("en-US");
  const result = rows.filter((row) => {
    const modelScore = scoreForModel(row, filters.model);
    return (
      (query.length === 0 ||
        row.ticker.toLocaleLowerCase("en-US").includes(query) ||
        row.name.toLocaleLowerCase("en-US").includes(query) ||
        row.industry.toLocaleLowerCase("en-US").includes(query)) &&
      (filters.assetType === "all" || (filters.assetType === "etf" ? row.isEtf : !row.isEtf)) &&
      (filters.sectors.length === 0 || filters.sectors.includes(row.sector)) &&
      (filters.ratings.length === 0 || filters.ratings.includes(modelScore.rating)) &&
      (filters.fairValueVerdicts.length === 0 ||
        (row.fairValueVerdict !== null &&
          filters.fairValueVerdicts.includes(row.fairValueVerdict))) &&
      (!filters.underBuyPoint ||
        (row.price !== null && row.buyPoint !== null && row.price <= row.buyPoint)) &&
      Object.entries(filters.metricRanges).every(([key, [displayMinimum, displayMaximum]]) => {
        const value = metricValue(row, key);
        if (value === null) return true;
        const divisor = percentageMetrics.has(key) ? 100 : 1;
        return value >= displayMinimum / divisor && value <= displayMaximum / divisor;
      }) &&
      (modelScore.composite === null || modelScore.composite >= filters.minimumScore) &&
      (row.marketCapB === null || row.marketCapB >= filters.minimumMarketCapB) &&
      (!filters.watchlistOnly || watchlist.has(row.ticker)) &&
      matchesResearchPreset(row, filters.preset)
    );
  });

  const separator = filters.sort.lastIndexOf("-");
  const column = filters.sort.slice(0, separator);
  const direction = filters.sort.slice(separator + 1) as "asc" | "desc";

  return result.toSorted(
    (left, right) =>
      compareNullable(
        sortableValue(left, column, filters.model),
        sortableValue(right, column, filters.model),
        direction,
      ) || left.ticker.localeCompare(right.ticker),
  );
}
