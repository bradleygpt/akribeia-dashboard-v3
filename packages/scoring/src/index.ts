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

export type MissingDataPolicy = "require-complete" | "renormalize-explicitly";

export interface CoverageAwareCompositeOptions {
  minimumCoverage: number;
  missingDataPolicy: MissingDataPolicy;
}

export interface CoverageAwareCompositeResult extends CompositeResult {
  eligible: boolean;
  missingPillars: Pillar[];
  normalization: "total-weight" | "available-weight" | "not-scored";
  missingDataPolicy: MissingDataPolicy;
}

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

export function calculateCoverageAwareComposite(
  values: PillarValues,
  weights: PillarWeights,
  options: CoverageAwareCompositeOptions,
): CoverageAwareCompositeResult {
  if (
    !Number.isFinite(options.minimumCoverage) ||
    options.minimumCoverage < 0 ||
    options.minimumCoverage > 1
  ) {
    throw new Error("minimumCoverage must be between 0 and 1.");
  }

  const normalizedWeights = Object.fromEntries(
    PILLARS.map((pillar) => [
      pillar,
      Math.max(0, Number.isFinite(weights[pillar]) ? weights[pillar] : 0),
    ]),
  ) as PillarWeights;
  const totalWeight = PILLARS.reduce((sum, pillar) => sum + normalizedWeights[pillar], 0);

  if (totalWeight <= 0) {
    throw new Error("At least one positive pillar weight is required.");
  }

  const missingPillars = PILLARS.filter((pillar) => {
    const value = values[pillar];

    return (
      normalizedWeights[pillar] > 0 &&
      (value === null || value === undefined || !Number.isFinite(value))
    );
  });
  const availableWeight = PILLARS.reduce(
    (sum, pillar) => (missingPillars.includes(pillar) ? sum : sum + normalizedWeights[pillar]),
    0,
  );
  const coverage = availableWeight / totalWeight;
  const meetsCoverage = coverage + 1e-12 >= options.minimumCoverage;
  const completeWhenRequired =
    options.missingDataPolicy !== "require-complete" || missingPillars.length === 0;
  const eligible = meetsCoverage && completeWhenRequired;

  if (!eligible || availableWeight <= 0) {
    return {
      score: null,
      coverage,
      availableWeight,
      totalWeight,
      eligible: false,
      missingPillars,
      normalization: "not-scored",
      missingDataPolicy: options.missingDataPolicy,
    };
  }

  const weightedSum = PILLARS.reduce((sum, pillar) => {
    const value = values[pillar];

    return value === null || value === undefined || !Number.isFinite(value)
      ? sum
      : sum + value * normalizedWeights[pillar];
  }, 0);
  const denominator =
    options.missingDataPolicy === "renormalize-explicitly" ? availableWeight : totalWeight;

  return {
    score: weightedSum / denominator,
    coverage,
    availableWeight,
    totalWeight,
    eligible: true,
    missingPillars,
    normalization:
      options.missingDataPolicy === "renormalize-explicitly" ? "available-weight" : "total-weight",
    missingDataPolicy: options.missingDataPolicy,
  };
}
