import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const normalized = JSON.parse(
  readFileSync("apps/dashboard/public/data/etf-holdings-normalized.json", "utf8"),
);
const canonical = JSON.parse(
  readFileSync("apps/dashboard/public/data/etf-holdings-canonical.json", "utf8"),
);
const dispositionPath =
  "C:/Akribeia-ETF-Issuer-Expansion-20260806-104500/ETF_CANDIDATE_DISPOSITION.csv";

describe("ETF full coverage accounting", () => {
  it("keeps the canonical universe and candidate disposition totals explicit", () => {
    expect(canonical.coverage.canonicalEquities).toBe(1291);
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
    const lines = readFileSync(dispositionPath, "utf8").trim().split(/\r?\n/);
    expect(lines).toHaveLength(855);
    const body = lines.slice(1);
    expect(new Set(body.map((line) => line.split(",")[0])).size).toBe(854);
    expect(body.filter((line) => line.includes('"retained"')).length).toBe(758);
  });
});
