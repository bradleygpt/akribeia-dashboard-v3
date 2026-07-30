import { resolve } from "node:path";
import { generateQualityReport } from "./quality.js";

const result = await generateQualityReport({
  activeDailyEvidencePath: resolve("apps/dashboard/public/data/evidence/active.json"),
  activeModelCardPath: resolve(
    "apps/dashboard/public/data/evidence/governance/active-model-card.json",
  ),
  publishedDataRoot: resolve("apps/dashboard/public/data"),
  qualityRoot: resolve("data/evidence/quality"),
  dashboardProjectionPath: resolve("apps/dashboard/app/generated/active-quality-report.json"),
  publicQualityRoot: resolve("apps/dashboard/public/data/evidence/quality"),
});

process.stdout.write(
  `${JSON.stringify(
    {
      buildId: result.report.buildId,
      disposition: result.disposition,
      reportPath: result.reportPath,
      driftStatus: result.report.drift.status,
    },
    null,
    2,
  )}\n`,
);
