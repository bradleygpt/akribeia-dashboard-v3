import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import {
  BenchmarkReadinessSchema,
  CorporateActionReadinessSchema,
  ExecutionCostReadinessSchema,
  ExitDispositionReadinessSchema,
  FilingAvailabilityReportSchema,
  HistoricalReadinessReportSchema,
  UniverseMembershipReadinessSchema,
  WalkForwardReadinessSchema,
  type WalkForwardReadiness,
} from "@akribeia/contracts";

export interface GenerateWalkForwardReadinessOptions {
  evidenceRoot: string;
  reportRoot: string;
  dashboardProjectionPath: string;
  publicReportRoot: string;
}

export interface GenerateWalkForwardReadinessResult {
  reportPath: string;
  disposition: "published" | "reused";
  report: WalkForwardReadiness;
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
      throw new Error(`Immutable walk-forward-readiness conflict at "${path}".`, { cause: error });
    }
    return "reused";
  }
}

async function writeProjection(path: string, payload: Uint8Array): Promise<void> {
  const temporaryPath = join(dirname(path), `.${randomUUID()}-walk-forward.tmp`);
  await mkdir(dirname(path), { recursive: true });
  try {
    await writeFile(temporaryPath, payload, { flag: "wx" });
    await rename(temporaryPath, path);
  } finally {
    await rm(temporaryPath, { force: true });
  }
}

export async function generateWalkForwardReadiness(
  options: GenerateWalkForwardReadinessOptions,
): Promise<GenerateWalkForwardReadinessResult> {
  const root = resolve(options.evidenceRoot);
  const paths = {
    historical: join(root, "historical-readiness", "active.json"),
    filings: join(root, "filing-availability", "active.json"),
    membership: join(root, "universe-membership", "active.json"),
    actions: join(root, "corporate-action-readiness", "active.json"),
    exits: join(root, "exit-disposition-readiness", "active.json"),
    execution: join(root, "execution-cost-readiness", "active.json"),
    benchmark: join(root, "benchmark-readiness", "active.json"),
  };
  const [historical, filings, membership, actions, exits, execution, benchmark] = await Promise.all(
    [
      readFile(paths.historical).then((value) =>
        HistoricalReadinessReportSchema.parse(parseJson(paths.historical, value)),
      ),
      readFile(paths.filings).then((value) =>
        FilingAvailabilityReportSchema.parse(parseJson(paths.filings, value)),
      ),
      readFile(paths.membership).then((value) =>
        UniverseMembershipReadinessSchema.parse(parseJson(paths.membership, value)),
      ),
      readFile(paths.actions).then((value) =>
        CorporateActionReadinessSchema.parse(parseJson(paths.actions, value)),
      ),
      readFile(paths.exits).then((value) =>
        ExitDispositionReadinessSchema.parse(parseJson(paths.exits, value)),
      ),
      readFile(paths.execution).then((value) =>
        ExecutionCostReadinessSchema.parse(parseJson(paths.execution, value)),
      ),
      readFile(paths.benchmark).then((value) =>
        BenchmarkReadinessSchema.parse(parseJson(paths.benchmark, value)),
      ),
    ],
  );
  const sources = [filings, membership, actions, exits, execution, benchmark];
  if (
    sources.some(
      ({ buildId, modelVersion }) =>
        buildId !== historical.buildId || modelVersion !== historical.modelVersion,
    )
  ) {
    throw new Error("Walk-forward readiness inputs do not share active lineage.");
  }
  const report = WalkForwardReadinessSchema.parse({
    reportSchemaVersion: "1.0.0",
    buildId: historical.buildId,
    modelVersion: historical.modelVersion,
    assessedAt: historical.assessedAt,
    status: "blocked-no-eligible-folds",
    walkForwardEligible: false,
    outOfSampleEligible: false,
    calendar: {
      snapshotCount: historical.snapshots.length,
      pointInTimeEligibleSnapshotCount: historical.snapshots.filter(
        ({ pointInTimeEligible }) => pointInTimeEligible,
      ).length,
      candidateFoldCount: 0,
      eligibleFoldCount: 0,
      evaluatedFoldCount: 0,
      performanceComparisonCount: 0,
    },
    snapshots: historical.snapshots.map(
      ({ snapshotId, declaredGeneratedAt, timestampStatus, pointInTimeEligible }) => ({
        snapshotId,
        declaredGeneratedAt,
        timestampStatus,
        pointInTimeEligible,
      }),
    ),
    sourceReports: [
      {
        name: "historical-readiness",
        status: historical.status,
        eligibilityClaim: historical.historicalValidationEligible,
      },
      {
        name: "filing-availability",
        status: filings.status,
        eligibilityClaim: filings.historicalValidationEligible,
      },
      {
        name: "universe-membership",
        status: membership.status,
        eligibilityClaim: membership.historicalValidationEligible,
      },
      {
        name: "corporate-action-readiness",
        status: actions.status,
        eligibilityClaim: actions.historicalValidationEligible,
      },
      {
        name: "exit-disposition-readiness",
        status: exits.status,
        eligibilityClaim: exits.historicalTickerHistoryEligible,
      },
      {
        name: "execution-cost-readiness",
        status: execution.status,
        eligibilityClaim: execution.netPerformanceEligible,
      },
      {
        name: "benchmark-readiness",
        status: benchmark.status,
        eligibilityClaim: benchmark.benchmarkReturnEligible,
      },
    ],
    controls: [
      {
        key: "strict-cross-section-inventory",
        status: "partial",
        detail:
          "Two receipted $10B cross-sections pass the strict input contract, but neither is point-in-time eligible.",
      },
      {
        key: "filing-availability",
        status: "partial",
        detail:
          "Retrospective SEC acceptance timestamps cover 11 selected tickers at one decision cutoff; acquisition-time history is absent.",
      },
      {
        key: "survivorship-aware-universe",
        status: "blocked",
        detail:
          "Observed membership changes lack eligibility rules, effective intervals, and survivorship control.",
      },
      {
        key: "identity-actions-exits",
        status: "blocked",
        detail:
          "Permanent listing identity, ticker history, corporate actions, delistings, and successor terms remain unverified.",
      },
      {
        key: "execution-and-costs",
        status: "blocked",
        detail:
          "No capital base, prior holdings, executable prices, turnover, slippage, fees, or net-return record exists.",
      },
      {
        key: "benchmark-total-return",
        status: "blocked",
        detail:
          "No benchmark is selected and no adjusted, distribution-inclusive total-return series exists.",
      },
      {
        key: "walk-forward-protocol",
        status: "blocked",
        detail:
          "No training window, rebalance cadence, embargo, parameter-freeze, or fold-construction policy exists.",
      },
      {
        key: "out-of-sample-calendar",
        status: "blocked",
        detail:
          "Two timezone-unspecified snapshots cannot form a training, validation, and out-of-sample evaluation calendar.",
      },
    ],
    limitations: [
      "Zero candidate, eligible, or evaluated folds exist.",
      "The report evaluates readiness controls; it does not run a backtest.",
      "No portfolio return, benchmark return, excess return, risk statistic, or performance comparison is computed.",
      "A longer calendar alone is insufficient without point-in-time identity, membership, actions, execution, and benchmark evidence.",
      "Future folds must be immutable, deterministic, temporally ordered, and independently reproducible.",
      "This report cannot support an investment-performance claim.",
    ],
    notice: historical.notice,
  });
  const payload = deterministicJson(report);
  const relativePath = join("builds", report.buildId, "walk-forward-readiness.json");
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
