export type Pillar = "valuation" | "growth" | "profitability" | "momentum" | "revisions";
export type PillarValues = Partial<Record<Pillar, number | null>>;
export type PillarWeights = Record<Pillar, number>;

export const PILLARS: readonly Pillar[] = [
  "valuation",
  "growth",
  "profitability",
  "momentum",
  "revisions",
];

export type MissingDataPolicy = "require-complete" | "renormalize-explicitly";
export type ScoreExclusionReason =
  "below-minimum-coverage" | "missing-required-pillar" | "no-observed-weight";

export interface PillarContribution {
  pillar: Pillar;
  value: number | null;
  weight: number;
  weightedValue: number | null;
  status: "available" | "missing";
}

export interface CoverageAwareCompositeOptions {
  minimumCoverage: number;
  missingDataPolicy: MissingDataPolicy;
}

export interface CoverageAwareCompositeResult {
  score: number | null;
  coverage: number;
  availableWeight: number;
  totalWeight: number;
  eligible: boolean;
  missingPillars: Pillar[];
  exclusionReasons: ScoreExclusionReason[];
  contributions: PillarContribution[];
  normalization: "total-weight" | "available-weight" | "not-scored";
  missingDataPolicy: MissingDataPolicy;
}

function validateWeights(weights: PillarWeights): PillarWeights {
  for (const pillar of PILLARS) {
    if (!Number.isFinite(weights[pillar]) || weights[pillar] < 0) {
      throw new Error(`Weight for "${pillar}" must be a finite nonnegative number.`);
    }
  }

  if (PILLARS.every((pillar) => weights[pillar] === 0)) {
    throw new Error("At least one positive pillar weight is required.");
  }

  return { ...weights };
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

  const validatedWeights = validateWeights(weights);
  const totalWeight = PILLARS.reduce((sum, pillar) => sum + validatedWeights[pillar], 0);
  const contributions = PILLARS.map((pillar): PillarContribution => {
    const value = values[pillar];
    const available = value !== null && value !== undefined && Number.isFinite(value);

    return {
      pillar,
      value: available ? value : null,
      weight: validatedWeights[pillar],
      weightedValue: available ? value * validatedWeights[pillar] : null,
      status: available ? "available" : "missing",
    };
  });
  const missingPillars = contributions
    .filter((contribution) => contribution.weight > 0 && contribution.status === "missing")
    .map((contribution) => contribution.pillar);
  const availableWeight = contributions.reduce(
    (sum, contribution) => (contribution.status === "available" ? sum + contribution.weight : sum),
    0,
  );
  const coverage = availableWeight / totalWeight;
  const exclusionReasons: ScoreExclusionReason[] = [];

  if (coverage + 1e-12 < options.minimumCoverage) {
    exclusionReasons.push("below-minimum-coverage");
  }
  if (options.missingDataPolicy === "require-complete" && missingPillars.length > 0) {
    exclusionReasons.push("missing-required-pillar");
  }
  if (availableWeight <= 0) {
    exclusionReasons.push("no-observed-weight");
  }

  if (exclusionReasons.length > 0) {
    return {
      score: null,
      coverage,
      availableWeight,
      totalWeight,
      eligible: false,
      missingPillars,
      exclusionReasons,
      contributions,
      normalization: "not-scored",
      missingDataPolicy: options.missingDataPolicy,
    };
  }

  const weightedSum = contributions.reduce(
    (sum, contribution) => sum + (contribution.weightedValue ?? 0),
    0,
  );
  const denominator =
    options.missingDataPolicy === "renormalize-explicitly" ? availableWeight : totalWeight;

  return {
    score: weightedSum / denominator,
    coverage,
    availableWeight,
    totalWeight,
    eligible: true,
    missingPillars,
    exclusionReasons,
    contributions,
    normalization:
      options.missingDataPolicy === "renormalize-explicitly" ? "available-weight" : "total-weight",
    missingDataPolicy: options.missingDataPolicy,
  };
}
