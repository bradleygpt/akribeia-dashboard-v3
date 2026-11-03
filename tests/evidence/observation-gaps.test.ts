import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { ObservationGapLedgerSchema, ObservationGapRecordSchema } from "@akribeia/contracts";

// Missed-observation markers (owner decision 2026-11-03): dated the day they were recorded,
// carrying no observation data, under data/evidence/daily/gaps/ -- a non-date directory every
// ledger reader skips -- with a public copy and the projection the dashboard shows.
const GAP_DIR = resolve("data/evidence/daily/gaps");
const PUBLIC_GAP_DIR = resolve("apps/dashboard/public/data/evidence/daily/gaps");
const jsonFiles = (directory: string) =>
  existsSync(directory)
    ? readdirSync(directory)
        .filter((name) => name.endsWith(".json"))
        .sort()
    : [];
const fileName = (gap: { recordedOn: string; missedFrom: string; missedThrough: string }) =>
  `${gap.recordedOn}-missed-${gap.missedFrom}-to-${gap.missedThrough}.json`;
const ledger = ObservationGapLedgerSchema.parse(
  JSON.parse(
    readFileSync(resolve("apps/dashboard/app/generated/active-observation-gaps.json"), "utf8"),
  ),
);

describe("missed-observation markers", () => {
  it("projects every marker, with byte-identical public copies", () => {
    const names = jsonFiles(GAP_DIR);
    expect(readdirSync(GAP_DIR).sort()).toEqual(names);
    expect(jsonFiles(PUBLIC_GAP_DIR)).toEqual(names);
    expect(ledger.gaps.map(fileName)).toEqual(names);
    for (const name of names) {
      const payload = readFileSync(join(GAP_DIR, name), "utf8");
      expect(readFileSync(join(PUBLIC_GAP_DIR, name), "utf8")).toBe(payload);
      expect(ObservationGapRecordSchema.parse(JSON.parse(payload))).toEqual(
        ledger.gaps.find((gap) => fileName(gap) === name),
      );
    }
  });

  it("never names a ledger date, and sits where no ledger reader looks", () => {
    const ledgerDates = new Set(
      readdirSync(resolve("data/evidence/daily")).filter((name) =>
        /^\d{4}-\d{2}-\d{2}$/.test(name),
      ),
    );
    for (const gap of ledger.gaps) {
      for (const date of gap.missedDates) expect(ledgerDates.has(date)).toBe(false);
      expect(ledgerDates.has(gap.lastObservationBefore)).toBe(true);
      expect(ledgerDates.has(gap.firstObservationAfter)).toBe(true);
    }
    // the readers take only YYYY-MM-DD directories; the maturity scan takes only evidence.json
    expect(/^\d{4}-\d{2}-\d{2}$/.test("gaps")).toBe(false);
    expect(jsonFiles(GAP_DIR)).not.toContain("evidence.json");
  });

  it("records the 2026-10-24 to 2026-11-01 dependency-audit block", () => {
    const gap = ledger.gaps.find(({ missedFrom }) => missedFrom === "2026-10-24");
    expect(gap?.recordedOn).toBe("2026-11-03");
    expect(gap?.missedDates).toHaveLength(9);
    expect(gap?.cause).toBe("refresh-blocked-by-dependency-audit");
  });

  it("refuses a marker that skips a date or carries observation data", () => {
    const gap = ledger.gaps[0]!;
    expect(() =>
      ObservationGapRecordSchema.parse({ ...gap, missedDates: gap.missedDates.slice(1) }),
    ).toThrow();
    expect(() =>
      ObservationGapRecordSchema.parse({ ...gap, build: { buildId: "preview-x" } }),
    ).toThrow();
    expect(() => ObservationGapRecordSchema.parse({ ...gap, recordedOn: "2026-10-30" })).toThrow();
  });
});
