import { readFileSync } from "node:fs";
import { resolve as resolvePath } from "node:path";
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { DataQualityReportSchema } from "@akribeia/contracts";
import { generateQualityReport } from "@akribeia/evidence";

const temporaryDirectories: string[] = [];
async function temporaryRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "akribeia-quality-"));
  temporaryDirectories.push(root);
  return root;
}
function options(
  root: string,
  overrides: Partial<Parameters<typeof generateQualityReport>[0]> = {},
) {
  return {
    activeDailyEvidencePath: resolve("apps/dashboard/public/data/evidence/active.json"),
    activeModelCardPath: resolve(
      "apps/dashboard/public/data/evidence/governance/active-model-card.json",
    ),
    publishedDataRoot: resolve("apps/dashboard/public/data"),
    qualityRoot: join(root, "quality"),
    dashboardProjectionPath: join(root, "generated", "active-quality-report.json"),
    publicQualityRoot: join(root, "public-quality"),
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

const COMMITTED_QUALITY = JSON.parse(
  readFileSync(resolvePath("apps/dashboard/app/generated/active-quality-report.json"), "utf8"),
) as Record<string, unknown>;

describe("data quality and drift report", () => {
  it("reports exact active-build quality and insufficient drift history", async () => {
    const root = await temporaryRoot();
    const result = await generateQualityReport(options(root));
    const payload = await readFile(result.reportPath, "utf8");
    const report = DataQualityReportSchema.parse(JSON.parse(payload));

    expect(report.quality).toEqual(COMMITTED_QUALITY.quality);
    expect(report.quality.portfolio.reconciled).toBe(true);
    expect(report.drift.status).toBe("insufficient-history");
    expect(report.drift.comparisons).toEqual([]);
    expect(await readFile(options(root).dashboardProjectionPath, "utf8")).toBe(payload);
  });

  it("reuses the same immutable report on retry", async () => {
    const root = await temporaryRoot();
    expect((await generateQualityReport(options(root))).disposition).toBe("published");
    expect((await generateQualityReport(options(root))).disposition).toBe("reused");
  });

  it("rejects scores that fail their daily receipt", async () => {
    const root = await temporaryRoot();
    const publishedDataRoot = join(root, "published");
    await cp(resolve("apps/dashboard/public/data"), publishedDataRoot, { recursive: true });
    const daily = JSON.parse(
      await readFile(resolve("apps/dashboard/public/data/evidence/active.json"), "utf8"),
    );
    await writeFile(
      join(publishedDataRoot, "builds", daily.build.buildId, "scores.json"),
      '{"tampered":true}\n',
    );
    await expect(generateQualityReport(options(root, { publishedDataRoot }))).rejects.toThrow(
      "fail the daily evidence receipt",
    );
  });

  it("rejects model-card lineage that differs from daily evidence", async () => {
    const root = await temporaryRoot();
    const card = JSON.parse(
      await readFile(
        resolve("apps/dashboard/public/data/evidence/governance/active-model-card.json"),
        "utf8",
      ),
    );
    const activeModelCardPath = join(root, "wrong-card.json");
    await writeFile(
      activeModelCardPath,
      `${JSON.stringify({ ...card, activeBuildId: "different-build" }, null, 2)}\n`,
    );
    await expect(generateQualityReport(options(root, { activeModelCardPath }))).rejects.toThrow(
      "lineage do not match",
    );
  });

  it("refuses to rewrite an immutable quality report", async () => {
    const root = await temporaryRoot();
    const first = await generateQualityReport(options(root));
    await writeFile(first.reportPath, '{"conflict":true}\n');
    await expect(generateQualityReport(options(root))).rejects.toThrow(
      "Immutable quality-report conflict",
    );
  });
});
