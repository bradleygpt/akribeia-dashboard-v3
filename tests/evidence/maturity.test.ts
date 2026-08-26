import { readFileSync, readdirSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { MATURITY_LEVELS, MaturityAssessmentSchema } from "@akribeia/contracts";
import { generateMaturityAssessment } from "@akribeia/evidence";

const temporaryDirectories: string[] = [];

// Count immutable daily builds the same way the assessment does: unique build
// ids among ledger records that share the ACTIVE model version.
const dailyRoot = resolve("data/evidence/daily");
const ACTIVE_MODEL_VERSION = (
  JSON.parse(readFileSync(resolve("apps/dashboard/public/data/evidence/active.json"), "utf8")) as {
    build: { modelVersion: string };
  }
).build.modelVersion;
const LEDGER_MODEL_BUILDS = new Set(
  readdirSync(dailyRoot)
    .filter((name) => /^\d{4}-\d{2}-\d{2}$/.test(name))
    .flatMap((date) =>
      readdirSync(resolve(dailyRoot, date)).filter((buildId) => {
        const record = JSON.parse(
          readFileSync(resolve(dailyRoot, date, buildId, "evidence.json"), "utf8"),
        ) as { build: { modelVersion: string } };
        return record.build.modelVersion === ACTIVE_MODEL_VERSION;
      }),
    ),
).size;

const activeDaily = JSON.parse(
  readFileSync(resolve("apps/dashboard/public/data/evidence/active.json"), "utf8"),
) as { asOfDate: string; build: { buildId: string } };

async function temporaryRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "akribeia-maturity-"));
  temporaryDirectories.push(root);
  return root;
}

function options(
  root: string,
  overrides: Partial<Parameters<typeof generateMaturityAssessment>[0]> = {},
) {
  return {
    activeDailyEvidencePath: resolve("apps/dashboard/public/data/evidence/active.json"),
    activeReproductionReportPath: resolve(
      "apps/dashboard/public/data/evidence/daily",
      activeDaily.asOfDate,
      activeDaily.build.buildId,
      "reproducibility.json",
    ),
    activeModelCardPath: resolve(
      "apps/dashboard/public/data/evidence/governance/active-model-card.json",
    ),
    activeQualityReportPath: resolve("apps/dashboard/public/data/evidence/quality/active.json"),
    activeSecurityMasterPath: resolve(
      "apps/dashboard/public/data/evidence/security-master/active.json",
    ),
    dailyEvidenceRoot: resolve("data/evidence/daily"),
    maturityRoot: join(root, "maturity"),
    dashboardProjectionPath: join(root, "generated", "active-maturity.json"),
    publicMaturityRoot: join(root, "public-maturity"),
    ...overrides,
  };
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe("evidence maturity assessment", () => {
  it("labels the active build research-preview and exposes every later blocker", async () => {
    const root = await temporaryRoot();
    const result = await generateMaturityAssessment(options(root));
    const payload = await readFile(result.assessmentPath, "utf8");
    const assessment = MaturityAssessmentSchema.parse(JSON.parse(payload));

    expect(assessment.currentLevel).toBe("research-preview");
    expect(assessment.releaseEligible).toBe(false);
    expect(assessment.levels.map(({ level }) => level)).toEqual(MATURITY_LEVELS);
    expect(assessment.levels.map(({ status }) => status)).toEqual([
      "achieved",
      "current",
      "blocked",
      "blocked",
      "blocked",
    ]);
    expect(assessment.observations).toEqual({
      immutableDailyBuilds: LEDGER_MODEL_BUILDS,
      requiredDailyBuilds: 30,
      qualityStatus: "pass",
      driftStatus: "insufficient-history",
      securityMasterStatus: "provisional",
      permanentIdentifierCount: 0,
      modelValidationPasses: 4,
      modelValidationTotal: 8,
    });
    expect(assessment.blockers).toContain(
      "The security master has no permanent identifiers or ticker-reuse protection.",
    );
    expect(assessment.blockers).toContain("1 of 30 required immutable daily build is available.");
    expect(assessment.cutover).toMatchObject({
      authorized: false,
      status: "not-authorized",
    });
    expect(await readFile(options(root).dashboardProjectionPath, "utf8")).toBe(payload);
  });

  it("reuses the same immutable assessment on retry", async () => {
    const root = await temporaryRoot();

    expect((await generateMaturityAssessment(options(root))).disposition).toBe("published");
    expect((await generateMaturityAssessment(options(root))).disposition).toBe("reused");
  });

  it("rejects a reproduction report that does not receipt the active evidence", async () => {
    const root = await temporaryRoot();
    const report = JSON.parse(await readFile(options(root).activeReproductionReportPath, "utf8"));
    const activeReproductionReportPath = join(root, "wrong-report.json");
    await writeFile(
      activeReproductionReportPath,
      `${JSON.stringify(
        {
          ...report,
          evidenceRecordSha256: "0".repeat(64),
        },
        null,
        2,
      )}\n`,
    );

    await expect(
      generateMaturityAssessment(options(root, { activeReproductionReportPath })),
    ).rejects.toThrow("fail immutable reproduction");
  });

  it("rejects a forged production label without cutover authorization", async () => {
    const root = await temporaryRoot();
    const { assessment } = await generateMaturityAssessment(options(root));
    const forged = {
      ...assessment,
      currentLevel: "production-approved",
      releaseEligible: true,
      levels: assessment.levels.map((level) => ({
        ...level,
        status: level.level === "production-approved" ? "current" : "achieved",
      })),
      blockers: [],
    };
    const result = MaturityAssessmentSchema.safeParse(forged);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.map(({ message }) => message)).toContain(
        "Production approval requires explicit cutover authorization.",
      );
    }
  });

  it("refuses to rewrite an immutable maturity assessment", async () => {
    const root = await temporaryRoot();
    const first = await generateMaturityAssessment(options(root));
    await writeFile(first.assessmentPath, '{"conflict":true}\n');

    await expect(generateMaturityAssessment(options(root))).rejects.toThrow(
      "Immutable maturity-assessment conflict",
    );
  });
});
