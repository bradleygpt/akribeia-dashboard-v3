import { resolve } from "node:path";
import { generateFilingAvailability } from "./filing-availability.js";

const result = await generateFilingAvailability({
  activeDailyEvidencePath: resolve("apps/dashboard/public/data/evidence/active.json"),
  activeSecRegistrantsPath: resolve(
    "apps/dashboard/public/data/evidence/sec-registrants/active.json",
  ),
  publishedDataRoot: resolve("apps/dashboard/public/data"),
  sourceReceiptPath: resolve("data/reference/sec/filing-submissions/2026-07-30/receipt.json"),
  reportRoot: resolve("data/evidence/filing-availability"),
  dashboardProjectionPath: resolve("apps/dashboard/app/generated/active-filing-availability.json"),
  publicReportRoot: resolve("apps/dashboard/public/data/evidence/filing-availability"),
});

process.stdout.write(
  `${JSON.stringify(
    {
      buildId: result.report.buildId,
      disposition: result.disposition,
      reportPath: result.reportPath,
      status: result.report.status,
      selectedSecurities: result.report.coverage.selectedTickerCount,
      submissionHistories: result.report.coverage.submissionHistoryCount,
      excludedPostCutoffFilings: result.report.coverage.excludedPostCutoffFilingCount,
    },
    null,
    2,
  )}\n`,
);
