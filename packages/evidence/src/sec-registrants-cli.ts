import { resolve } from "node:path";
import { generateSecRegistrantCrosswalk } from "./sec-registrants.js";

const result = await generateSecRegistrantCrosswalk({
  activeDailyEvidencePath: resolve("apps/dashboard/public/data/evidence/active.json"),
  activeSecurityMasterPath: resolve(
    "apps/dashboard/public/data/evidence/security-master/active.json",
  ),
  sourceReceiptPath: resolve("data/reference/sec/2026-07-30/receipt.json"),
  crosswalkRoot: resolve("data/evidence/sec-registrants"),
  dashboardProjectionPath: resolve("apps/dashboard/app/generated/active-sec-registrants.json"),
  publicCrosswalkRoot: resolve("apps/dashboard/public/data/evidence/sec-registrants"),
});

process.stdout.write(
  `${JSON.stringify(
    {
      buildId: result.crosswalk.buildId,
      disposition: result.disposition,
      crosswalkPath: result.crosswalkPath,
      status: result.crosswalk.status,
      matchedSecurities: result.crosswalk.coverage.matchedSecurityCount,
      uniqueCiks: result.crosswalk.coverage.uniqueCikCount,
    },
    null,
    2,
  )}\n`,
);
