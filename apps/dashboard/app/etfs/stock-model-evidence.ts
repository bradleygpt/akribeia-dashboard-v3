import type { ResearchRow } from "../research-data";

const REQUIRED_FACTOR_FAMILIES = [
  [
    "forwardPE",
    "trailingPE",
    "pegRatio",
    "priceToBook",
    "priceToSalesTrailing12Months",
    "enterpriseToEbitda",
    "enterpriseToRevenue",
  ],
  ["revenueGrowth", "earningsGrowth", "revenueQuarterlyGrowth", "earningsQuarterlyGrowth"],
  ["grossMargins", "operatingMargins", "profitMargins", "returnOnEquity", "returnOnAssets"],
  [
    "momentum_1m",
    "momentum_3m",
    "momentum_6m",
    "momentum_12m",
    "momentum_vs_sma50",
    "momentum_vs_sma200",
  ],
  ["analyst_mean_target_upside", "analyst_recommendation_score", "earnings_surprise_pct"],
] as const;

export function hasCompleteStockModelEvidence(row: Pick<ResearchRow, "raw" | "isEtf">): boolean {
  // The authoritative V2 ETF contract states that ETFs do not receive 5-pillar
  // stock-factor grades. Neutral values present in the generic scored shard are
  // therefore inapplicable, even if an ETF happens to populate several factors.
  if (row.isEtf) return false;
  return REQUIRED_FACTOR_FAMILIES.every((family) =>
    family.some((key) => {
      const value = row.raw[key];
      return typeof value === "number" && Number.isFinite(value);
    }),
  );
}
