export interface RiskMetrics {
  cagrPercent: number | null;
  sharpe: number | null;
  sortino: number | null;
  calmar: number | null;
  maxDrawdownPercent: number | null;
  volatilityPercent: number | null;
  currentDrawdownPercent: number | null;
}

const RISK_FREE_RATE = 0.04;
const TRADING_DAYS = 252;
export const RADAR_MAXIMUM = 12;

export interface RadarAxis {
  name: string;
  value: number | null;
  normalized: number | null;
  direction: "higher-is-better";
}

export function normalizeRadarAxes(
  pillars: readonly string[],
  values: Readonly<Record<string, number | null>>,
): RadarAxis[] {
  return pillars.map((name) => {
    const value = values[name];
    const finite = value !== null && value !== undefined && Number.isFinite(value);
    return {
      name,
      value: finite ? value : null,
      normalized: finite ? Math.max(0, Math.min(1, value / RADAR_MAXIMUM)) : null,
      direction: "higher-is-better",
    };
  });
}

function mean(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function sampleStandardDeviation(values: number[]): number {
  if (values.length < 2) return 0;
  const average = mean(values);
  return Math.sqrt(
    values.reduce((sum, value) => sum + (value - average) ** 2, 0) / (values.length - 1),
  );
}

export function computeRiskMetrics(closes: readonly number[]): RiskMetrics | null {
  if (closes.length < 30 || closes.some((value) => !Number.isFinite(value) || value <= 0)) {
    return null;
  }

  const returns = closes
    .slice(1)
    .map((value, index) => (value - (closes[index] ?? value)) / (closes[index] ?? value));
  if (returns.length < 2) return null;

  const riskFreeDaily = (1 + RISK_FREE_RATE) ** (1 / TRADING_DAYS) - 1;
  const standardDeviation = sampleStandardDeviation(returns);
  const excessMean = mean(returns.map((value) => value - riskFreeDaily));
  const downside = returns.filter((value) => value < 0);
  const downsideDeviation = downside.length >= 2 ? sampleStandardDeviation(downside) : null;
  const sharpe =
    standardDeviation === 0 ? null : (excessMean / standardDeviation) * Math.sqrt(TRADING_DAYS);
  const sortino =
    downsideDeviation === null || downsideDeviation === 0
      ? null
      : (excessMean / downsideDeviation) * Math.sqrt(TRADING_DAYS);

  let cumulative = 1;
  let peak = 1;
  let maxDrawdown = 0;
  for (const dailyReturn of returns) {
    cumulative *= 1 + dailyReturn;
    peak = Math.max(peak, cumulative);
    maxDrawdown = Math.min(maxDrawdown, (cumulative - peak) / peak);
  }

  const years = returns.length / TRADING_DAYS;
  const cumulativeReturn = cumulative - 1;
  const cagr =
    years > 0 && cumulativeReturn > -1 ? (1 + cumulativeReturn) ** (1 / years) - 1 : null;
  const maxDrawdownPercent = Math.abs(maxDrawdown) * 100;
  const allTimeHigh = Math.max(...closes);
  const latest = closes.at(-1) ?? allTimeHigh;

  return {
    cagrPercent: cagr === null ? null : cagr * 100,
    sharpe,
    sortino,
    calmar: cagr === null || maxDrawdownPercent === 0 ? null : cagr / (maxDrawdownPercent / 100),
    maxDrawdownPercent,
    volatilityPercent: standardDeviation * Math.sqrt(TRADING_DAYS) * 100,
    currentDrawdownPercent: Math.abs((latest - allTimeHigh) / allTimeHigh) * 100,
  };
}
