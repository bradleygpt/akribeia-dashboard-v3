import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import {
  DailyEvidenceRecordSchema,
  HistoricalFixtureInventoryShapeSchema,
  HistoricalReadinessReportSchema,
  SecurityMasterSchema,
  V2BaselineMetadataSchema,
  V2BaselineUniverseSnapshotSchema,
  type HistoricalReadinessReport,
} from "@akribeia/contracts";

interface SnapshotSource {
  snapshotId: string;
  label: string;
  metadataPath: string;
  floor0Path: string;
  floor10Path: string;
}

export interface GenerateHistoricalReadinessOptions {
  activeDailyEvidencePath: string;
  activeSecurityMasterPath: string;
  snapshots: [SnapshotSource, SnapshotSource];
  historicalReadinessRoot: string;
  dashboardProjectionPath: string;
  publicHistoricalReadinessRoot: string;
}

export interface GenerateHistoricalReadinessResult {
  reportPath: string;
  disposition: "published" | "reused";
  report: HistoricalReadinessReport;
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
      throw new Error(`Immutable historical-readiness conflict at "${path}".`, { cause: error });
    }

    return "reused";
  }
}

async function writeProjection(path: string, payload: Uint8Array): Promise<void> {
  const temporaryPath = join(dirname(path), `.${randomUUID()}-historical-readiness.tmp`);

  await mkdir(dirname(path), { recursive: true });

  try {
    await writeFile(temporaryPath, payload, { flag: "wx" });
    await rename(temporaryPath, path);
  } finally {
    await rm(temporaryPath, { force: true });
  }
}

async function inventorySnapshot(source: SnapshotSource) {
  const metadataPath = resolve(source.metadataPath);
  const floor0Path = resolve(source.floor0Path);
  const floor10Path = resolve(source.floor10Path);
  const [metadataPayload, floor0Payload, floor10Payload] = await Promise.all([
    readFile(metadataPath),
    readFile(floor0Path),
    readFile(floor10Path),
  ]);
  const metadata = V2BaselineMetadataSchema.parse(parseJson(metadataPath, metadataPayload));
  const floor0 = HistoricalFixtureInventoryShapeSchema.parse(parseJson(floor0Path, floor0Payload));
  const floor10 = HistoricalFixtureInventoryShapeSchema.parse(
    parseJson(floor10Path, floor10Payload),
  );
  const floor0Strict = V2BaselineUniverseSnapshotSchema.safeParse(
    parseJson(floor0Path, floor0Payload),
  );
  const floor10Strict = V2BaselineUniverseSnapshotSchema.safeParse(
    parseJson(floor10Path, floor10Payload),
  );

  if (floor0.meta.floor !== 0 || floor10.meta.floor !== 10) {
    throw new Error(`Historical fixture floors do not match their declared inventory paths.`);
  }

  return {
    snapshotId: source.snapshotId,
    label: source.label,
    metadataPath: relative(resolve("."), metadataPath).replaceAll("\\", "/"),
    metadataSha256: sha256(metadataPayload),
    declaredGeneratedAt: metadata.generated_at,
    timestampStatus: "timezone-unspecified" as const,
    sourceCommit: metadata.source_commit,
    observationKind: "cross-sectional-research-snapshot" as const,
    pointInTimeEligible: false as const,
    artifacts: [
      {
        floorBillions: 0 as const,
        path: relative(resolve("."), floor0Path).replaceAll("\\", "/"),
        sha256: sha256(floor0Payload),
        rowCount: floor0.rows.length,
        strictInputContractStatus: floor0Strict.success ? ("pass" as const) : ("fail" as const),
        strictInputIssueCount: floor0Strict.success ? 0 : floor0Strict.error.issues.length,
        strictInputIssues: floor0Strict.success
          ? []
          : floor0Strict.error.issues.map(({ path, message }) => ({
              path: path.join("."),
              message,
            })),
      },
      {
        floorBillions: 10 as const,
        path: relative(resolve("."), floor10Path).replaceAll("\\", "/"),
        sha256: sha256(floor10Payload),
        rowCount: floor10.rows.length,
        strictInputContractStatus: floor10Strict.success ? ("pass" as const) : ("fail" as const),
        strictInputIssueCount: floor10Strict.success ? 0 : floor10Strict.error.issues.length,
        strictInputIssues: floor10Strict.success
          ? []
          : floor10Strict.error.issues.map(({ path, message }) => ({
              path: path.join("."),
              message,
            })),
      },
    ],
    limitation:
      "This file is a research capture with no per-record availability time, permanent identity history, or corporate-action semantics.",
  };
}

export async function generateHistoricalReadiness(
  options: GenerateHistoricalReadinessOptions,
): Promise<GenerateHistoricalReadinessResult> {
  const dailyPath = resolve(options.activeDailyEvidencePath);
  const masterPath = resolve(options.activeSecurityMasterPath);
  const [daily, master, ...snapshots] = await Promise.all([
    readFile(dailyPath).then((payload) =>
      DailyEvidenceRecordSchema.parse(parseJson(dailyPath, payload)),
    ),
    readFile(masterPath).then((payload) =>
      SecurityMasterSchema.parse(parseJson(masterPath, payload)),
    ),
    ...options.snapshots.map(inventorySnapshot),
  ]);

  if (
    master.buildId !== daily.build.buildId ||
    master.source.contentSha256 !== daily.source.contentSha256
  ) {
    throw new Error("Historical-readiness inputs do not share the active build lineage.");
  }

  const controls = [
    {
      key: "snapshot-inventory" as const,
      status: "pass" as const,
      detail: `${snapshots.length} preserved research snapshots are digested and inventoried.`,
      evidence: snapshots.flatMap(({ artifacts }) => artifacts.map(({ path }) => path)),
    },
    {
      key: "snapshot-input-validity" as const,
      status: "blocked" as const,
      detail: `${
        snapshots
          .flatMap(({ artifacts }) => artifacts)
          .filter(({ strictInputContractStatus }) => strictInputContractStatus === "fail").length
      } of ${snapshots.length * 2} inventoried fixture files fail the strict V3 input contract.`,
      evidence: snapshots
        .flatMap(({ artifacts }) => artifacts)
        .filter(({ strictInputContractStatus }) => strictInputContractStatus === "fail")
        .map(({ path }) => path),
    },
    {
      key: "availability-timestamps" as const,
      status: "blocked" as const,
      detail:
        "Declared snapshot generation times omit timezone semantics and no record-level retrieval or availability timestamps exist.",
      evidence: snapshots.map(({ metadataPath }) => metadataPath),
    },
    {
      key: "point-in-time-fundamentals" as const,
      status: "blocked" as const,
      detail:
        "Fundamental and estimate values do not record filing, announcement, vendor-availability, or revision timestamps.",
      evidence: snapshots.flatMap(({ artifacts }) => artifacts.map(({ path }) => path)),
    },
    {
      key: "survivorship-universe" as const,
      status: "blocked" as const,
      detail:
        "The preserved universes are cross-sectional captures and do not prove historical constituent eligibility without survivorship bias.",
      evidence: snapshots.flatMap(({ artifacts }) => artifacts.map(({ path }) => path)),
    },
    {
      key: "permanent-identity-history" as const,
      status: "blocked" as const,
      detail:
        "The active security master contains zero permanent identifiers and cannot link issuers or listings across time.",
      evidence: ["data/evidence/security-master"],
    },
    {
      key: "delistings-ticker-history" as const,
      status: "blocked" as const,
      detail:
        "Listing dates, delistings, ticker changes, aliases, mergers, and ticker reuse are unavailable.",
      evidence: ["data/evidence/security-master"],
    },
    {
      key: "corporate-actions" as const,
      status: "blocked" as const,
      detail: "Split, dividend, merger, spin-off, and price-adjustment records are absent.",
      evidence: ["ROADMAP.md"],
    },
    {
      key: "benchmark-series" as const,
      status: "blocked" as const,
      detail:
        "No point-in-time benchmark membership, prices, returns, or immutable comparison series is present.",
      evidence: ["data/evidence/daily"],
    },
    {
      key: "execution-costs" as const,
      status: "blocked" as const,
      detail:
        "No execution calendar, next-trade timing, spread, slippage, commission, liquidity, or transaction-cost inputs exist.",
      evidence: ["ROADMAP.md"],
    },
    {
      key: "walk-forward-design" as const,
      status: "blocked" as const,
      detail:
        "Two cross-sectional snapshots do not constitute a walk-forward, out-of-sample evaluation series.",
      evidence: snapshots.map(({ metadataPath }) => metadataPath),
    },
  ];
  const declaredTimes = snapshots.map(({ declaredGeneratedAt }) => declaredGeneratedAt).sort();
  const report = HistoricalReadinessReportSchema.parse({
    historicalReadinessSchemaVersion: "1.0.0",
    buildId: daily.build.buildId,
    modelVersion: daily.build.modelVersion,
    assessedAt: daily.recordedAt,
    status: "blocked",
    historicalValidationEligible: false,
    inventory: {
      snapshotCount: snapshots.length,
      crossSectionOnly: true,
      earliestDeclaredGeneratedAt: declaredTimes[0],
      latestDeclaredGeneratedAt: declaredTimes.at(-1),
    },
    snapshots,
    controls,
    blockers: controls.filter(({ status }) => status === "blocked").map(({ detail }) => detail),
    conclusion:
      "The repository can reproduce two research cross-sections, but it cannot yet support a point-in-time backtest, benchmark comparison, or investment-performance claim.",
    notice: daily.notice,
  });
  const payload = deterministicJson(report);
  const relativePath = join("builds", report.buildId, "historical-readiness.json");
  const reportPath = join(resolve(options.historicalReadinessRoot), relativePath);
  const dispositions = await Promise.all([
    writeImmutable(reportPath, payload),
    writeImmutable(join(resolve(options.publicHistoricalReadinessRoot), relativePath), payload),
  ]);

  await Promise.all([
    writeProjection(resolve(options.dashboardProjectionPath), payload),
    writeProjection(join(resolve(options.publicHistoricalReadinessRoot), "active.json"), payload),
  ]);

  return {
    reportPath,
    disposition: dispositions.every((disposition) => disposition === "reused")
      ? "reused"
      : "published",
    report,
  };
}
