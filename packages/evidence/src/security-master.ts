import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import {
  DailyEvidenceRecordSchema,
  DataQualityReportSchema,
  PublishedScoresArtifactSchema,
  SecurityMasterSchema,
  type SecurityMaster,
} from "@akribeia/contracts";

export interface GenerateSecurityMasterOptions {
  activeDailyEvidencePath: string;
  activeQualityReportPath: string;
  publishedDataRoot: string;
  securityMasterRoot: string;
  dashboardProjectionPath: string;
  publicSecurityMasterRoot: string;
}

export interface GenerateSecurityMasterResult {
  masterPath: string;
  disposition: "published" | "reused";
  master: SecurityMaster;
}

function sha256(payload: Uint8Array | string): string {
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
      throw new Error(`Immutable security-master conflict at "${path}".`, { cause: error });
    }

    return "reused";
  }
}

async function writeProjection(path: string, payload: Uint8Array): Promise<void> {
  const temporaryPath = join(dirname(path), `.${randomUUID()}-security-master.tmp`);

  await mkdir(dirname(path), { recursive: true });

  try {
    await writeFile(temporaryPath, payload, { flag: "wx" });
    await rename(temporaryPath, path);
  } finally {
    await rm(temporaryPath, { force: true });
  }
}

export async function generateSecurityMaster(
  options: GenerateSecurityMasterOptions,
): Promise<GenerateSecurityMasterResult> {
  const dailyPath = resolve(options.activeDailyEvidencePath);
  const qualityPath = resolve(options.activeQualityReportPath);
  const [dailyPayload, qualityPayload] = await Promise.all([
    readFile(dailyPath),
    readFile(qualityPath),
  ]);
  const daily = DailyEvidenceRecordSchema.parse(parseJson(dailyPath, dailyPayload));
  const quality = DataQualityReportSchema.parse(parseJson(qualityPath, qualityPayload));

  if (
    quality.buildId !== daily.build.buildId ||
    quality.modelVersion !== daily.build.modelVersion ||
    quality.quality.status !== "pass" ||
    quality.quality.rowCount !== daily.source.rowCount
  ) {
    throw new Error("Active quality evidence does not approve the daily evidence identity set.");
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

  const scores = PublishedScoresArtifactSchema.parse(parseJson(scoresPath, scoresPayload));

  if (
    scores.buildId !== daily.build.buildId ||
    scores.modelVersion !== daily.build.modelVersion ||
    scores.source.contentSha256 !== daily.source.contentSha256 ||
    scores.securities.length !== quality.quality.uniqueTickerCount
  ) {
    throw new Error("Score, daily-evidence, quality, and source lineage do not reconcile.");
  }

  const securities = [...scores.securities]
    .sort(({ ticker: left }, { ticker: right }) => left.localeCompare(right))
    .map(({ ticker, name, sector, industry }) => ({
      securityId: `AKR-TICKER:${ticker}`,
      identifierStatus: "provisional-ticker-derived" as const,
      currentTicker: ticker,
      tickerEvidence: [
        {
          ticker,
          observedOn: daily.asOfDate,
          sourceRecordSha256: sha256(
            deterministicJson({
              ticker,
              name,
              sector,
              industry,
              sourceContentSha256: daily.source.contentSha256,
            }),
          ),
        },
      ],
      name,
      sector,
      industry,
      observationStatus: "present-in-snapshot" as const,
      permanentIdentifiers: {
        cik: null,
        cusip: null,
        isin: null,
        lei: null,
      },
    }));
  const securityIds = securities.map(({ securityId: id }) => id);
  const tickers = securities.map(({ currentTicker }) => currentTicker);
  const duplicateSecurityIds = securityIds
    .filter((id, index) => securityIds.indexOf(id) !== index)
    .filter((id, index, values) => values.indexOf(id) === index);
  const duplicateCurrentTickers = tickers
    .filter((ticker, index) => tickers.indexOf(ticker) !== index)
    .filter((ticker, index, values) => values.indexOf(ticker) === index);

  if (duplicateSecurityIds.length > 0 || duplicateCurrentTickers.length > 0) {
    throw new Error("Security-master identifiers or current tickers are not unique.");
  }

  const master = SecurityMasterSchema.parse({
    securityMasterSchemaVersion: "1.0.0",
    buildId: daily.build.buildId,
    recordedAt: daily.recordedAt,
    asOfDate: daily.asOfDate,
    status: "provisional",
    source: daily.source,
    identityPolicy: {
      securityIdMethod: "ticker-prefix-v1",
      identifierBasis: "current-ticker-only",
      permanentIdentifiersAvailable: false,
      tickerHistoryAvailable: false,
      tickerReuseProtection: "unavailable",
    },
    coverage: {
      securityCount: securities.length,
      uniqueSecurityIdCount: new Set(securityIds).size,
      uniqueCurrentTickerCount: new Set(tickers).size,
      provisionalIdentityCount: securities.length,
      permanentIdentifierCount: 0,
      duplicateSecurityIds,
      duplicateCurrentTickers,
    },
    securities,
    limitations: [
      "The source snapshot contains no CIK, CUSIP, ISIN, LEI, exchange listing identifier, or other permanent issuer identifier.",
      "Security IDs are deterministic within this V3 ticker-only scope but must not be treated as permanent across ticker changes or ticker reuse.",
      "One snapshot cannot establish listing dates, delistings, historical aliases, corporate actions, mergers, or survivorship-safe membership.",
      "A future point-in-time master must resolve permanent identifiers before historical validation or production cutover.",
    ],
    notice: daily.notice,
  });
  const payload = deterministicJson(master);
  const relativePath = join("builds", master.buildId, "security-master.json");
  const masterPath = join(resolve(options.securityMasterRoot), relativePath);
  const dispositions = await Promise.all([
    writeImmutable(masterPath, payload),
    writeImmutable(join(resolve(options.publicSecurityMasterRoot), relativePath), payload),
  ]);

  await Promise.all([
    writeProjection(resolve(options.dashboardProjectionPath), payload),
    writeProjection(join(resolve(options.publicSecurityMasterRoot), "active.json"), payload),
  ]);

  return {
    masterPath,
    disposition: dispositions.every((disposition) => disposition === "reused")
      ? "reused"
      : "published",
    master,
  };
}
