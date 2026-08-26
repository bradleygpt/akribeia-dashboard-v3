import { readFileSync } from "node:fs";
import { resolve as resolvePath } from "node:path";
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  DailyEvidenceRecordSchema,
  EvidenceReproducibilityReportSchema,
} from "@akribeia/contracts";
import { generateDailyEvidence } from "@akribeia/evidence";

const temporaryDirectories: string[] = [];

async function temporaryRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "akribeia-evidence-"));
  temporaryDirectories.push(root);
  return root;
}

function options(root: string, publishedDataRoot = resolve("apps/dashboard/public/data")) {
  return {
    publishedDataRoot,
    evidenceRoot: join(root, "evidence"),
    dashboardProjectionPath: join(root, "generated", "active-daily-evidence.json"),
    publicEvidenceRoot: join(root, "public-evidence"),
  };
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

const ACTIVE_BUILD_ID = (
  JSON.parse(readFileSync(resolvePath("apps/dashboard/public/data/active-build.json"), "utf8")) as {
    activeBuildId: string;
  }
).activeBuildId;

describe("immutable daily evidence", () => {
  it("receipts the active build with explicit benchmark and performance limits", async () => {
    const root = await temporaryRoot();
    const result = await generateDailyEvidence(options(root));
    const [recordPayload, reportPayload, projectionPayload, publicPayload] = await Promise.all([
      readFile(result.evidencePath, "utf8"),
      readFile(result.reportPath, "utf8"),
      readFile(join(root, "generated", "active-daily-evidence.json"), "utf8"),
      readFile(
        join(root, "public-evidence", "daily", result.asOfDate, result.buildId, "evidence.json"),
        "utf8",
      ),
    ]);
    const record = DailyEvidenceRecordSchema.parse(JSON.parse(recordPayload));
    const report = EvidenceReproducibilityReportSchema.parse(JSON.parse(reportPayload));

    expect(result.disposition).toBe("published");
    expect(record.asOfDate).toBe(
      record.build.buildId
        .match(/preview-(\d{4})(\d{2})(\d{2})/)!
        .slice(1)
        .join("-"),
    );
    expect(record.build.buildId).toBe(ACTIVE_BUILD_ID);
    expect(record.artifacts.map(({ name }) => name)).toEqual(["dashboard", "portfolio", "scores"]);
    expect(record.portfolio.totalWeightUnits).toBe(1_000_000_000);
    expect(record.portfolio.positions).toHaveLength(9);
    expect(record.benchmark.status).toBe("unavailable");
    expect(record.benchmark.return).toBeNull();
    expect(record.performance.status).toBe("not-computed");
    expect(record.maturity).toBe("research-preview");
    expect(report.checks).toEqual({
      activePointer: true,
      manifestSchema: true,
      publicationHealthy: true,
      artifactDigests: true,
      artifactSchemas: true,
      lineage: true,
      exactPortfolioWeights: true,
      evidenceSchema: true,
    });
    expect(projectionPayload).toBe(recordPayload);
    expect(publicPayload).toBe(recordPayload);
  });

  it("reuses identical immutable records on deterministic retry", async () => {
    const root = await temporaryRoot();
    const first = await generateDailyEvidence(options(root));
    const second = await generateDailyEvidence(options(root));

    expect(first.disposition).toBe("published");
    expect(second.disposition).toBe("reused");
    expect(second.record).toEqual(first.record);
    expect(second.report).toEqual(first.report);
  });

  it("rejects a daily date that does not match the source observation", async () => {
    const root = await temporaryRoot();
    const result = await generateDailyEvidence(options(root));

    expect(() =>
      DailyEvidenceRecordSchema.parse({
        ...result.record,
        asOfDate: "2026-07-29",
      }),
    ).toThrow("Evidence date must match the source observation date.");
  });

  it("does not let unavailable benchmark evidence claim a return", async () => {
    const root = await temporaryRoot();
    const result = await generateDailyEvidence(options(root));

    expect(() =>
      DailyEvidenceRecordSchema.parse({
        ...result.record,
        benchmark: {
          ...result.record.benchmark,
          return: 0.01,
        },
      }),
    ).toThrow();
  });

  it("rejects artifact row counts that do not reconcile with the recorded output", async () => {
    const root = await temporaryRoot();
    const result = await generateDailyEvidence(options(root));
    const parsed = DailyEvidenceRecordSchema.safeParse({
      ...result.record,
      artifacts: result.record.artifacts.map((artifact) =>
        artifact.name === "portfolio" ? { ...artifact, rowCount: 10 } : artifact,
      ),
    });

    expect(parsed.success).toBe(false);

    if (!parsed.success) {
      expect(parsed.error.issues.map(({ message }) => message)).toContain(
        'Artifact receipt "portfolio" row count does not reconcile.',
      );
    }
  });

  it("fails closed when an active artifact no longer matches its receipt", async () => {
    const root = await temporaryRoot();
    const publishedDataRoot = join(root, "published-data");
    await cp(resolve("apps/dashboard/public/data"), publishedDataRoot, { recursive: true });
    const pointer = JSON.parse(
      await readFile(join(publishedDataRoot, "active-build.json"), "utf8"),
    ) as { activeBuildId: string };
    const scoresPath = join(publishedDataRoot, "builds", pointer.activeBuildId, "scores.json");

    await writeFile(scoresPath, '{"tampered":true}\n');

    await expect(generateDailyEvidence(options(root, publishedDataRoot))).rejects.toThrow(
      'Active artifact "scores" failed byte-size or SHA-256 verification.',
    );
  });

  it("refuses to rewrite an existing daily record with different bytes", async () => {
    const root = await temporaryRoot();
    const first = await generateDailyEvidence(options(root));

    await writeFile(first.evidencePath, '{"conflict":true}\n');

    await expect(generateDailyEvidence(options(root))).rejects.toThrow(
      "Immutable evidence conflict",
    );
  });
});
