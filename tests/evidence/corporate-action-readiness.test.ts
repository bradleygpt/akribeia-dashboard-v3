import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { CorporateActionReadinessSchema } from "@akribeia/contracts";
import { generateCorporateActionReadiness } from "@akribeia/evidence";

const temporaryDirectories: string[] = [];

async function temporaryRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "akribeia-corporate-actions-"));
  temporaryDirectories.push(root);
  return root;
}

function options(
  root: string,
  overrides: Partial<Parameters<typeof generateCorporateActionReadiness>[0]> = {},
) {
  return {
    activeHistoricalReadinessPath: resolve(
      "apps/dashboard/public/data/evidence/historical-readiness/active.json",
    ),
    activeUniverseMembershipPath: resolve(
      "apps/dashboard/public/data/evidence/universe-membership/active.json",
    ),
    reportRoot: join(root, "corporate-actions"),
    dashboardProjectionPath: join(root, "generated", "active-corporate-actions.json"),
    publicReportRoot: join(root, "public-corporate-actions"),
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

describe("corporate-action readiness", () => {
  it("surfaces price comparability signals without inventing corporate actions", async () => {
    const root = await temporaryRoot();
    const result = await generateCorporateActionReadiness(options(root));
    const payload = await readFile(result.reportPath, "utf8");
    const report = CorporateActionReadinessSchema.parse(JSON.parse(payload));

    expect(report.corporateActionsControlled).toBe(false);
    expect(report.historicalValidationEligible).toBe(false);
    expect(report.comparison.commonTickerCount).toBe(629);
    expect(report.coverage).toEqual({
      thresholdObservationCount: 5,
      possibleShareCountDiscontinuityCount: 3,
      priceAndMarketCapDiscontinuityCount: 2,
      verifiedCorporateActionCount: 0,
      verifiedAdjustedSeriesCount: 0,
    });
    expect(report.observations.map(({ ticker, signal }) => [ticker, signal])).toEqual([
      ["ASTS", "price-and-market-cap-discontinuity"],
      ["CRWD", "possible-share-count-discontinuity"],
      ["DD", "possible-share-count-discontinuity"],
      ["KLAC", "possible-share-count-discontinuity"],
      ["ORCL", "price-and-market-cap-discontinuity"],
    ]);
    expect(report.observations.find(({ ticker }) => ticker === "KLAC")).toMatchObject({
      earlierPrice: 2045.2,
      laterPrice: 214,
      impliedSharesRatio: 10.025560327942246,
      verifiedCorporateAction: null,
    });
    expect(report.controls.map(({ status }) => status)).toEqual([
      "pass",
      "blocked",
      "blocked",
      "blocked",
      "blocked",
      "blocked",
    ]);
    expect(await readFile(options(root).dashboardProjectionPath, "utf8")).toBe(payload);
  });

  it("reuses identical immutable evidence", async () => {
    const root = await temporaryRoot();
    expect((await generateCorporateActionReadiness(options(root))).disposition).toBe("published");
    expect((await generateCorporateActionReadiness(options(root))).disposition).toBe("reused");
  });

  it("rejects membership evidence from a different build", async () => {
    const root = await temporaryRoot();
    const membership = JSON.parse(
      await readFile(options(root).activeUniverseMembershipPath, "utf8"),
    );
    membership.buildId = "different-build";
    const activeUniverseMembershipPath = join(root, "wrong-membership.json");
    await writeFile(activeUniverseMembershipPath, `${JSON.stringify(membership, null, 2)}\n`);

    await expect(
      generateCorporateActionReadiness(options(root, { activeUniverseMembershipPath })),
    ).rejects.toThrow("do not share active lineage");
  });

  it("fails closed when a source snapshot no longer matches its receipt", async () => {
    const root = await temporaryRoot();
    const historical = JSON.parse(
      await readFile(options(root).activeHistoricalReadinessPath, "utf8"),
    );
    historical.snapshots[1].artifacts[1].sha256 = "0".repeat(64);
    const activeHistoricalReadinessPath = join(root, "wrong-history.json");
    await writeFile(activeHistoricalReadinessPath, `${JSON.stringify(historical, null, 2)}\n`);

    await expect(
      generateCorporateActionReadiness(options(root, { activeHistoricalReadinessPath })),
    ).rejects.toThrow("fails its historical-readiness receipt");
  });

  it("rejects a forged verified action or adjusted series", async () => {
    const root = await temporaryRoot();
    const { report } = await generateCorporateActionReadiness(options(root));

    expect(
      CorporateActionReadinessSchema.safeParse({
        ...report,
        corporateActionsControlled: true,
        historicalValidationEligible: true,
        coverage: {
          ...report.coverage,
          verifiedCorporateActionCount: 1,
          verifiedAdjustedSeriesCount: 1,
        },
      }).success,
    ).toBe(false);
  });

  it("refuses to rewrite immutable corporate-action readiness", async () => {
    const root = await temporaryRoot();
    const first = await generateCorporateActionReadiness(options(root));
    await writeFile(first.reportPath, '{"conflict":true}\n');

    await expect(generateCorporateActionReadiness(options(root))).rejects.toThrow(
      "Immutable corporate-action-readiness conflict",
    );
  });
});
