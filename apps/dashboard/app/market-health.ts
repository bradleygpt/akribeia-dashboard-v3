import type { UniverseDisplayRow } from "./v2-universe";

export interface MarketBreadth {
  pctAbove50Sma: number;
  pctAbove200Sma: number;
  pctPositive1m: number;
  pctPositive3m: number;
  buyPct: number;
  sellPct: number;
  breadthScore: number;
}

export interface FearGreed {
  score: number;
  classification: "Extreme Greed" | "Greed" | "Neutral" | "Fear" | "Extreme Fear";
}

export interface MacroHealth {
  score: number;
  label: "Strong Expansion" | "Moderate Growth" | "Slowing" | "Contraction Risk" | "Recession";
  components: Record<string, number>;
}

const clip = (value: number) => Math.max(0, Math.min(100, value));

function finiteValues(values: readonly (number | null)[]): number[] {
  return values.filter((value): value is number => value !== null && Number.isFinite(value));
}

function positivePercent(values: readonly (number | null)[]): number {
  const finite = finiteValues(values);
  return finite.length === 0
    ? 50
    : (finite.filter((value) => value > 0).length / finite.length) * 100;
}

export function computeMarketBreadth(rows: readonly UniverseDisplayRow[]): MarketBreadth {
  const count = rows.length || 1;
  const above50 = positivePercent(rows.map(({ above50Sma }) => above50Sma));
  const above200 = positivePercent(rows.map(({ above200Sma }) => above200Sma));
  const positive1m = positivePercent(rows.map(({ momentum1m }) => momentum1m));
  const positive3m = positivePercent(rows.map(({ momentum3m }) => momentum3m));
  const buy =
    (rows.filter(({ rating }) => ["Strong Buy+", "Strong Buy", "Buy"].includes(rating)).length /
      count) *
    100;
  const sell =
    (rows.filter(({ rating }) => ["Sell", "Strong Sell"].includes(rating)).length / count) * 100;

  return {
    pctAbove50Sma: above50,
    pctAbove200Sma: above200,
    pctPositive1m: positive1m,
    pctPositive3m: positive3m,
    buyPct: buy,
    sellPct: sell,
    breadthScore: above50 * 0.3 + above200 * 0.3 + positive1m * 0.2 + positive3m * 0.2,
  };
}

export function creditCalm(hyOas: number | null): number | null {
  return hyOas === null ? null : clip(100 - (hyOas - 2.5) * 14);
}

export function computeFearGreed(
  vixScore: number | null,
  breadth: MarketBreadth,
  spDistancePct: number | null,
  buffettScore: number | null,
  creditScore: number | null = null,
): FearGreed {
  const base: [number, number][] = [
    [vixScore ?? 50, 0.25],
    [breadth.pctAbove50Sma, 0.2],
    [breadth.pctAbove200Sma, 0.15],
    [breadth.pctPositive1m, 0.15],
    [clip(100 + (spDistancePct ?? 0) * 3.33), 0.15],
    [buffettScore ?? 50, 0.1],
  ];
  const components =
    creditScore === null
      ? base
      : [
          ...base.map(
            ([componentScore, weight]) => [componentScore, weight * 0.88] as [number, number],
          ),
          [creditScore, 0.12] as [number, number],
        ];
  const composite =
    Math.round(clip(components.reduce((sum, [value, weight]) => sum + value * weight, 0)) * 10) /
    10;
  const classification =
    composite >= 80
      ? "Extreme Greed"
      : composite >= 60
        ? "Greed"
        : composite >= 45
          ? "Neutral"
          : composite >= 25
            ? "Fear"
            : "Extreme Fear";

  return { score: composite, classification };
}

function numeric(record: Record<string, unknown>, key: string): number {
  const value = record[key];
  return typeof value === "number" && Number.isFinite(value) ? value : Number.NaN;
}

export function computeMacroHealth(
  macroData: Record<string, unknown>,
  spread: number | null,
  hyOas: number | null,
): MacroHealth | null {
  const ism = numeric(macroData, "ism_composite");
  const unemployment = numeric(macroData, "unemployment_current");
  const gdp = numeric(macroData, "gdp_latest_qoq_annualized");
  const cpi = numeric(macroData, "cpi_current");

  if (![ism, unemployment, gdp, cpi].every(Number.isFinite)) {
    return null;
  }

  const ismScore = clip((ism - 45) * 6.67);
  const unemploymentScore = clip(((7 - unemployment) / 3.5) * 100);
  const gdpScore = clip(gdp * 25);
  const cpiScore =
    cpi >= 2 && cpi <= 2.5
      ? 100
      : cpi >= 1.5 && cpi <= 3
        ? 75
        : cpi >= 1 && cpi <= 3.5
          ? 50
          : Math.max(0, 50 - Math.abs(cpi - 2.5) * 20);
  const yieldCurveScore =
    spread === null ? 50 : spread > 0.5 ? 80 : spread > 0 ? 60 : spread > -0.5 ? 30 : 10;
  const calm = creditCalm(hyOas);
  const components: Record<string, number> = {
    ISM: Math.round(ismScore),
    Unemployment: Math.round(unemploymentScore),
    GDP: Math.round(gdpScore),
    CPI: Math.round(cpiScore),
    "Yield Curve": Math.round(yieldCurveScore),
  };
  let result: number;

  if (calm !== null) {
    result =
      ismScore * 0.22 +
      unemploymentScore * 0.22 +
      gdpScore * 0.18 +
      cpiScore * 0.13 +
      yieldCurveScore * 0.13 +
      calm * 0.12;
    components["Credit (HY OAS)"] = Math.round(calm);
  } else {
    result =
      ismScore * 0.25 +
      unemploymentScore * 0.25 +
      gdpScore * 0.2 +
      cpiScore * 0.15 +
      yieldCurveScore * 0.15;
  }

  const label =
    result >= 75
      ? "Strong Expansion"
      : result >= 55
        ? "Moderate Growth"
        : result >= 40
          ? "Slowing"
          : result >= 25
            ? "Contraction Risk"
            : "Recession";

  return { score: Math.round(result), label, components };
}

export function ismIsStale(period: string | undefined, now = new Date()): boolean {
  if (!period) return true;

  let businessDays = 0;
  for (let day = 1; day <= now.getDate(); day += 1) {
    const weekday = new Date(now.getFullYear(), now.getMonth(), day).getDay();
    if (weekday !== 0 && weekday !== 6) businessDays += 1;
  }

  if (businessDays <= 2) return false;

  const prior = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const expected = `${prior.getFullYear()}-${String(prior.getMonth() + 1).padStart(2, "0")}`;
  return period.slice(0, 7) < expected;
}
