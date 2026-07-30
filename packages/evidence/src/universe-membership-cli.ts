import { resolve } from "node:path";
import { generateUniverseMembership } from "./universe-membership.js";

const result = await generateUniverseMembership({
  activeHistoricalReadinessPath: resolve(
    "apps/dashboard/public/data/evidence/historical-readiness/active.json",
  ),
  reportRoot: resolve("data/evidence/universe-membership"),
  dashboardProjectionPath: resolve("apps/dashboard/app/generated/active-universe-membership.json"),
  publicReportRoot: resolve("apps/dashboard/public/data/evidence/universe-membership"),
});

process.stdout.write(
  `${JSON.stringify(
    {
      buildId: result.report.buildId,
      disposition: result.disposition,
      reportPath: result.reportPath,
      status: result.report.status,
      continuing: result.report.comparison.continuingTickerCount,
      entrants: result.report.comparison.entrantCount,
      exits: result.report.comparison.exitCount,
    },
    null,
    2,
  )}\n`,
);
