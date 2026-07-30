import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import {
  ExitDispositionReadinessSchema,
  SecCompanyTickerAssociationsSchema,
  SecIdentitySourceReceiptSchema,
  UniverseMembershipReadinessSchema,
  type ExitDispositionReadiness,
} from "@akribeia/contracts";

export interface GenerateExitDispositionReadinessOptions {
  activeUniverseMembershipPath: string;
  sourceReceiptPath: string;
  reportRoot: string;
  dashboardProjectionPath: string;
  publicReportRoot: string;
}

export interface GenerateExitDispositionReadinessResult {
  reportPath: string;
  disposition: "published" | "reused";
  report: ExitDispositionReadiness;
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
      throw new Error(`Immutable exit-disposition conflict at "${path}".`, { cause: error });
    }
    return "reused";
  }
}
async function writeProjection(path: string, payload: Uint8Array): Promise<void> {
  const temporaryPath = join(dirname(path), `.${randomUUID()}-exit-disposition.tmp`);
  await mkdir(dirname(path), { recursive: true });
  try {
    await writeFile(temporaryPath, payload, { flag: "wx" });
    await rename(temporaryPath, path);
  } finally {
    await rm(temporaryPath, { force: true });
  }
}

export async function generateExitDispositionReadiness(
  options: GenerateExitDispositionReadinessOptions,
): Promise<GenerateExitDispositionReadinessResult> {
  const membershipPath = resolve(options.activeUniverseMembershipPath);
  const receiptPath = resolve(options.sourceReceiptPath);
  const [membershipPayload, receiptPayload] = await Promise.all([
    readFile(membershipPath),
    readFile(receiptPath),
  ]);
  const membership = UniverseMembershipReadinessSchema.parse(
    parseJson(membershipPath, membershipPayload),
  );
  const receipt = SecIdentitySourceReceiptSchema.parse(parseJson(receiptPath, receiptPayload));
  const companyReceipt = receipt.sources.find(({ kind }) => kind === "company-tickers");
  if (companyReceipt === undefined) {
    throw new Error("SEC identity receipt has no company-ticker source.");
  }
  const sourcePath = resolve(companyReceipt.path);
  const sourcePayload = await readFile(sourcePath);
  if (
    sourcePayload.byteLength !== companyReceipt.byteSize ||
    sha256(sourcePayload) !== companyReceipt.sha256
  ) {
    throw new Error("SEC company-ticker source fails its receipt.");
  }
  const companies = SecCompanyTickerAssociationsSchema.parse(parseJson(sourcePath, sourcePayload));
  if (Object.keys(companies).length !== companyReceipt.recordCount) {
    throw new Error("SEC company-ticker source record count fails its receipt.");
  }
  const byTicker = new Map<string, Array<{ cik_str: number; ticker: string; title: string }>>();
  for (const company of Object.values(companies)) {
    const ticker = company.ticker.toUpperCase();
    byTicker.set(ticker, [...(byTicker.get(ticker) ?? []), company]);
  }
  const entries = membership.exits.map((exit) => {
    const candidates = byTicker.get(exit.ticker) ?? [];
    if (candidates.length > 1) {
      throw new Error(`Current SEC association for "${exit.ticker}" is ambiguous.`);
    }
    const match = candidates[0];
    return {
      ticker: exit.ticker,
      snapshotName: exit.name,
      earlierMarketCapB: exit.earlierMarketCapB,
      currentAssociationStatus: match === undefined ? ("unmatched" as const) : ("present" as const),
      currentSecAssociation:
        match === undefined
          ? null
          : { cik: String(match.cik_str).padStart(10, "0"), title: match.title },
      historicalDispositionStatus: "unverified" as const,
    };
  });
  const presentCount = entries.filter(
    ({ currentAssociationStatus }) => currentAssociationStatus === "present",
  ).length;
  const report = ExitDispositionReadinessSchema.parse({
    reportSchemaVersion: "1.0.0",
    buildId: membership.buildId,
    modelVersion: membership.modelVersion,
    assessedAt: membership.assessedAt,
    generatedAt: receipt.retrievedAt,
    status: "partial-current-association-not-disposition-history",
    historicalDelistingControlled: false,
    historicalTickerHistoryEligible: false,
    sourceReceipt: {
      snapshotId: receipt.snapshotId,
      retrievedAt: receipt.retrievedAt,
      lastModifiedAt: companyReceipt.lastModifiedAt,
      sha256: companyReceipt.sha256,
      byteSize: companyReceipt.byteSize,
      recordCount: companyReceipt.recordCount,
    },
    coverage: {
      observedExitCount: entries.length,
      currentSecAssociationCount: presentCount,
      unmatchedCurrentAssociationCount: entries.length - presentCount,
      historicalDispositionResolvedCount: 0,
    },
    entries,
    controls: [
      {
        key: "current-sec-association",
        status: "pass",
        detail: `${presentCount} of ${entries.length} observed exits have an exact current SEC ticker association.`,
      },
      {
        key: "permanent-listing-identity",
        status: "blocked",
        detail: "CIK identifies a registrant, not a permanent exchange listing or security.",
      },
      {
        key: "ticker-effective-intervals",
        status: "blocked",
        detail: "No ticker start, end, alias, reuse, or effective-date history is available.",
      },
      {
        key: "delisting-events",
        status: "blocked",
        detail:
          "No exchange delisting notice, effective date, reason, or terminal value is available.",
      },
      {
        key: "merger-successor-terms",
        status: "blocked",
        detail:
          "No cash-out, conversion ratio, successor identity, or merger-effective terms exist.",
      },
    ],
    limitations: [
      "A current SEC association does not prove that a security was continuously listed or investable.",
      "An unmatched current association does not prove delisting, acquisition, or ticker change.",
      "The SEC source is a current association snapshot, not an as-was historical series.",
      "CIK continuity cannot substitute for permanent listing identity or historical ticker intervals.",
      "All 13 observed exit dispositions remain historically unverified.",
    ],
    notice: membership.notice,
  });
  const payload = deterministicJson(report);
  const relativePath = join("builds", report.buildId, "exit-disposition-readiness.json");
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
