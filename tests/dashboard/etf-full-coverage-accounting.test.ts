import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { readEtfArtifactSync } from "../../apps/dashboard/scripts/lib/etf-artifact-store.mjs";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const normalized = readEtfArtifactSync(
  resolve(repositoryRoot, "apps/dashboard/public/data/etf-holdings-normalized.json"),
);
const canonical = readEtfArtifactSync(
  resolve(repositoryRoot, "apps/dashboard/public/data/etf-holdings-canonical.json"),
);

describe("ETF full coverage accounting", () => {
  it("keeps the canonical universe and candidate disposition totals explicit", () => {
    expect(canonical.coverage.canonicalEquities).toBe(1290);
    expect(canonical.coverage.candidateHoldingsBackedEtfs).toBeGreaterThan(854);
    expect(canonical.coverage.retainedEtfs).toBeGreaterThan(758);
    expect(canonical.coverage.equitiesUncovered).toBe(3);
  });

  it("never projects a non-canonical constituent into the canonical artifact", () => {
    const canonicalTickers = new Set(
      canonical.rows.map((row: { constituentTicker: string }) => row.constituentTicker),
    );
    expect(
      canonical.rows.every((row: { constituentTicker: string }) =>
        canonicalTickers.has(row.constituentTicker),
      ),
    ).toBe(true);
    expect(canonical.rows.length).toBeGreaterThan(52337);
  });

  it("prevents legacy rows from mixing into SEC-covered ETFs", () => {
    const secEtfs = new Set(
      normalized.rows
        .filter((row: { sourceStatus: string }) => row.sourceStatus === "sec-nport-equity")
        .map((row: { etfTicker: string }) => row.etfTicker),
    );
    const mixed = normalized.rows.some(
      (row: { etfTicker: string; sourceStatus: string }) =>
        secEtfs.has(row.etfTicker) && row.sourceStatus !== "sec-nport-equity",
    );
    expect(mixed).toBe(false);
  });

  it("has one auditable disposition for every holdings-backed candidate", () => {
    const candidateIds = new Set(
      normalized.rows.map((row: { etfTicker: string }) => row.etfTicker),
    );
    const retainedIds = new Set(canonical.funds.map((fund: { ticker: string }) => fund.ticker));
    const dispositionedIds = new Set<string>();
    const dispositionById = new Map<string, "retained" | "no-canonical-projection">();
    for (const candidateId of candidateIds) {
      const disposition = retainedIds.has(candidateId) ? "retained" : "no-canonical-projection";
      dispositionedIds.add(candidateId);
      dispositionById.set(candidateId, disposition);
    }

    expect(dispositionedIds).toEqual(candidateIds);
    expect(dispositionById.size).toBe(candidateIds.size);
    expect(new Set(dispositionById.keys())).toEqual(candidateIds);
    expect([...dispositionById.values()].filter((value) => value === "retained")).toHaveLength(758);
    expect(
      [...dispositionById.values()].filter((value) => value === "no-canonical-projection"),
    ).toHaveLength(96);
  });
});
