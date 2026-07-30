import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { UniverseMembershipReadinessSchema } from "@akribeia/contracts";
import { generateUniverseMembership } from "@akribeia/evidence";

const temporaryDirectories: string[] = [];

async function temporaryRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "akribeia-universe-membership-"));
  temporaryDirectories.push(root);
  return root;
}

function options(
  root: string,
  overrides: Partial<Parameters<typeof generateUniverseMembership>[0]> = {},
) {
  return {
    activeHistoricalReadinessPath: resolve(
      "apps/dashboard/public/data/evidence/historical-readiness/active.json",
    ),
    reportRoot: join(root, "universe-membership"),
    dashboardProjectionPath: join(root, "generated", "active-universe-membership.json"),
    publicReportRoot: join(root, "public-universe-membership"),
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

describe("universe membership readiness", () => {
  it("reconciles observed entrants and exits without claiming survivorship control", async () => {
    const root = await temporaryRoot();
    const result = await generateUniverseMembership(options(root));
    const payload = await readFile(result.reportPath, "utf8");
    const report = UniverseMembershipReadinessSchema.parse(JSON.parse(payload));

    expect(report.survivorshipBiasControlled).toBe(false);
    expect(report.historicalValidationEligible).toBe(false);
    expect(report.comparison).toEqual({
      earlierSnapshotId: "june-oracle",
      laterSnapshotId: "july-baseline",
      earlierTickerCount: 642,
      laterTickerCount: 643,
      continuingTickerCount: 629,
      entrantCount: 14,
      exitCount: 13,
      unionTickerCount: 656,
      jaccardContinuity: 629 / 656,
      entrantRate: 14 / 643,
      exitRate: 13 / 642,
      commonTickerClassificationChangeCount: 0,
    });
    expect(report.entrants.map(({ ticker }) => ticker)).toEqual([
      "BAX",
      "CART",
      "CORT",
      "CRDO",
      "CRL",
      "DAR",
      "ENSG",
      "JKHY",
      "LITE",
      "MOH",
      "ORI",
      "SCI",
      "TECH",
      "ZION",
    ]);
    expect(report.exits.map(({ ticker }) => ticker)).toEqual([
      "BLD",
      "BMNR",
      "DOCU",
      "ESI",
      "HOLX",
      "IT",
      "JOBY",
      "LUMN",
      "OKLO",
      "POWL",
      "RIOT",
      "SWKS",
      "WULF",
    ]);
    expect(report.controls.map(({ status }) => status)).toEqual([
      "pass",
      "blocked",
      "blocked",
      "blocked",
      "blocked",
      "blocked",
    ]);
    expect(await readFile(options(root).dashboardProjectionPath, "utf8")).toBe(payload);
    expect(
      await readFile(
        join(options(root).publicReportRoot, "builds", report.buildId, "universe-membership.json"),
        "utf8",
      ),
    ).toBe(payload);
  });

  it("reuses identical immutable evidence", async () => {
    const root = await temporaryRoot();

    expect((await generateUniverseMembership(options(root))).disposition).toBe("published");
    expect((await generateUniverseMembership(options(root))).disposition).toBe("reused");
  });

  it("fails closed when a source snapshot no longer matches its receipt", async () => {
    const root = await temporaryRoot();
    const historical = JSON.parse(
      await readFile(options(root).activeHistoricalReadinessPath, "utf8"),
    );
    const activeHistoricalReadinessPath = join(root, "tampered-readiness.json");
    historical.snapshots[0].artifacts[1].sha256 = "0".repeat(64);
    await writeFile(activeHistoricalReadinessPath, `${JSON.stringify(historical, null, 2)}\n`);

    await expect(
      generateUniverseMembership(options(root, { activeHistoricalReadinessPath })),
    ).rejects.toThrow("fails its historical-readiness receipt");
  });

  it("rejects missing canonical snapshots", async () => {
    const root = await temporaryRoot();
    const historical = JSON.parse(
      await readFile(options(root).activeHistoricalReadinessPath, "utf8"),
    );
    const activeHistoricalReadinessPath = join(root, "wrong-snapshots.json");
    historical.snapshots[0].snapshotId = "other-snapshot";
    await writeFile(activeHistoricalReadinessPath, `${JSON.stringify(historical, null, 2)}\n`);

    await expect(
      generateUniverseMembership(options(root, { activeHistoricalReadinessPath })),
    ).rejects.toThrow("required June and July snapshots");
  });

  it("rejects forged survivorship eligibility and noncanonical control order", async () => {
    const root = await temporaryRoot();
    const { report } = await generateUniverseMembership(options(root));
    const forged = {
      ...report,
      survivorshipBiasControlled: true,
      historicalValidationEligible: true,
      controls: [
        report.controls[0],
        report.controls[2],
        report.controls[1],
        ...report.controls.slice(3),
      ],
    };

    expect(UniverseMembershipReadinessSchema.safeParse(forged).success).toBe(false);
    expect(
      UniverseMembershipReadinessSchema.safeParse({
        ...report,
        entrants: [...report.entrants.slice(0, -1), report.entrants[0]],
      }).success,
    ).toBe(false);
  });

  it("refuses to rewrite an immutable membership report", async () => {
    const root = await temporaryRoot();
    const first = await generateUniverseMembership(options(root));
    await writeFile(first.reportPath, '{"conflict":true}\n');

    await expect(generateUniverseMembership(options(root))).rejects.toThrow(
      "Immutable universe-membership conflict",
    );
  });
});
