import { readFileSync } from "node:fs";
import { resolve as resolvePath } from "node:path";
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { ProspectiveReadinessSchema } from "@akribeia/contracts";
import { generateProspectiveReadiness } from "@akribeia/evidence";

const directories: string[] = [];

async function temporaryRoot(): Promise<string> {
  const value = await mkdtemp(join(tmpdir(), "akribeia-prospective-readiness-"));
  directories.push(value);
  return value;
}

function options(value: string, evidenceRoot = resolve("apps/dashboard/public/data/evidence")) {
  return {
    evidenceRoot,
    reportRoot: join(value, "report"),
    dashboardProjectionPath: join(value, "generated", "active.json"),
    publicReportRoot: join(value, "public"),
  };
}

afterEach(async () => {
  await Promise.all(
    directories.splice(0).map((path) => rm(path, { recursive: true, force: true })),
  );
});

const COMMITTED_PROSPECTIVE = JSON.parse(
  readFileSync(
    resolvePath("apps/dashboard/app/generated/active-prospective-readiness.json"),
    "utf8",
  ),
) as { progress: Record<string, unknown> };

describe("prospective readiness", () => {
  it("reports one of thirty observation days without inventing execution or performance", async () => {
    const value = await temporaryRoot();
    const result = await generateProspectiveReadiness(options(value));
    const payload = await readFile(result.reportPath, "utf8");
    const report = ProspectiveReadinessSchema.parse(JSON.parse(payload));

    expect(report.prospectiveValidationEligible).toBe(false);
    expect(report.certificationEligible).toBe(false);
    expect(report.progress).toEqual(COMMITTED_PROSPECTIVE.progress);
    expect(report.observations).toHaveLength(
      COMMITTED_PROSPECTIVE.progress.uniqueObservationDayCount as number,
    );
    expect(report.observations[0]).toMatchObject({
      asOfDate: "2026-07-28",
      reproductionVerified: true,
      executionRecorded: false,
      costedReturnComputed: false,
      approvedBenchmarkCompared: false,
    });
    expect(report.controls.map(({ status }) => status)).toEqual([
      "partial",
      "blocked",
      "blocked",
      "blocked",
      "blocked",
      "blocked",
      "blocked",
      "blocked",
    ]);
    expect(report.certificationConditions.every(({ satisfied }) => !satisfied)).toBe(true);
    expect(await readFile(options(value).dashboardProjectionPath, "utf8")).toBe(payload);
  });

  it("reuses identical immutable evidence", async () => {
    const value = await temporaryRoot();

    expect((await generateProspectiveReadiness(options(value))).disposition).toBe("published");
    expect((await generateProspectiveReadiness(options(value))).disposition).toBe("reused");
  });

  it("rejects active reports from different builds", async () => {
    const value = await temporaryRoot();
    const evidenceRoot = join(value, "evidence");
    await cp(resolve("apps/dashboard/public/data/evidence"), evidenceRoot, { recursive: true });
    const benchmarkPath = join(evidenceRoot, "benchmark-readiness", "active.json");
    const benchmark = JSON.parse(await readFile(benchmarkPath, "utf8"));
    benchmark.buildId = "different-build";
    await writeFile(benchmarkPath, `${JSON.stringify(benchmark, null, 2)}\n`);

    await expect(generateProspectiveReadiness(options(value, evidenceRoot))).rejects.toThrow(
      "do not share active lineage",
    );
  });

  it("rejects a daily record whose path does not match its lineage", async () => {
    const value = await temporaryRoot();
    const evidenceRoot = join(value, "evidence");
    await cp(resolve("apps/dashboard/public/data/evidence"), evidenceRoot, { recursive: true });
    await cp(join(evidenceRoot, "daily", "2026-07-28"), join(evidenceRoot, "daily", "2026-07-29"), {
      recursive: true,
    });

    await expect(generateProspectiveReadiness(options(value, evidenceRoot))).rejects.toThrow(
      "does not match its record lineage",
    );
  });

  it("rejects a daily record whose reproducibility receipt is forged", async () => {
    const value = await temporaryRoot();
    const evidenceRoot = join(value, "evidence");
    await cp(resolve("apps/dashboard/public/data/evidence"), evidenceRoot, { recursive: true });
    const reportPath = join(
      evidenceRoot,
      "daily",
      "2026-07-28",
      "preview-20260728-pipeline-v4-a34fc842220f",
      "reproducibility.json",
    );
    const report = JSON.parse(await readFile(reportPath, "utf8"));
    report.evidenceRecordSha256 = "0".repeat(64);
    await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);

    await expect(generateProspectiveReadiness(options(value, evidenceRoot))).rejects.toThrow(
      "reproducibility receipt does not reconcile",
    );
  });

  it("rejects forged prospective eligibility and progress", async () => {
    const value = await temporaryRoot();
    const { report } = await generateProspectiveReadiness(options(value));

    expect(
      ProspectiveReadinessSchema.safeParse({
        ...report,
        prospectiveValidationEligible: true,
        certificationEligible: true,
        progress: {
          ...report.progress,
          uniqueObservationDayCount: 30,
          remainingObservationDayCount: 0,
        },
      }).success,
    ).toBe(false);
  });

  it("refuses to rewrite immutable prospective readiness", async () => {
    const value = await temporaryRoot();
    const first = await generateProspectiveReadiness(options(value));
    await writeFile(first.reportPath, '{"conflict":true}\n');

    await expect(generateProspectiveReadiness(options(value))).rejects.toThrow(
      "Immutable prospective-readiness conflict",
    );
  });
});
