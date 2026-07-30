export const PORTFOLIO_WEIGHT_SCALE = 1_000_000_000;

export interface CappedWeightInput {
  id: string;
  rawWeight: number;
  maxWeight: number;
}

export interface CappedWeightResult {
  id: string;
  weight: number;
  weightUnits: number;
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
  weightUnits: number;
  maxWeight: number;
  maxWeightUnits: number;
}

export interface SectorCapacityEvidence {
  sector: string;
  candidateCapacity: number;
  candidateCapacityUnits: number;
  cappedCapacity: number;
  cappedCapacityUnits: number;
}

export interface PortfolioConstructionEvidence {
  method: "ranked-greedy-integer-units-v1";
  weightScale: number;
  candidateCount: number;
  sectorCount: number;
  maximumFeasibleWeight: number;
  maximumFeasibleWeightUnits: number;
  sectorCapacities: SectorCapacityEvidence[];
  bindingPositionIds: string[];
  bindingSectors: string[];
}

export interface PortfolioInfeasibility {
  code: "insufficient-capped-capacity" | "allocation-invariant-failed";
  message: string;
  requiredWeight: 1;
  requiredWeightUnits: number;
  maximumFeasibleWeight: number;
  maximumFeasibleWeightUnits: number;
  shortfallWeight: number;
  shortfallWeightUnits: number;
  sectorCapacities: SectorCapacityEvidence[];
}

export type RankedPortfolioResult =
  | {
      status: "constructed";
      positions: RankedPortfolioPosition[];
      sectorWeights: Record<string, number>;
      sectorWeightUnits: Record<string, number>;
      totalWeight: 1;
      totalWeightUnits: number;
      constraints: RankedPortfolioConstraints;
      construction: PortfolioConstructionEvidence;
    }
  | {
      status: "infeasible";
      reasons: string[];
      constraints: RankedPortfolioConstraints;
      maximumFeasibleWeight: number;
      maximumFeasibleWeightUnits: number;
      infeasibility: PortfolioInfeasibility;
    };

function compareText(left: string, right: string): number {
  return left === right ? 0 : left < right ? -1 : 1;
}

function validateCanonicalText(name: string, value: string): void {
  if (value.length === 0 || value !== value.trim()) {
    throw new Error(`${name} must be nonempty and contain no surrounding whitespace.`);
  }
}

function weightToUnits(name: string, value: number): number {
  if (!Number.isFinite(value) || value <= 0 || value > 1) {
    throw new Error(`${name} must be greater than 0 and no greater than 1.`);
  }

  const scaled = value * PORTFOLIO_WEIGHT_SCALE;
  const units = Math.round(scaled);

  if (Math.abs(scaled - units) > 1e-6) {
    throw new Error(`${name} must be representable to nine decimal places.`);
  }

  return units;
}

function unitsToWeight(units: number): number {
  return units / PORTFOLIO_WEIGHT_SCALE;
}

function allocateProportionally(
  inputs: Array<CappedWeightInput & { maxWeightUnits: number }>,
  remainingWeightUnits: number,
): Map<string, number> {
  const rawTotal = inputs.reduce((sum, item) => sum + item.rawWeight, 0);

  if (rawTotal <= 0) {
    throw new Error("Remaining raw weights must contain a positive value.");
  }

  const allocations = new Map<string, number>();
  const remainders = inputs.map((item) => {
    const exactUnits = (remainingWeightUnits * item.rawWeight) / rawTotal;
    const baseUnits = Math.min(Math.floor(exactUnits), item.maxWeightUnits);

    allocations.set(item.id, baseUnits);

    return {
      id: item.id,
      fractionalUnits: exactUnits - Math.floor(exactUnits),
      maxWeightUnits: item.maxWeightUnits,
    };
  });
  let unitsLeft =
    remainingWeightUnits - [...allocations.values()].reduce((sum, units) => sum + units, 0);
  const orderedRemainders = remainders.sort(
    (left, right) => right.fractionalUnits - left.fractionalUnits || compareText(left.id, right.id),
  );

  while (unitsLeft > 0) {
    let allocated = false;

    for (const item of orderedRemainders) {
      const current = allocations.get(item.id) ?? 0;

      if (current >= item.maxWeightUnits) {
        continue;
      }

      allocations.set(item.id, current + 1);
      unitsLeft -= 1;
      allocated = true;

      if (unitsLeft === 0) {
        break;
      }
    }

    if (!allocated) {
      throw new Error("Position caps cannot support the remaining allocation.");
    }
  }

  return allocations;
}

export function projectToCappedSimplex(inputs: CappedWeightInput[]): CappedWeightResult[] {
  if (inputs.length === 0) return [];

  const ids = new Set<string>();
  const normalized = inputs.map((item) => {
    validateCanonicalText("Capped-weight ID", item.id);

    if (ids.has(item.id)) {
      throw new Error(`Duplicate capped-weight ID "${item.id}".`);
    }
    if (!Number.isFinite(item.rawWeight) || item.rawWeight < 0) {
      throw new Error(`rawWeight for "${item.id}" must be finite and nonnegative.`);
    }

    ids.add(item.id);

    return {
      ...item,
      maxWeightUnits: weightToUnits(`maxWeight for "${item.id}"`, item.maxWeight),
    };
  });
  const capTotalUnits = normalized.reduce((sum, item) => sum + item.maxWeightUnits, 0);

  if (capTotalUnits < PORTFOLIO_WEIGHT_SCALE) {
    throw new Error("Position caps cannot support a fully invested portfolio.");
  }

  const remaining = new Set(normalized.map((item) => item.id));
  const result = new Map<string, number>();
  let remainingWeightUnits = PORTFOLIO_WEIGHT_SCALE;

  while (remaining.size > 0) {
    const candidates = normalized.filter((item) => remaining.has(item.id));
    const rawTotal = candidates.reduce((sum, item) => sum + item.rawWeight, 0);

    if (rawTotal <= 0) {
      throw new Error("Remaining raw weights must contain a positive value.");
    }

    const capped = candidates.filter(
      (item) => (remainingWeightUnits * item.rawWeight) / rawTotal > item.maxWeightUnits,
    );

    if (capped.length === 0) {
      const allocations = allocateProportionally(candidates, remainingWeightUnits);

      for (const [id, units] of allocations) {
        result.set(id, units);
      }
      break;
    }

    for (const item of capped.sort((left, right) => compareText(left.id, right.id))) {
      result.set(item.id, item.maxWeightUnits);
      remainingWeightUnits -= item.maxWeightUnits;
      remaining.delete(item.id);
    }
  }

  return inputs.map((item) => {
    const weightUnits = result.get(item.id) ?? 0;

    return {
      id: item.id,
      weight: unitsToWeight(weightUnits),
      weightUnits,
    };
  });
}

function buildSectorCapacityEvidence(
  capacityUnitsBySector: ReadonlyMap<string, number>,
  maxSectorWeightUnits: number,
): SectorCapacityEvidence[] {
  return [...capacityUnitsBySector.entries()]
    .sort(([left], [right]) => compareText(left, right))
    .map(([sector, candidateCapacityUnits]) => {
      const cappedCapacityUnits = Math.min(candidateCapacityUnits, maxSectorWeightUnits);

      return {
        sector,
        candidateCapacity: unitsToWeight(candidateCapacityUnits),
        candidateCapacityUnits,
        cappedCapacity: unitsToWeight(cappedCapacityUnits),
        cappedCapacityUnits,
      };
    });
}

function infeasibleResult(
  code: PortfolioInfeasibility["code"],
  constraints: RankedPortfolioConstraints,
  maximumFeasibleWeightUnits: number,
  sectorCapacities: SectorCapacityEvidence[],
  message: string,
): RankedPortfolioResult {
  const shortfallWeightUnits = Math.max(0, PORTFOLIO_WEIGHT_SCALE - maximumFeasibleWeightUnits);
  const infeasibility: PortfolioInfeasibility = {
    code,
    message,
    requiredWeight: 1,
    requiredWeightUnits: PORTFOLIO_WEIGHT_SCALE,
    maximumFeasibleWeight: unitsToWeight(maximumFeasibleWeightUnits),
    maximumFeasibleWeightUnits,
    shortfallWeight: unitsToWeight(shortfallWeightUnits),
    shortfallWeightUnits,
    sectorCapacities,
  };

  return {
    status: "infeasible",
    reasons: [message],
    constraints,
    maximumFeasibleWeight: infeasibility.maximumFeasibleWeight,
    maximumFeasibleWeightUnits,
    infeasibility,
  };
}

export function constructRankedCappedPortfolio(
  candidates: RankedPortfolioCandidate[],
  constraints: RankedPortfolioConstraints,
): RankedPortfolioResult {
  const maxPositionWeightUnits = weightToUnits("maxPositionWeight", constraints.maxPositionWeight);
  const maxSectorWeightUnits = weightToUnits("maxSectorWeight", constraints.maxSectorWeight);
  const ids = new Set<string>();
  const normalized = candidates.map((candidate) => {
    validateCanonicalText("Portfolio candidate ID", candidate.id);
    validateCanonicalText(`Sector for "${candidate.id}"`, candidate.sector);

    if (ids.has(candidate.id)) {
      throw new Error(`Duplicate portfolio candidate ID "${candidate.id}".`);
    }
    if (!Number.isFinite(candidate.score)) {
      throw new Error(`Portfolio candidate "${candidate.id}" requires a finite score.`);
    }

    ids.add(candidate.id);

    const requestedMaxWeight = candidate.maxWeight ?? constraints.maxPositionWeight;
    const requestedMaxWeightUnits = weightToUnits(
      `maxWeight for "${candidate.id}"`,
      requestedMaxWeight,
    );
    const maxWeightUnits = Math.min(requestedMaxWeightUnits, maxPositionWeightUnits);

    return {
      ...candidate,
      maxWeight: unitsToWeight(maxWeightUnits),
      maxWeightUnits,
    };
  });
  const capacityUnitsBySector = new Map<string, number>();

  for (const candidate of normalized) {
    capacityUnitsBySector.set(
      candidate.sector,
      (capacityUnitsBySector.get(candidate.sector) ?? 0) + candidate.maxWeightUnits,
    );
  }

  const sectorCapacities = buildSectorCapacityEvidence(capacityUnitsBySector, maxSectorWeightUnits);
  const maximumFeasibleWeightUnits = sectorCapacities.reduce(
    (sum, capacity) => sum + capacity.cappedCapacityUnits,
    0,
  );

  if (maximumFeasibleWeightUnits < PORTFOLIO_WEIGHT_SCALE) {
    const maximumFeasibleWeight = unitsToWeight(maximumFeasibleWeightUnits);

    return infeasibleResult(
      "insufficient-capped-capacity",
      constraints,
      maximumFeasibleWeightUnits,
      sectorCapacities,
      `Candidate capacity reaches only ${maximumFeasibleWeight.toFixed(9)} after position and sector caps; 1.000000000 is required.`,
    );
  }

  const ordered = [...normalized].sort(
    (left, right) => right.score - left.score || compareText(left.id, right.id),
  );
  const positions: RankedPortfolioPosition[] = [];
  const sectorWeightUnits = new Map<string, number>();
  let remainingWeightUnits = PORTFOLIO_WEIGHT_SCALE;

  for (const candidate of ordered) {
    if (remainingWeightUnits === 0) {
      break;
    }

    const sectorRemainingWeightUnits =
      maxSectorWeightUnits - (sectorWeightUnits.get(candidate.sector) ?? 0);
    const weightUnits = Math.min(
      candidate.maxWeightUnits,
      sectorRemainingWeightUnits,
      remainingWeightUnits,
    );

    if (weightUnits <= 0) {
      continue;
    }

    positions.push({
      id: candidate.id,
      sector: candidate.sector,
      score: candidate.score,
      weight: unitsToWeight(weightUnits),
      weightUnits,
      maxWeight: candidate.maxWeight,
      maxWeightUnits: candidate.maxWeightUnits,
    });
    sectorWeightUnits.set(
      candidate.sector,
      (sectorWeightUnits.get(candidate.sector) ?? 0) + weightUnits,
    );
    remainingWeightUnits -= weightUnits;
  }

  if (remainingWeightUnits > 0) {
    return infeasibleResult(
      "allocation-invariant-failed",
      constraints,
      maximumFeasibleWeightUnits,
      sectorCapacities,
      `Deterministic allocation stopped with ${unitsToWeight(remainingWeightUnits).toFixed(9)} unallocated despite sufficient preflight capacity.`,
    );
  }

  const orderedSectorUnits = [...sectorWeightUnits.entries()].sort(([left], [right]) =>
    compareText(left, right),
  );
  const sectorWeightUnitRecord = Object.fromEntries(orderedSectorUnits);

  return {
    status: "constructed",
    positions,
    sectorWeights: Object.fromEntries(
      orderedSectorUnits.map(([sector, units]) => [sector, unitsToWeight(units)]),
    ),
    sectorWeightUnits: sectorWeightUnitRecord,
    totalWeight: 1,
    totalWeightUnits: PORTFOLIO_WEIGHT_SCALE,
    constraints,
    construction: {
      method: "ranked-greedy-integer-units-v1",
      weightScale: PORTFOLIO_WEIGHT_SCALE,
      candidateCount: normalized.length,
      sectorCount: capacityUnitsBySector.size,
      maximumFeasibleWeight: unitsToWeight(maximumFeasibleWeightUnits),
      maximumFeasibleWeightUnits,
      sectorCapacities,
      bindingPositionIds: positions
        .filter((position) => position.weightUnits === position.maxWeightUnits)
        .map((position) => position.id),
      bindingSectors: orderedSectorUnits
        .filter(([, units]) => units === maxSectorWeightUnits)
        .map(([sector]) => sector),
    },
  };
}
