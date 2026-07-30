import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import {
  BenchmarkReadinessSchema,
  HistoricalReadinessReportSchema,
  SecRegistrantCrosswalkSchema,
  UniverseMembershipReadinessSchema,
  V2BaselineUniverseSnapshotSchema,
  type BenchmarkReadiness,
  type HistoricalReadinessReport,
  type V2BaselineUniverseSnapshot,
} from "@akribeia/contracts";

export interface GenerateBenchmarkReadinessOptions {
  activeHistoricalReadinessPath: string;
  activeUniverseMembershipPath: string;
  activeSecRegistrantsPath: string;
  reportRoot: string;
  dashboardProjectionPath: string;
  publicReportRoot: string;
}

export interface GenerateBenchmarkReadinessResult {
  reportPath: string;
  disposition: "published" | "reused";
  report: BenchmarkReadiness;
}

const CANDIDATE_TICKERS = ["ITOT", "IVV", "SCHB", "SPLG", "SPTM", "SPY", "VOO", "VTI"] as const;

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
      throw new Error(`Immutable benchmark-readiness conflict at "${path}".`, { cause: error });
    }
    return "reused";
  }
}

async function writeProjection(path: string, payload: Uint8Array): Promise<void> {
  const temporaryPath = join(dirname(path), `.${randomUUID()}-benchmark-readiness.tmp`);
  await mkdir(dirname(path), { recursive: true });
  try {
    await writeFile(temporaryPath, payload, { flag: "wx" });
    await rename(temporaryPath, path);
  } finally {
    await rm(temporaryPath, { force: true });
  }
}

async function loadFloor10(
  snapshot: HistoricalReadinessReport["snapshots"][number],
): Promise<V2BaselineUniverseSnapshot> {
  const artifact = snapshot.artifacts.find(({ floorBillions }) => floorBillions === 10);
  if (artifact === undefined || artifact.strictInputContractStatus !== "pass") {
    throw new Error(`Snapshot "${snapshot.snapshotId}" has no valid $10B universe artifact.`);
  }
  const path = resolve(artifact.path);
  const payload = await readFile(path);
  if (sha256(payload) !== artifact.sha256) {
    throw new Error(`Snapshot "${snapshot.snapshotId}" fails its historical-readiness receipt.`);
  }
  const snapshotData = V2BaselineUniverseSnapshotSchema.parse(parseJson(path, payload));
  if (snapshotData.meta.floor !== 10 || snapshotData.rows.length !== artifact.rowCount) {
    throw new Error(`Snapshot "${snapshot.snapshotId}" does not reconcile with its receipt.`);
  }
  return snapshotData;
}

export async function generateBenchmarkReadiness(
  options: GenerateBenchmarkReadinessOptions,
): Promise<GenerateBenchmarkReadinessResult> {
  const historicalPath = resolve(options.activeHistoricalReadinessPath);
  const membershipPath = resolve(options.activeUniverseMembershipPath);
  const registrantsPath = resolve(options.activeSecRegistrantsPath);
  const [historical, membership, registrants] = await Promise.all([
    readFile(historicalPath).then((payload) =>
      HistoricalReadinessReportSchema.parse(parseJson(historicalPath, payload)),
    ),
    readFile(membershipPath).then((payload) =>
      UniverseMembershipReadinessSchema.parse(parseJson(membershipPath, payload)),
    ),
    readFile(registrantsPath).then((payload) =>
      SecRegistrantCrosswalkSchema.parse(parseJson(registrantsPath, payload)),
    ),
  ]);
  if (
    membership.buildId !== historical.buildId ||
    registrants.buildId !== historical.buildId ||
    membership.modelVersion !== historical.modelVersion ||
    registrants.modelVersion !== historical.modelVersion ||
    membership.assessedAt !== historical.assessedAt
  ) {
    throw new Error("Benchmark-readiness inputs do not share active lineage.");
  }
  const earlierInventory = historical.snapshots.find(
    ({ snapshotId }) => snapshotId === membership.comparison.earlierSnapshotId,
  );
  const laterInventory = historical.snapshots.find(
    ({ snapshotId }) => snapshotId === membership.comparison.laterSnapshotId,
  );
  if (earlierInventory === undefined || laterInventory === undefined) {
    throw new Error("Benchmark readiness cannot resolve the compared snapshots.");
  }
  const [earlier, later] = await Promise.all([
    loadFloor10(earlierInventory),
    loadFloor10(laterInventory),
  ]);
  const earlierEtfs = earlier.rows.filter(({ sector }) => sector === "ETF");
  const laterEtfs = later.rows.filter(({ sector }) => sector === "ETF");
  const earlierByTicker = new Map(earlierEtfs.map((row) => [row.ticker, row]));
  const laterByTicker = new Map(laterEtfs.map((row) => [row.ticker, row]));
  const fundMatches = new Map(
    registrants.matches
      .filter(({ sourceType }) => sourceType === "mutual-fund-class")
      .map((match) => [match.ticker, match]),
  );
  const unmatchedFunds = new Set(
    registrants.unmatched
      .filter(({ expectedSource }) => expectedSource === "mutual-fund-tickers")
      .map(({ ticker }) => ticker),
  );
  const candidates = CANDIDATE_TICKERS.map((ticker) => {
    const before = earlierByTicker.get(ticker);
    const after = laterByTicker.get(ticker);
    if (before === undefined || after === undefined || before.name !== after.name) {
      throw new Error(`Benchmark candidate "${ticker}" does not reconcile across snapshots.`);
    }
    const association = fundMatches.get(ticker);
    if (association === undefined && !unmatchedFunds.has(ticker)) {
      throw new Error(`Benchmark candidate "${ticker}" has no current identity disposition.`);
    }
    return {
      ticker,
      name: before.name,
      candidateRole: "broad-us-equity-proxy" as const,
      earlierPrice: before.price,
      laterPrice: after.price,
      observedPriceChange: after.price / before.price - 1,
      currentSecFundAssociation:
        association === undefined
          ? null
          : {
              cik: association.cik,
              seriesId: association.seriesId,
              classId: association.classId,
            },
      benchmarkSelected: false as const,
      adjustedPricesAvailable: false as const,
      distributionsAvailable: false as const,
      totalReturn: null,
    };
  });
  const associationCount = candidates.filter(
    ({ currentSecFundAssociation }) => currentSecFundAssociation !== null,
  ).length;
  const report = BenchmarkReadinessSchema.parse({
    reportSchemaVersion: "1.0.0",
    buildId: historical.buildId,
    modelVersion: historical.modelVersion,
    assessedAt: historical.assessedAt,
    identityObservedAt: registrants.generatedAt,
    status: "candidate-proxies-not-return-series",
    benchmarkSelected: false,
    benchmarkReturnEligible: false,
    comparison: {
      earlierSnapshotId: membership.comparison.earlierSnapshotId,
      laterSnapshotId: membership.comparison.laterSnapshotId,
      earlierEtfCount: earlierEtfs.length,
      laterEtfCount: laterEtfs.length,
      candidateCount: candidates.length,
      observedPriceComparisonCount: candidates.length,
      totalReturnObservationCount: 0,
      selectedBenchmarkId: null,
    },
    candidates,
    coverage: {
      candidateCount: candidates.length,
      currentSecFundAssociationCount: associationCount,
      unmatchedCurrentAssociationCount: candidates.length - associationCount,
      observedPriceComparisonCount: candidates.length,
      totalReturnObservationCount: 0,
    },
    controls: [
      {
        key: "receipted-candidate-prices",
        status: "pass",
        detail: `${candidates.length} broad-U.S.-equity proxy candidates have prices in both receipted $10B snapshots.`,
      },
      {
        key: "current-sec-fund-associations",
        status: "partial",
        detail: `${associationCount} of ${candidates.length} candidates have an exact current SEC series/class association; current identity does not prove historical continuity.`,
      },
      {
        key: "benchmark-mandate",
        status: "blocked",
        detail:
          "No approved investment universe, benchmark policy, comparison objective, or selected benchmark identifier exists.",
      },
      {
        key: "observation-availability-times",
        status: "blocked",
        detail:
          "The snapshots have timezone-unspecified generation metadata and no record-level availability timestamps.",
      },
      {
        key: "distributions-corporate-actions",
        status: "blocked",
        detail:
          "No distribution, split, reinvestment, or other corporate-action ledger exists for any candidate.",
      },
      {
        key: "total-return-series",
        status: "blocked",
        detail:
          "Snapshot prices are not an adjusted total-return series and cannot establish benchmark return.",
      },
      {
        key: "evaluation-interval",
        status: "blocked",
        detail:
          "No decision-to-execution-to-valuation interval or market-session convention is defined.",
      },
      {
        key: "portfolio-execution-alignment",
        status: "blocked",
        detail:
          "No executed portfolio, transaction-cost record, or timestamp-aligned benchmark observation exists.",
      },
    ],
    limitations: [
      "Candidate status is an inventory aid, not a benchmark selection or endorsement.",
      "Observed price change is not a price return, total return, or investable performance result.",
      "Ticker equality and current SEC series/class association do not prove point-in-time fund identity.",
      "The repository does not contain distributions, reinvestment assumptions, adjusted prices, or index constituent history.",
      "Two cross-sections cannot establish a benchmark series, risk statistics, or walk-forward comparison.",
      "No candidate observation may be used to infer benchmark or portfolio performance.",
    ],
    notice: membership.notice,
  });
  const payload = deterministicJson(report);
  const relativePath = join("builds", report.buildId, "benchmark-readiness.json");
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
