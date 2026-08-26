import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { generateMaturityAssessment } from "./maturity.js";

// Derive the active evidence root from the active daily record itself so the
// assessment always follows the current build instead of a frozen path.
const activeDaily = JSON.parse(
  await readFile(resolve("apps/dashboard/public/data/evidence/active.json"), "utf8"),
) as { asOfDate: string; build: { buildId: string } };
const activeEvidenceRoot = resolve(
  "apps/dashboard/public/data/evidence/daily",
  activeDaily.asOfDate,
  activeDaily.build.buildId,
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
