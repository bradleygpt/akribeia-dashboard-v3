import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import {
  DailyEvidenceRecordSchema,
  DataQualityReportSchema,
  ModelCardSchema,
  PublishedScoresArtifactSchema,
  type DataQualityReport,
} from "@akribeia/contracts";

export interface GenerateQualityReportOptions {
  activeDailyEvidencePath: string;
  activeModelCardPath: string;
  publishedDataRoot: string;
  qualityRoot: string;
  dashboardProjectionPath: string;
  publicQualityRoot: string;
}

export interface GenerateQualityReportResult {
  reportPath: string;
  disposition: "published" | "reused";
  report: DataQualityReport;
}

function sha256(payload: Uint8Array): string {
  return createHash("sha256").update(payload).digest("hex");
}

function json(path: string, payload: Uint8Array): unknown {
  try {
    return JSON.parse(new TextDecoder().decode(payload)) as unknown;
  } catch (error) {
    throw new Error(`Invalid JSON at "${path}".`, { cause: error });
  }
}

function bytes(value: unknown): Uint8Array {
  return new TextEncoder().encode(`${JSON.stringify(value, null, 2)}\n`);
}

function code(error: unknown, expected: string): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === expected
  );
}

async function immutable(path: string, payload: Uint8Array): Promise<"published" | "reused"> {
  await mkdir(dirname(path), { recursive: true });
  try {
    await writeFile(path, payload, { flag: "wx" });
    return "published";
  } catch (error) {
    if (!code(error, "EEXIST")) throw error;
    if (!(await readFile(path)).equals(payload)) {
      throw new Error(`Immutable quality-report conflict at "${path}".`, { cause: error });
    }
    return "reused";
  }
}

async function projection(path: string, payload: Uint8Array): Promise<void> {
  const temporary = join(dirname(path), `.${randomUUID()}-quality.tmp`);
  await mkdir(dirname(path), { recursive: true });
  try {
    await writeFile(temporary, payload, { flag: "wx" });
    await rename(temporary, path);
  } finally {
    await rm(temporary, { force: true });
  }
}

export async function generateQualityReport(
  options: GenerateQualityReportOptions,
): Promise<GenerateQualityReportResult> {
  const [dailyPayload, cardPayload] = await Promise.all([
    readFile(resolve(options.activeDailyEvidencePath)),
    readFile(resolve(options.activeModelCardPath)),
  ]);
  const daily = DailyEvidenceRecordSchema.parse(
    json(options.activeDailyEvidencePath, dailyPayload),
  );
  const card = ModelCardSchema.parse(json(options.activeModelCardPath, cardPayload));

  if (
    daily.build.modelVersion !== card.modelVersion ||
    daily.build.buildId !== card.activeBuildId
  ) {
    throw new Error("Active daily evidence and model card lineage do not match.");
  }

  const receipt = daily.artifacts.find(({ name }) => name === "scores")!;
  const scoresPath = join(
    resolve(options.publishedDataRoot),
    "builds",
    daily.build.buildId,
    receipt.path,
  );
  const scoresPayload = await readFile(scoresPath);
  if (scoresPayload.byteLength !== receipt.byteSize || sha256(scoresPayload) !== receipt.sha256) {
    throw new Error("Published scores fail the daily evidence receipt.");
  }
  const scores = PublishedScoresArtifactSchema.parse(json(scoresPath, scoresPayload));
  if (
    scores.buildId !== daily.build.buildId ||
    scores.modelVersion !== daily.build.modelVersion ||
    scores.source.contentSha256 !== daily.source.contentSha256
  ) {
    throw new Error("Published scores lineage does not match daily evidence.");
  }

  const tickerCounts = new Map<string, number>();
  for (const security of scores.securities) {
    tickerCounts.set(security.ticker, (tickerCounts.get(security.ticker) ?? 0) + 1);
  }
  const duplicates = [...tickerCounts.entries()]
    .filter(([, count]) => count > 1)
    .map(([ticker]) => ticker)
    .sort();
  const scoreValues = scores.securities
    .filter(({ eligible }) => eligible)
    .map(({ score }) => score!)
    .sort((left, right) => left - right);
  const middle = Math.floor(scoreValues.length / 2);
  const median =
    scoreValues.length % 2 === 1
      ? scoreValues[middle]!
      : (scoreValues[middle - 1]! + scoreValues[middle]!) / 2;
  const reconciled = daily.portfolio.totalWeightUnits === daily.portfolio.construction.weightScale;
  const clean =
    duplicates.length === 0 &&
    scores.securities.every(({ price }) => price > 0) &&
    scores.securities.every(({ marketCapB }) => marketCapB >= 0) &&
    reconciled;
  const report = DataQualityReportSchema.parse({
    reportSchemaVersion: "1.0.0",
    buildId: daily.build.buildId,
    modelVersion: daily.build.modelVersion,
    recordedAt: daily.recordedAt,
    quality: {
      status: clean ? "pass" : "fail",
      rowCount: scores.securities.length,
      uniqueTickerCount: tickerCounts.size,
      duplicateTickers: duplicates,
      invalidPriceCount: scores.securities.filter(({ price }) => price <= 0).length,
      invalidMarketCapCount: scores.securities.filter(({ marketCapB }) => marketCapB < 0).length,
      eligibleSecurities: scores.scoring.eligibleSecurities,
      excludedSecurities: scores.scoring.excludedSecurities,
      factorCoverage: scores.scoring.factorCoverage,
      scoreDistribution: {
        count: scoreValues.length,
        minimum: scoreValues[0]!,
        maximum: scoreValues.at(-1)!,
        mean: scoreValues.reduce((sum, score) => sum + score, 0) / scoreValues.length,
        median,
      },
      portfolio: {
        positionCount: daily.portfolio.positions.length,
        totalWeightUnits: daily.portfolio.totalWeightUnits,
        weightScale: daily.portfolio.construction.weightScale,
        reconciled,
      },
    },
    drift: {
      status: "insufficient-history",
      availableBuilds: 1,
      requiredBuilds: 2,
      baselineBuildId: null,
      comparisons: [],
      reason:
        "Only one immutable model observation exists; temporal drift requires at least two comparable builds.",
    },
    notice: daily.notice,
  });
  const payload = bytes(report);
  const relativePath = join("builds", report.buildId, "quality-drift.json");
  const reportPath = join(resolve(options.qualityRoot), relativePath);
  const dispositions = await Promise.all([
    immutable(reportPath, payload),
    immutable(join(resolve(options.publicQualityRoot), relativePath), payload),
  ]);
  await Promise.all([
    projection(resolve(options.dashboardProjectionPath), payload),
    projection(join(resolve(options.publicQualityRoot), "active.json"), payload),
  ]);
  return {
    reportPath,
    disposition: dispositions.every((item) => item === "reused") ? "reused" : "published",
    report,
  };
}
