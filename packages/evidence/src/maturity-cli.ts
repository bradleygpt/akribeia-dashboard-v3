import { resolve } from "node:path";
import { generateMaturityAssessment } from "./maturity.js";

const activeEvidenceRoot = resolve(
  "apps/dashboard/public/data/evidence/daily/2026-07-28/preview-20260728-pipeline-v4-a34fc842220f",
);
const result = await generateMaturityAssessment({
  activeDailyEvidencePath: resolve("apps/dashboard/public/data/evidence/active.json"),
  activeReproductionReportPath: resolve(activeEvidenceRoot, "reproducibility.json"),
  activeModelCardPath: resolve(
    "apps/dashboard/public/data/evidence/governance/active-model-card.json",
  ),
  activeQualityReportPath: resolve("apps/dashboard/public/data/evidence/quality/active.json"),
  activeSecurityMasterPath: resolve(
    "apps/dashboard/public/data/evidence/security-master/active.json",
  ),
  dailyEvidenceRoot: resolve("data/evidence/daily"),
  maturityRoot: resolve("data/evidence/maturity"),
  dashboardProjectionPath: resolve("apps/dashboard/app/generated/active-maturity.json"),
  publicMaturityRoot: resolve("apps/dashboard/public/data/evidence/maturity"),
});

process.stdout.write(
  `${JSON.stringify(
    {
      buildId: result.assessment.buildId,
      disposition: result.disposition,
      assessmentPath: result.assessmentPath,
      currentLevel: result.assessment.currentLevel,
      releaseEligible: result.assessment.releaseEligible,
      blockerCount: result.assessment.blockers.length,
    },
    null,
    2,
  )}\n`,
);
