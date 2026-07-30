import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  FilingAvailabilityReportSchema,
  SecSubmissionSourceReceiptSchema,
} from "@akribeia/contracts";
import { captureSecSubmissionSources, generateFilingAvailability } from "@akribeia/evidence";

const temporaryDirectories: string[] = [];

async function temporaryRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "akribeia-filing-availability-"));
  temporaryDirectories.push(root);
  return root;
}

function generatorOptions(
  root: string,
  overrides: Partial<Parameters<typeof generateFilingAvailability>[0]> = {},
) {
  return {
    activeDailyEvidencePath: resolve("apps/dashboard/public/data/evidence/active.json"),
    activeSecRegistrantsPath: resolve(
      "apps/dashboard/public/data/evidence/sec-registrants/active.json",
    ),
    publishedDataRoot: resolve("apps/dashboard/public/data"),
    sourceReceiptPath: resolve("data/reference/sec/filing-submissions/2026-07-30/receipt.json"),
    reportRoot: join(root, "filing-availability"),
    dashboardProjectionPath: join(root, "generated", "active-filing-availability.json"),
    publicReportRoot: join(root, "public-filing-availability"),
    ...overrides,
  };
}

function submissionHistory(cik = "0000000001") {
  return {
    cik,
    name: "Example Issuer",
    tickers: ["TEST"],
    exchanges: ["Nasdaq"],
    filings: {
      recent: {
        accessionNumber: ["0000000001-26-000001"],
        filingDate: ["2026-07-01"],
        reportDate: ["2026-06-30"],
        acceptanceDateTime: ["2026-07-01T16:30:00.000Z"],
        form: ["10-Q"],
        primaryDocument: ["test-20260630.htm"],
      },
    },
  };
}

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe("SEC submission source capture", () => {
  it("preserves exact API bytes and reuses a checksum-verified receipt", async () => {
    const root = await temporaryRoot();
    const raw = JSON.stringify(submissionHistory());
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(new Response(raw));
    const options = {
      snapshotId: "2026-07-30",
      outputRoot: join(root, "submissions"),
      ciks: ["0000000001"],
      userAgent: "Akribeia-V3 test@example.com",
      retrievedAt: "2026-07-30T07:11:50.237Z",
      fetchImpl,
      requestIntervalMs: 0,
    };
    const first = await captureSecSubmissionSources(options);
    const receipt = SecSubmissionSourceReceiptSchema.parse(
      JSON.parse(await readFile(first.receiptPath, "utf8")),
    );

    expect(first.disposition).toBe("published");
    expect(fetchImpl).toHaveBeenCalledWith(
      "https://data.sec.gov/submissions/CIK0000000001.json",
      expect.any(Object),
    );
    expect(await readFile(join(root, "submissions", "CIK0000000001.json"), "utf8")).toBe(raw);
    expect(receipt.sources[0]).toMatchObject({
      cik: "0000000001",
      recentFilingCount: 1,
    });

    fetchImpl.mockRejectedValue(new Error("network must not be used"));
    expect((await captureSecSubmissionSources(options)).disposition).toBe("reused");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("rejects invalid request identity and a mismatched provider CIK", async () => {
    const root = await temporaryRoot();

    await expect(
      captureSecSubmissionSources({
        snapshotId: "2026-07-30",
        outputRoot: join(root, "short-agent"),
        ciks: ["0000000001"],
        userAgent: "Akribeia",
      }),
    ).rejects.toThrow("SEC_USER_AGENT");

    await expect(
      captureSecSubmissionSources({
        snapshotId: "2026-07-30",
        outputRoot: join(root, "wrong-cik"),
        ciks: ["0000000001"],
        userAgent: "Akribeia-V3 test@example.com",
        fetchImpl: vi
          .fn<typeof fetch>()
          .mockResolvedValue(new Response(JSON.stringify(submissionHistory("0000000002")))),
        requestIntervalMs: 0,
      }),
    ).rejects.toThrow('returned CIK "0000000002"');
  });
});

describe("filing availability evidence", () => {
  it("filters selected filings at the model cutoff and exposes incomplete coverage", async () => {
    const root = await temporaryRoot();
    const result = await generateFilingAvailability(generatorOptions(root));
    const payload = await readFile(result.reportPath, "utf8");
    const report = FilingAvailabilityReportSchema.parse(JSON.parse(payload));
    const micron = report.entries.find(({ ticker }) => ticker === "MU");

    expect(report.status).toBe("partial-retrospective-metadata");
    expect(report.historicalValidationEligible).toBe(false);
    expect(report.decisionCutoffAt).toBe("2026-07-28T17:06:46Z");
    expect(report.selection).toEqual({
      policy: "dashboard-top-scores-and-active-portfolio",
      topScoreTickerCount: 12,
      portfolioTickerCount: 9,
      selectedTickerCount: 12,
      submissionHistoryCount: 11,
      unmatchedTickerCount: 1,
    });
    expect(report.coverage).toEqual({
      selectedTickerCount: 12,
      submissionHistoryCount: 11,
      tickerVerifiedCount: 11,
      periodicFilingAvailableCount: 11,
      currentFilingAvailableCount: 11,
      excludedPostCutoffFilingCount: 12,
      submissionCoverage: 11 / 12,
    });
    expect(report.unmatched).toEqual([{ ticker: "CTRA", reason: "no-exact-sec-registrant-match" }]);
    expect(micron).toMatchObject({
      cik: "0000723125",
      tickerPresentInSubmission: true,
      latestPeriodic: {
        accessionNumber: "0000723125-26-000015",
        form: "10-Q",
        acceptedAt: "2026-06-24T22:59:46.000Z",
        availabilityBasis: "edgar-acceptance-time",
        eligibleAtCutoff: true,
      },
      latestCurrent: {
        accessionNumber: "0000723125-26-000013",
        form: "8-K",
        acceptedAt: "2026-06-24T20:02:01.000Z",
      },
      filingsAfterCutoffExcluded: 2,
    });
    expect(await readFile(generatorOptions(root).dashboardProjectionPath, "utf8")).toBe(payload);
  });

  it("reuses identical immutable evidence and refuses conflicting content", async () => {
    const root = await temporaryRoot();
    const first = await generateFilingAvailability(generatorOptions(root));

    expect(first.disposition).toBe("published");
    expect((await generateFilingAvailability(generatorOptions(root))).disposition).toBe("reused");
    await writeFile(first.reportPath, '{"conflict":true}\n');
    await expect(generateFilingAvailability(generatorOptions(root))).rejects.toThrow(
      "Immutable filing-availability conflict",
    );
  });

  it("fails closed when the source receipt no longer covers the selected CIKs", async () => {
    const root = await temporaryRoot();
    const receipt = JSON.parse(
      await readFile(
        resolve("data/reference/sec/filing-submissions/2026-07-30/receipt.json"),
        "utf8",
      ),
    );
    receipt.sources = receipt.sources.slice(1);
    const sourceReceiptPath = join(root, "receipt.json");
    await writeFile(sourceReceiptPath, `${JSON.stringify(receipt, null, 2)}\n`);

    await expect(
      generateFilingAvailability(generatorOptions(root, { sourceReceiptPath })),
    ).rejects.toThrow("does not cover the selected active-company CIKs");
  });

  it("fails closed when a captured submission no longer matches its digest", async () => {
    const root = await temporaryRoot();
    const receipt = JSON.parse(
      await readFile(
        resolve("data/reference/sec/filing-submissions/2026-07-30/receipt.json"),
        "utf8",
      ),
    );
    receipt.sources[0].sha256 = "0".repeat(64);
    const sourceReceiptPath = join(root, "receipt.json");
    await writeFile(sourceReceiptPath, `${JSON.stringify(receipt, null, 2)}\n`);

    await expect(
      generateFilingAvailability(generatorOptions(root, { sourceReceiptPath })),
    ).rejects.toThrow("fails receipt integrity");
  });

  it("rejects post-cutoff inclusion or a historical-validation claim", async () => {
    const root = await temporaryRoot();
    const { report } = await generateFilingAvailability(generatorOptions(root));

    expect(
      FilingAvailabilityReportSchema.safeParse({
        ...report,
        historicalValidationEligible: true,
      }).success,
    ).toBe(false);
    expect(
      FilingAvailabilityReportSchema.safeParse({
        ...report,
        entries: report.entries.map((entry, index) =>
          index === 0 && entry.latestCurrent !== null
            ? {
                ...entry,
                latestCurrent: {
                  ...entry.latestCurrent,
                  acceptedAt: "2026-07-29T00:00:00.000Z",
                },
              }
            : entry,
        ),
      }).success,
    ).toBe(false);
  });
});
