import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import {
  DailyEvidenceRecordSchema,
  FilingAvailabilityReportSchema,
  SecRegistrantCrosswalkSchema,
  SecSubmissionHistorySchema,
  SecSubmissionSourceReceiptSchema,
  VerticalSliceDashboardSchema,
  type FilingAvailabilityReport,
  type SecSubmissionHistory,
} from "@akribeia/contracts";

export interface GenerateFilingAvailabilityOptions {
  activeDailyEvidencePath: string;
  activeSecRegistrantsPath: string;
  publishedDataRoot: string;
  sourceReceiptPath: string;
  reportRoot: string;
  dashboardProjectionPath: string;
  publicReportRoot: string;
}

export interface GenerateFilingAvailabilityResult {
  reportPath: string;
  disposition: "published" | "reused";
  report: FilingAvailabilityReport;
}

const PERIODIC_FORMS = new Set(["10-K", "10-K/A", "10-Q", "10-Q/A"]);
const CURRENT_FORMS = new Set(["8-K", "8-K/A"]);

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
      throw new Error(`Immutable filing-availability conflict at "${path}".`, {
        cause: error,
      });
    }

    return "reused";
  }
}

async function writeProjection(path: string, payload: Uint8Array): Promise<void> {
  const temporaryPath = join(dirname(path), `.${randomUUID()}-filing-availability.tmp`);
  await mkdir(dirname(path), { recursive: true });

  try {
    await writeFile(temporaryPath, payload, { flag: "wx" });
    await rename(temporaryPath, path);
  } finally {
    await rm(temporaryPath, { force: true });
  }
}

function filingAt(
  history: SecSubmissionHistory,
  index: number,
): {
  accessionNumber: string;
  form: string;
  filingDate: string;
  reportDate: string | null;
  acceptedAt: string;
  primaryDocument: string;
  availabilityBasis: "edgar-acceptance-time";
  eligibleAtCutoff: true;
} {
  const recent = history.filings.recent;

  return {
    accessionNumber: recent.accessionNumber[index]!,
    form: recent.form[index]!,
    filingDate: recent.filingDate[index]!,
    reportDate: recent.reportDate[index] || null,
    acceptedAt: recent.acceptanceDateTime[index]!,
    primaryDocument: recent.primaryDocument[index]!,
    availabilityBasis: "edgar-acceptance-time",
    eligibleAtCutoff: true,
  };
}

function latestEligibleFiling(
  history: SecSubmissionHistory,
  forms: Set<string>,
  cutoffAt: string,
): ReturnType<typeof filingAt> | null {
  const candidates = history.filings.recent.accessionNumber
    .map((_, index) => filingAt(history, index))
    .filter(
      ({ form, acceptedAt }) => forms.has(form) && Date.parse(acceptedAt) <= Date.parse(cutoffAt),
    )
    .sort(({ acceptedAt: left }, { acceptedAt: right }) => Date.parse(right) - Date.parse(left));

  return candidates[0] ?? null;
}

export async function generateFilingAvailability(
  options: GenerateFilingAvailabilityOptions,
): Promise<GenerateFilingAvailabilityResult> {
  const dailyPath = resolve(options.activeDailyEvidencePath);
  const crosswalkPath = resolve(options.activeSecRegistrantsPath);
  const receiptPath = resolve(options.sourceReceiptPath);
  const [dailyPayload, crosswalkPayload, receiptPayload] = await Promise.all([
    readFile(dailyPath),
    readFile(crosswalkPath),
    readFile(receiptPath),
  ]);
  const daily = DailyEvidenceRecordSchema.parse(parseJson(dailyPath, dailyPayload));
  const crosswalk = SecRegistrantCrosswalkSchema.parse(parseJson(crosswalkPath, crosswalkPayload));
  const receipt = SecSubmissionSourceReceiptSchema.parse(parseJson(receiptPath, receiptPayload));

  if (
    crosswalk.buildId !== daily.build.buildId ||
    crosswalk.modelVersion !== daily.build.modelVersion
  ) {
    throw new Error("Filing-availability inputs do not share the active build lineage.");
  }

  const dashboardReceipt = daily.artifacts.find(({ name }) => name === "dashboard");
  if (dashboardReceipt === undefined) {
    throw new Error("Daily evidence does not receipt the active dashboard.");
  }

  const dashboardPath = join(
    resolve(options.publishedDataRoot),
    "builds",
    daily.build.buildId,
    dashboardReceipt.path,
  );
  const dashboardPayload = await readFile(dashboardPath);
  if (
    dashboardPayload.byteLength !== dashboardReceipt.byteSize ||
    sha256(dashboardPayload) !== dashboardReceipt.sha256
  ) {
    throw new Error("Active dashboard fails its daily evidence receipt.");
  }
  const dashboard = VerticalSliceDashboardSchema.parse(parseJson(dashboardPath, dashboardPayload));
  if (
    dashboard.buildId !== daily.build.buildId ||
    dashboard.modelVersion !== daily.build.modelVersion
  ) {
    throw new Error("Active dashboard lineage does not match daily evidence.");
  }

  const topScoreTickers = dashboard.topScores.map(({ ticker }) => ticker);
  const portfolioTickers = dashboard.portfolio.positions.map(({ ticker }) => ticker);
  const selectedTickers = [...new Set([...topScoreTickers, ...portfolioTickers])].sort(
    (left, right) => left.localeCompare(right),
  );
  const registrantsByTicker = new Map(
    crosswalk.matches
      .filter(({ sourceType }) => sourceType === "company-ticker")
      .map((entry) => [entry.ticker, entry]),
  );
  const selectedRegistrants = selectedTickers
    .map((ticker) => registrantsByTicker.get(ticker))
    .filter((entry) => entry !== undefined)
    .sort(({ ticker: left }, { ticker: right }) => left.localeCompare(right));
  const expectedCiks = [...new Set(selectedRegistrants.map(({ cik }) => cik))].sort((left, right) =>
    left.localeCompare(right),
  );
  const receiptCiks = receipt.sources.map(({ cik }) => cik);
  if (expectedCiks.join(",") !== receiptCiks.join(",")) {
    throw new Error("SEC submission receipt does not cover the selected active-company CIKs.");
  }

  const historiesByCik = new Map<string, SecSubmissionHistory>();
  for (const source of receipt.sources) {
    const path = resolve(source.path);
    const payload = await readFile(path);
    if (payload.byteLength !== source.byteSize || sha256(payload) !== source.sha256) {
      throw new Error(`SEC submission source fails receipt integrity at "${path}".`);
    }
    const history = SecSubmissionHistorySchema.parse(parseJson(path, payload));
    if (
      history.cik !== source.cik ||
      history.filings.recent.accessionNumber.length !== source.recentFilingCount
    ) {
      throw new Error(`SEC submission source does not match its receipt at "${path}".`);
    }
    historiesByCik.set(source.cik, history);
  }

  const entries = selectedRegistrants.map((registrant) => {
    const history = historiesByCik.get(registrant.cik)!;
    return {
      ticker: registrant.ticker,
      provisionalSecurityId: registrant.provisionalSecurityId,
      cik: registrant.cik,
      secName: history.name,
      tickerPresentInSubmission: history.tickers.includes(registrant.ticker),
      latestPeriodic: latestEligibleFiling(history, PERIODIC_FORMS, daily.source.observedAt),
      latestCurrent: latestEligibleFiling(history, CURRENT_FORMS, daily.source.observedAt),
      filingsAfterCutoffExcluded: history.filings.recent.acceptanceDateTime.filter(
        (acceptedAt) => Date.parse(acceptedAt) > Date.parse(daily.source.observedAt),
      ).length,
    };
  });
  const unmatched = selectedTickers
    .filter((ticker) => !registrantsByTicker.has(ticker))
    .map((ticker) => ({
      ticker,
      reason: "no-exact-sec-registrant-match" as const,
    }));
  const report = FilingAvailabilityReportSchema.parse({
    reportSchemaVersion: "1.0.0",
    buildId: daily.build.buildId,
    modelVersion: daily.build.modelVersion,
    generatedAt: receipt.retrievedAt,
    decisionCutoffAt: daily.source.observedAt,
    status: "partial-retrospective-metadata",
    historicalValidationEligible: false,
    sourceReceipt: {
      path: relative(resolve("."), receiptPath).replaceAll("\\", "/"),
      sha256: sha256(receiptPayload),
      snapshotId: receipt.snapshotId,
      retrievedAt: receipt.retrievedAt,
    },
    selection: {
      policy: "dashboard-top-scores-and-active-portfolio",
      topScoreTickerCount: topScoreTickers.length,
      portfolioTickerCount: portfolioTickers.length,
      selectedTickerCount: selectedTickers.length,
      submissionHistoryCount: entries.length,
      unmatchedTickerCount: unmatched.length,
    },
    entries,
    unmatched,
    coverage: {
      selectedTickerCount: selectedTickers.length,
      submissionHistoryCount: entries.length,
      tickerVerifiedCount: entries.filter(({ tickerPresentInSubmission }) =>
        Boolean(tickerPresentInSubmission),
      ).length,
      periodicFilingAvailableCount: entries.filter(({ latestPeriodic }) => latestPeriodic !== null)
        .length,
      currentFilingAvailableCount: entries.filter(({ latestCurrent }) => latestCurrent !== null)
        .length,
      excludedPostCutoffFilingCount: entries.reduce(
        (count, { filingsAfterCutoffExcluded }) => count + filingsAfterCutoffExcluded,
        0,
      ),
      submissionCoverage: entries.length / selectedTickers.length,
    },
    limitations: [
      "This is a retrospective metadata capture, not proof that the research pipeline acquired each filing at its acceptance time.",
      "EDGAR acceptance time is used as the earliest supported availability boundary; vendor processing and model ingestion latency are not measured.",
      "Coverage is limited to operating-company CIKs in the visible top-score and active-portfolio set, not the full 643-security universe.",
      "Current SEC submission histories can be revised and do not provide a versioned as-was API snapshot.",
      "Filing availability alone does not resolve survivorship, identity history, corporate actions, benchmark, execution-cost, or walk-forward controls.",
    ],
    notice: daily.notice,
  });
  const payload = deterministicJson(report);
  const relativePath = join("builds", report.buildId, "filing-availability.json");
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
    disposition: dispositions.every((disposition) => disposition === "reused")
      ? "reused"
      : "published",
    report,
  };
}
