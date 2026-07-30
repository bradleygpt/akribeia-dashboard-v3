import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import {
  DailyEvidenceRecordSchema,
  SecCompanyTickerAssociationsSchema,
  SecIdentitySourceReceiptSchema,
  SecMutualFundTickerAssociationsSchema,
  SecRegistrantCrosswalkSchema,
  SecurityMasterSchema,
  type SecRegistrantCrosswalk,
} from "@akribeia/contracts";

export interface GenerateSecRegistrantCrosswalkOptions {
  activeDailyEvidencePath: string;
  activeSecurityMasterPath: string;
  sourceReceiptPath: string;
  crosswalkRoot: string;
  dashboardProjectionPath: string;
  publicCrosswalkRoot: string;
}

export interface GenerateSecRegistrantCrosswalkResult {
  crosswalkPath: string;
  disposition: "published" | "reused";
  crosswalk: SecRegistrantCrosswalk;
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
      throw new Error(`Immutable SEC registrant conflict at "${path}".`, { cause: error });
    }

    return "reused";
  }
}

async function writeProjection(path: string, payload: Uint8Array): Promise<void> {
  const temporaryPath = join(dirname(path), `.${randomUUID()}-sec-registrants.tmp`);

  await mkdir(dirname(path), { recursive: true });

  try {
    await writeFile(temporaryPath, payload, { flag: "wx" });
    await rename(temporaryPath, path);
  } finally {
    await rm(temporaryPath, { force: true });
  }
}

function addMatch<T>(map: Map<string, T[]>, ticker: string, match: T): void {
  const matches = map.get(ticker) ?? [];
  matches.push(match);
  map.set(ticker, matches);
}

export async function generateSecRegistrantCrosswalk(
  options: GenerateSecRegistrantCrosswalkOptions,
): Promise<GenerateSecRegistrantCrosswalkResult> {
  const dailyPath = resolve(options.activeDailyEvidencePath);
  const masterPath = resolve(options.activeSecurityMasterPath);
  const receiptPath = resolve(options.sourceReceiptPath);
  const [dailyPayload, masterPayload, receiptPayload] = await Promise.all([
    readFile(dailyPath),
    readFile(masterPath),
    readFile(receiptPath),
  ]);
  const daily = DailyEvidenceRecordSchema.parse(parseJson(dailyPath, dailyPayload));
  const master = SecurityMasterSchema.parse(parseJson(masterPath, masterPayload));
  const receipt = SecIdentitySourceReceiptSchema.parse(parseJson(receiptPath, receiptPayload));

  if (
    master.buildId !== daily.build.buildId ||
    master.source.contentSha256 !== daily.source.contentSha256
  ) {
    throw new Error("SEC registrant inputs do not share the active build lineage.");
  }

  const sourcePayloads = await Promise.all(
    receipt.sources.map(async (source) => {
      const path = resolve(source.path);
      const payload = await readFile(path);

      if (payload.byteLength !== source.byteSize || sha256(payload) !== source.sha256) {
        throw new Error(`SEC registrant source fails receipt integrity at "${path}".`);
      }

      return { source, path, payload };
    }),
  );
  const companySource = sourcePayloads.find(({ source }) => source.kind === "company-tickers")!;
  const fundSource = sourcePayloads.find(({ source }) => source.kind === "mutual-fund-tickers")!;
  const companies = SecCompanyTickerAssociationsSchema.parse(
    parseJson(companySource.path, companySource.payload),
  );
  const funds = SecMutualFundTickerAssociationsSchema.parse(
    parseJson(fundSource.path, fundSource.payload),
  );

  if (
    Object.keys(companies).length !== companySource.source.recordCount ||
    funds.data.length !== fundSource.source.recordCount
  ) {
    throw new Error("SEC registrant source record counts do not match the immutable receipt.");
  }

  const companiesByTicker = new Map<
    string,
    Array<{ cik_str: number; ticker: string; title: string }>
  >();
  for (const company of Object.values(companies)) {
    addMatch(companiesByTicker, company.ticker.toUpperCase(), company);
  }

  const fundsByTicker = new Map<string, Array<[number, string, string, string]>>();
  for (const fund of funds.data) {
    if (fund[3].length > 0) {
      addMatch(fundsByTicker, fund[3].toUpperCase(), fund);
    }
  }

  const matches: Array<
    | {
        ticker: string;
        provisionalSecurityId: string;
        sourceType: "company-ticker";
        matchMethod: "exact-current-ticker";
        cik: string;
        secTitle: string;
        seriesId: null;
        classId: null;
        identityScope: "registrant-only";
      }
    | {
        ticker: string;
        provisionalSecurityId: string;
        sourceType: "mutual-fund-class";
        matchMethod: "exact-current-ticker";
        cik: string;
        secTitle: null;
        seriesId: string;
        classId: string;
        identityScope: "registered-fund-class";
      }
  > = [];
  const unmatched: Array<{
    ticker: string;
    provisionalSecurityId: string;
    expectedSource: "company-tickers" | "mutual-fund-tickers";
    reason: "no-exact-current-ticker-match";
  }> = [];

  for (const security of master.securities) {
    if (security.sector === "ETF") {
      const candidates = fundsByTicker.get(security.currentTicker) ?? [];
      if (candidates.length > 1) {
        throw new Error(
          `SEC mutual-fund match for "${security.currentTicker}" is ambiguous with ${candidates.length} candidates.`,
        );
      }
      if (candidates.length === 0) {
        unmatched.push({
          ticker: security.currentTicker,
          provisionalSecurityId: security.securityId,
          expectedSource: "mutual-fund-tickers",
          reason: "no-exact-current-ticker-match",
        });
      } else {
        const [cik, seriesId, classId] = candidates[0]!;
        matches.push({
          ticker: security.currentTicker,
          provisionalSecurityId: security.securityId,
          sourceType: "mutual-fund-class",
          matchMethod: "exact-current-ticker",
          cik: String(cik).padStart(10, "0"),
          secTitle: null,
          seriesId,
          classId,
          identityScope: "registered-fund-class",
        });
      }
      continue;
    }

    const candidates = companiesByTicker.get(security.currentTicker) ?? [];
    if (candidates.length > 1) {
      throw new Error(
        `SEC company match for "${security.currentTicker}" is ambiguous with ${candidates.length} candidates.`,
      );
    }
    if (candidates.length === 0) {
      unmatched.push({
        ticker: security.currentTicker,
        provisionalSecurityId: security.securityId,
        expectedSource: "company-tickers",
        reason: "no-exact-current-ticker-match",
      });
    } else {
      const company = candidates[0]!;
      matches.push({
        ticker: security.currentTicker,
        provisionalSecurityId: security.securityId,
        sourceType: "company-ticker",
        matchMethod: "exact-current-ticker",
        cik: String(company.cik_str).padStart(10, "0"),
        secTitle: company.title,
        seriesId: null,
        classId: null,
        identityScope: "registrant-only",
      });
    }
  }
  matches.sort(({ ticker: left }, { ticker: right }) => left.localeCompare(right));
  unmatched.sort(({ ticker: left }, { ticker: right }) => left.localeCompare(right));
  const companyMatches = matches.filter(({ sourceType }) => sourceType === "company-ticker");
  const fundMatches = matches.filter(({ sourceType }) => sourceType === "mutual-fund-class");
  const operatingCompanyCount = master.securities.filter(({ sector }) => sector !== "ETF").length;
  const registeredFundCount = master.securities.length - operatingCompanyCount;
  const crosswalk = SecRegistrantCrosswalkSchema.parse({
    crosswalkSchemaVersion: "1.0.0",
    buildId: daily.build.buildId,
    modelVersion: daily.build.modelVersion,
    generatedAt: receipt.retrievedAt,
    status: "partial-current-snapshot",
    historicalIdentityEligible: false,
    sourceReceipt: {
      path: relative(resolve("."), receiptPath).replaceAll("\\", "/"),
      sha256: sha256(receiptPayload),
      snapshotId: receipt.snapshotId,
      retrievedAt: receipt.retrievedAt,
    },
    coverage: {
      activeSecurityCount: master.coverage.securityCount,
      matchedSecurityCount: matches.length,
      unmatchedSecurityCount: unmatched.length,
      ambiguousSecurityCount: 0,
      operatingCompanyCount,
      companyCikMatchCount: companyMatches.length,
      registeredFundCount,
      fundClassMatchCount: fundMatches.length,
      uniqueCikCount: new Set(matches.map(({ cik }) => cik)).size,
      registrantCoverage: matches.length / master.securities.length,
      companyCikCoverage: companyMatches.length / operatingCompanyCount,
      fundClassCoverage: fundMatches.length / registeredFundCount,
      operatingCompanyListingIdentityCoverage: 0,
    },
    matches,
    unmatched,
    limitations: [
      "CIK identifies an SEC filer or registrant and is not a permanent exchange-listing or security identifier.",
      "The SEC periodically updates ticker associations and explicitly does not guarantee their accuracy or scope.",
      "This is one current association snapshot and does not establish historical ticker, listing, merger, or delisting intervals.",
      "Operating-company matches have no exchange-listing identifier; their Akribeia security IDs remain provisional.",
      "Registered-fund series and class IDs identify fund structures but do not provide point-in-time trading or corporate-action history.",
    ],
    notice: daily.notice,
  });
  const payload = deterministicJson(crosswalk);
  const relativePath = join("builds", crosswalk.buildId, "sec-registrants.json");
  const crosswalkPath = join(resolve(options.crosswalkRoot), relativePath);
  const dispositions = await Promise.all([
    writeImmutable(crosswalkPath, payload),
    writeImmutable(join(resolve(options.publicCrosswalkRoot), relativePath), payload),
  ]);

  await Promise.all([
    writeProjection(resolve(options.dashboardProjectionPath), payload),
    writeProjection(join(resolve(options.publicCrosswalkRoot), "active.json"), payload),
  ]);

  return {
    crosswalkPath,
    disposition: dispositions.every((disposition) => disposition === "reused")
      ? "reused"
      : "published",
    crosswalk,
  };
}
