import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import {
  BenchmarkReadinessSchema,
  DailyEvidenceRecordSchema,
  EvidenceReproducibilityReportSchema,
  ExecutionCostReadinessSchema,
  ProspectiveReadinessSchema,
  WalkForwardReadinessSchema,
  type DailyEvidenceRecord,
  type ProspectiveReadiness,
} from "@akribeia/contracts";

export interface GenerateProspectiveReadinessOptions {
  evidenceRoot: string;
  reportRoot: string;
  dashboardProjectionPath: string;
  publicReportRoot: string;
}

export interface GenerateProspectiveReadinessResult {
  reportPath: string;
  disposition: "published" | "reused";
  report: ProspectiveReadiness;
}

interface ReceiptedDailyEvidence {
  path: string;
  relativePath: string;
  reproducibilityReportPath: string;
  payload: Uint8Array;
  sha256: string;
  record: DailyEvidenceRecord;
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
    if (!hasErrorCode(error, "EEXIST")) {
      throw error;
    }

    if (!(await readFile(path)).equals(payload)) {
      throw new Error(`Immutable prospective-readiness conflict at "${path}".`, { cause: error });
    }

    return "reused";
  }
}

async function writeProjection(path: string, payload: Uint8Array): Promise<void> {
  const temporaryPath = join(dirname(path), `.${randomUUID()}-prospective-readiness.tmp`);
  await mkdir(dirname(path), { recursive: true });

  try {
    await writeFile(temporaryPath, payload, { flag: "wx" });
    await rename(temporaryPath, path);
  } finally {
    await rm(temporaryPath, { force: true });
  }
}

async function collectDailyEvidence(evidenceRoot: string): Promise<ReceiptedDailyEvidence[]> {
  const dailyRoot = join(evidenceRoot, "daily");
  const dates = (await readdir(dailyRoot, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory() && /^\d{4}-\d{2}-\d{2}$/.test(entry.name))
    .sort((left, right) => left.name.localeCompare(right.name));
  const records: ReceiptedDailyEvidence[] = [];

  for (const dateEntry of dates) {
    const dateRoot = join(dailyRoot, dateEntry.name);
    const builds = (await readdir(dateRoot, { withFileTypes: true }))
      .filter((entry) => entry.isDirectory())
      .sort((left, right) => left.name.localeCompare(right.name));

    for (const buildEntry of builds) {
      const path = join(dateRoot, buildEntry.name, "evidence.json");
      let payload: Uint8Array;

      try {
        payload = await readFile(path);
      } catch (error) {
        if (hasErrorCode(error, "ENOENT")) {
          throw new Error(
            `Daily evidence directory "${join(dateEntry.name, buildEntry.name)}" is incomplete.`,
            { cause: error },
          );
        }
        throw error;
      }

      const record = DailyEvidenceRecordSchema.parse(parseJson(path, payload));
      if (record.asOfDate !== dateEntry.name || record.build.buildId !== buildEntry.name) {
        throw new Error(`Daily evidence path does not match its record lineage at "${path}".`);
      }

      const relativePath = relative(evidenceRoot, path).replaceAll("\\", "/");
      const reproducibilityPath = join(dateRoot, buildEntry.name, "reproducibility.json");
      const reproducibilityPayload = await readFile(reproducibilityPath);
      const reproducibility = EvidenceReproducibilityReportSchema.parse(
        parseJson(reproducibilityPath, reproducibilityPayload),
      );
      const digest = sha256(payload);
      if (
        reproducibility.buildId !== record.build.buildId ||
        reproducibility.asOfDate !== record.asOfDate ||
        reproducibility.evidenceRecordPath !== relativePath ||
        reproducibility.evidenceRecordSha256 !== digest ||
        reproducibility.result !== "verified"
      ) {
        throw new Error(`Daily evidence reproducibility receipt does not reconcile at "${path}".`);
      }

      records.push({
        path,
        relativePath,
        reproducibilityReportPath: relative(evidenceRoot, reproducibilityPath).replaceAll(
          "\\",
          "/",
        ),
        payload,
        sha256: digest,
        record,
      });
    }
  }

  return records;
}

export async function generateProspectiveReadiness(
  options: GenerateProspectiveReadinessOptions,
): Promise<GenerateProspectiveReadinessResult> {
  const evidenceRoot = resolve(options.evidenceRoot);
  const activeDailyPath = join(evidenceRoot, "active.json");
  const executionPath = join(evidenceRoot, "execution-cost-readiness", "active.json");
  const benchmarkPath = join(evidenceRoot, "benchmark-readiness", "active.json");
  const walkForwardPath = join(evidenceRoot, "walk-forward-readiness", "active.json");
  const [activeDailyPayload, executionPayload, benchmarkPayload, walkForwardPayload, dailyRecords] =
    await Promise.all([
      readFile(activeDailyPath),
      readFile(executionPath),
      readFile(benchmarkPath),
      readFile(walkForwardPath),
      collectDailyEvidence(evidenceRoot),
    ]);
  const activeDaily = DailyEvidenceRecordSchema.parse(
    parseJson(activeDailyPath, activeDailyPayload),
  );
  const execution = ExecutionCostReadinessSchema.parse(parseJson(executionPath, executionPayload));
  const benchmark = BenchmarkReadinessSchema.parse(parseJson(benchmarkPath, benchmarkPayload));
  const walkForward = WalkForwardReadinessSchema.parse(
    parseJson(walkForwardPath, walkForwardPayload),
  );

  if (
    execution.buildId !== activeDaily.build.buildId ||
    benchmark.buildId !== activeDaily.build.buildId ||
    walkForward.buildId !== activeDaily.build.buildId ||
    execution.modelVersion !== activeDaily.build.modelVersion ||
    benchmark.modelVersion !== activeDaily.build.modelVersion ||
    walkForward.modelVersion !== activeDaily.build.modelVersion
  ) {
    throw new Error("Prospective readiness inputs do not share active lineage.");
  }

  const activeImmutableRecord = dailyRecords.find(
    ({ record }) =>
      record.asOfDate === activeDaily.asOfDate &&
      record.build.buildId === activeDaily.build.buildId,
  );
  if (
    activeImmutableRecord === undefined ||
    !activeDailyPayload.equals(activeImmutableRecord.payload)
  ) {
    throw new Error("Active daily evidence does not match its immutable ledger record.");
  }

  const observationDates = [...new Set(dailyRecords.map(({ record }) => record.asOfDate))];
  const requiredDailyObservationCount = 30;
  const uniqueObservationDayCount = observationDates.length;
  const earliestObservationDate = observationDates.at(0) ?? null;
  const latestObservationDate = observationDates.at(-1) ?? null;
  const report = ProspectiveReadinessSchema.parse({
    reportSchemaVersion: "1.0.0",
    buildId: activeDaily.build.buildId,
    modelVersion: activeDaily.build.modelVersion,
    assessedAt: walkForward.assessedAt,
    status: "blocked-insufficient-prospective-history",
    prospectiveValidationEligible: false,
    certificationEligible: false,
    requirements: {
      immutableDailyObservationDays: requiredDailyObservationCount,
      executablePortfolioRecords: 30,
      costedReturnObservations: 30,
      approvedBenchmarkComparisons: 30,
      monthlyValidationReports: 1,
    },
    progress: {
      immutableDailyEvidenceRecordCount: dailyRecords.length,
      uniqueObservationDayCount,
      remainingObservationDayCount: Math.max(
        0,
        requiredDailyObservationCount - uniqueObservationDayCount,
      ),
      executablePortfolioRecordCount: 0,
      costedReturnObservationCount: 0,
      approvedBenchmarkComparisonCount: 0,
      monthlyValidationReportCount: 0,
      earliestObservationDate,
      latestObservationDate,
    },
    observations: dailyRecords.map(
      ({ record, relativePath, reproducibilityReportPath, sha256: digest }) => ({
        asOfDate: record.asOfDate,
        buildId: record.build.buildId,
        modelVersion: record.build.modelVersion,
        recordedAt: record.recordedAt,
        evidenceRecordPath: relativePath,
        evidenceRecordSha256: digest,
        reproducibilityReportPath,
        reproductionVerified: true,
        executionRecorded: false,
        costedReturnComputed: false,
        approvedBenchmarkCompared: false,
      }),
    ),
    sourceReports: [
      {
        name: "daily-evidence",
        status: "partial-observation-window",
        eligibilityClaim: false,
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
      {
        name: "walk-forward-readiness",
        status: walkForward.status,
        eligibilityClaim: walkForward.outOfSampleEligible,
      },
    ],
    controls: [
      {
        key: "immutable-daily-ledger",
        status: "partial",
        detail: `${uniqueObservationDayCount} of ${requiredDailyObservationCount} required independent daily observation dates are present in the immutable ledger.`,
      },
      {
        key: "independent-observation-window",
        status: "blocked",
        detail:
          "The repository has not yet accumulated 30 distinct post-publication observation dates under a frozen prospective protocol.",
      },
      {
        key: "executable-portfolio-records",
        status: "blocked",
        detail:
          "No daily record contains capital, prior holdings, executable prices, fills, or realized trade quantities.",
      },
      {
        key: "costed-net-returns",
        status: "blocked",
        detail:
          "No daily observation contains turnover, transaction costs, gross return, or net return; missing costs remain null rather than zero.",
      },
      {
        key: "approved-benchmark-comparisons",
        status: "blocked",
        detail:
          "No approved benchmark mandate or distribution-inclusive total-return comparison is attached to a daily observation.",
      },
      {
        key: "monthly-validation-reports",
        status: "blocked",
        detail:
          "No completed monthly prospective-validation report exists because the first 30-day observation window is incomplete.",
      },
      {
        key: "prospective-protocol",
        status: "blocked",
        detail:
          "No frozen policy yet defines the daily decision time, execution convention, benchmark, review cadence, exceptions, and certification thresholds.",
      },
      {
        key: "model-drift-retirement-rules",
        status: "blocked",
        detail:
          "No approved prospective thresholds define model drift alerts, investigation, suspension, retirement, or replacement decisions.",
      },
    ],
    certificationConditions: [
      {
        key: "thirty-immutable-observation-days",
        requiredCount: 30,
        observedCount: uniqueObservationDayCount,
        satisfied: false,
        detail:
          "Collect 30 distinct immutable daily evidence dates without backfilling or rewriting records.",
      },
      {
        key: "thirty-executable-portfolio-records",
        requiredCount: 30,
        observedCount: 0,
        satisfied: false,
        detail:
          "Record executable portfolio decisions, fills, and prior-holding lineage for each observation date.",
      },
      {
        key: "thirty-costed-return-observations",
        requiredCount: 30,
        observedCount: 0,
        satisfied: false,
        detail:
          "Compute gross and net returns only from receipted fills, costs, and valuation timestamps.",
      },
      {
        key: "thirty-approved-benchmark-comparisons",
        requiredCount: 30,
        observedCount: 0,
        satisfied: false,
        detail:
          "Use one approved, point-in-time, distribution-inclusive benchmark series aligned to portfolio valuation.",
      },
      {
        key: "one-monthly-validation-report",
        requiredCount: 1,
        observedCount: 0,
        satisfied: false,
        detail:
          "Publish an immutable monthly report covering completeness, exceptions, costs, benchmark comparison, and limitations.",
      },
      {
        key: "frozen-prospective-protocol",
        requiredCount: null,
        observedCount: 0,
        satisfied: false,
        detail:
          "Approve and version the prospective protocol before additional observations can count toward certification.",
      },
      {
        key: "approved-drift-retirement-policy",
        requiredCount: null,
        observedCount: 0,
        satisfied: false,
        detail:
          "Approve versioned drift, escalation, suspension, and model-retirement rules before certification.",
      },
    ],
    limitations: [
      "The single preserved daily record is a research-preview receipt, not a prospective performance result.",
      "Repeated builds on one date do not create additional independent observation days.",
      "No execution, cost, return, benchmark, excess-return, risk, or attribution statistic is computed.",
      "Thirty dates alone cannot satisfy certification without complete execution, benchmark, protocol, and monthly-review evidence.",
      "Future records must remain immutable, chronological, reproducible, and free of retroactive model selection.",
      "This report cannot support an investment-performance or V2-replacement claim.",
    ],
    notice: activeDaily.notice,
  });
  const payload = deterministicJson(report);
  const relativePath = join("builds", report.buildId, "prospective-readiness.json");
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
