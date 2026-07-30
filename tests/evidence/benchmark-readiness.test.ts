import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { BenchmarkReadinessSchema } from "@akribeia/contracts";
import { generateBenchmarkReadiness } from "@akribeia/evidence";

const directories: string[] = [];

async function temporaryRoot(): Promise<string> {
  const value = await mkdtemp(join(tmpdir(), "akribeia-benchmark-readiness-"));
  directories.push(value);
  return value;
}

function options(
  value: string,
  overrides: Partial<Parameters<typeof generateBenchmarkReadiness>[0]> = {},
) {
  return {
    activeHistoricalReadinessPath: resolve(
      "apps/dashboard/public/data/evidence/historical-readiness/active.json",
    ),
    activeUniverseMembershipPath: resolve(
      "apps/dashboard/public/data/evidence/universe-membership/active.json",
    ),
    activeSecRegistrantsPath: resolve(
      "apps/dashboard/public/data/evidence/sec-registrants/active.json",
    ),
    reportRoot: join(value, "report"),
    dashboardProjectionPath: join(value, "generated", "active.json"),
    publicReportRoot: join(value, "public"),
    ...overrides,
  };
}

afterEach(async () => {
  await Promise.all(
    directories.splice(0).map((path) => rm(path, { recursive: true, force: true })),
  );
});

describe("benchmark readiness", () => {
  it("inventories candidate proxies without turning price comparisons into returns", async () => {
    const value = await temporaryRoot();
    const result = await generateBenchmarkReadiness(options(value));
    const payload = await readFile(result.reportPath, "utf8");
    const report = BenchmarkReadinessSchema.parse(JSON.parse(payload));

    expect(report.benchmarkSelected).toBe(false);
    expect(report.benchmarkReturnEligible).toBe(false);
    expect(report.comparison).toMatchObject({
      earlierEtfCount: 55,
      laterEtfCount: 55,
      candidateCount: 8,
      observedPriceComparisonCount: 8,
      totalReturnObservationCount: 0,
      selectedBenchmarkId: null,
    });
    expect(report.candidates.map(({ ticker }) => ticker)).toEqual([
      "ITOT",
      "IVV",
      "SCHB",
      "SPLG",
      "SPTM",
      "SPY",
      "VOO",
      "VTI",
    ]);
    expect(report.coverage).toEqual({
      candidateCount: 8,
      currentSecFundAssociationCount: 6,
      unmatchedCurrentAssociationCount: 2,
      observedPriceComparisonCount: 8,
      totalReturnObservationCount: 0,
    });
    expect(
      report.candidates
        .filter(({ currentSecFundAssociation }) => currentSecFundAssociation === null)
        .map(({ ticker }) => ticker),
    ).toEqual(["SPLG", "SPY"]);
    expect(report.candidates.every(({ totalReturn }) => totalReturn === null)).toBe(true);
    expect(report.controls.map(({ status }) => status)).toEqual([
      "pass",
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
    expect((await generateBenchmarkReadiness(options(value))).disposition).toBe("published");
    expect((await generateBenchmarkReadiness(options(value))).disposition).toBe("reused");
  });

  it("rejects membership evidence from a different build", async () => {
    const value = await temporaryRoot();
    const membership = JSON.parse(
      await readFile(options(value).activeUniverseMembershipPath, "utf8"),
    );
    membership.buildId = "different-build";
    const activeUniverseMembershipPath = join(value, "wrong-membership.json");
    await writeFile(activeUniverseMembershipPath, `${JSON.stringify(membership, null, 2)}\n`);

    await expect(
      generateBenchmarkReadiness(options(value, { activeUniverseMembershipPath })),
    ).rejects.toThrow("do not share active lineage");
  });

  it("fails closed when a source snapshot no longer matches its receipt", async () => {
    const value = await temporaryRoot();
    const historical = JSON.parse(
      await readFile(options(value).activeHistoricalReadinessPath, "utf8"),
    );
    historical.snapshots[0].artifacts.find(
      ({ floorBillions }: { floorBillions: number }) => floorBillions === 10,
    ).sha256 = "0".repeat(64);
    const activeHistoricalReadinessPath = join(value, "wrong-history.json");
    await writeFile(activeHistoricalReadinessPath, `${JSON.stringify(historical, null, 2)}\n`);

    await expect(
      generateBenchmarkReadiness(options(value, { activeHistoricalReadinessPath })),
    ).rejects.toThrow("fails its historical-readiness receipt");
  });

  it("rejects a forged benchmark selection and return", async () => {
    const value = await temporaryRoot();
    const { report } = await generateBenchmarkReadiness(options(value));

    expect(
      BenchmarkReadinessSchema.safeParse({
        ...report,
        benchmarkSelected: true,
        benchmarkReturnEligible: true,
        comparison: { ...report.comparison, selectedBenchmarkId: "SPY" },
        candidates: report.candidates.map((candidate) =>
          candidate.ticker === "SPY"
            ? { ...candidate, benchmarkSelected: true, totalReturn: 0 }
            : candidate,
        ),
      }).success,
    ).toBe(false);
  });

  it("rejects a non-reconciling observed price change", async () => {
    const value = await temporaryRoot();
    const { report } = await generateBenchmarkReadiness(options(value));

    expect(
      BenchmarkReadinessSchema.safeParse({
        ...report,
        candidates: report.candidates.map((candidate, index) =>
          index === 0 ? { ...candidate, observedPriceChange: 0 } : candidate,
        ),
      }).success,
    ).toBe(false);
  });

  it("refuses to rewrite immutable benchmark readiness", async () => {
    const value = await temporaryRoot();
    const first = await generateBenchmarkReadiness(options(value));
    await writeFile(first.reportPath, '{"conflict":true}\n');

    await expect(generateBenchmarkReadiness(options(value))).rejects.toThrow(
      "Immutable benchmark-readiness conflict",
    );
  });
});
