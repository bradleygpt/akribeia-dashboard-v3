import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { WalkForwardReadinessSchema } from "@akribeia/contracts";
import { generateWalkForwardReadiness } from "@akribeia/evidence";

const directories: string[] = [];

async function temporaryRoot(): Promise<string> {
  const value = await mkdtemp(join(tmpdir(), "akribeia-walk-forward-"));
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

describe("walk-forward readiness", () => {
  it("consolidates active blockers without creating an eligible fold", async () => {
    const value = await temporaryRoot();
    const result = await generateWalkForwardReadiness(options(value));
    const payload = await readFile(result.reportPath, "utf8");
    const report = WalkForwardReadinessSchema.parse(JSON.parse(payload));

    expect(report.walkForwardEligible).toBe(false);
    expect(report.outOfSampleEligible).toBe(false);
    expect(report.calendar).toEqual({
      snapshotCount: 2,
      pointInTimeEligibleSnapshotCount: 0,
      candidateFoldCount: 0,
      eligibleFoldCount: 0,
      evaluatedFoldCount: 0,
      performanceComparisonCount: 0,
    });
    expect(report.sourceReports).toHaveLength(7);
    expect(report.sourceReports.every(({ eligibilityClaim }) => !eligibilityClaim)).toBe(true);
    expect(report.controls.map(({ status }) => status)).toEqual([
      "partial",
      "partial",
      "blocked",
      "blocked",
      "blocked",
      "blocked",
      "blocked",
      "blocked",
    ]);
    expect(await readFile(options(value).dashboardProjectionPath, "utf8")).toBe(payload);
  });

  it("reuses identical immutable evidence", async () => {
    const value = await temporaryRoot();
    expect((await generateWalkForwardReadiness(options(value))).disposition).toBe("published");
    expect((await generateWalkForwardReadiness(options(value))).disposition).toBe("reused");
  });

  it("rejects active reports from different builds", async () => {
    const value = await temporaryRoot();
    const evidenceRoot = join(value, "evidence");
    await cp(resolve("apps/dashboard/public/data/evidence"), evidenceRoot, { recursive: true });
    const benchmarkPath = join(evidenceRoot, "benchmark-readiness", "active.json");
    const benchmark = JSON.parse(await readFile(benchmarkPath, "utf8"));
    benchmark.buildId = "different-build";
    await writeFile(benchmarkPath, `${JSON.stringify(benchmark, null, 2)}\n`);

    await expect(generateWalkForwardReadiness(options(value, evidenceRoot))).rejects.toThrow(
      "do not share active lineage",
    );
  });

  it("rejects forged fold and eligibility claims", async () => {
    const value = await temporaryRoot();
    const { report } = await generateWalkForwardReadiness(options(value));

    expect(
      WalkForwardReadinessSchema.safeParse({
        ...report,
        walkForwardEligible: true,
        outOfSampleEligible: true,
        calendar: {
          ...report.calendar,
          candidateFoldCount: 1,
          eligibleFoldCount: 1,
          evaluatedFoldCount: 1,
          performanceComparisonCount: 1,
        },
      }).success,
    ).toBe(false);
  });

  it("rejects a source report claiming eligibility", async () => {
    const value = await temporaryRoot();
    const { report } = await generateWalkForwardReadiness(options(value));

    expect(
      WalkForwardReadinessSchema.safeParse({
        ...report,
        sourceReports: report.sourceReports.map((source, index) =>
          index === 0 ? { ...source, eligibilityClaim: true } : source,
        ),
      }).success,
    ).toBe(false);
  });

  it("refuses to rewrite immutable walk-forward readiness", async () => {
    const value = await temporaryRoot();
    const first = await generateWalkForwardReadiness(options(value));
    await writeFile(first.reportPath, '{"conflict":true}\n');

    await expect(generateWalkForwardReadiness(options(value))).rejects.toThrow(
      "Immutable walk-forward-readiness conflict",
    );
  });
});
