import { resolve } from "node:path";
import { generateWalkForwardReadiness } from "./walk-forward-readiness.js";

const result = await generateWalkForwardReadiness({
  evidenceRoot: resolve("apps/dashboard/public/data/evidence"),
  reportRoot: resolve("data/evidence/walk-forward-readiness"),
  dashboardProjectionPath: resolve(
    "apps/dashboard/app/generated/active-walk-forward-readiness.json",
  ),
  publicReportRoot: resolve("apps/dashboard/public/data/evidence/walk-forward-readiness"),
});

process.stdout.write(
  `${JSON.stringify(
    {
      buildId: result.report.buildId,
      disposition: result.disposition,
      snapshots: result.report.calendar.snapshotCount,
      eligibleFolds: result.report.calendar.eligibleFoldCount,
      comparisons: result.report.calendar.performanceComparisonCount,
    },
    null,
    2,
  )}\n`,
);
