import { resolve } from "node:path";
import { generateExitDispositionReadiness } from "./exit-disposition-readiness.js";

const result = await generateExitDispositionReadiness({
  activeUniverseMembershipPath: resolve(
    "apps/dashboard/public/data/evidence/universe-membership/active.json",
  ),
  sourceReceiptPath: resolve("data/reference/sec/2026-07-30/receipt.json"),
  reportRoot: resolve("data/evidence/exit-disposition-readiness"),
  dashboardProjectionPath: resolve(
    "apps/dashboard/app/generated/active-exit-disposition-readiness.json",
  ),
  publicReportRoot: resolve("apps/dashboard/public/data/evidence/exit-disposition-readiness"),
});

process.stdout.write(
  `${JSON.stringify(
    {
      buildId: result.report.buildId,
      disposition: result.disposition,
      observedExits: result.report.coverage.observedExitCount,
      currentAssociations: result.report.coverage.currentSecAssociationCount,
      unmatched: result.report.coverage.unmatchedCurrentAssociationCount,
    },
    null,
    2,
  )}\n`,
);
