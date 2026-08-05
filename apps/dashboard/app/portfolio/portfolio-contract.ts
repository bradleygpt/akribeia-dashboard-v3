import type { ResearchRow } from "../research-data";

export const PORTFOLIO_STORAGE_KEY = "qd_holdings";
export const PORTFOLIO_SOURCE_COMMIT = "b477349a8691fdc5000641a6ae2893dbbfae2de6";

export interface Holding {
  ticker: string;
  shares: number;
  cost_basis: number | null;
}

export interface PortfolioPosition extends Holding {
  name: string;
  isEtf: boolean;
  sector: string;
  price: number | null;
  priceSource: "as_of" | "unavailable";
  marketValue: number | null;
  gainPercent: number | null;
  weight: number | null;
  composite: number | null;
  rating: string;
  marketCapB: number | null;
  momentum: {
    m1: number | null;
    m3: number | null;
    m6: number | null;
    m12: number | null;
  };
}

export interface PortfolioAnalysis {
  totalValue: number;
  positions: PortfolioPosition[];
  unavailableTickers: string[];
  weightedComposite: number | null;
  concentrationHhi: number;
  concentrationLabel: "Diversified" | "Moderate" | "Concentrated";
}

function finitePositive(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

export function normalizeHolding(value: unknown): Holding | null {
  if (typeof value !== "object" || value === null) return null;
  const candidate = value as Record<string, unknown>;
  const ticker = typeof candidate.ticker === "string" ? candidate.ticker.trim().toUpperCase() : "";
  const shares = candidate.shares;
  const costBasis = candidate.cost_basis;
  if (!/^[A-Z0-9][A-Z0-9.-]{0,14}$/.test(ticker) || !finitePositive(shares)) return null;
  return {
    ticker,
    shares,
    cost_basis: finitePositive(costBasis) ? costBasis : null,
  };
}

export function parseStoredHoldings(raw: string | null): {
  holdings: Holding[];
  error: string | null;
} {
  if (raw === null || raw.trim() === "") return { holdings: [], error: null };
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed))
      return { holdings: [], error: "Saved portfolio is not a holdings array." };
    const holdings = parsed.map(normalizeHolding).filter((item): item is Holding => item !== null);
    if (holdings.length !== parsed.length) {
      return { holdings, error: "Invalid saved rows were ignored; valid rows remain available." };
    }
    return { holdings, error: null };
  } catch {
    return { holdings: [], error: "Saved portfolio is corrupt and was not loaded or overwritten." };
  }
}

function splitCsvLine(line: string): string[] {
  return line.split(",").map((value) => value.trim().replace(/^"|"$/g, ""));
}

export function parseHoldingsCsv(text: string): Holding[] {
  const lines = text.split(/\r?\n/).filter((line) => line.trim());
  if (lines.length < 2) return [];
  const header = splitCsvLine(lines[0] ?? "").map((value) => value.toLowerCase());
  const find = (...keys: string[]) =>
    header.findIndex((value) => keys.some((key) => value.includes(key)));
  const tickerIndex = find("symbol", "ticker");
  const sharesIndex = find("quantity", "shares");
  const costIndex = find("cost basis per share", "average cost", "cost basis");
  if (tickerIndex < 0 || sharesIndex < 0) return [];
  return lines.slice(1).flatMap((line) => {
    const cells = splitCsvLine(line);
    const ticker = (cells[tickerIndex] ?? "").toUpperCase().replace(/[^A-Z0-9.-]/g, "");
    const shares = Number.parseFloat((cells[sharesIndex] ?? "").replace(/[^0-9.-]/g, ""));
    const cost =
      costIndex < 0
        ? Number.NaN
        : Number.parseFloat((cells[costIndex] ?? "").replace(/[^0-9.-]/g, ""));
    const holding = normalizeHolding({ ticker, shares, cost_basis: cost });
    return holding === null ? [] : [holding];
  });
}

export function holdingsToCsv(holdings: readonly Holding[]): string {
  return [
    "Ticker,Shares,Cost Basis Per Share",
    ...holdings.map(({ ticker, shares, cost_basis }) => `${ticker},${shares},${cost_basis ?? ""}`),
  ].join("\r\n");
}

export function analyzePortfolio(
  holdings: readonly Holding[],
  rows: readonly ResearchRow[],
): PortfolioAnalysis {
  const byTicker = new Map(rows.map((row) => [row.ticker, row]));
  const unavailableTickers: string[] = [];
  const positions = holdings.flatMap<PortfolioPosition>((holding) => {
    const row = byTicker.get(holding.ticker);
    if (!row) {
      unavailableTickers.push(holding.ticker);
      return [];
    }
    const marketValue = row.price === null ? null : holding.shares * row.price;
    return [
      {
        ...holding,
        name: row.name,
        isEtf: row.isEtf,
        sector: row.isEtf ? "ETF" : row.sector,
        price: row.price,
        priceSource: row.price === null ? "unavailable" : "as_of",
        marketValue,
        gainPercent:
          row.price !== null && holding.cost_basis !== null
            ? ((row.price - holding.cost_basis) / holding.cost_basis) * 100
            : null,
        weight: null,
        composite: row.isEtf ? null : row.composite,
        rating: row.isEtf ? "Not applicable (ETF)" : row.rating,
        marketCapB: row.marketCapB,
        momentum: {
          m1: row.raw.momentum_1m ?? null,
          m3: row.raw.momentum_3m ?? null,
          m6: row.raw.momentum_6m ?? null,
          m12: row.raw.momentum_12m ?? null,
        },
      },
    ];
  });
  const totalValue = positions.reduce((sum, position) => sum + (position.marketValue ?? 0), 0);
  for (const position of positions) {
    position.weight =
      position.marketValue === null || totalValue <= 0 ? null : position.marketValue / totalValue;
  }
  const scoredWeight = positions.reduce(
    (sum, position) => sum + (position.composite === null ? 0 : (position.weight ?? 0)),
    0,
  );
  const weightedComposite =
    scoredWeight <= 0
      ? null
      : positions.reduce(
          (sum, position) => sum + (position.composite ?? 0) * (position.weight ?? 0),
          0,
        ) / scoredWeight;
  const concentrationHhi = positions.reduce(
    (sum, position) => sum + (position.weight ?? 0) ** 2,
    0,
  );
  return {
    totalValue,
    positions,
    unavailableTickers,
    weightedComposite,
    concentrationHhi,
    concentrationLabel:
      concentrationHhi < 0.15
        ? "Diversified"
        : concentrationHhi < 0.25
          ? "Moderate"
          : "Concentrated",
  };
}
