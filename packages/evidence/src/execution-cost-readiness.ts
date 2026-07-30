import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import {
  DailyEvidenceRecordSchema,
  ExecutionCostReadinessSchema,
  PublishedPortfolioArtifactSchema,
  type ExecutionCostReadiness,
} from "@akribeia/contracts";

export interface GenerateExecutionCostReadinessOptions {
  activeDailyEvidencePath: string;
  publishedDataRoot: string;
  reportRoot: string;
  dashboardProjectionPath: string;
  publicReportRoot: string;
}
export interface GenerateExecutionCostReadinessResult {
  reportPath: string;
  disposition: "published" | "reused";
  report: ExecutionCostReadiness;
}
function sha256(payload: Uint8Array): string {
  return createHash("sha256").update(payload).digest("hex");
}
function parseJson(path: string, payload: Uint8Array): unknown {
  try {
    return JSON.parse(new TextDecoder().decode(payload)) as unknown;
  } catch (error) {
    throw new Error(`Invalid JSON at "${path}".`, { cause: error });
  }
}
function deterministicJson(value: unknown): Uint8Array {
  return new TextEncoder().encode(`${JSON.stringify(value, null, 2)}\n`);
}
function hasErrorCode(error: unknown, code: string): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === code
  );
}
async function writeImmutable(path: string, payload: Uint8Array): Promise<"published" | "reused"> {
  await mkdir(dirname(path), { recursive: true });
  try {
    await writeFile(path, payload, { flag: "wx" });
    return "published";
  } catch (error) {
    if (!hasErrorCode(error, "EEXIST")) throw error;
    if (!(await readFile(path)).equals(payload)) {
      throw new Error(`Immutable execution-cost conflict at "${path}".`, { cause: error });
    }
    return "reused";
  }
}
async function writeProjection(path: string, payload: Uint8Array): Promise<void> {
  const temporaryPath = join(dirname(path), `.${randomUUID()}-execution-cost.tmp`);
  await mkdir(dirname(path), { recursive: true });
  try {
    await writeFile(temporaryPath, payload, { flag: "wx" });
    await rename(temporaryPath, path);
  } finally {
    await rm(temporaryPath, { force: true });
  }
}

export async function generateExecutionCostReadiness(
  options: GenerateExecutionCostReadinessOptions,
): Promise<GenerateExecutionCostReadinessResult> {
  const dailyPath = resolve(options.activeDailyEvidencePath);
  const daily = DailyEvidenceRecordSchema.parse(parseJson(dailyPath, await readFile(dailyPath)));
  const receipt = daily.artifacts.find(({ name }) => name === "portfolio");
  if (receipt === undefined) throw new Error("Daily evidence has no portfolio receipt.");
  const portfolioPath = join(
    resolve(options.publishedDataRoot),
    "builds",
    daily.build.buildId,
    receipt.path,
  );
  const portfolioPayload = await readFile(portfolioPath);
  if (
    portfolioPayload.byteLength !== receipt.byteSize ||
    sha256(portfolioPayload) !== receipt.sha256
  ) {
    throw new Error("Published portfolio fails its daily evidence receipt.");
  }
  const artifact = PublishedPortfolioArtifactSchema.parse(
    parseJson(portfolioPath, portfolioPayload),
  );
  if (
    artifact.buildId !== daily.build.buildId ||
    artifact.modelVersion !== daily.build.modelVersion ||
    artifact.portfolio.totalWeightUnits !== daily.portfolio.totalWeightUnits
  ) {
    throw new Error("Execution-cost inputs do not share active portfolio lineage.");
  }
  const targets = artifact.portfolio.positions.map((position, index) => ({
    rank: index + 1,
    ticker: position.ticker,
    sector: position.sector,
    targetWeight: position.weight,
    targetWeightUnits: position.weightUnits,
    researchSnapshotPrice: position.price,
    executionPrice: null,
    tradeQuantity: null,
    estimatedCost: null,
  }));
  const report = ExecutionCostReadinessSchema.parse({
    reportSchemaVersion: "1.0.0",
    buildId: daily.build.buildId,
    modelVersion: daily.build.modelVersion,
    generatedAt: daily.recordedAt,
    decisionObservedAt: daily.source.observedAt,
    status: "blocked-no-execution-economics",
    executionRecorded: false,
    netPerformanceEligible: false,
    portfolio: {
      positionCount: targets.length,
      totalTargetWeightUnits: artifact.portfolio.totalWeightUnits,
      weightScale: artifact.portfolio.construction.weightScale,
      capitalBase: null,
      priorHoldingsAvailable: false,
      assumedExecutionAt: null,
      observedExecutionAt: null,
      pricedExecutionCount: 0,
      turnover: null,
      grossReturn: null,
      transactionCost: null,
      netReturn: null,
    },
    targets,
    controls: [
      {
        key: "exact-target-weights",
        status: "pass",
        detail: `${targets.length} targets reconcile to ${artifact.portfolio.totalWeightUnits} exact weight units.`,
      },
      {
        key: "capital-base",
        status: "blocked",
        detail: "No portfolio notional or account capital base exists for share sizing.",
      },
      {
        key: "prior-holdings",
        status: "blocked",
        detail: "No prior holdings exist, so trades and turnover cannot be derived.",
      },
      {
        key: "execution-calendar",
        status: "blocked",
        detail: "No market calendar, next-session rule, or assumed execution timestamp exists.",
      },
      {
        key: "executable-prices",
        status: "blocked",
        detail:
          "Research snapshot prices are not executable bid, ask, open, close, or VWAP records.",
      },
      {
        key: "liquidity-slippage",
        status: "blocked",
        detail: "No spread, volume, participation, market-impact, or slippage model exists.",
      },
      {
        key: "fees-taxes",
        status: "blocked",
        detail: "No commission, regulatory fee, borrow, financing, or tax schedule exists.",
      },
    ],
    limitations: [
      "Target weights are model instructions, not executed trades or holdings.",
      "Research snapshot prices cannot be used as assumed fills.",
      "Missing costs remain null and must never be silently treated as zero.",
      "Gross return, transaction cost, and net return are unavailable without an evaluation interval.",
      "This report is not a performance record or investment-performance claim.",
    ],
    notice: daily.notice,
  });
  const payload = deterministicJson(report);
  const relativePath = join("builds", report.buildId, "execution-cost-readiness.json");
  const reportPath = join(resolve(options.reportRoot), relativePath);
  const dispositions = await Promise.all([
    writeImmutable(reportPath, payload),
    writeImmutable(join(resolve(options.publicReportRoot), relativePath), payload),
  ]);
  await Promise.all([
    writeProjection(resolve(options.dashboardProjectionPath), payload),
    writeProjection(join(resolve(options.publicReportRoot), "active.json"), payload),
  ]);
  return {
    reportPath,
    disposition: dispositions.every((value) => value === "reused") ? "reused" : "published",
    report,
  };
}
