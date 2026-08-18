import activeInstitutional from "../generated/active-institutional-intelligence.json";
import type { InstitutionalIntelligence } from "@akribeia/contracts";

// The generated artifact is schema-validated at generation time; the cast keeps
// the page layer on the same contract type without re-parsing at runtime.
export const institutionalIntelligence = activeInstitutional as InstitutionalIntelligence;

export type InstitutionalManagerView = InstitutionalIntelligence["managers"][number];
export type InstitutionalRollupView = InstitutionalIntelligence["stockRollups"][number];

export function getInstitutionalManager(cik: string): InstitutionalManagerView | null {
  return institutionalIntelligence.managers.find((manager) => manager.cik === cik) ?? null;
}

export function getInstitutionalRollup(ticker: string): InstitutionalRollupView | null {
  return (
    institutionalIntelligence.stockRollups.find(
      (rollup) => rollup.ticker === ticker.toUpperCase(),
    ) ?? null
  );
}

export function latestUsablePeriod(
  manager: InstitutionalManagerView,
): InstitutionalManagerView["periods"][number] | null {
  const usable = manager.periods.filter(({ effectiveState }) => effectiveState === "usable");
  return usable.at(-1) ?? manager.periods.at(-1) ?? null;
}

export function latestFilingDate(manager: InstitutionalManagerView): string | null {
  const period = latestUsablePeriod(manager);
  if (period === null) return null;
  return period.filings.at(-1)?.filingDate ?? null;
}

export function reportingLagDays(periodOfReport: string, filingDate: string): number {
  return Math.round(
    (Date.parse(`${filingDate}T00:00:00Z`) - Date.parse(`${periodOfReport}T00:00:00Z`)) /
      86_400_000,
  );
}

export function formatUsdCompact(value: number | null): string {
  if (value === null) return "Unavailable";
  const abs = Math.abs(value);
  const sign = value < 0 ? "-" : "";
  if (abs >= 1e12) return `${sign}$${(abs / 1e12).toFixed(2)}T`;
  if (abs >= 1e9) return `${sign}$${(abs / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `${sign}$${(abs / 1e6).toFixed(1)}M`;
  if (abs >= 1e3) return `${sign}$${(abs / 1e3).toFixed(0)}K`;
  return `${sign}$${abs.toFixed(0)}`;
}

export function formatShares(value: number | null): string {
  if (value === null) return "—";
  if (value >= 1e9) return `${(value / 1e9).toFixed(2)}B`;
  if (value >= 1e6) return `${(value / 1e6).toFixed(2)}M`;
  if (value >= 1e3) return `${(value / 1e3).toFixed(1)}K`;
  return value.toFixed(0);
}

export const CLASSIFICATION_LABELS: Record<string, string> = {
  NEW: "New",
  INCREASED: "Increased",
  REDUCED: "Reduced",
  EXITED: "Exited",
  UNCHANGED: "Unchanged",
};
