import type { ResearchAssetType, ResearchPreset, ResearchRow } from "./research-data";

export type ResearchSort =
  "score-desc" | "score-asc" | "market-cap-desc" | "valuation-asc" | "buy-point-asc" | "ticker-asc";

export interface ResearchFilters {
  query: string;
  assetType: ResearchAssetType;
  sector: string;
  rating: string;
  fairValue: string;
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

function descendingNullable(left: number | null, right: number | null): number {
  if (left === null && right === null) return 0;
  if (left === null) return 1;
  if (right === null) return -1;
  return right - left;
}

function ascendingNullable(left: number | null, right: number | null): number {
  if (left === null && right === null) return 0;
  if (left === null) return 1;
  if (right === null) return -1;
  return left - right;
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
      (filters.sector === "all" || row.sector === filters.sector) &&
      (filters.rating === "all" || modelScore.rating === filters.rating) &&
      (filters.fairValue === "all" ||
        (filters.fairValue === "discount"
          ? row.fairValuePremium !== null && row.fairValuePremium <= 0
          : row.fairValueVerdict === filters.fairValue)) &&
      (modelScore.composite === null || modelScore.composite >= filters.minimumScore) &&
      (row.marketCapB === null || row.marketCapB >= filters.minimumMarketCapB) &&
      (!filters.watchlistOnly || watchlist.has(row.ticker)) &&
      matchesResearchPreset(row, filters.preset)
    );
  });

  return result.toSorted((left, right) => {
    const leftScore = scoreForModel(left, filters.model).composite;
    const rightScore = scoreForModel(right, filters.model).composite;
    if (filters.sort === "score-asc") {
      return ascendingNullable(leftScore, rightScore) || left.ticker.localeCompare(right.ticker);
    }
    if (filters.sort === "market-cap-desc") {
      return (
        descendingNullable(left.marketCapB, right.marketCapB) ||
        left.ticker.localeCompare(right.ticker)
      );
    }
    if (filters.sort === "valuation-asc") {
      return (
        ascendingNullable(left.fairValuePremium, right.fairValuePremium) ||
        left.ticker.localeCompare(right.ticker)
      );
    }
    if (filters.sort === "buy-point-asc") {
      return (
        ascendingNullable(left.buyPointDistance, right.buyPointDistance) ||
        left.ticker.localeCompare(right.ticker)
      );
    }
    if (filters.sort === "ticker-asc") return left.ticker.localeCompare(right.ticker);
    return descendingNullable(leftScore, rightScore) || left.ticker.localeCompare(right.ticker);
  });
}
