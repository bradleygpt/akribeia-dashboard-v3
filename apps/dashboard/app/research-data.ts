import preservedUniverse from "../../../data/reference/v2-baseline/fixtures/universe_floor0.json";
import preservedMeta from "../../../data/reference/v2-baseline/fixtures/meta.json";
import { V2_UNIVERSE_EXPECTED, validateV2UniversePayload } from "./v2-universe";

export const RESEARCH_PRESETS = {
  all: {
    label: "All securities",
    description: "The complete preserved V2 no-floor universe.",
  },
  conviction: {
    label: "High conviction",
    description: "Buy-tier stocks with an equal-weight composite of 8.0 or higher.",
  },
  value: {
    label: "Value",
    description: "Stocks at or below fair value with a valuation pillar score of 7.0 or higher.",
  },
  quality: {
    label: "Quality compounders",
    description: "Profitability and growth pillar scores of 7.0 or higher.",
  },
  momentum: {
    label: "Momentum",
    description: "Positive three-month momentum with a momentum pillar score of 8.0 or higher.",
  },
  buyPoint: {
    label: "At / below buy point",
    description: "Stocks whose preserved price is at or below the quantitative buy point.",
  },
} as const;

export type ResearchPreset = keyof typeof RESEARCH_PRESETS;
export type ResearchAssetType = "all" | "stock" | "etf";

export interface ScreenerMetric {
  key: string;
  name: string;
  type: "range" | "pct_range";
  default_min: number;
  default_max: number;
  step: number;
}

export interface ScreenerPreset {
  description: string;
  rating_filter: string[];
  fair_value_filter: string[];
  metric_filters: Record<string, [number, number]>;
  sort_by: string;
}

interface PreservedScreenerConfig {
  filterable_metrics: Record<string, ScreenerMetric[]>;
  preset_screens: Record<string, ScreenerPreset>;
}

export const V2_SCREENER_CONFIG = preservedMeta.screener as PreservedScreenerConfig;
export const V2_SCREENER_METRICS = Object.entries(V2_SCREENER_CONFIG.filterable_metrics).flatMap(
  ([category, metrics]) => metrics.map((metric) => ({ category, metric })),
);

export interface ResearchPresetScore {
  composite: number | null;
  rating: string;
}

export interface ResearchRow {
  ticker: string;
  name: string;
  sector: string;
  industry: string;
  isEtf: boolean;
  marketCapB: number | null;
  price: number | null;
  fairValue: number | null;
  fairValueVerdict: string | null;
  fairValuePremium: number | null;
  buyPoint: number | null;
  buyPointDistance: number | null;
  buyPointSignal: string | null;
  composite: number | null;
  rating: string;
  pillars: Record<string, number | null>;
  grades: Record<string, string>;
  raw: Record<string, number | null>;
  presets: Record<string, ResearchPresetScore>;
}

export interface ResearchUniverse {
  rows: ResearchRow[];
  sectors: string[];
  total: number;
  stocks: number;
  etfs: number;
  source: typeof V2_UNIVERSE_EXPECTED;
}

interface SourceCell {
  c?: number | null;
  r?: string | null;
}

interface SourceRow {
  ticker: string;
  name: string | null;
  sector: string | null;
  industry: string | null;
  marketCapB: number | null;
  price?: number | null;
  fv?: number | null;
  qbp?: number | null;
  fvVerdict?: string | null;
  fvPremium?: number | null;
  qbpDistance?: number | null;
  qbpSignal?: string | null;
  pillars?: Record<string, number | null>;
  grades?: Record<string, string>;
  raw: Record<string, number | null>;
  byPreset: Record<string, SourceCell>;
}

function mapRow(row: SourceRow): ResearchRow {
  const equal = row.byPreset.equal;
  return {
    ticker: row.ticker,
    name: row.name ?? row.ticker,
    sector: row.sector?.trim() || "Unclassified",
    industry: row.industry?.trim() || "Unclassified",
    isEtf: row.sector === "ETF",
    marketCapB: row.marketCapB,
    price: row.price ?? null,
    fairValue: row.fv ?? null,
    fairValueVerdict: row.fvVerdict ?? null,
    fairValuePremium: row.fvPremium ?? null,
    buyPoint: row.qbp ?? null,
    buyPointDistance: row.qbpDistance ?? null,
    buyPointSignal: row.qbpSignal ?? null,
    composite: equal?.c ?? null,
    rating: equal?.r ?? "Unavailable",
    pillars: row.pillars ?? {},
    grades: row.grades ?? {},
    raw: row.raw,
    presets: Object.fromEntries(
      Object.entries(row.byPreset).map(([key, cell]) => [
        key,
        {
          composite: cell.c ?? null,
          rating: cell.r ?? "Unavailable",
        },
      ]),
    ),
  };
}

let cachedUniverse: ResearchUniverse | undefined;

export function loadResearchUniverse(): ResearchUniverse {
  if (cachedUniverse !== undefined) return cachedUniverse;
  const payload = validateV2UniversePayload(preservedUniverse, V2_UNIVERSE_EXPECTED);
  const rows = (payload.rows as unknown as SourceRow[]).map(mapRow);
  cachedUniverse = {
    rows,
    sectors: [...new Set(rows.filter(({ isEtf }) => !isEtf).map(({ sector }) => sector))].sort(
      (left, right) => left.localeCompare(right),
    ),
    total: payload.meta.n_total,
    stocks: payload.meta.n_stocks,
    etfs: payload.meta.n_etf,
    source: V2_UNIVERSE_EXPECTED,
  };
  return cachedUniverse;
}

export function getResearchSecurity(ticker: string): ResearchRow | null {
  const normalized = ticker.trim().toUpperCase();
  return loadResearchUniverse().rows.find((row) => row.ticker === normalized) ?? null;
}

export interface SectorResearch {
  sector: string;
  count: number;
  totalMarketCapB: number;
  averageScore: number | null;
  medianScore: number | null;
  scoreDispersion: number | null;
  buyTierPercent: number;
  aggregatePe: number | null;
  best: ResearchRow | null;
  weakest: ResearchRow | null;
  pillarScores: Record<string, number | null>;
  ratingCounts: Record<string, number>;
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const ordered = values.toSorted((left, right) => left - right);
  const middle = Math.floor(ordered.length / 2);
  return ordered.length % 2 === 0
    ? ((ordered[middle - 1] ?? 0) + (ordered[middle] ?? 0)) / 2
    : (ordered[middle] ?? null);
}

function standardDeviation(values: number[]): number | null {
  if (values.length < 2) return null;
  const average = values.reduce((sum, value) => sum + value, 0) / values.length;
  return Math.sqrt(
    values.reduce((sum, value) => sum + (value - average) ** 2, 0) / (values.length - 1),
  );
}

export function buildSectorResearch(rows = loadResearchUniverse().rows): SectorResearch[] {
  const groups = new Map<string, ResearchRow[]>();
  for (const row of rows) {
    if (row.isEtf) continue;
    const group = groups.get(row.sector) ?? [];
    group.push(row);
    groups.set(row.sector, group);
  }

  return [...groups.entries()]
    .map(([sector, members]) => {
      const ranked = members
        .filter((row) => row.composite !== null)
        .toSorted((left, right) => (right.composite ?? 0) - (left.composite ?? 0));
      const scores = ranked.map((row) => row.composite as number);
      const totalMarketCapB = members.reduce((sum, row) => sum + (row.marketCapB ?? 0), 0);
      const estimatedEarnings = members.reduce((sum, row) => {
        const pe = row.raw.trailingPE;
        return pe !== null && pe !== undefined && pe > 0 && row.marketCapB !== null
          ? sum + row.marketCapB / pe
          : sum;
      }, 0);
      const ratingCounts = Object.fromEntries(
        ["Strong Buy+", "Strong Buy", "Buy", "Hold", "Sell", "Strong Sell", "Unavailable"].map(
          (rating) => [rating, members.filter((row) => row.rating === rating).length],
        ),
      );
      const buyTier =
        (ratingCounts["Strong Buy+"] ?? 0) +
        (ratingCounts["Strong Buy"] ?? 0) +
        (ratingCounts.Buy ?? 0);
      const pillarScores = Object.fromEntries(
        ["Valuation", "Growth", "Profitability", "Momentum", "EPS Revisions"].map((pillar) => {
          const values = members
            .map((row) => row.pillars[pillar])
            .filter((value): value is number => value !== null && value !== undefined);
          return [
            pillar,
            values.length === 0
              ? null
              : values.reduce((sum, value) => sum + value, 0) / values.length,
          ];
        }),
      );

      return {
        sector,
        count: members.length,
        totalMarketCapB,
        averageScore:
          scores.length === 0
            ? null
            : scores.reduce((sum, score) => sum + score, 0) / scores.length,
        medianScore: median(scores),
        scoreDispersion: standardDeviation(scores),
        buyTierPercent: members.length === 0 ? 0 : (buyTier / members.length) * 100,
        aggregatePe: estimatedEarnings > 0 ? totalMarketCapB / estimatedEarnings : null,
        best: ranked[0] ?? null,
        weakest: ranked.at(-1) ?? null,
        pillarScores,
        ratingCounts,
      };
    })
    .toSorted(
      (left, right) =>
        (right.averageScore ?? Number.NEGATIVE_INFINITY) -
        (left.averageScore ?? Number.NEGATIVE_INFINITY),
    );
}
