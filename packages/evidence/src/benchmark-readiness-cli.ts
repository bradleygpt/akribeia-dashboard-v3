import { resolve } from "node:path";
import { generateBenchmarkReadiness } from "./benchmark-readiness.js";

const result = await generateBenchmarkReadiness({
  activeHistoricalReadinessPath: resolve(
    "apps/dashboard/public/data/evidence/historical-readiness/active.json",
  ),
  activeUniverseMembershipPath: resolve(
    "apps/dashboard/public/data/evidence/universe-membership/active.json",
  ),
  activeSecRegistrantsPath: resolve(
    "apps/dashboard/public/data/evidence/sec-registrants/active.json",
  ),
  reportRoot: resolve("data/evidence/benchmark-readiness"),
  dashboardProjectionPath: resolve("apps/dashboard/app/generated/active-benchmark-readiness.json"),
  publicReportRoot: resolve("apps/dashboard/public/data/evidence/benchmark-readiness"),
});

process.stdout.write(
  `${JSON.stringify(
    {
      buildId: result.report.buildId,
      disposition: result.disposition,
      candidates: result.report.coverage.candidateCount,
      currentSecAssociations: result.report.coverage.currentSecFundAssociationCount,
      totalReturns: result.report.coverage.totalReturnObservationCount,
    },
    null,
    2,
  )}\n`,
);
