// Faithful port of the V2 Monte Carlo (quant-dashboard-pro-v2 src/lib/montecarlo.ts,
// itself a port of portfolio.run_monte_carlo): GBM with mean reversion, return caps,
// 0.45 cross-correlation, and macro scenario adjustment. Per-holding expected
// return / volatility come from estimateParams over each holding's 1-year daily
// close series (momentum 1m/3m/6m/12m at 21/63/126/252 trading days). A holding
// with no close series follows the SAME fallback the V2 estimateParams took for
// an absent series: long-term-premium trailing return and the volatility floor
// for its market-cap class. The math below is kept verbatim — deterministic
// mulberry32(42) seed, identical constants, identical order of operations — so
// the acceptance output matches the V2 card for identical inputs.

const LONG_TERM_EQUITY_PREMIUM = 0.1;
const LONG_TERM_SMALL_CAP_PREMIUM = 0.12;
const LONG_TERM_SPECULATIVE_PREMIUM = 0.08;
const MAX_ANNUAL_RETURN = 0.4;
const MIN_ANNUAL_RETURN = -0.3;
const MEAN_REVERSION_WEIGHT = 0.6;
const VOL_FLOORS = { large: 0.2, mid: 0.3, small: 0.45, micro: 0.6, etf: 0.15 } as const;
const SCENARIO_ADJ: Record<"Bull" | "Base" | "Bear", number> = {
  Bull: 0.08,
  Base: 0,
  Bear: -0.12,
};

export type Scenario = "Blended" | "Bull" | "Base" | "Bear";

export interface McHoldingInput {
  ticker: string;
  weight: number | null;
  marketCapB: number | null;
  isEtf: boolean;
  /**
   * 1-year daily closes; null/absent when the series is unavailable — both take
   * the vol-floor fallback path (callers like the portfolio parity contract
   * pass plain positions with no series at all).
   */
  closes?: number[] | null;
}

export interface McHoldingDetail {
  ticker: string;
  expReturnPct: number;
  volPct: number;
  weightPct: number;
  seriesUsed: boolean;
}

export interface McFanPoint {
  day: number;
  p5: number;
  p25: number;
  p50: number;
  p75: number;
  p95: number;
}

export interface MonteCarlo {
  totalValue: number;
  sims: number;
  horizonDays: number;
  scenario: Scenario;
  expReturnPct: number;
  volPct: number;
  pPositive: number;
  pGain20: number;
  pGain50: number;
  pLoss10: number;
  pLoss20: number;
  percentiles: { p5: number; p25: number; p50: number; p75: number; p95: number };
  fan: McFanPoint[];
  holdingDetails: McHoldingDetail[];
  /** Legacy alias of holdingDetails, kept for the original V3 percentile contract. */
  assumptions: McHoldingDetail[];
  modelParams: {
    meanReversionWeight: number;
    maxAnnualReturnCap: number;
    longTermPremium: number;
    avgCorrelation: number;
    scenarioAdjustmentPct: number;
  };
}

// V2 mulberry32 — the deterministic acceptance seed is 42, always.
function mulberry32(a: number): () => number {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function gauss(rng: () => number): number {
  let u = 0;
  let v = 0;
  while (u === 0) u = rng();
  while (v === 0) v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

function pct(sorted: readonly number[], p: number): number {
  const i = (p / 100) * (sorted.length - 1);
  const lo = Math.floor(i);
  const hi = Math.ceil(i);
  const lower = sorted[lo] ?? 0;
  const upper = sorted[hi] ?? lower;
  return lo === hi ? lower : lower + (upper - lower) * (i - lo);
}

function momentum(closes: number[] | null, k: number): number | null {
  if (!closes || closes.length <= k) return null;
  const a = closes[closes.length - 1 - k] ?? 0;
  const b = closes[closes.length - 1] ?? 0;
  return a > 0 ? b / a - 1 : null;
}

// portfolio._estimate_holding_params (V2 estimateParams, verbatim math). A null
// close series yields the long-term-premium trailing return and vol 0.30 before
// floors — exactly the V2 fallback for a holding absent from the price map.
function estimateParams(
  closes: number[] | null,
  mcapB: number | null,
  isEtf: boolean,
): { expRet: number; vol: number } {
  const m1 = momentum(closes, 21);
  const m3 = momentum(closes, 63);
  const m6 = momentum(closes, 126);
  const m12 = momentum(closes, 252);
  let trailing: number;
  if (m12 != null) trailing = m12;
  else if (m6 != null) trailing = m6 * 2;
  else if (m3 != null) trailing = m3 * 4;
  else trailing = LONG_TERM_EQUITY_PREMIUM;

  let lt: number;
  if (isEtf) lt = LONG_TERM_EQUITY_PREMIUM;
  else if (mcapB != null && mcapB < 5) lt = LONG_TERM_SPECULATIVE_PREMIUM;
  else if (mcapB != null && mcapB < 20) lt = LONG_TERM_SMALL_CAP_PREMIUM;
  else lt = LONG_TERM_EQUITY_PREMIUM;

  let expRet = MEAN_REVERSION_WEIGHT * lt + (1 - MEAN_REVERSION_WEIGHT) * trailing;
  expRet = Math.max(MIN_ANNUAL_RETURN, Math.min(MAX_ANNUAL_RETURN, expRet));

  const periodRets: number[] = [];
  if (m1 != null) periodRets.push(m1 * 12);
  if (m3 != null) periodRets.push(m3 * 4);
  if (m6 != null) periodRets.push(m6 * 2);
  if (m12 != null) periodRets.push(m12);
  let vol: number;
  if (periodRets.length >= 2) {
    const mean = periodRets.reduce((a, b) => a + b, 0) / periodRets.length;
    // population std (np.std), as in the source pipeline
    const std = Math.sqrt(periodRets.reduce((a, r) => a + (r - mean) ** 2, 0) / periodRets.length);
    const avgAbs = periodRets.reduce((a, r) => a + Math.abs(r), 0) / periodRets.length;
    vol = Math.max(std, avgAbs * 0.5);
  } else vol = 0.3;
  if (isEtf) vol = Math.max(vol, VOL_FLOORS.etf);
  else if (mcapB != null && mcapB >= 50) vol = Math.max(vol, VOL_FLOORS.large);
  else if (mcapB != null && mcapB >= 10) vol = Math.max(vol, VOL_FLOORS.mid);
  else if (mcapB != null && mcapB >= 2) vol = Math.max(vol, VOL_FLOORS.small);
  else vol = Math.max(vol, VOL_FLOORS.micro);
  vol = Math.min(vol, 1.0);
  return { expRet, vol };
}

export function runMonteCarlo(
  holdings: readonly McHoldingInput[],
  totalValue: number,
  opts: {
    sims?: number;
    /** Legacy spelling accepted by the original V3 contract. */
    simulations?: number;
    horizonDays?: number;
    scenario?: Scenario;
    /** Deterministic acceptance seed; V2 parity uses 42. */
    seed?: number;
  } = {},
): MonteCarlo | null {
  const sims = opts.sims ?? opts.simulations ?? 5000;
  const nDays = opts.horizonDays ?? 252;
  const scenario = opts.scenario ?? "Blended";
  const seed = opts.seed ?? 42;
  const held = holdings.filter(
    (h): h is McHoldingInput & { weight: number } => h.weight !== null && h.weight > 0,
  );
  if (!held.length || totalValue <= 0) return null;

  const weights = held.map((h) => h.weight);
  const details = held.map((h) => {
    const closes = h.closes ?? null;
    const { expRet, vol } = estimateParams(closes, h.marketCapB, h.isEtf);
    return {
      ticker: h.ticker,
      expRet,
      vol,
      weight: h.weight,
      seriesUsed: closes !== null && closes.length > 21,
    };
  });

  const portReturn = details.reduce((a, d, i) => a + (weights[i] ?? 0) * d.expRet, 0);
  const avgCorr = 0.45;
  const wsig = details.map((d, i) => (weights[i] ?? 0) * d.vol);
  const sumWsig = wsig.reduce((a, b) => a + b, 0);
  const sumWsig2 = wsig.reduce((a, b) => a + b * b, 0);
  let portVol = Math.sqrt(Math.max(0, sumWsig2 + avgCorr * (sumWsig * sumWsig - sumWsig2)));
  portVol = Math.max(portVol, 0.12);

  const scenarioAdj =
    scenario === "Blended"
      ? 0.25 * SCENARIO_ADJ.Bull + 0.5 * SCENARIO_ADJ.Base + 0.25 * SCENARIO_ADJ.Bear
      : SCENARIO_ADJ[scenario];
  const adjustedReturn = portReturn + scenarioAdj;

  const dailyMu = (adjustedReturn - 0.5 * portVol * portVol) / 252;
  const dailySigma = portVol / Math.sqrt(252);

  // sampled days for the fan chart (≤60 points incl. final day)
  const step = Math.max(1, Math.floor(nDays / 60));
  const sampleDays: number[] = [];
  for (let d = step; d < nDays; d += step) sampleDays.push(d);
  sampleDays.push(nDays);
  const bySample: number[][] = sampleDays.map(() => []);
  const sampleIdx = new Map(sampleDays.map((d, i) => [d, i]));

  const rng = mulberry32(seed);
  const finals: number[] = new Array<number>(sims);
  for (let s = 0; s < sims; s++) {
    let cum = 0;
    for (let d = 1; d <= nDays; d++) {
      cum += dailyMu + dailySigma * gauss(rng);
      const j = sampleIdx.get(d);
      if (j !== undefined) bySample[j]?.push(totalValue * Math.exp(cum));
    }
    finals[s] = totalValue * Math.exp(cum);
  }
  finals.sort((a, b) => a - b);
  const q = (p: number) => pct(finals, p);
  const fan: McFanPoint[] = sampleDays.map((day, i) => {
    const col = (bySample[i] ?? []).sort((a, b) => a - b);
    return {
      day,
      p5: pct(col, 5),
      p25: pct(col, 25),
      p50: pct(col, 50),
      p75: pct(col, 75),
      p95: pct(col, 95),
    };
  });

  const above = (mult: number) => (finals.filter((x) => x > totalValue * mult).length / sims) * 100;
  const below = (mult: number) => (finals.filter((x) => x < totalValue * mult).length / sims) * 100;

  return {
    totalValue,
    sims,
    horizonDays: nDays,
    scenario,
    expReturnPct: Math.round(adjustedReturn * 1000) / 10,
    volPct: Math.round(portVol * 1000) / 10,
    pPositive: above(1),
    pGain20: above(1.2),
    pGain50: above(1.5),
    pLoss10: below(0.9),
    pLoss20: below(0.8),
    percentiles: { p5: q(5), p25: q(25), p50: q(50), p75: q(75), p95: q(95) },
    fan,
    ...(() => {
      const holdingDetails = details.map((d) => ({
        ticker: d.ticker,
        expReturnPct: Math.round(d.expRet * 1000) / 10,
        volPct: Math.round(d.vol * 1000) / 10,
        weightPct: Math.round(d.weight * 1000) / 10,
        seriesUsed: d.seriesUsed,
      }));
      return { holdingDetails, assumptions: holdingDetails };
    })(),
    modelParams: {
      meanReversionWeight: MEAN_REVERSION_WEIGHT,
      maxAnnualReturnCap: MAX_ANNUAL_RETURN,
      longTermPremium: LONG_TERM_EQUITY_PREMIUM,
      avgCorrelation: avgCorr,
      scenarioAdjustmentPct: Math.round(scenarioAdj * 1000) / 10,
    },
  };
}
