import { resolve } from "node:path";
import { generateSecurityMaster } from "./security-master.js";

const result = await generateSecurityMaster({
  activeDailyEvidencePath: resolve("apps/dashboard/public/data/evidence/active.json"),
  activeQualityReportPath: resolve("apps/dashboard/public/data/evidence/quality/active.json"),
  publishedDataRoot: resolve("apps/dashboard/public/data"),
  securityMasterRoot: resolve("data/evidence/security-master"),
  dashboardProjectionPath: resolve("apps/dashboard/app/generated/active-security-master.json"),
  publicSecurityMasterRoot: resolve("apps/dashboard/public/data/evidence/security-master"),
});

process.stdout.write(
  `${JSON.stringify(
    {
      buildId: result.master.buildId,
      disposition: result.disposition,
      masterPath: result.masterPath,
      status: result.master.status,
      securityCount: result.master.coverage.securityCount,
      permanentIdentifierCount: result.master.coverage.permanentIdentifierCount,
    },
    null,
    2,
  )}\n`,
);
