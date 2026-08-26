import { readFileSync, readdirSync } from "node:fs";
import { resolve as resolvePath } from "node:path";
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { DailyObservationCollectionReceiptSchema } from "@akribeia/contracts";
import { classifyDailyObservationDate, collectDailyObservation } from "@akribeia/evidence";

const directories: string[] = [];
const attemptedAt = "2026-07-30T16:50:00.000Z";

async function temporaryRoot(): Promise<string> {
  const value = await mkdtemp(join(tmpdir(), "akribeia-daily-observation-"));
  directories.push(value);
  return value;
}

function options(
  value: string,
  overrides: Partial<Parameters<typeof collectDailyObservation>[0]> = {},
) {
  return {
    publishedDataRoot: resolve("apps/dashboard/public/data"),
    evidenceRoot: resolve("data/evidence"),
    dashboardProjectionPath: join(value, "generated", "active-daily.json"),
    publicEvidenceRoot: resolve("apps/dashboard/public/data/evidence"),
    prospectiveReportRoot: join(value, "prospective-report"),
    prospectiveDashboardProjectionPath: join(value, "generated", "active-prospective.json"),
    prospectivePublicReportRoot: join(value, "public-prospective"),
    receiptPath: join(value, "receipt.json"),
    attemptedAt,
    ...overrides,
  };
}

afterEach(async () => {
  await Promise.all(
    directories.splice(0).map((path) => rm(path, { recursive: true, force: true })),
  );
});

const ACTIVE_BUILD_ID = (
  JSON.parse(readFileSync(resolvePath("apps/dashboard/public/data/active-build.json"), "utf8")) as {
    activeBuildId: string;
  }
).activeBuildId;
// The full committed ledger, derived from the repository itself so the
// duplicate-date no-op stays correct as scheduled observations accumulate.
const LEDGER_DATES = readdirSync(resolvePath("data/evidence/daily"))
  .filter((name) => /^\d{4}-\d{2}-\d{2}$/.test(name))
  .sort();
const ACTIVE_AS_OF = ACTIVE_BUILD_ID.match(/preview-(\d{4})(\d{2})(\d{2})/)!
  .slice(1)
  .join("-");

describe("daily prospective observation collection", () => {
  it("collects only when the candidate date advances the ledger", () => {
    expect(classifyDailyObservationDate("2026-07-28", [])).toBe("collect");
    expect(classifyDailyObservationDate("2026-07-29", ["2026-07-28"])).toBe("collect");
  });

  it("treats an existing date as an auditable no-op", () => {
    expect(classifyDailyObservationDate("2026-07-28", ["2026-07-28"])).toBe("no-op-duplicate-date");
  });

  it("blocks a previously unseen date older than the latest observation", () => {
    expect(classifyDailyObservationDate("2026-07-29", ["2026-07-28", "2026-07-30"])).toBe(
      "blocked-backdated-date",
    );
  });

  it("does not inflate the ledger when the active source date already exists", async () => {
    const value = await temporaryRoot();
    const result = await collectDailyObservation(options(value));
    const receipt = DailyObservationCollectionReceiptSchema.parse(
      JSON.parse(await readFile(join(value, "receipt.json"), "utf8")),
    );

    expect(result.receipt.disposition).toBe("no-op-duplicate-date");
    expect(receipt.ledger).toMatchObject({
      observationDates: LEDGER_DATES,
      observationDayCountBefore: LEDGER_DATES.length,
      observationDayCountAfter: LEDGER_DATES.length,
    });
    expect(receipt.dailyEvidence).toBeNull();
    expect(receipt.prospectiveReadiness).toBeNull();
  });

  it("publishes one new immutable day and regenerates prospective readiness", async () => {
    const value = await temporaryRoot();
    const evidenceRoot = join(value, "evidence");
    const publicEvidenceRoot = join(value, "public-evidence");
    await cp(resolve("apps/dashboard/public/data/evidence"), publicEvidenceRoot, {
      recursive: true,
    });
    await rm(join(publicEvidenceRoot, "daily"), { recursive: true, force: true });
    await rm(join(publicEvidenceRoot, "active.json"), { force: true });

    const result = await collectDailyObservation(
      options(value, {
        evidenceRoot,
        publicEvidenceRoot,
      }),
    );

    expect(result.receipt.disposition).toBe("collected");
    expect(result.receipt.ledger).toMatchObject({
      observationDates: [],
      latestObservationDate: null,
      observationDayCountBefore: 0,
      observationDayCountAfter: 1,
    });
    expect(result.receipt.dailyEvidence?.disposition).toBe("published");
    expect(result.receipt.prospectiveReadiness).toMatchObject({
      uniqueObservationDayCount: 1,
      remainingObservationDayCount: 29,
    });
    expect(
      JSON.parse(
        await readFile(
          join(evidenceRoot, "daily", ACTIVE_AS_OF, ACTIVE_BUILD_ID, "evidence.json"),
          "utf8",
        ),
      ).asOfDate,
    ).toBe(ACTIVE_AS_OF);
  });

  it("rejects a forged receipt that inflates collection progress", async () => {
    const value = await temporaryRoot();
    const result = await collectDailyObservation(options(value));

    expect(
      DailyObservationCollectionReceiptSchema.safeParse({
        ...result.receipt,
        disposition: "collected",
        ledger: {
          ...result.receipt.ledger,
          observationDayCountAfter: 30,
        },
      }).success,
    ).toBe(false);
  });

  it("fails before collection when the active dashboard no longer matches its receipt", async () => {
    const value = await temporaryRoot();
    const publishedDataRoot = join(value, "published-data");
    await cp(resolve("apps/dashboard/public/data"), publishedDataRoot, { recursive: true });
    const pointer = JSON.parse(
      await readFile(join(publishedDataRoot, "active-build.json"), "utf8"),
    ) as { activeBuildId: string };
    const dashboardPath = join(
      publishedDataRoot,
      "builds",
      pointer.activeBuildId,
      "dashboard.json",
    );
    await writeFile(dashboardPath, '{"tampered":true}\n');

    await expect(collectDailyObservation(options(value, { publishedDataRoot }))).rejects.toThrow(
      'Active artifact "dashboard" failed byte-size or SHA-256 verification.',
    );
  });
});
