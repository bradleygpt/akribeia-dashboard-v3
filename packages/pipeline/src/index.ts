import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import {
  BuildManifestSchema,
  PublishedPortfolioArtifactSchema,
  PublishedScoresArtifactSchema,
  SCORING_PILLARS,
  V2BaselineMetadataSchema,
  V2BaselineUniverseSnapshotSchema,
  VerticalSliceDashboardSchema,
  type ArtifactFile,
  type FactorCoverage,
  type PublishedScoredSecurity,
  type VerticalSliceBuildRecipe,
  type VerticalSliceDashboard,
} from "@akribeia/contracts";
import { constructRankedCappedPortfolio, type RankedPortfolioPosition } from "@akribeia/portfolio";
import {
  activateBuild,
  evaluateManifest,
  publishBuildIdempotently,
  rollbackActiveBuild,
  type BuildActivationResult,
  type BuildRollbackResult,
} from "@akribeia/publisher";
import {
  calculateCoverageAwareComposite,
  type PillarValues,
  type PillarWeights,
} from "@akribeia/scoring";

const SCORE_WEIGHTS: PillarWeights = {
  valuation: 0.2,
  growth: 0.2,
  profitability: 0.2,
  momentum: 0.2,
  revisions: 0.2,
};
const MAX_POSITION_WEIGHT = 0.12;
const MAX_SECTOR_WEIGHT = 0.3;
const NOTICE =
  "Research preview only. Scores and model weights are evidence artifacts, not investment advice or a promise of future performance.";
const PILLAR_SOURCE_FIELDS = {
  valuation: "pillars.Valuation",
  growth: "pillars.Growth",
  profitability: "pillars.Profitability",
  momentum: "pillars.Momentum",
  revisions: "pillars.EPS Revisions",
} as const;

type ScoredSecurity = PublishedScoredSecurity;

export interface VerticalSliceRunResult {
  buildId: string;
  buildDirectory: string;
  manifestPath: string;
  pointerPath: string;
  projectionPath: string;
  publicationDisposition: "published" | "reused";
  dashboard: VerticalSliceDashboard;
}

export interface VerticalSliceRollbackResult {
  pointer: BuildRollbackResult;
  projectionPath: string;
  dashboard: VerticalSliceDashboard;
}

function sha256(payload: Uint8Array): string {
  return createHash("sha256").update(payload).digest("hex");
}

function hasErrorCode(error: unknown, code: string): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === code
  );
}

function deterministicJson(value: unknown): Uint8Array {
  return new TextEncoder().encode(`${JSON.stringify(value, null, 2)}\n`);
}

function parseJson(path: string, payload: string): unknown {
  try {
    return JSON.parse(payload) as unknown;
  } catch (error) {
    throw new Error(`Invalid JSON at "${path}".`, { cause: error });
  }
}

function sourceAgeSeconds(observedAt: string, evaluatedAt: string): number {
  const observed = Date.parse(observedAt);
  const evaluated = Date.parse(evaluatedAt);

  if (!Number.isFinite(observed) || !Number.isFinite(evaluated) || evaluated < observed) {
    throw new Error("The source observation and evaluation timestamps are inconsistent.");
  }

  return Math.floor((evaluated - observed) / 1000);
}

function publishedSecurity(security: ScoredSecurity & { score: number }) {
  return {
    ticker: security.ticker,
    name: security.name,
    sector: security.sector,
    industry: security.industry,
    score: security.score,
    coverage: security.coverage,
    missingPillars: security.missingPillars,
    price: security.price,
    marketCapB: security.marketCapB,
  };
}

function calculateFactorCoverage(securities: ScoredSecurity[]): FactorCoverage[] {
  return SCORING_PILLARS.map((pillar) => {
    const availableSecurities = securities.filter(
      ({ contributions }) =>
        contributions.find((contribution) => contribution.pillar === pillar)?.status ===
        "available",
    ).length;

    return {
      pillar,
      sourceField: PILLAR_SOURCE_FIELDS[pillar],
      weight: SCORE_WEIGHTS[pillar],
      availableSecurities,
      missingSecurities: securities.length - availableSecurities,
      coverage: availableSecurities / securities.length,
    };
  });
}

function artifactMetadata(
  path: string,
  payload: Uint8Array,
  rowCount: number,
  recipe: VerticalSliceBuildRecipe,
  sourceHash: string,
  ageSeconds: number,
): ArtifactFile {
  return {
    path,
    sha256: sha256(payload),
    byteSize: payload.byteLength,
    rowCount,
    status: "current",
    freshness: {
      status: "current",
      observedAt: recipe.observedAt,
      retrievedAt: recipe.observedAt,
      evaluatedAt: recipe.evaluatedAt,
      ageSeconds,
      maxAgeSeconds: recipe.maxAgeSeconds,
      reason: null,
    },
    provenance: [
      {
        sourceId: "v2-baseline-universe-floor10",
        sourceType: "first-party",
        retrievedAt: recipe.observedAt,
        sourceVersion: recipe.sourceCommit,
        sourceUri: recipe.sourcePath.replaceAll("\\", "/"),
        contentSha256: sourceHash,
      },
    ],
  };
}

async function projectActiveDashboard(
  projectionPath: string,
  dashboardPayload: Uint8Array,
): Promise<void> {
  const absolutePath = resolve(projectionPath);
  const temporaryPath = join(
    dirname(absolutePath),
    `.${randomUUID()}-${absolutePath.split(/[\\/]/).at(-1)}.tmp`,
  );

  await mkdir(dirname(absolutePath), { recursive: true });

  try {
    await writeFile(temporaryPath, dashboardPayload, { flag: "wx" });
    await rename(temporaryPath, absolutePath);
  } finally {
    await rm(temporaryPath, { force: true });
  }
}

async function readOptionalProjection(projectionPath: string): Promise<Uint8Array | null> {
  try {
    return await readFile(resolve(projectionPath));
  } catch (error) {
    if (hasErrorCode(error, "ENOENT")) {
      return null;
    }

    throw error;
  }
}

async function restoreProjection(
  projectionPath: string,
  previousProjection: Uint8Array | null,
): Promise<void> {
  if (previousProjection === null) {
    await rm(resolve(projectionPath), { force: true });
    return;
  }

  await projectActiveDashboard(projectionPath, previousProjection);
}

async function activateProjectedBuild(
  rootDirectory: string,
  buildId: string,
  projectionPath: string,
  dashboardPayload: Uint8Array,
): Promise<BuildActivationResult> {
  const previousProjection = await readOptionalProjection(projectionPath);

  await projectActiveDashboard(projectionPath, dashboardPayload);

  try {
    return await activateBuild({
      rootDirectory,
      buildId,
    });
  } catch (activationError) {
    try {
      await restoreProjection(projectionPath, previousProjection);
    } catch (restorationError) {
      throw new AggregateError(
        [activationError, restorationError],
        "Build activation failed and the dashboard projection could not be restored.",
        { cause: restorationError },
      );
    }

    throw activationError;
  }
}

function mapPortfolioPosition(
  position: RankedPortfolioPosition,
  eligibleByTicker: ReadonlyMap<string, ScoredSecurity & { score: number }>,
) {
  const security = eligibleByTicker.get(position.id);

  if (security === undefined) {
    throw new Error(`Portfolio position "${position.id}" is absent from scored securities.`);
  }

  return {
    ...publishedSecurity(security),
    weight: position.weight,
    weightUnits: position.weightUnits,
    maxWeight: position.maxWeight,
    maxWeightUnits: position.maxWeightUnits,
  };
}

export async function runVerticalSlice(
  recipe: VerticalSliceBuildRecipe,
): Promise<VerticalSliceRunResult> {
  const sourcePath = resolve(recipe.sourcePath);
  const metadataPath = resolve(recipe.metadataPath);
  const outputRoot = resolve(recipe.outputRoot);
  const projectionPath = resolve(recipe.projectionPath);
  const [sourcePayload, metadataPayload] = await Promise.all([
    readFile(sourcePath),
    readFile(metadataPath, "utf8"),
  ]);
  const snapshot = V2BaselineUniverseSnapshotSchema.parse(
    parseJson(sourcePath, sourcePayload.toString("utf8")),
  );
  const sourceMetadata = V2BaselineMetadataSchema.parse(parseJson(metadataPath, metadataPayload));

  if (sourceMetadata.source_commit !== recipe.sourceCommit) {
    throw new Error(
      `Recipe source commit "${recipe.sourceCommit}" does not match metadata commit "${sourceMetadata.source_commit}".`,
    );
  }

  const ageSeconds = sourceAgeSeconds(recipe.observedAt, recipe.evaluatedAt);

  if (ageSeconds > recipe.maxAgeSeconds) {
    throw new Error(
      `Source snapshot is stale by policy: ${ageSeconds} seconds exceeds ${recipe.maxAgeSeconds}.`,
    );
  }

  const sourceHash = sha256(sourcePayload);
  const scored: ScoredSecurity[] = snapshot.rows.map((row) => {
    const values: PillarValues = {
      valuation: row.pillars.Valuation,
      growth: row.pillars.Growth,
      profitability: row.pillars.Profitability,
      momentum: row.pillars.Momentum,
      revisions: row.pillars["EPS Revisions"],
    };
    const result = calculateCoverageAwareComposite(values, SCORE_WEIGHTS, {
      minimumCoverage: 1,
      missingDataPolicy: "require-complete",
    });

    return {
      ticker: row.ticker,
      name: row.name,
      sector: row.sector,
      industry: row.industry,
      ...result,
      price: row.price,
      marketCapB: row.marketCapB,
    };
  });
  const eligible = scored
    .filter(
      (security): security is ScoredSecurity & { score: number } =>
        security.eligible && security.score !== null,
    )
    .sort((left, right) => right.score - left.score || left.ticker.localeCompare(right.ticker));
  const portfolio = constructRankedCappedPortfolio(
    eligible.map((security) => ({
      id: security.ticker,
      sector: security.sector,
      score: security.score,
    })),
    {
      maxPositionWeight: MAX_POSITION_WEIGHT,
      maxSectorWeight: MAX_SECTOR_WEIGHT,
    },
  );

  if (portfolio.status === "infeasible") {
    throw new Error(`Portfolio construction is infeasible: ${portfolio.reasons.join(" ")}`);
  }

  const eligibleByTicker = new Map(
    eligible.map((security) => [security.ticker, security] as const),
  );
  const factorCoverage = calculateFactorCoverage(scored);
  const scoring = {
    method: "weighted-five-pillar" as const,
    weights: SCORE_WEIGHTS,
    missingDataPolicy: "require-complete" as const,
    minimumCoverage: 1,
    eligibleNormalization: "total-weight" as const,
    eligibleSecurities: eligible.length,
    excludedSecurities: scored.length - eligible.length,
    averageCoverage: scored.reduce((sum, security) => sum + security.coverage, 0) / scored.length,
    factorCoverage,
  };
  const dashboard = VerticalSliceDashboardSchema.parse({
    buildId: recipe.buildId,
    generatedAt: recipe.evaluatedAt,
    schemaVersion: recipe.schemaVersion,
    modelVersion: recipe.modelVersion,
    status: "healthy",
    source: {
      dataset: "V2 production baseline — $10B+ universe",
      repositoryPath: recipe.sourcePath.replaceAll("\\", "/"),
      sourceCommit: recipe.sourceCommit,
      contentSha256: sourceHash,
      observedAt: recipe.observedAt,
      rowCount: snapshot.rows.length,
      freshnessStatus: "current",
      ageSeconds,
      maxAgeSeconds: recipe.maxAgeSeconds,
    },
    scoring,
    portfolio: {
      constraints: portfolio.constraints,
      totalWeight: portfolio.totalWeight,
      totalWeightUnits: portfolio.totalWeightUnits,
      positions: portfolio.positions.map((position) =>
        mapPortfolioPosition(position, eligibleByTicker),
      ),
      sectorWeights: portfolio.sectorWeights,
      sectorWeightUnits: portfolio.sectorWeightUnits,
      construction: portfolio.construction,
    },
    pipeline: {
      requiredArtifacts: ["dashboard", "portfolio", "scores"],
      freshnessGate: "fail-closed",
      publicationMode: "atomic-immutable-directory",
      integrityMode: "sha256-and-byte-size",
      retryMode: "verify-and-reuse",
      activationMode: "atomic-active-build-pointer",
      rollbackMode: "validated-pointer-and-projection",
    },
    topScores: eligible.slice(0, 12).map(publishedSecurity),
    notice: NOTICE,
  });
  const scores = PublishedScoresArtifactSchema.parse({
    buildId: recipe.buildId,
    generatedAt: recipe.evaluatedAt,
    schemaVersion: recipe.schemaVersion,
    modelVersion: recipe.modelVersion,
    scoring,
    securities: scored,
    source: dashboard.source,
  });
  const publishedPortfolio = PublishedPortfolioArtifactSchema.parse({
    buildId: recipe.buildId,
    generatedAt: recipe.evaluatedAt,
    schemaVersion: recipe.schemaVersion,
    modelVersion: recipe.modelVersion,
    scoring,
    portfolio: dashboard.portfolio,
    source: dashboard.source,
  });
  const artifacts = {
    dashboard: deterministicJson(dashboard),
    portfolio: deterministicJson(publishedPortfolio),
    scores: deterministicJson(scores),
  };
  const files = {
    dashboard: artifactMetadata(
      "dashboard.json",
      artifacts.dashboard,
      1,
      recipe,
      sourceHash,
      ageSeconds,
    ),
    portfolio: artifactMetadata(
      "portfolio.json",
      artifacts.portfolio,
      dashboard.portfolio.positions.length,
      recipe,
      sourceHash,
      ageSeconds,
    ),
    scores: artifactMetadata(
      "scores.json",
      artifacts.scores,
      scored.length,
      recipe,
      sourceHash,
      ageSeconds,
    ),
  };
  const manifestEvaluation = evaluateManifest({
    buildId: recipe.buildId,
    schemaVersion: recipe.schemaVersion,
    modelVersion: recipe.modelVersion,
    generatedAt: recipe.evaluatedAt,
    evaluatedAt: recipe.evaluatedAt,
    requiredArtifacts: ["dashboard", "portfolio", "scores"],
    files,
  });

  if (manifestEvaluation.decision !== "publish" || manifestEvaluation.candidateManifest === null) {
    throw new Error(
      `Vertical slice failed closed at the publication gate: ${manifestEvaluation.reasons.join(" ")}`,
    );
  }

  const publication = await publishBuildIdempotently({
    rootDirectory: outputRoot,
    manifest: manifestEvaluation.candidateManifest,
    artifacts,
  });
  const activation = await activateProjectedBuild(
    outputRoot,
    recipe.buildId,
    projectionPath,
    artifacts.dashboard,
  );

  return {
    buildId: recipe.buildId,
    buildDirectory: publication.buildDirectory,
    manifestPath: publication.manifestPath,
    pointerPath: activation.pointerPath,
    projectionPath,
    publicationDisposition: publication.disposition,
    dashboard,
  };
}

export async function rollbackVerticalSlice(
  outputRoot: string,
  projectionPath: string,
): Promise<VerticalSliceRollbackResult> {
  const absoluteRoot = resolve(outputRoot);
  const absoluteProjectionPath = resolve(projectionPath);
  const rollback = await rollbackActiveBuild({
    rootDirectory: absoluteRoot,
  });

  try {
    const dashboard = await verifyPublishedVerticalSlice(absoluteRoot);
    await projectActiveDashboard(absoluteProjectionPath, deterministicJson(dashboard));

    return {
      pointer: rollback,
      projectionPath: absoluteProjectionPath,
      dashboard,
    };
  } catch (rollbackError) {
    try {
      const recovery = await rollbackActiveBuild({
        rootDirectory: absoluteRoot,
      });

      if (recovery.activeBuildId !== rollback.rolledBackFromBuildId) {
        throw new Error(
          `Rollback recovery activated "${recovery.activeBuildId}" instead of "${rollback.rolledBackFromBuildId}".`,
          { cause: rollbackError },
        );
      }
    } catch (recoveryError) {
      throw new AggregateError(
        [rollbackError, recoveryError],
        "Vertical-slice rollback failed and the original active build could not be restored.",
        { cause: recoveryError },
      );
    }

    throw rollbackError;
  }
}

export async function verifyPublishedVerticalSlice(
  outputRoot: string,
): Promise<VerticalSliceDashboard> {
  const absoluteRoot = resolve(outputRoot);
  const pointer = JSON.parse(
    await readFile(join(absoluteRoot, "active-build.json"), "utf8"),
  ) as unknown;

  if (
    typeof pointer !== "object" ||
    pointer === null ||
    !("activeBuildId" in pointer) ||
    typeof pointer.activeBuildId !== "string"
  ) {
    throw new Error("Published vertical slice has a malformed active-build pointer.");
  }

  const buildDirectory = join(absoluteRoot, "builds", pointer.activeBuildId);
  const manifest = BuildManifestSchema.parse(
    JSON.parse(await readFile(join(buildDirectory, "manifest.json"), "utf8")) as unknown,
  );

  for (const artifact of Object.values(manifest.files)) {
    const payload = await readFile(join(buildDirectory, artifact.path));

    if (payload.byteLength !== artifact.byteSize || sha256(payload) !== artifact.sha256) {
      throw new Error(`Published artifact "${artifact.path}" failed integrity verification.`);
    }
  }

  const dashboard = VerticalSliceDashboardSchema.parse(
    JSON.parse(await readFile(join(buildDirectory, "dashboard.json"), "utf8")) as unknown,
  );
  const scores = PublishedScoresArtifactSchema.parse(
    JSON.parse(await readFile(join(buildDirectory, "scores.json"), "utf8")) as unknown,
  );
  const portfolio = PublishedPortfolioArtifactSchema.parse(
    JSON.parse(await readFile(join(buildDirectory, "portfolio.json"), "utf8")) as unknown,
  );

  if (
    scores.buildId !== dashboard.buildId ||
    scores.schemaVersion !== dashboard.schemaVersion ||
    scores.modelVersion !== dashboard.modelVersion ||
    scores.source.contentSha256 !== dashboard.source.contentSha256 ||
    portfolio.buildId !== dashboard.buildId ||
    portfolio.schemaVersion !== dashboard.schemaVersion ||
    portfolio.modelVersion !== dashboard.modelVersion ||
    portfolio.source.contentSha256 !== dashboard.source.contentSha256
  ) {
    throw new Error("Published scoring or portfolio lineage does not match the active dashboard.");
  }

  return dashboard;
}
