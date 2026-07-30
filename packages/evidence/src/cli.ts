import { resolve } from "node:path";
import { generateDailyEvidence } from "./index.js";

const result = await generateDailyEvidence({
  publishedDataRoot: resolve("apps/dashboard/public/data"),
  evidenceRoot: resolve("data/evidence"),
  dashboardProjectionPath: resolve("apps/dashboard/app/generated/active-daily-evidence.json"),
  publicEvidenceRoot: resolve("apps/dashboard/public/data/evidence"),
});

process.stdout.write(
  `${JSON.stringify(
    {
      buildId: result.buildId,
      asOfDate: result.asOfDate,
      disposition: result.disposition,
      evidencePath: result.evidencePath,
      reportPath: result.reportPath,
    },
    null,
    2,
  )}\n`,
);
