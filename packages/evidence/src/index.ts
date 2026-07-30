import { createHash, randomUUID } from "node:crypto";
import type { Dirent } from "node:fs";
import { mkdir, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import {
  ActiveBuildPointerSchema,
  BuildManifestSchema,
  DailyEvidenceRecordSchema,
  DailyObservationCollectionReceiptSchema,
  EvidenceReproducibilityReportSchema,
  PublishedPortfolioArtifactSchema,
  PublishedScoresArtifactSchema,
  VerticalSliceDashboardSchema,
  type DailyEvidenceRecord,
  type DailyObservationCollectionReceipt,
  type EvidenceReproducibilityReport,
} from "@akribeia/contracts";

import { generateProspectiveReadiness } from "./prospective-readiness.js";

export * from "./governance.js";
export * from "./benchmark-readiness.js";
export * from "./corporate-action-readiness.js";
export * from "./exit-disposition-readiness.js";
export * from "./execution-cost-readiness.js";
export * from "./filing-availability.js";
export * from "./historical-readiness.js";
export * from "./maturity.js";
export * from "./quality.js";
export * from "./prospective-readiness.js";
export * from "./sec-identity-source.js";
export * from "./sec-registrants.js";
export * from "./sec-submissions-source.js";
export * from "./security-master.js";
export * from "./universe-membership.js";
export * from "./walk-forward-readiness.js";

const REQUIRED_ARTIFACTS = ["dashboard", "portfolio", "scores"] as const;
const BENCHMARK_REASON =
  "No point-in-time benchmark input is present in the repository; no benchmark return was computed.";
const PERFORMANCE_REASON =
  "A single model snapshot cannot establish investment performance; returns and comparisons remain uncomputed.";

export interface GenerateDailyEvidenceOptions {
  publishedDataRoot: string;
  evidenceRoot: string;
  dashboardProjectionPath: string;
  publicEvidenceRoot: string;
}

export interface GenerateDailyEvidenceResult {
  buildId: string;
  asOfDate: string;
  evidencePath: string;
  reportPath: string;
  disposition: "published" | "reused";
  record: DailyEvidenceRecord;
  report: EvidenceReproducibilityReport;
}

export interface CollectDailyObservationOptions extends GenerateDailyEvidenceOptions {
  prospectiveReportRoot: string;
  prospectiveDashboardProjectionPath: string;
  prospectivePublicReportRoot: string;
  receiptPath?: string;
  attemptedAt?: string;
}

export interface CollectDailyObservationResult {
  receipt: DailyObservationCollectionReceipt;
  receiptPath: string | null;
}

interface ActiveObservationCandidate {
  asOfDate: string;
  observedAt: string;
  buildId: string;
  modelVersion: string;
}

export type DailyObservationDateDecision =
  "collect" | "no-op-duplicate-date" | "blocked-backdated-date";

function sha256(payload: Uint8Array): string {
  return createHash("sha256").update(payload).digest("hex");
}

function deterministicJson(value: unknown): Uint8Array {
  return new TextEncoder().encode(`${JSON.stringify(value, null, 2)}\n`);
}

function parseJson(path: string, payload: Uint8Array): unknown {
  try {
    return JSON.parse(new TextDecoder().decode(payload)) as unknown;
  } catch (error) {
    throw new Error(`Invalid JSON at "${path}".`, { cause: error });
  }
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

    const existing = await readFile(path);

    if (!existing.equals(payload)) {
      throw new Error(`Immutable evidence conflict at "${path}".`, { cause: error });
    }

    return "reused";
  }
}

async function writeProjection(path: string, payload: Uint8Array): Promise<void> {
  const temporaryPath = join(dirname(path), `.${randomUUID()}-${path.split(/[\\/]/).at(-1)}.tmp`);

  await mkdir(dirname(path), { recursive: true });

  try {
    await writeFile(temporaryPath, payload, { flag: "wx" });
    await rename(temporaryPath, path);
  } finally {
    await rm(temporaryPath, { force: true });
  }
}

function assertSameLineage(
  buildId: string,
  schemaVersion: string,
  modelVersion: string,
  artifact: { buildId: string; schemaVersion: string; modelVersion: string },
  name: string,
): void {
  if (
    artifact.buildId !== buildId ||
    artifact.schemaVersion !== schemaVersion ||
    artifact.modelVersion !== modelVersion
  ) {
    throw new Error(`${name} lineage does not match the active manifest.`);
  }
}

async function loadActiveObservationCandidate(
  publishedDataRootInput: string,
): Promise<ActiveObservationCandidate> {
  const publishedDataRoot = resolve(publishedDataRootInput);
  const pointerPath = join(publishedDataRoot, "active-build.json");
  const pointer = ActiveBuildPointerSchema.parse(
    parseJson(pointerPath, await readFile(pointerPath)),
  );
  const buildRoot = join(publishedDataRoot, "builds", pointer.activeBuildId);
  const manifestPath = join(buildRoot, "manifest.json");
  const manifest = BuildManifestSchema.parse(parseJson(manifestPath, await readFile(manifestPath)));

  if (
    manifest.buildId !== pointer.activeBuildId ||
    manifest.status !== "healthy" ||
    manifest.publication.decision !== "publish" ||
    manifest.publishedAt === undefined
  ) {
    throw new Error("Active build is not a healthy published manifest.");
  }

  const receipt = manifest.files.dashboard;
  if (receipt === undefined) {
    throw new Error('Active manifest is missing required artifact "dashboard".');
  }

  const payload = await readFile(join(buildRoot, receipt.path));
  if (payload.byteLength !== receipt.byteSize || sha256(payload) !== receipt.sha256) {
    throw new Error('Active artifact "dashboard" failed byte-size or SHA-256 verification.');
  }

  const dashboard = VerticalSliceDashboardSchema.parse(parseJson("dashboard.json", payload));
  assertSameLineage(
    manifest.buildId,
    manifest.schemaVersion,
    manifest.modelVersion,
    dashboard,
    "dashboard",
  );

  return {
    asOfDate: dashboard.source.observedAt.slice(0, 10),
    observedAt: dashboard.source.observedAt,
    buildId: manifest.buildId,
    modelVersion: manifest.modelVersion,
  };
}

async function listObservationDates(evidenceRootInput: string): Promise<string[]> {
  const evidenceRoot = resolve(evidenceRootInput);
  const dailyRoot = join(evidenceRoot, "daily");
  let dateEntries: Dirent[];

  try {
    dateEntries = await readdir(dailyRoot, { withFileTypes: true });
  } catch (error) {
    if (hasErrorCode(error, "ENOENT")) {
      return [];
    }
    throw error;
  }

  const dates = dateEntries
    .filter((entry) => entry.isDirectory() && /^\d{4}-\d{2}-\d{2}$/.test(entry.name))
    .sort((left, right) => left.name.localeCompare(right.name));

  for (const dateEntry of dates) {
    const dateRoot = join(dailyRoot, dateEntry.name);
    const buildEntries = (await readdir(dateRoot, { withFileTypes: true }))
      .filter((entry) => entry.isDirectory())
      .sort((left, right) => left.name.localeCompare(right.name));

    if (buildEntries.length === 0) {
      throw new Error(`Daily evidence date directory "${dateEntry.name}" has no build records.`);
    }

    for (const buildEntry of buildEntries) {
      const evidencePath = join(dateRoot, buildEntry.name, "evidence.json");
      const reproducibilityPath = join(dateRoot, buildEntry.name, "reproducibility.json");
      let evidencePayload: Uint8Array;
      let reproducibilityPayload: Uint8Array;

      try {
        [evidencePayload, reproducibilityPayload] = await Promise.all([
          readFile(evidencePath),
          readFile(reproducibilityPath),
        ]);
      } catch (error) {
        if (hasErrorCode(error, "ENOENT")) {
          throw new Error(
            `Daily evidence directory "${join(dateEntry.name, buildEntry.name)}" is incomplete.`,
            { cause: error },
          );
        }
        throw error;
      }

      const record = DailyEvidenceRecordSchema.parse(parseJson(evidencePath, evidencePayload));
      const reproducibility = EvidenceReproducibilityReportSchema.parse(
        parseJson(reproducibilityPath, reproducibilityPayload),
      );
      const relativeEvidencePath = relative(evidenceRoot, evidencePath).replaceAll("\\", "/");

      if (
        record.asOfDate !== dateEntry.name ||
        record.build.buildId !== buildEntry.name ||
        reproducibility.buildId !== record.build.buildId ||
        reproducibility.asOfDate !== record.asOfDate ||
        reproducibility.evidenceRecordPath !== relativeEvidencePath ||
        reproducibility.evidenceRecordSha256 !== sha256(evidencePayload) ||
        reproducibility.result !== "verified"
      ) {
        throw new Error(`Daily evidence ledger receipt does not reconcile at "${evidencePath}".`);
      }
    }
  }

  return dates.map(({ name }) => name);
}

export function classifyDailyObservationDate(
  candidateDate: string,
  observationDates: readonly string[],
): DailyObservationDateDecision {
  if (observationDates.includes(candidateDate)) {
    return "no-op-duplicate-date";
  }

  const latestObservationDate = [...observationDates]
    .sort((left, right) => left.localeCompare(right))
    .at(-1);

  if (latestObservationDate !== undefined && candidateDate < latestObservationDate) {
    return "blocked-backdated-date";
  }

  return "collect";
}

async function maybeWriteCollectionReceipt(
  path: string | undefined,
  receipt: DailyObservationCollectionReceipt,
): Promise<string | null> {
  if (path === undefined) {
    return null;
  }

  const resolvedPath = resolve(path);
  await writeProjection(resolvedPath, deterministicJson(receipt));
  return resolvedPath;
}

export async function generateDailyEvidence(
  options: GenerateDailyEvidenceOptions,
): Promise<GenerateDailyEvidenceResult> {
  const publishedDataRoot = resolve(options.publishedDataRoot);
  const pointerPath = join(publishedDataRoot, "active-build.json");
  const pointer = ActiveBuildPointerSchema.parse(
    parseJson(pointerPath, await readFile(pointerPath)),
  );
  const buildRoot = join(publishedDataRoot, "builds", pointer.activeBuildId);
  const manifestPath = join(buildRoot, "manifest.json");
  const manifest = BuildManifestSchema.parse(parseJson(manifestPath, await readFile(manifestPath)));

  if (
    manifest.buildId !== pointer.activeBuildId ||
    manifest.status !== "healthy" ||
    manifest.publication.decision !== "publish" ||
    manifest.publishedAt === undefined
  ) {
    throw new Error("Active build is not a healthy published manifest.");
  }

  const payloads = new Map<string, Uint8Array>();

  for (const name of REQUIRED_ARTIFACTS) {
    const receipt = manifest.files[name];

    if (receipt === undefined) {
      throw new Error(`Active manifest is missing required artifact "${name}".`);
    }

    const payload = await readFile(join(buildRoot, receipt.path));

    if (payload.byteLength !== receipt.byteSize || sha256(payload) !== receipt.sha256) {
      throw new Error(`Active artifact "${name}" failed byte-size or SHA-256 verification.`);
    }

    payloads.set(name, payload);
  }

  const dashboard = VerticalSliceDashboardSchema.parse(
    parseJson("dashboard.json", payloads.get("dashboard")!),
  );
  const portfolio = PublishedPortfolioArtifactSchema.parse(
    parseJson("portfolio.json", payloads.get("portfolio")!),
  );
  const scores = PublishedScoresArtifactSchema.parse(
    parseJson("scores.json", payloads.get("scores")!),
  );

  for (const [name, artifact] of [
    ["dashboard", dashboard],
    ["portfolio", portfolio],
    ["scores", scores],
  ] as const) {
    assertSameLineage(
      manifest.buildId,
      manifest.schemaVersion,
      manifest.modelVersion,
      artifact,
      name,
    );
  }

  if (
    dashboard.source.contentSha256 !== portfolio.source.contentSha256 ||
    dashboard.source.contentSha256 !== scores.source.contentSha256 ||
    dashboard.portfolio.totalWeightUnits !== dashboard.portfolio.construction.weightScale
  ) {
    throw new Error("Active artifact source lineage or exact portfolio weights do not reconcile.");
  }

  const record = DailyEvidenceRecordSchema.parse({
    evidenceSchemaVersion: "1.0.0",
    asOfDate: dashboard.source.observedAt.slice(0, 10),
    recordedAt: manifest.publishedAt,
    build: {
      buildId: manifest.buildId,
      schemaVersion: manifest.schemaVersion,
      modelVersion: manifest.modelVersion,
      generatedAt: manifest.generatedAt,
      publishedAt: manifest.publishedAt,
      status: manifest.status,
      publicationDecision: manifest.publication.decision,
    },
    source: dashboard.source,
    artifacts: REQUIRED_ARTIFACTS.map((name) => {
      const artifact = manifest.files[name]!;

      return {
        name,
        path: artifact.path,
        sha256: artifact.sha256,
        byteSize: artifact.byteSize,
        rowCount: artifact.rowCount ?? 0,
      };
    }),
    scoring: dashboard.scoring,
    portfolio: dashboard.portfolio,
    benchmark: {
      status: "unavailable",
      benchmarkId: null,
      observedAt: null,
      return: null,
      reason: BENCHMARK_REASON,
    },
    performance: {
      status: "not-computed",
      reason: PERFORMANCE_REASON,
    },
    maturity: "research-preview",
    notice: dashboard.notice,
  });
  const evidencePayload = deterministicJson(record);
  const relativeEvidencePath = join(
    "daily",
    record.asOfDate,
    record.build.buildId,
    "evidence.json",
  ).replaceAll("\\", "/");
  const evidencePath = join(resolve(options.evidenceRoot), relativeEvidencePath);
  const publicEvidencePath = join(resolve(options.publicEvidenceRoot), relativeEvidencePath);
  const report = EvidenceReproducibilityReportSchema.parse({
    reportSchemaVersion: "1.0.0",
    buildId: record.build.buildId,
    asOfDate: record.asOfDate,
    verifiedAt: record.recordedAt,
    evidenceRecordPath: relative(resolve(options.evidenceRoot), evidencePath).replaceAll("\\", "/"),
    evidenceRecordSha256: sha256(evidencePayload),
    reproductionCommand: "npm run evidence:generate",
    checks: {
      activePointer: true,
      manifestSchema: true,
      publicationHealthy: true,
      artifactDigests: true,
      artifactSchemas: true,
      lineage: true,
      exactPortfolioWeights: true,
      evidenceSchema: true,
    },
    result: "verified",
  });
  const reportPayload = deterministicJson(report);
  const reportPath = join(
    resolve(options.evidenceRoot),
    "daily",
    record.asOfDate,
    record.build.buildId,
    "reproducibility.json",
  );
  const publicReportPath = join(
    resolve(options.publicEvidenceRoot),
    "daily",
    record.asOfDate,
    record.build.buildId,
    "reproducibility.json",
  );
  const dispositions = await Promise.all([
    writeImmutable(evidencePath, evidencePayload),
    writeImmutable(reportPath, reportPayload),
    writeImmutable(publicEvidencePath, evidencePayload),
    writeImmutable(publicReportPath, reportPayload),
  ]);

  await Promise.all([
    writeProjection(resolve(options.dashboardProjectionPath), evidencePayload),
    writeProjection(join(resolve(options.publicEvidenceRoot), "active.json"), evidencePayload),
  ]);

  return {
    buildId: record.build.buildId,
    asOfDate: record.asOfDate,
    evidencePath,
    reportPath,
    disposition: dispositions.every((disposition) => disposition === "reused")
      ? "reused"
      : "published",
    record,
    report,
  };
}

export async function collectDailyObservation(
  options: CollectDailyObservationOptions,
): Promise<CollectDailyObservationResult> {
  const candidate = await loadActiveObservationCandidate(options.publishedDataRoot);
  const [observationDates, publicObservationDates] = await Promise.all([
    listObservationDates(options.evidenceRoot),
    listObservationDates(options.publicEvidenceRoot),
  ]);
  if (observationDates.join(",") !== publicObservationDates.join(",")) {
    throw new Error("Local and public daily evidence ledgers do not reconcile.");
  }
  const decision = classifyDailyObservationDate(candidate.asOfDate, observationDates);
  const latestObservationDate = observationDates.at(-1) ?? null;
  const attemptedAt = options.attemptedAt ?? new Date().toISOString();

  if (decision !== "collect") {
    const receipt = DailyObservationCollectionReceiptSchema.parse({
      receiptSchemaVersion: "1.0.0",
      attemptedAt,
      disposition: decision,
      candidate,
      ledger: {
        observationDates,
        latestObservationDate,
        observationDayCountBefore: observationDates.length,
        observationDayCountAfter: observationDates.length,
      },
      dailyEvidence: null,
      prospectiveReadiness: null,
      reason:
        decision === "no-op-duplicate-date"
          ? `Observation date ${candidate.asOfDate} already exists in the immutable daily ledger; repeated builds do not add an independent day.`
          : `Observation date ${candidate.asOfDate} is earlier than the latest immutable ledger date ${latestObservationDate}; backfilled observations are blocked.`,
    });

    return {
      receipt,
      receiptPath: await maybeWriteCollectionReceipt(options.receiptPath, receipt),
    };
  }

  const daily = await generateDailyEvidence(options);
  if (daily.asOfDate !== candidate.asOfDate || daily.buildId !== candidate.buildId) {
    throw new Error("Collected daily evidence does not match the inspected active observation.");
  }

  const prospective = await generateProspectiveReadiness({
    evidenceRoot: options.publicEvidenceRoot,
    reportRoot: options.prospectiveReportRoot,
    dashboardProjectionPath: options.prospectiveDashboardProjectionPath,
    publicReportRoot: options.prospectivePublicReportRoot,
  });
  const [updatedDates, updatedPublicDates] = await Promise.all([
    listObservationDates(options.evidenceRoot),
    listObservationDates(options.publicEvidenceRoot),
  ]);

  if (
    updatedDates.join(",") !== updatedPublicDates.join(",") ||
    updatedDates.length !== observationDates.length + 1 ||
    !updatedDates.includes(candidate.asOfDate)
  ) {
    throw new Error(
      "Daily observation collection did not advance the immutable ledger by one date.",
    );
  }

  const receipt = DailyObservationCollectionReceiptSchema.parse({
    receiptSchemaVersion: "1.0.0",
    attemptedAt,
    disposition: "collected",
    candidate,
    ledger: {
      observationDates,
      latestObservationDate,
      observationDayCountBefore: observationDates.length,
      observationDayCountAfter: updatedDates.length,
    },
    dailyEvidence: {
      disposition: daily.disposition,
      evidencePath: daily.evidencePath,
      reproducibilityReportPath: daily.reportPath,
    },
    prospectiveReadiness: {
      disposition: prospective.disposition,
      reportPath: prospective.reportPath,
      uniqueObservationDayCount: prospective.report.progress.uniqueObservationDayCount,
      remainingObservationDayCount: prospective.report.progress.remainingObservationDayCount,
    },
    reason: `Collected immutable observation date ${candidate.asOfDate} and regenerated the prospective-readiness gate.`,
  });

  return {
    receipt,
    receiptPath: await maybeWriteCollectionReceipt(options.receiptPath, receipt),
  };
}
