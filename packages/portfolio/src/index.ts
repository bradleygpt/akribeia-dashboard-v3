export interface CappedWeightInput {
  id: string;
  rawWeight: number;
  maxWeight: number;
}

export interface CappedWeightResult {
  id: string;
  weight: number;
}

export function projectToCappedSimplex(inputs: CappedWeightInput[]): CappedWeightResult[] {
  if (inputs.length === 0) return [];
  const capTotal = inputs.reduce((sum, item) => sum + item.maxWeight, 0);
  if (capTotal < 1 - 1e-12) throw new Error("Position caps cannot support a fully invested portfolio.");

  const remaining = new Set(inputs.map((item) => item.id));
  const result = new Map<string, number>();
  let remainingBudget = 1;

  while (remaining.size > 0) {
    const candidates = inputs.filter((item) => remaining.has(item.id));
    const rawTotal = candidates.reduce((sum, item) => sum + Math.max(0, item.rawWeight), 0);
    if (rawTotal <= 0) throw new Error("Remaining raw weights must contain a positive value.");

    let cappedAny = false;
    for (const item of candidates) {
      const proposed = remainingBudget * Math.max(0, item.rawWeight) / rawTotal;
      if (proposed > item.maxWeight + 1e-12) {
        result.set(item.id, item.maxWeight);
        remainingBudget -= item.maxWeight;
        remaining.delete(item.id);
        cappedAny = true;
      }
    }

    if (!cappedAny) {
      for (const item of candidates) {
        result.set(item.id, remainingBudget * Math.max(0, item.rawWeight) / rawTotal);
      }
      break;
    }
  }

  return inputs.map((item) => ({ id: item.id, weight: result.get(item.id) ?? 0 }));
}
