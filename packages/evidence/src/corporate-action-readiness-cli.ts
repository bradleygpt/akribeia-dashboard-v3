import { resolve } from "node:path";
import { generateCorporateActionReadiness } from "./corporate-action-readiness.js";

const result = await generateCorporateActionReadiness({
  activeHistoricalReadinessPath: resolve(
    "apps/dashboard/public/data/evidence/historical-readiness/active.json",
  ),
  activeUniverseMembershipPath: resolve(
    "apps/dashboard/public/data/evidence/universe-membership/active.json",
  ),
  reportRoot: resolve("data/evidence/corporate-action-readiness"),
  dashboardProjectionPath: resolve(
    "apps/dashboard/app/generated/active-corporate-action-readiness.json",
  ),
  publicReportRoot: resolve("apps/dashboard/public/data/evidence/corporate-action-readiness"),
});

process.stdout.write(
  `${JSON.stringify(
    {
      buildId: result.report.buildId,
      disposition: result.disposition,
      reportPath: result.reportPath,
      status: result.report.status,
      observations: result.report.coverage.thresholdObservationCount,
      possibleShareCountDiscontinuities:
        result.report.coverage.possibleShareCountDiscontinuityCount,
    },
    null,
    2,
  )}\n`,
);
