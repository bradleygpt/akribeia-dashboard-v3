import { resolve } from "node:path";
import { generateHistoricalReadiness } from "./historical-readiness.js";

const baselineRoot = resolve("data/reference/v2-baseline");
const result = await generateHistoricalReadiness({
  activeDailyEvidencePath: resolve("apps/dashboard/public/data/evidence/active.json"),
  activeSecurityMasterPath: resolve(
    "apps/dashboard/public/data/evidence/security-master/active.json",
  ),
  snapshots: [
    {
      snapshotId: "june-oracle",
      label: "June 2026 matching oracle vintage",
      metadataPath: resolve(baselineRoot, "june-oracle-fixtures/meta.json"),
      floor0Path: resolve(baselineRoot, "june-oracle-fixtures/universe_floor0.json"),
      floor10Path: resolve(baselineRoot, "june-oracle-fixtures/universe_floor10.json"),
    },
    {
      snapshotId: "july-baseline",
      label: "July 2026 V2 baseline vintage",
      metadataPath: resolve(baselineRoot, "fixtures/meta.json"),
      floor0Path: resolve(baselineRoot, "fixtures/universe_floor0.json"),
      floor10Path: resolve(baselineRoot, "fixtures/universe_floor10.json"),
    },
  ],
  historicalReadinessRoot: resolve("data/evidence/historical-readiness"),
  dashboardProjectionPath: resolve("apps/dashboard/app/generated/active-historical-readiness.json"),
  publicHistoricalReadinessRoot: resolve(
    "apps/dashboard/public/data/evidence/historical-readiness",
  ),
});

process.stdout.write(
  `${JSON.stringify(
    {
      buildId: result.report.buildId,
      disposition: result.disposition,
      reportPath: result.reportPath,
      status: result.report.status,
      snapshotCount: result.report.inventory.snapshotCount,
      blockerCount: result.report.blockers.length,
    },
    null,
    2,
  )}\n`,
);
