export type Pillar = "valuation" | "growth" | "profitability" | "momentum" | "revisions";
export type PillarValues = Partial<Record<Pillar, number | null>>;
export type PillarWeights = Record<Pillar, number>;

export interface CompositeResult {
  score: number | null;
  coverage: number;
  availableWeight: number;
  totalWeight: number;
}

const PILLARS: Pillar[] = ["valuation", "growth", "profitability", "momentum", "revisions"];

export function calculateComposite(values: PillarValues, weights: PillarWeights): CompositeResult {
  const normalizedWeights = Object.fromEntries(
    PILLARS.map((pillar) => [
      pillar,
      Math.max(0, Number.isFinite(weights[pillar]) ? weights[pillar] : 0),
    ]),
  ) as PillarWeights;

  const totalWeight = PILLARS.reduce((sum, pillar) => sum + normalizedWeights[pillar], 0);
  if (totalWeight <= 0) throw new Error("At least one positive pillar weight is required.");

  let weightedSum = 0;
  let availableWeight = 0;
  for (const pillar of PILLARS) {
    const value = values[pillar];
    if (value === null || value === undefined || !Number.isFinite(value)) continue;
    weightedSum += value * normalizedWeights[pillar];
    availableWeight += normalizedWeights[pillar];
  }

  return {
    score: availableWeight > 0 ? weightedSum / availableWeight : null,
    coverage: availableWeight / totalWeight,
    availableWeight,
    totalWeight,
  };
}
