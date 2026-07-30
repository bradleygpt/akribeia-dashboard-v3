import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { HistoricalReadinessReportSchema } from "@akribeia/contracts";
import { generateHistoricalReadiness } from "@akribeia/evidence";

const temporaryDirectories: string[] = [];

async function temporaryRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "akribeia-historical-readiness-"));
  temporaryDirectories.push(root);
  return root;
}

function options(
  root: string,
  overrides: Partial<Parameters<typeof generateHistoricalReadiness>[0]> = {},
) {
  const baselineRoot = resolve("data/reference/v2-baseline");

  return {
    activeDailyEvidencePath: resolve("apps/dashboard/public/data/evidence/active.json"),
    activeSecurityMasterPath: resolve(
      "apps/dashboard/public/data/evidence/security-master/active.json",
    ),
    snapshots: [
      {
        snapshotId: "june-oracle",
        label: "June 2026 matching oracle vintage",
        metadataPath: resolve(baselineRoot, "june-oracle-fixtures/meta.json"),
        floor0Path: resolve(baselineRoot, "june-oracle-fixtures/universe_floor0.json"),
        floor10Path: resolve(baselineRoot, "june-oracle-fixtures/universe_floor10.json"),
      },
      {
        snapshotId: "july-baseline",
        label: "July 2026 V2 baseline vintage",
        metadataPath: resolve(baselineRoot, "fixtures/meta.json"),
        floor0Path: resolve(baselineRoot, "fixtures/universe_floor0.json"),
        floor10Path: resolve(baselineRoot, "fixtures/universe_floor10.json"),
      },
    ] as Parameters<typeof generateHistoricalReadiness>[0]["snapshots"],
    historicalReadinessRoot: join(root, "historical-readiness"),
    dashboardProjectionPath: join(root, "generated", "active-historical-readiness.json"),
    publicHistoricalReadinessRoot: join(root, "public-historical-readiness"),
    ...overrides,
  };
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe("historical point-in-time readiness", () => {
  it("inventories two digested research snapshots without claiming a backtest", async () => {
    const root = await temporaryRoot();
    const result = await generateHistoricalReadiness(options(root));
    const payload = await readFile(result.reportPath, "utf8");
    const report = HistoricalReadinessReportSchema.parse(JSON.parse(payload));

    expect(report.status).toBe("blocked");
    expect(report.historicalValidationEligible).toBe(false);
    expect(report.inventory).toEqual({
      snapshotCount: 2,
      crossSectionOnly: true,
      earliestDeclaredGeneratedAt: "2026-06-03T14:12:05",
      latestDeclaredGeneratedAt: "2026-07-28T17:06:46",
    });
    expect(
      report.snapshots.map(({ artifacts }) => artifacts.map(({ rowCount }) => rowCount)),
    ).toEqual([
      [1360, 642],
      [1361, 643],
    ]);
    expect(report.controls.map(({ status }) => status)).toEqual([
      "pass",
      "blocked",
      "blocked",
      "blocked",
      "blocked",
      "blocked",
      "blocked",
      "blocked",
      "blocked",
      "blocked",
      "blocked",
    ]);
    expect(report.blockers).toHaveLength(10);
    expect(report.snapshots[0]?.artifacts[0]).toMatchObject({
      strictInputContractStatus: "fail",
      strictInputIssueCount: 1,
      strictInputIssues: [
        {
          path: "rows.664.price",
          message: "Expected number, received null",
        },
      ],
    });
    expect(report.snapshots[1]?.artifacts[0]).toMatchObject({
      strictInputContractStatus: "fail",
      strictInputIssueCount: 5,
    });
    expect(report.snapshots[1]?.artifacts[1]).toMatchObject({
      strictInputContractStatus: "pass",
      strictInputIssueCount: 0,
      strictInputIssues: [],
    });
    expect(report.conclusion).toContain("cannot yet support a point-in-time backtest");
    expect(await readFile(options(root).dashboardProjectionPath, "utf8")).toBe(payload);
  });

  it("reuses an identical immutable readiness report", async () => {
    const root = await temporaryRoot();

    expect((await generateHistoricalReadiness(options(root))).disposition).toBe("published");
    expect((await generateHistoricalReadiness(options(root))).disposition).toBe("reused");
  });

  it("rejects active evidence that no longer matches security-master lineage", async () => {
    const root = await temporaryRoot();
    const daily = JSON.parse(await readFile(options(root).activeDailyEvidencePath, "utf8"));
    const activeDailyEvidencePath = join(root, "wrong-daily.json");
    await writeFile(
      activeDailyEvidencePath,
      `${JSON.stringify(
        {
          ...daily,
          source: {
            ...daily.source,
            contentSha256: "0".repeat(64),
          },
        },
        null,
        2,
      )}\n`,
    );

    await expect(
      generateHistoricalReadiness(options(root, { activeDailyEvidencePath })),
    ).rejects.toThrow("do not share the active build lineage");
  });

  it("rejects a forged historical-validation eligibility claim", async () => {
    const root = await temporaryRoot();
    const { report } = await generateHistoricalReadiness(options(root));
    const forged = {
      ...report,
      status: "pass",
      historicalValidationEligible: true,
      controls: report.controls.map((control) => ({ ...control, status: "pass" })),
      blockers: [],
    };

    expect(HistoricalReadinessReportSchema.safeParse(forged).success).toBe(false);
  });

  it("refuses to rewrite an immutable historical-readiness report", async () => {
    const root = await temporaryRoot();
    const first = await generateHistoricalReadiness(options(root));
    await writeFile(first.reportPath, '{"conflict":true}\n');

    await expect(generateHistoricalReadiness(options(root))).rejects.toThrow(
      "Immutable historical-readiness conflict",
    );
  });
});
