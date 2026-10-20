import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { UpstreamStallLedgerSchema, UpstreamStallRecordSchema } from "@akribeia/contracts";

// No-new-upstream-data days (owner decision 2026-10-20, audit E3) are written by the ingest:
// one immutable record per date, a public copy, and the projection the dashboard shows.
const STALL_DIR = resolve("data/evidence/upstream-stalls");
const PUBLIC_STALL_DIR = resolve("apps/dashboard/public/data/evidence/upstream-stalls");
// the directories appear with the first stall day
const jsonFiles = (directory: string) =>
  existsSync(directory)
    ? readdirSync(directory)
        .filter((name) => name.endsWith(".json"))
        .sort()
    : [];

describe("no-new-upstream-data ledger", () => {
  it("projects every recorded stall day, with byte-identical public copies", () => {
    const ledger = UpstreamStallLedgerSchema.parse(
      JSON.parse(
        readFileSync(resolve("apps/dashboard/app/generated/active-upstream-stalls.json"), "utf8"),
      ),
    );
    const names = jsonFiles(STALL_DIR);

    expect(jsonFiles(PUBLIC_STALL_DIR)).toEqual(names);
    expect(ledger.stalls.map(({ observationDate }) => `${observationDate}.json`)).toEqual(names);
    for (const name of names) {
      const payload = readFileSync(join(STALL_DIR, name), "utf8");
      expect(readFileSync(join(PUBLIC_STALL_DIR, name), "utf8")).toBe(payload);
      expect(UpstreamStallRecordSchema.parse(JSON.parse(payload))).toEqual(
        ledger.stalls.find(({ observationDate }) => `${observationDate}.json` === name),
      );
    }
  });

  it("never lets a stall day be an observation day", () => {
    const ledgerDates = new Set(readdirSync(resolve("data/evidence/daily")));
    for (const name of jsonFiles(STALL_DIR)) {
      expect(ledgerDates.has(name.replace(/\.json$/, ""))).toBe(false);
    }
  });

  it("refuses a stall that does not follow the observation it repeats", () => {
    const stall = {
      recordSchemaVersion: "1.0.0",
      observationDate: "2026-10-21",
      recordedAt: "2026-10-21T05:50:00Z",
      disposition: "no-new-upstream-data",
      countsTowardProspectiveHistory: false,
      v2Commit: "a".repeat(40),
      v2SourceCommit: "abb0079",
      v2GeneratedAt: "2026-10-21T02:10:00Z",
      bulkDataCommit: "b".repeat(40),
      dataAsOf: "2026-10-20T00:00:00Z",
      universeSha256: {
        "universe_floor0.json": "0".repeat(64),
        "universe_floor1.json": "1".repeat(64),
        "universe_floor10.json": "2".repeat(64),
      },
      unchangedSince: {
        observationDate: "2026-10-20",
        buildId: "preview-20261020-pipeline-v6-f88d3b9d1b6f",
      },
      reason: "unchanged",
    };

    expect(UpstreamStallRecordSchema.safeParse(stall).success).toBe(true);
    expect(
      UpstreamStallRecordSchema.safeParse({
        ...stall,
        unchangedSince: { ...stall.unchangedSince, observationDate: "2026-10-21" },
      }).success,
    ).toBe(false);
    expect(
      UpstreamStallRecordSchema.safeParse({ ...stall, countsTowardProspectiveHistory: true })
        .success,
    ).toBe(false);
    expect(
      UpstreamStallLedgerSchema.safeParse({
        ledgerSchemaVersion: "1.0.0",
        stallDayCount: 2,
        stalls: [stall, stall],
      }).success,
    ).toBe(false);
  });
});
