import { readFileSync } from "node:fs";
import { resolve as resolvePath } from "node:path";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { ExecutionCostReadinessSchema } from "@akribeia/contracts";
import { generateExecutionCostReadiness } from "@akribeia/evidence";

const directories: string[] = [];
async function root() {
  const value = await mkdtemp(join(tmpdir(), "akribeia-execution-cost-"));
  directories.push(value);
  return value;
}
function options(
  value: string,
  overrides: Partial<Parameters<typeof generateExecutionCostReadiness>[0]> = {},
) {
  return {
    activeDailyEvidencePath: resolve("apps/dashboard/public/data/evidence/active.json"),
    publishedDataRoot: resolve("apps/dashboard/public/data"),
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

const COMMITTED_EXEC = JSON.parse(
  readFileSync(
    resolvePath("apps/dashboard/app/generated/active-execution-cost-readiness.json"),
    "utf8",
  ),
) as { targets: unknown };

describe("execution-cost readiness", () => {
  it("preserves exact targets while all execution economics remain null", async () => {
    const value = await root();
    const result = await generateExecutionCostReadiness(options(value));
    const payload = await readFile(result.reportPath, "utf8");
    const report = ExecutionCostReadinessSchema.parse(JSON.parse(payload));
    expect(report.executionRecorded).toBe(false);
    expect(report.netPerformanceEligible).toBe(false);
    expect(report.portfolio).toMatchObject({
      positionCount: 9,
      totalTargetWeightUnits: 1_000_000_000,
      pricedExecutionCount: 0,
      turnover: null,
      grossReturn: null,
      transactionCost: null,
      netReturn: null,
    });
    expect(
      report.targets.map(({ ticker, targetWeightUnits }) => [ticker, targetWeightUnits]),
    ).toEqual(
      (COMMITTED_EXEC.targets as { ticker: string; targetWeightUnits: number }[]).map(
        ({ ticker, targetWeightUnits }) => [ticker, targetWeightUnits],
      ),
    );
    expect(report.controls.map(({ status }) => status)).toEqual([
      "pass",
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
    const value = await root();
    expect((await generateExecutionCostReadiness(options(value))).disposition).toBe("published");
    expect((await generateExecutionCostReadiness(options(value))).disposition).toBe("reused");
  });
  it("rejects a portfolio that fails its evidence receipt", async () => {
    const value = await root();
    const daily = JSON.parse(await readFile(options(value).activeDailyEvidencePath, "utf8"));
    daily.artifacts.find(({ name }: { name: string }) => name === "portfolio").sha256 = "0".repeat(
      64,
    );
    const activeDailyEvidencePath = join(value, "wrong-daily.json");
    await writeFile(activeDailyEvidencePath, `${JSON.stringify(daily, null, 2)}\n`);
    await expect(
      generateExecutionCostReadiness(options(value, { activeDailyEvidencePath })),
    ).rejects.toThrow("fails its daily evidence receipt");
  });
  it("rejects forged zero-cost and net-return claims", async () => {
    const value = await root();
    const { report } = await generateExecutionCostReadiness(options(value));
    expect(
      ExecutionCostReadinessSchema.safeParse({
        ...report,
        executionRecorded: true,
        netPerformanceEligible: true,
        portfolio: { ...report.portfolio, transactionCost: 0, netReturn: 0 },
      }).success,
    ).toBe(false);
  });
  it("rejects non-reconciling target units", async () => {
    const value = await root();
    const { report } = await generateExecutionCostReadiness(options(value));
    expect(
      ExecutionCostReadinessSchema.safeParse({
        ...report,
        targets: report.targets.map((target, index) =>
          index === 0 ? { ...target, targetWeightUnits: target.targetWeightUnits - 1 } : target,
        ),
      }).success,
    ).toBe(false);
  });
  it("refuses to rewrite immutable execution-cost evidence", async () => {
    const value = await root();
    const first = await generateExecutionCostReadiness(options(value));
    await writeFile(first.reportPath, '{"conflict":true}\n');
    await expect(generateExecutionCostReadiness(options(value))).rejects.toThrow(
      "Immutable execution-cost conflict",
    );
  });
});
