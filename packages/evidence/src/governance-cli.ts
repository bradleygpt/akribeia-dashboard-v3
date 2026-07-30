import { resolve } from "node:path";
import { generateModelGovernance } from "./governance.js";

const result = await generateModelGovernance({
  activeDailyEvidencePath: resolve("apps/dashboard/public/data/evidence/active.json"),
  evidenceRoot: resolve("data/evidence"),
  metadataPath: resolve("data/reference/v2-baseline/fixtures/meta.json"),
  governanceRoot: resolve("data/evidence/governance"),
  dashboardProjectionRoot: resolve("apps/dashboard/app/generated"),
  publicGovernanceRoot: resolve("apps/dashboard/public/data/evidence/governance"),
});

process.stdout.write(
  `${JSON.stringify(
    {
      modelVersion: result.modelVersion,
      disposition: result.disposition,
      modelCardPath: result.modelCardPath,
      metricDictionaryPath: result.metricDictionaryPath,
    },
    null,
    2,
  )}\n`,
);
