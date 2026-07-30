import { resolve } from "node:path";
import { generateProspectiveReadiness } from "./prospective-readiness.js";

const result = await generateProspectiveReadiness({
  evidenceRoot: resolve("apps/dashboard/public/data/evidence"),
  reportRoot: resolve("data/evidence/prospective-readiness"),
  dashboardProjectionPath: resolve(
    "apps/dashboard/app/generated/active-prospective-readiness.json",
  ),
  publicReportRoot: resolve("apps/dashboard/public/data/evidence/prospective-readiness"),
});

process.stdout.write(
  `${JSON.stringify(
    {
      buildId: result.report.buildId,
      disposition: result.disposition,
      reportPath: result.reportPath,
      status: result.report.status,
      observationDays: result.report.progress.uniqueObservationDayCount,
      requiredObservationDays: result.report.requirements.immutableDailyObservationDays,
      executablePortfolioRecords: result.report.progress.executablePortfolioRecordCount,
      costedReturns: result.report.progress.costedReturnObservationCount,
      benchmarkComparisons: result.report.progress.approvedBenchmarkComparisonCount,
      monthlyReports: result.report.progress.monthlyValidationReportCount,
    },
    null,
    2,
  )}\n`,
);
