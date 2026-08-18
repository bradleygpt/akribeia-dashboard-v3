// Governing strategy state, per the 2026-08-18 corrected go-live blocker
// handoff (sections 4–6): the active set is Katalepsis / Auxo / Statera /
// Pronoia / Kairos; Aristeia and Prosodos are retired and must not receive
// active presentation anywhere. Pinned V2 records predate this state, so the
// surfaces derive presentation from this module rather than from whichever
// strategies happen to exist in the pinned snapshot.

export interface ActiveStrategy {
  name: string;
  factor: string | null;
  note?: string;
}

export interface RetiredStrategy {
  name: string;
  factor: string | null;
  retiredOn: string | null;
  note: string;
}

export const ACTIVE_STRATEGIES: readonly ActiveStrategy[] = [
  { name: "Katalepsis", factor: "ML posterior · c78q" },
  { name: "Auxo", factor: "Growth" },
  { name: "Statera", factor: null },
  { name: "Pronoia", factor: "ML 12-month foresight" },
  {
    name: "Kairos",
    factor: "Event momentum",
    note: "Paper-only sleeve; replaced Aristeia on 2026-08-11.",
  },
] as const;

export const RETIRED_STRATEGIES: readonly RetiredStrategy[] = [
  {
    name: "Aristeia",
    factor: "Event / PEAD",
    retiredOn: "2026-08-11",
    note: "Retired; Kairos holds the replacement slot.",
  },
  {
    name: "Prosodos",
    factor: "Profitability",
    retiredOn: null,
    note: "Retired.",
  },
] as const;

const ACTIVE_NAMES = new Set(ACTIVE_STRATEGIES.map(({ name }) => name));
const RETIRED_NAMES = new Set(RETIRED_STRATEGIES.map(({ name }) => name));

export function isActiveStrategyName(name: string): boolean {
  return ACTIVE_NAMES.has(name);
}

export function isRetiredStrategyName(name: string): boolean {
  return RETIRED_NAMES.has(name);
}

export function strategyFactorLabel(name: string): string | null {
  return (
    ACTIVE_STRATEGIES.find((strategy) => strategy.name === name)?.factor ??
    RETIRED_STRATEGIES.find((strategy) => strategy.name === name)?.factor ??
    null
  );
}

// Splits whatever strategy names a pinned data snapshot contains into the
// governed active set and the retired set, so retired sleeves can never be
// presented as active regardless of the snapshot's vintage.
export function partitionStrategyNames(names: readonly string[]): {
  active: string[];
  retired: string[];
  unknown: string[];
} {
  const active: string[] = [];
  const retired: string[] = [];
  const unknown: string[] = [];
  for (const name of names) {
    if (ACTIVE_NAMES.has(name)) active.push(name);
    else if (RETIRED_NAMES.has(name)) retired.push(name);
    else unknown.push(name);
  }
  return { active, retired, unknown };
}
