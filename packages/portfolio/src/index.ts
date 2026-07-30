export interface CappedWeightInput {
  id: string;
  rawWeight: number;
  maxWeight: number;
}

export interface CappedWeightResult {
  id: string;
  weight: number;
}

export interface RankedPortfolioCandidate {
  id: string;
  sector: string;
  score: number;
  maxWeight?: number;
}

export interface RankedPortfolioConstraints {
  maxPositionWeight: number;
  maxSectorWeight: number;
}

export interface RankedPortfolioPosition {
  id: string;
  sector: string;
  score: number;
  weight: number;
}

export type RankedPortfolioResult =
  | {
      status: "constructed";
      positions: RankedPortfolioPosition[];
      sectorWeights: Record<string, number>;
      totalWeight: number;
      constraints: RankedPortfolioConstraints;
    }
  | {
      status: "infeasible";
      reasons: string[];
      constraints: RankedPortfolioConstraints;
      maximumFeasibleWeight: number;
    };

export function projectToCappedSimplex(inputs: CappedWeightInput[]): CappedWeightResult[] {
  if (inputs.length === 0) return [];
  const capTotal = inputs.reduce((sum, item) => sum + item.maxWeight, 0);
  if (capTotal < 1 - 1e-12)
    throw new Error("Position caps cannot support a fully invested portfolio.");

  const remaining = new Set(inputs.map((item) => item.id));
  const result = new Map<string, number>();
  let remainingBudget = 1;

  while (remaining.size > 0) {
    const candidates = inputs.filter((item) => remaining.has(item.id));
    const rawTotal = candidates.reduce((sum, item) => sum + Math.max(0, item.rawWeight), 0);
    if (rawTotal <= 0) throw new Error("Remaining raw weights must contain a positive value.");

    let cappedAny = false;
    for (const item of candidates) {
      const proposed = (remainingBudget * Math.max(0, item.rawWeight)) / rawTotal;
      if (proposed > item.maxWeight + 1e-12) {
        result.set(item.id, item.maxWeight);
        remainingBudget -= item.maxWeight;
        remaining.delete(item.id);
        cappedAny = true;
      }
    }

    if (!cappedAny) {
      for (const item of candidates) {
        result.set(item.id, (remainingBudget * Math.max(0, item.rawWeight)) / rawTotal);
      }
      break;
    }
  }

  return inputs.map((item) => ({ id: item.id, weight: result.get(item.id) ?? 0 }));
}

function validateConstraint(name: string, value: number): void {
  if (!Number.isFinite(value) || value <= 0 || value > 1) {
    throw new Error(`${name} must be greater than 0 and no greater than 1.`);
  }
}

export function constructRankedCappedPortfolio(
  candidates: RankedPortfolioCandidate[],
  constraints: RankedPortfolioConstraints,
): RankedPortfolioResult {
  validateConstraint("maxPositionWeight", constraints.maxPositionWeight);
  validateConstraint("maxSectorWeight", constraints.maxSectorWeight);

  const ids = new Set<string>();
  const normalized = candidates.map((candidate) => {
    if (candidate.id.trim().length === 0) {
      throw new Error("Portfolio candidate IDs must not be empty.");
    }
    if (ids.has(candidate.id)) {
      throw new Error(`Duplicate portfolio candidate ID "${candidate.id}".`);
    }
    if (candidate.sector.trim().length === 0) {
      throw new Error(`Portfolio candidate "${candidate.id}" requires a sector.`);
    }
    if (!Number.isFinite(candidate.score)) {
      throw new Error(`Portfolio candidate "${candidate.id}" requires a finite score.`);
    }

    ids.add(candidate.id);

    const maxWeight = candidate.maxWeight ?? constraints.maxPositionWeight;

    validateConstraint(`maxWeight for "${candidate.id}"`, maxWeight);

    return {
      ...candidate,
      maxWeight: Math.min(maxWeight, constraints.maxPositionWeight),
    };
  });
  const capacityBySector = new Map<string, number>();

  for (const candidate of normalized) {
    capacityBySector.set(
      candidate.sector,
      (capacityBySector.get(candidate.sector) ?? 0) + candidate.maxWeight,
    );
  }

  const maximumFeasibleWeight = [...capacityBySector.values()].reduce(
    (sum, capacity) => sum + Math.min(capacity, constraints.maxSectorWeight),
    0,
  );

  if (maximumFeasibleWeight < 1 - 1e-12) {
    return {
      status: "infeasible",
      reasons: [
        `Candidate capacity reaches only ${maximumFeasibleWeight.toFixed(6)} after position and sector caps; 1.000000 is required.`,
      ],
      constraints,
      maximumFeasibleWeight,
    };
  }

  const ordered = [...normalized].sort(
    (left, right) => right.score - left.score || left.id.localeCompare(right.id),
  );
  const positions: RankedPortfolioPosition[] = [];
  const sectorWeights = new Map<string, number>();
  let remainingWeight = 1;

  for (const candidate of ordered) {
    if (remainingWeight <= 1e-12) {
      break;
    }

    const sectorRemaining =
      constraints.maxSectorWeight - (sectorWeights.get(candidate.sector) ?? 0);
    const weight = Math.min(candidate.maxWeight, sectorRemaining, remainingWeight);

    if (weight <= 1e-12) {
      continue;
    }

    positions.push({
      id: candidate.id,
      sector: candidate.sector,
      score: candidate.score,
      weight,
    });
    sectorWeights.set(candidate.sector, (sectorWeights.get(candidate.sector) ?? 0) + weight);
    remainingWeight -= weight;
  }

  if (remainingWeight > 1e-10) {
    return {
      status: "infeasible",
      reasons: [`Deterministic allocation stopped with ${remainingWeight.toFixed(6)} unallocated.`],
      constraints,
      maximumFeasibleWeight,
    };
  }

  const totalWeight = positions.reduce((sum, position) => sum + position.weight, 0);

  return {
    status: "constructed",
    positions,
    sectorWeights: Object.fromEntries(
      [...sectorWeights.entries()].sort(([left], [right]) => left.localeCompare(right)),
    ),
    totalWeight,
    constraints,
  };
}
