import governedExclusions from "../../../data/reference/governed-security-exclusions.json";

// Governed security exclusions: tickers that must not appear in the governed
// dashboard universe or any derived surface or count. The preserved V2
// baseline fixture is deliberately left byte-identical; exclusion happens at
// every point of derivation so derived counts are recomputed, never patched.
export interface GovernedSecurityExclusion {
  ticker: string;
  reason: string;
  directive: string;
  excludedAt: string;
}

export const GOVERNED_SECURITY_EXCLUSIONS: readonly GovernedSecurityExclusion[] = (
  governedExclusions as {
    exclusions: GovernedSecurityExclusion[];
  }
).exclusions;

export const EXCLUDED_SECURITY_TICKERS: ReadonlySet<string> = new Set(
  GOVERNED_SECURITY_EXCLUSIONS.map(({ ticker }) => ticker.toUpperCase()),
);

export function isExcludedSecurityTicker(ticker: string): boolean {
  return EXCLUDED_SECURITY_TICKERS.has(ticker.trim().toUpperCase());
}
