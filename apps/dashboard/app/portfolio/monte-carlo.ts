import type { PortfolioPosition } from "./portfolio-contract";

const LONG_TERM_EQUITY_PREMIUM = 0.1;
const LONG_TERM_SMALL_CAP_PREMIUM = 0.12;
const LONG_TERM_SPECULATIVE_PREMIUM = 0.08;
const MAX_ANNUAL_RETURN = 0.4;
const MIN_ANNUAL_RETURN = -0.3;
const MEAN_REVERSION_WEIGHT = 0.6;
const AVERAGE_CORRELATION = 0.45;
const SCENARIO_ADJUSTMENT = { Bull: 0.08, Base: 0, Bear: -0.12 } as const;

export type Scenario = "Blended" | keyof typeof SCENARIO_ADJUSTMENT;

export interface MonteCarloResult {
  simulations: number;
  horizonDays: number;
  scenario: Scenario;
  expectedReturnPercent: number;
  volatilityPercent: number;
  probabilityGain: number;
  probabilityLoss20: number;
  percentiles: Record<"p5" | "p25" | "p50" | "p75" | "p95", number>;
  assumptions: Array<{
    ticker: string;
    expectedReturnPercent: number;
    volatilityPercent: number;
    weightPercent: number;
  }>;
}

function mulberry32(seed: number): () => number {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let value = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  };
}

function gaussian(random: () => number): number {
  let left = 0;
  let right = 0;
  while (left === 0) left = random();
  while (right === 0) right = random();
  return Math.sqrt(-2 * Math.log(left)) * Math.cos(2 * Math.PI * right);
}

function percentile(sorted: readonly number[], level: number): number {
  const index = (level / 100) * (sorted.length - 1);
  const low = Math.floor(index);
  const high = Math.ceil(index);
  const lower = sorted[low] ?? 0;
  const upper = sorted[high] ?? lower;
  return low === high ? lower : lower + (upper - lower) * (index - low);
}

function estimate(position: PortfolioPosition): { expectedReturn: number; volatility: number } {
  const { m1, m3, m6, m12 } = position.momentum;
  const trailing =
    m12 ??
    (m6 === null ? null : m6 * 2) ??
    (m3 === null ? null : m3 * 4) ??
    LONG_TERM_EQUITY_PREMIUM;
  const premium = position.isEtf
    ? LONG_TERM_EQUITY_PREMIUM
    : position.marketCapB !== null && position.marketCapB < 5
      ? LONG_TERM_SPECULATIVE_PREMIUM
      : position.marketCapB !== null && position.marketCapB < 20
        ? LONG_TERM_SMALL_CAP_PREMIUM
        : LONG_TERM_EQUITY_PREMIUM;
  const expectedReturn = Math.max(
    MIN_ANNUAL_RETURN,
    Math.min(
      MAX_ANNUAL_RETURN,
      MEAN_REVERSION_WEIGHT * premium + (1 - MEAN_REVERSION_WEIGHT) * trailing,
    ),
  );
  const annualized = [
    m1 === null ? null : m1 * 12,
    m3 === null ? null : m3 * 4,
    m6 === null ? null : m6 * 2,
    m12,
  ].filter((value): value is number => value !== null);
  let volatility = 0.3;
  if (annualized.length >= 2) {
    const mean = annualized.reduce((sum, value) => sum + value, 0) / annualized.length;
    const standardDeviation = Math.sqrt(
      annualized.reduce((sum, value) => sum + (value - mean) ** 2, 0) / annualized.length,
    );
    const averageAbsolute =
      annualized.reduce((sum, value) => sum + Math.abs(value), 0) / annualized.length;
    volatility = Math.max(standardDeviation, averageAbsolute * 0.5);
  }
  const floor = position.isEtf
    ? 0.15
    : position.marketCapB !== null && position.marketCapB >= 50
      ? 0.2
      : position.marketCapB !== null && position.marketCapB >= 10
        ? 0.3
        : position.marketCapB !== null && position.marketCapB >= 2
          ? 0.45
          : 0.6;
  return { expectedReturn, volatility: Math.min(1, Math.max(volatility, floor)) };
}

export function runMonteCarlo(
  positions: readonly PortfolioPosition[],
  totalValue: number,
  options: { simulations: number; horizonDays: number; scenario: Scenario; seed?: number },
): MonteCarloResult | null {
  const held = positions.filter((position) => position.weight !== null && position.weight > 0);
  if (!held.length || totalValue <= 0) return null;
  const assumptions = held.map((position) => ({
    ...estimate(position),
    ticker: position.ticker,
    weight: position.weight ?? 0,
  }));
  const portfolioReturn = assumptions.reduce(
    (sum, item) => sum + item.weight * item.expectedReturn,
    0,
  );
  const weightedVolatility = assumptions.map((item) => item.weight * item.volatility);
  const sum = weightedVolatility.reduce((total, value) => total + value, 0);
  const squares = weightedVolatility.reduce((total, value) => total + value * value, 0);
  const portfolioVolatility = Math.max(
    0.12,
    Math.sqrt(Math.max(0, squares + AVERAGE_CORRELATION * (sum * sum - squares))),
  );
  const scenarioAdjustment =
    options.scenario === "Blended"
      ? 0.25 * SCENARIO_ADJUSTMENT.Bull +
        0.5 * SCENARIO_ADJUSTMENT.Base +
        0.25 * SCENARIO_ADJUSTMENT.Bear
      : SCENARIO_ADJUSTMENT[options.scenario];
  const adjustedReturn = portfolioReturn + scenarioAdjustment;
  const dailyMean = (adjustedReturn - 0.5 * portfolioVolatility ** 2) / 252;
  const dailySigma = portfolioVolatility / Math.sqrt(252);
  const random = mulberry32(options.seed ?? 42);
  const terminal = Array.from({ length: options.simulations }, () => {
    let cumulative = 0;
    for (let day = 0; day < options.horizonDays; day += 1)
      cumulative += dailyMean + dailySigma * gaussian(random);
    return totalValue * Math.exp(cumulative);
  }).sort((left, right) => left - right);
  return {
    simulations: options.simulations,
    horizonDays: options.horizonDays,
    scenario: options.scenario,
    expectedReturnPercent: adjustedReturn * 100,
    volatilityPercent: portfolioVolatility * 100,
    probabilityGain:
      (terminal.filter((value) => value > totalValue).length / terminal.length) * 100,
    probabilityLoss20:
      (terminal.filter((value) => value < totalValue * 0.8).length / terminal.length) * 100,
    percentiles: {
      p5: percentile(terminal, 5),
      p25: percentile(terminal, 25),
      p50: percentile(terminal, 50),
      p75: percentile(terminal, 75),
      p95: percentile(terminal, 95),
    },
    assumptions: assumptions.map((item) => ({
      ticker: item.ticker,
      expectedReturnPercent: item.expectedReturn * 100,
      volatilityPercent: item.volatility * 100,
      weightPercent: item.weight * 100,
    })),
  };
}
