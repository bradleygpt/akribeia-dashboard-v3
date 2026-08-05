export type PricePeriod =
  "1d" | "wtd" | "1w" | "mtd" | "1mo" | "6mo" | "1y" | "2y" | "5y" | "10y" | "max";

export interface SelectedPriceHistory {
  dates: string[];
  close: number[];
}

export interface PricePeriodSummary {
  startDate: string;
  endDate: string;
  startPrice: number;
  endPrice: number;
  percent: number;
}

export interface ObservedPeriodMetrics {
  sessions: number;
  priceChange: number;
  averageSessionReturnPercent: number;
  bestSessionPercent: number;
  worstSessionPercent: number;
  maxDrawdownPercent: number;
  currentDrawdownPercent: number;
}

interface DatedPricePoint {
  date: string;
  time: number;
  close: number;
}

const SHORT_PERIODS = new Set(["1d", "wtd", "1w", "mtd", "1mo"]);

export function isShortPricePeriod(period: string): boolean {
  return SHORT_PERIODS.has(period.trim().toLowerCase());
}

export function queryPriceRange(period: string): string {
  return isShortPricePeriod(period) ? "6mo" : period.trim().toLowerCase();
}

export function labelPricePeriod(period: string): string {
  switch (period.trim().toLowerCase()) {
    case "1d":
      return "1D";
    case "wtd":
      return "WTD";
    case "1w":
    case "1wk":
      return "1W";
    case "mtd":
      return "MTD";
    case "1m":
    case "1mo":
      return "1M";
    case "6m":
    case "6mo":
      return "6M";
    case "1y":
      return "1Y";
    case "2y":
      return "2Y";
    case "5y":
      return "5Y";
    case "10y":
      return "10Y";
    case "max":
      return "MAX";
    default:
      return period.trim().toUpperCase();
  }
}

function buildPoints(
  dates: readonly string[],
  closes: readonly (number | null)[],
): DatedPricePoint[] {
  return dates
    .map((rawDate, index) => {
      const date = rawDate.slice(0, 10);
      const close = closes[index];

      if (
        !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
        typeof close !== "number" ||
        !Number.isFinite(close) ||
        close <= 0
      ) {
        return null;
      }

      const time = Date.parse(`${date}T00:00:00.000Z`);

      if (!Number.isFinite(time)) {
        return null;
      }

      return {
        date,
        time,
        close,
      };
    })
    .filter((point): point is DatedPricePoint => point !== null)
    .sort((left, right) => left.time - right.time);
}

function historyFromPoints(points: readonly DatedPricePoint[]): SelectedPriceHistory | null {
  if (points.length < 2) {
    return null;
  }

  return {
    dates: points.map(({ date }) => date),
    close: points.map(({ close }) => close),
  };
}

function selectAtOrBeforeBoundary(
  points: readonly DatedPricePoint[],
  boundary: number,
): SelectedPriceHistory | null {
  const hasBoundaryCoverage = points.some(({ time }) => time <= boundary);

  if (!hasBoundaryCoverage) {
    return null;
  }

  let startIndex = -1;

  for (let index = 0; index < points.length; index += 1) {
    if (points[index].time <= boundary) {
      startIndex = index;
    } else {
      break;
    }
  }

  return startIndex < 0 ? null : historyFromPoints(points.slice(startIndex));
}

function selectFromPriorClose(
  points: readonly DatedPricePoint[],
  boundary: number,
): SelectedPriceHistory | null {
  let startIndex = -1;

  for (let index = 0; index < points.length; index += 1) {
    if (points[index].time < boundary) {
      startIndex = index;
    } else {
      break;
    }
  }

  return startIndex < 0 ? null : historyFromPoints(points.slice(startIndex));
}

function startOfUtcWeek(time: number): number {
  const date = new Date(time);
  const day = date.getUTCDay();
  const daysSinceMonday = day === 0 ? 6 : day - 1;

  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() - daysSinceMonday);
}

function startOfUtcMonth(time: number): number {
  const date = new Date(time);

  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1);
}

function subtractUtcMonth(time: number): number {
  const date = new Date(time);
  const targetYear = date.getUTCMonth() === 0 ? date.getUTCFullYear() - 1 : date.getUTCFullYear();
  const targetMonth = date.getUTCMonth() === 0 ? 11 : date.getUTCMonth() - 1;
  const lastDayOfTargetMonth = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate();

  return Date.UTC(targetYear, targetMonth, Math.min(date.getUTCDate(), lastDayOfTargetMonth));
}

export function selectPricePeriod(
  period: string,
  dates: readonly string[],
  closes: readonly (number | null)[],
): SelectedPriceHistory | null {
  const points = buildPoints(dates, closes);

  if (points.length < 2) {
    return null;
  }

  const normalizedPeriod = period.trim().toLowerCase();
  const latest = points.at(-1);

  if (!latest) {
    return null;
  }

  switch (normalizedPeriod) {
    case "1d":
      return historyFromPoints(points.slice(-2));

    case "wtd":
      // Close-to-close WTD: anchor on the final trading close before Monday.
      return selectFromPriorClose(points, startOfUtcWeek(latest.time));

    case "1w":
    case "1wk":
      return selectAtOrBeforeBoundary(points, latest.time - 7 * 24 * 60 * 60 * 1000);

    case "mtd":
      // Close-to-close MTD: anchor on the final close before the month begins.
      return selectFromPriorClose(points, startOfUtcMonth(latest.time));

    case "1m":
    case "1mo":
      // A trailing calendar month uses the final trading close at or before the
      // same UTC calendar date in the prior month. This prevents weekends and
      // market holidays from silently shortening the measured interval.
      return selectAtOrBeforeBoundary(points, subtractUtcMonth(latest.time));
    default:
      return historyFromPoints(points);
  }
}

export function summarizePricePeriod(
  dates: readonly string[],
  closes: readonly (number | null)[],
): PricePeriodSummary | null {
  const points = buildPoints(dates, closes);

  if (points.length < 2) {
    return null;
  }

  const first = points[0];
  const last = points.at(-1);

  if (!first || !last || first.date === last.date) {
    return null;
  }

  return {
    startDate: first.date,
    endDate: last.date,
    startPrice: first.close,
    endPrice: last.close,
    percent: (last.close / first.close - 1) * 100,
  };
}

export function computeObservedPeriodMetrics(
  closes: readonly number[],
): ObservedPeriodMetrics | null {
  if (closes.length < 2 || closes.some((value) => !Number.isFinite(value) || value <= 0)) {
    return null;
  }

  const first = closes[0];
  const last = closes.at(-1);

  if (first === undefined || last === undefined) {
    return null;
  }

  const returns = closes.slice(1).map((value, index) => {
    const previous = closes[index];

    return previous === undefined ? 0 : value / previous - 1;
  });

  if (returns.length === 0) {
    return null;
  }

  let peak = first;
  let maxDrawdown = 0;

  for (const close of closes) {
    peak = Math.max(peak, close);
    maxDrawdown = Math.min(maxDrawdown, close / peak - 1);
  }

  const averageReturn = returns.reduce((sum, value) => sum + value, 0) / returns.length;

  return {
    sessions: returns.length,
    priceChange: last - first,
    averageSessionReturnPercent: averageReturn * 100,
    bestSessionPercent: Math.max(...returns) * 100,
    worstSessionPercent: Math.min(...returns) * 100,
    maxDrawdownPercent: Math.abs(maxDrawdown) * 100,
    currentDrawdownPercent: Math.abs(last / peak - 1) * 100,
  };
}
