import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  EXCLUDED_SECURITY_TICKERS,
  isExcludedSecurityTicker,
} from "../../apps/dashboard/app/security-exclusions";
import { getResearchSecurity, loadResearchUniverse } from "../../apps/dashboard/app/research-data";
import { V2_UNIVERSE_EXPECTED, loadV2Universe } from "../../apps/dashboard/app/v2-universe";

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(new URL(`../../${path}`, import.meta.url), "utf8"));
}

describe("governed security exclusions", () => {
  it("registers MCW as an excluded contaminated identity", () => {
    expect(EXCLUDED_SECURITY_TICKERS.has("MCW")).toBe(true);
    expect(isExcludedSecurityTicker("mcw")).toBe(true);
    const registry = readJson("data/reference/governed-security-exclusions.json") as {
      exclusions: Array<{ ticker: string; reason: string; directive: string }>;
    };
    const mcw = registry.exclusions.find(({ ticker }) => ticker === "MCW");
    expect(mcw?.reason).toContain("identity");
    expect(mcw?.directive.length).toBeGreaterThan(0);
  });

  it("keeps the preserved V2 archive byte-identical while the governed universe excludes MCW", () => {
    const archiveBytes = readFileSync(
      new URL("../../data/reference/v2-baseline/fixtures/universe_floor0.json", import.meta.url),
    );
    // The archive still contains the contaminated row (historical capture)...
    const archive = JSON.parse(archiveBytes.toString("utf8")) as {
      rows: Array<{ ticker: string }>;
    };
    expect(archive.rows.some(({ ticker }) => ticker === "MCW")).toBe(true);
    expect(archive.rows).toHaveLength(1361);
    // ...and its pinned V2 provenance hash is untouched.
    expect(createHash("sha256").update(archiveBytes).digest("hex")).toBe(
      V2_UNIVERSE_EXPECTED.sha256,
    );

    // The governed universe served to every surface excludes it, with counts
    // recomputed rather than patched.
    const universe = loadResearchUniverse();
    expect(universe.rows.some(({ ticker }) => ticker === "MCW")).toBe(false);
    expect(universe.total).toBe(1360);
    expect(universe.stocks).toBe(1290);
    expect(universe.etfs).toBe(70);
    expect(universe.total).toBe(universe.rows.length);
    expect(getResearchSecurity("MCW")).toBeNull();

    // Both universe loaders govern identically.
    const displayUniverse = loadV2Universe();
    expect(displayUniverse.rows.some(({ ticker }) => ticker === "MCW")).toBe(false);
    expect(displayUniverse.total).toBe(1360);
    expect(displayUniverse.stocks).toBe(1290);
    expect(displayUniverse.etfs).toBe(70);
  });

  it("removes MCW from the canonical ETF artifact with recomputed coverage", () => {
    const canonical = readJson("apps/dashboard/public/data/etf-holdings-canonical.json") as {
      coverage: {
        canonicalEquities: number;
        equitiesCovered: number;
        equitiesUncovered: number;
        retainedEtfs: number;
      };
      funds: Array<{ ticker: string }>;
      rows: Array<{ etfTicker: string; constituentTicker: string }>;
      invertedIndex: Record<string, unknown>;
      source: { governedExclusions?: string[] };
    };
    expect(canonical.rows.some(({ constituentTicker }) => constituentTicker === "MCW")).toBe(false);
    expect("MCW" in canonical.invertedIndex).toBe(false);
    expect(canonical.source.governedExclusions).toEqual(["MCW"]);
    expect(canonical.coverage.canonicalEquities).toBe(1290);
    expect(canonical.coverage.equitiesCovered + canonical.coverage.equitiesUncovered).toBe(1290);
    // Every fund that held MCW retains its listing through its other holdings.
    expect(canonical.coverage.retainedEtfs).toBe(canonical.funds.length);
    const coveredTickers = new Set(canonical.rows.map(({ constituentTicker }) => constituentTicker));
    expect(canonical.coverage.equitiesCovered).toBe(coveredTickers.size);
  });

  it("removes MCW from every runtime shard and dictionary", () => {
    const dictionary = JSON.stringify(
      readJson("apps/dashboard/public/data/etf-runtime/canonical-ticker-dictionary.json"),
    );
    expect(dictionary.includes('"MCW"')).toBe(false);
  });
});
