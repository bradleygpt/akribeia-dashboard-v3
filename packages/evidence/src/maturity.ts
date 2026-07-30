import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import {
  DailyEvidenceRecordSchema,
  DataQualityReportSchema,
  EvidenceReproducibilityReportSchema,
  MATURITY_LEVELS,
  MaturityAssessmentSchema,
  ModelCardSchema,
  SecurityMasterSchema,
  type MaturityAssessment,
  type MaturityLevel,
} from "@akribeia/contracts";

export interface GenerateMaturityAssessmentOptions {
  activeDailyEvidencePath: string;
  activeReproductionReportPath: string;
  activeModelCardPath: string;
  activeQualityReportPath: string;
  activeSecurityMasterPath: string;
  dailyEvidenceRoot: string;
  maturityRoot: string;
  dashboardProjectionPath: string;
  publicMaturityRoot: string;
}

export interface GenerateMaturityAssessmentResult {
  assessmentPath: string;
  disposition: "published" | "reused";
  assessment: MaturityAssessment;
}

type Requirement = MaturityAssessment["levels"][number]["requirements"][number];

function sha256(payload: Uint8Array): string {
  return createHash("sha256").update(payload).digest("hex");
}

function parseJson(path: string, payload: Uint8Array): unknown {
  try {
    return JSON.parse(new TextDecoder().decode(payload)) as unknown;
  } catch (error) {
    throw new Error(`Invalid JSON at "${path}".`, { cause: error });
  }
}

function deterministicJson(value: unknown): Uint8Array {
  return new TextEncoder().encode(`${JSON.stringify(value, null, 2)}\n`);
}

function hasErrorCode(error: unknown, code: string): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === code
  );
}

async function writeImmutable(path: string, payload: Uint8Array): Promise<"published" | "reused"> {
  await mkdir(dirname(path), { recursive: true });

  try {
    await writeFile(path, payload, { flag: "wx" });
    return "published";
  } catch (error) {
    if (!hasErrorCode(error, "EEXIST")) {
      throw error;
    }

    if (!(await readFile(path)).equals(payload)) {
      throw new Error(`Immutable maturity-assessment conflict at "${path}".`, { cause: error });
    }

    return "reused";
  }
}

async function writeProjection(path: string, payload: Uint8Array): Promise<void> {
  const temporaryPath = join(dirname(path), `.${randomUUID()}-maturity.tmp`);

  await mkdir(dirname(path), { recursive: true });

  try {
    await writeFile(temporaryPath, payload, { flag: "wx" });
    await rename(temporaryPath, path);
  } finally {
    await rm(temporaryPath, { force: true });
  }
}

async function evidencePaths(root: string): Promise<string[]> {
  const paths: string[] = [];

  async function visit(directory: string): Promise<void> {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);

      if (entry.isDirectory()) {
        await visit(path);
      } else if (entry.isFile() && entry.name === "evidence.json") {
        paths.push(path);
      }
    }
  }

  await visit(root);
  return paths.sort();
}

function requirement(
  key: string,
  passed: boolean,
  passDetail: string,
  blockedDetail: string,
  evidence: string[],
): Requirement {
  return {
    key,
    status: passed ? "pass" : "blocked",
    detail: passed ? passDetail : blockedDetail,
    evidence,
  };
}

function modelGate(
  card: ReturnType<typeof ModelCardSchema.parse>,
  name: (typeof card.validation)[number]["gate"],
) {
  return card.validation.find(({ gate }) => gate === name)!;
}

export async function generateMaturityAssessment(
  options: GenerateMaturityAssessmentOptions,
): Promise<GenerateMaturityAssessmentResult> {
  const paths = {
    daily: resolve(options.activeDailyEvidencePath),
    report: resolve(options.activeReproductionReportPath),
    card: resolve(options.activeModelCardPath),
    quality: resolve(options.activeQualityReportPath),
    master: resolve(options.activeSecurityMasterPath),
  };
  const [dailyPayload, reportPayload, cardPayload, qualityPayload, masterPayload] =
    await Promise.all([
      readFile(paths.daily),
      readFile(paths.report),
      readFile(paths.card),
      readFile(paths.quality),
      readFile(paths.master),
    ]);
  const daily = DailyEvidenceRecordSchema.parse(parseJson(paths.daily, dailyPayload));
  const report = EvidenceReproducibilityReportSchema.parse(parseJson(paths.report, reportPayload));
  const card = ModelCardSchema.parse(parseJson(paths.card, cardPayload));
  const quality = DataQualityReportSchema.parse(parseJson(paths.quality, qualityPayload));
  const master = SecurityMasterSchema.parse(parseJson(paths.master, masterPayload));
  const lineagePass =
    report.buildId === daily.build.buildId &&
    card.activeBuildId === daily.build.buildId &&
    quality.buildId === daily.build.buildId &&
    master.buildId === daily.build.buildId &&
    card.modelVersion === daily.build.modelVersion &&
    quality.modelVersion === daily.build.modelVersion &&
    master.source.contentSha256 === daily.source.contentSha256;
  const reproductionPass =
    report.result === "verified" && report.evidenceRecordSha256 === sha256(dailyPayload);

  if (!lineagePass || !reproductionPass) {
    throw new Error("Active maturity inputs fail immutable reproduction or lineage checks.");
  }

  const historicalRecords = await Promise.all(
    (await evidencePaths(resolve(options.dailyEvidenceRoot))).map(async (path) =>
      DailyEvidenceRecordSchema.parse(parseJson(path, await readFile(path))),
    ),
  );
  const immutableDailyBuilds = new Set(
    historicalRecords
      .filter(({ build }) => build.modelVersion === daily.build.modelVersion)
      .map(({ build }) => build.buildId),
  ).size;
  const validationRequirements: Requirement[] = [
    requirement(
      "portfolio-parity",
      modelGate(card, "portfolio-parity").status === "pass",
      "Portfolio parity evidence passes.",
      "Portfolio parity is unresolved against the preserved V2 oracle.",
      modelGate(card, "portfolio-parity").evidence,
    ),
    requirement(
      "benchmark",
      daily.benchmark.status === "available" && modelGate(card, "benchmark").status === "pass",
      "Point-in-time benchmark evidence passes.",
      "No point-in-time benchmark observation or validated comparison is available.",
      modelGate(card, "benchmark").evidence,
    ),
    requirement(
      "point-in-time",
      modelGate(card, "point-in-time").status === "pass",
      "Point-in-time data controls pass.",
      "Filing availability, survivorship, corporate actions, and execution timing are not implemented.",
      modelGate(card, "point-in-time").evidence,
    ),
    requirement(
      "permanent-identities",
      master.coverage.permanentIdentifierCount > 0,
      "The security master resolves permanent identities.",
      "The security master has no permanent identifiers or ticker-reuse protection.",
      ["data/evidence/security-master"],
    ),
    requirement(
      "temporal-drift",
      quality.drift.status === "evaluated",
      "Temporal drift is evaluated against comparable history.",
      "Only one comparable model observation exists, so temporal drift is not evaluated.",
      ["data/evidence/quality"],
    ),
  ];
  const modelPasses = card.validation.filter(({ status }) => status === "pass").length;
  const allModelGatesPass = modelPasses === card.validation.length;
  const prospectivePass = modelGate(card, "prospective").status === "pass";
  const releaseRequirements: Requirement[] = [
    requirement(
      "all-model-gates",
      allModelGatesPass,
      "Every model validation gate passes.",
      `${modelPasses} of ${card.validation.length} model validation gates pass.`,
      ["data/evidence/governance"],
    ),
    requirement(
      "prospective-history",
      prospectivePass && immutableDailyBuilds >= 30,
      "At least 30 healthy prospective daily builds are verified.",
      `${immutableDailyBuilds} of 30 required immutable daily ${
        immutableDailyBuilds === 1 ? "build is" : "builds are"
      } available.`,
      ["data/evidence/daily", "MIGRATION.md"],
    ),
    requirement(
      "model-release-flag",
      card.releaseEligible,
      "The versioned model card is release eligible.",
      "The versioned model card explicitly records releaseEligible: false.",
      ["data/evidence/governance"],
    ),
    requirement(
      "security-certification",
      false,
      "The security certification has no unresolved high or critical findings.",
      "A final security certification has not been recorded.",
      ["docs/decisions/RELEASE-GATES.md"],
    ),
  ];
  const productionRequirements: Requirement[] = [
    requirement(
      "recovery-certification",
      false,
      "Final recovery and accessibility certification passes.",
      "Final recovery, accessibility, and clean-environment certification is incomplete.",
      ["ROADMAP.md", "docs/operations/DEPLOYMENT_AND_RECOVERY.md"],
    ),
    requirement(
      "cutover-authorization",
      false,
      "Explicit final V3 production cutover authorization is recorded.",
      "Final V3 production cutover is not authorized.",
      ["docs/CODEX_EXECUTION_STATUS.md"],
    ),
  ];
  const researchRequirements: Requirement[] = [
    requirement(
      "immutable-reproduction",
      reproductionPass,
      "The active daily record has a verified immutable reproduction receipt.",
      "The active daily record does not reproduce from its immutable receipt.",
      ["data/evidence/daily"],
    ),
    requirement(
      "active-lineage",
      lineagePass,
      "Daily, model, quality, and identity evidence share one active build lineage.",
      "Active evidence lineage does not reconcile.",
      ["data/evidence"],
    ),
    requirement(
      "data-quality",
      quality.quality.status === "pass",
      "The active data-quality report passes.",
      "The active data-quality report does not pass.",
      ["data/evidence/quality"],
    ),
  ];
  const developmentRequirements: Requirement[] = [
    requirement(
      "runtime-contracts",
      true,
      "All maturity inputs pass their strict runtime contracts.",
      "One or more maturity inputs fail runtime validation.",
      ["packages/contracts/src/index.ts"],
    ),
  ];
  const researchReady = researchRequirements.every(({ status }) => status === "pass");
  const validationReady =
    researchReady && validationRequirements.every(({ status }) => status === "pass");
  const releaseReady =
    validationReady && releaseRequirements.every(({ status }) => status === "pass");
  const productionReady =
    releaseReady && productionRequirements.every(({ status }) => status === "pass");
  const currentLevel: MaturityLevel = productionReady
    ? "production-approved"
    : releaseReady
      ? "release-candidate"
      : validationReady
        ? "validation-candidate"
        : researchReady
          ? "research-preview"
          : "development";
  const currentIndex = MATURITY_LEVELS.indexOf(currentLevel);
  const requirementsByLevel: Record<MaturityLevel, Requirement[]> = {
    development: developmentRequirements,
    "research-preview": researchRequirements,
    "validation-candidate": validationRequirements,
    "release-candidate": releaseRequirements,
    "production-approved": productionRequirements,
  };
  const levels = MATURITY_LEVELS.map((level, index) => ({
    level,
    status:
      index < currentIndex
        ? ("achieved" as const)
        : index === currentIndex
          ? ("current" as const)
          : ("blocked" as const),
    requirements: requirementsByLevel[level],
  }));
  const blockers = levels
    .filter(({ status }) => status === "blocked")
    .flatMap(({ requirements }) =>
      requirements.filter(({ status }) => status === "blocked").map(({ detail }) => detail),
    );
  const assessment = MaturityAssessmentSchema.parse({
    maturitySchemaVersion: "1.0.0",
    buildId: daily.build.buildId,
    modelVersion: daily.build.modelVersion,
    assessedAt: daily.recordedAt,
    currentLevel,
    releaseEligible: currentIndex >= MATURITY_LEVELS.indexOf("release-candidate"),
    observations: {
      immutableDailyBuilds,
      requiredDailyBuilds: 30,
      qualityStatus: quality.quality.status,
      driftStatus: quality.drift.status,
      securityMasterStatus: master.status,
      permanentIdentifierCount: master.coverage.permanentIdentifierCount,
      modelValidationPasses: modelPasses,
      modelValidationTotal: card.validation.length,
    },
    levels,
    blockers,
    cutover: {
      authorized: false,
      status: "not-authorized",
      reason:
        "Final V3 production cutover requires explicit authorization after every release gate passes.",
    },
    notice: daily.notice,
  });
  const payload = deterministicJson(assessment);
  const relativePath = join("builds", assessment.buildId, "maturity.json");
  const assessmentPath = join(resolve(options.maturityRoot), relativePath);
  const dispositions = await Promise.all([
    writeImmutable(assessmentPath, payload),
    writeImmutable(join(resolve(options.publicMaturityRoot), relativePath), payload),
  ]);

  await Promise.all([
    writeProjection(resolve(options.dashboardProjectionPath), payload),
    writeProjection(join(resolve(options.publicMaturityRoot), "active.json"), payload),
  ]);

  return {
    assessmentPath,
    disposition: dispositions.every((disposition) => disposition === "reused")
      ? "reused"
      : "published",
    assessment,
  };
}
