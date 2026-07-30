import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { ExitDispositionReadinessSchema } from "@akribeia/contracts";
import { generateExitDispositionReadiness } from "@akribeia/evidence";

const temporaryDirectories: string[] = [];
async function temporaryRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "akribeia-exit-disposition-"));
  temporaryDirectories.push(root);
  return root;
}
function options(
  root: string,
  overrides: Partial<Parameters<typeof generateExitDispositionReadiness>[0]> = {},
) {
  return {
    activeUniverseMembershipPath: resolve(
      "apps/dashboard/public/data/evidence/universe-membership/active.json",
    ),
    sourceReceiptPath: resolve("data/reference/sec/2026-07-30/receipt.json"),
    reportRoot: join(root, "exit-disposition"),
    dashboardProjectionPath: join(root, "generated", "active-exit-disposition.json"),
    publicReportRoot: join(root, "public-exit-disposition"),
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

describe("exit disposition readiness", () => {
  it("shows current SEC associations without claiming historical disposition", async () => {
    const root = await temporaryRoot();
    const result = await generateExitDispositionReadiness(options(root));
    const payload = await readFile(result.reportPath, "utf8");
    const report = ExitDispositionReadinessSchema.parse(JSON.parse(payload));

    expect(report.historicalDelistingControlled).toBe(false);
    expect(report.historicalTickerHistoryEligible).toBe(false);
    expect(report.coverage).toEqual({
      observedExitCount: 13,
      currentSecAssociationCount: 11,
      unmatchedCurrentAssociationCount: 2,
      historicalDispositionResolvedCount: 0,
    });
    expect(
      report.entries
        .filter(({ currentAssociationStatus }) => currentAssociationStatus === "unmatched")
        .map(({ ticker }) => ticker),
    ).toEqual(["BLD", "HOLX"]);
    expect(report.entries.find(({ ticker }) => ticker === "DOCU")).toMatchObject({
      currentAssociationStatus: "present",
      currentSecAssociation: { cik: "0001261333", title: "DOCUSIGN, INC." },
      historicalDispositionStatus: "unverified",
    });
    expect(report.controls.map(({ status }) => status)).toEqual([
      "pass",
      "blocked",
      "blocked",
      "blocked",
      "blocked",
    ]);
    expect(await readFile(options(root).dashboardProjectionPath, "utf8")).toBe(payload);
  });

  it("reuses identical immutable evidence", async () => {
    const root = await temporaryRoot();
    expect((await generateExitDispositionReadiness(options(root))).disposition).toBe("published");
    expect((await generateExitDispositionReadiness(options(root))).disposition).toBe("reused");
  });

  it("fails closed when the SEC source no longer matches its receipt", async () => {
    const root = await temporaryRoot();
    const receipt = JSON.parse(await readFile(options(root).sourceReceiptPath, "utf8"));
    receipt.sources[0].sha256 = "0".repeat(64);
    const sourceReceiptPath = join(root, "wrong-receipt.json");
    await writeFile(sourceReceiptPath, `${JSON.stringify(receipt, null, 2)}\n`);

    await expect(
      generateExitDispositionReadiness(options(root, { sourceReceiptPath })),
    ).rejects.toThrow("fails its receipt");
  });

  it("rejects a forged resolved disposition claim", async () => {
    const root = await temporaryRoot();
    const { report } = await generateExitDispositionReadiness(options(root));
    expect(
      ExitDispositionReadinessSchema.safeParse({
        ...report,
        historicalDelistingControlled: true,
        historicalTickerHistoryEligible: true,
        coverage: { ...report.coverage, historicalDispositionResolvedCount: 1 },
      }).success,
    ).toBe(false);
  });

  it("rejects mismatched association status and record", async () => {
    const root = await temporaryRoot();
    const { report } = await generateExitDispositionReadiness(options(root));
    const forged = {
      ...report,
      entries: report.entries.map((entry, index) =>
        index === 0
          ? { ...entry, currentAssociationStatus: "present", currentSecAssociation: null }
          : entry,
      ),
    };
    expect(ExitDispositionReadinessSchema.safeParse(forged).success).toBe(false);
  });

  it("refuses to rewrite immutable exit-disposition evidence", async () => {
    const root = await temporaryRoot();
    const first = await generateExitDispositionReadiness(options(root));
    await writeFile(first.reportPath, '{"conflict":true}\n');
    await expect(generateExitDispositionReadiness(options(root))).rejects.toThrow(
      "Immutable exit-disposition conflict",
    );
  });
});
