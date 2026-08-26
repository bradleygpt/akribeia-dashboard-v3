import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import {
  DailyEvidenceRecordSchema,
  EvidenceReproducibilityReportSchema,
  MetricDictionarySchema,
  ModelCardSchema,
  SCORING_PILLARS,
  V2MetricMetadataSchema,
  type MetricDictionary,
  type ModelCard,
  type ScoringPillar,
} from "@akribeia/contracts";

const METADATA_PILLARS: Record<ScoringPillar, string> = {
  valuation: "Valuation",
  growth: "Growth",
  profitability: "Profitability",
  momentum: "Momentum",
  revisions: "EPS Revisions",
};
const SOURCE_FIELDS: Record<ScoringPillar, string> = {
  valuation: "pillars.Valuation",
  growth: "pillars.Growth",
  profitability: "pillars.Profitability",
  momentum: "pillars.Momentum",
  revisions: "pillars.EPS Revisions",
};
const INTERPRETATIONS: Record<ScoringPillar, string> = {
  valuation:
    "Higher preserved V2 valuation pillar scores contribute more positively to the composite.",
  growth: "Higher preserved V2 growth pillar scores contribute more positively to the composite.",
  profitability:
    "Higher preserved V2 profitability pillar scores contribute more positively to the composite.",
  momentum:
    "Higher preserved V2 momentum pillar scores contribute more positively to the composite.",
  revisions:
    "Higher preserved V2 EPS-revisions pillar scores contribute more positively to the composite.",
};

export interface GenerateModelGovernanceOptions {
  activeDailyEvidencePath: string;
  evidenceRoot: string;
  metadataPath: string;
  governanceRoot: string;
  dashboardProjectionRoot: string;
  publicGovernanceRoot: string;
}

export interface GenerateModelGovernanceResult {
  modelVersion: string;
  modelCardPath: string;
  metricDictionaryPath: string;
  disposition: "published" | "reused";
  modelCard: ModelCard;
  metricDictionary: MetricDictionary;
}

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

    const existing = await readFile(path);

    if (!existing.equals(payload)) {
      throw new Error(`Immutable governance conflict at "${path}".`, { cause: error });
    }

    return "reused";
  }
}

async function writeProjection(path: string, payload: Uint8Array): Promise<void> {
  const temporaryPath = join(dirname(path), `.${randomUUID()}-${path.split(/[\\/]/).at(-1)}.tmp`);

  await mkdir(dirname(path), { recursive: true });

  try {
    await writeFile(temporaryPath, payload, { flag: "wx" });
    await rename(temporaryPath, path);
  } finally {
    await rm(temporaryPath, { force: true });
  }
}

function relativeEvidencePath(asOfDate: string, buildId: string, filename: string): string {
  return `daily/${asOfDate}/${buildId}/${filename}`;
}

export async function generateModelGovernance(
  options: GenerateModelGovernanceOptions,
): Promise<GenerateModelGovernanceResult> {
  const activePath = resolve(options.activeDailyEvidencePath);
  const activePayload = await readFile(activePath);
  const activeRecord = DailyEvidenceRecordSchema.parse(parseJson(activePath, activePayload));
  const relativeRecordPath = relativeEvidencePath(
    activeRecord.asOfDate,
    activeRecord.build.buildId,
    "evidence.json",
  );
  const canonicalPath = join(resolve(options.evidenceRoot), relativeRecordPath);
  const reportPath = join(
    resolve(options.evidenceRoot),
    relativeEvidencePath(activeRecord.asOfDate, activeRecord.build.buildId, "reproducibility.json"),
  );
  const [canonicalPayload, reportPayload, metadataPayload] = await Promise.all([
    readFile(canonicalPath),
    readFile(reportPath),
    readFile(resolve(options.metadataPath)),
  ]);
  const report = EvidenceReproducibilityReportSchema.parse(parseJson(reportPath, reportPayload));
  const metadata = V2MetricMetadataSchema.parse(
    parseJson(resolve(options.metadataPath), metadataPayload),
  );

  if (
    !activePayload.equals(canonicalPayload) ||
    report.evidenceRecordSha256 !== sha256(canonicalPayload) ||
    report.result !== "verified"
  ) {
    throw new Error("Active daily evidence does not match its immutable verified record.");
  }

  if (
    metadata.source_commit !== activeRecord.source.sourceCommit ||
    metadata.default_preset !== "equal" ||
    metadata.pillars.some(
      (metadataPillar, index) => metadataPillar !== METADATA_PILLARS[SCORING_PILLARS[index]!],
    )
  ) {
    throw new Error(
      "Metric metadata does not match the active evidence source, equal preset, or canonical pillars.",
    );
  }

  const preset = metadata.presets[metadata.default_preset];

  if (preset === undefined) {
    throw new Error(`Metric metadata is missing preset "${metadata.default_preset}".`);
  }

  for (const pillar of SCORING_PILLARS) {
    const metadataWeight = preset.weights[METADATA_PILLARS[pillar]];
    const activeWeight = activeRecord.scoring.weights[pillar];

    if (
      metadataWeight === undefined ||
      activeWeight === undefined ||
      Math.abs(metadataWeight - activeWeight) > 1e-12
    ) {
      throw new Error(`Metric metadata weight for "${pillar}" does not match the active model.`);
    }
  }

  const source = {
    repositoryPath: "data/observations/current/meta.json",
    sourceCommit: metadata.source_commit,
    contentSha256: sha256(metadataPayload),
  };
  const modelCard = ModelCardSchema.parse({
    modelCardSchemaVersion: "1.0.0",
    modelVersion: activeRecord.build.modelVersion,
    title: "Akribeia V3 equal-weight five-pillar research model",
    maturity: "research-preview",
    releaseEligible: false,
    activeBuildId: activeRecord.build.buildId,
    recordedAt: activeRecord.recordedAt,
    purpose:
      "Rank a preserved large-cap research universe with transparent factor coverage and feed a deterministic constrained model portfolio.",
    intendedUses: [
      "Inspect cross-sectional research scores and their factor contributions.",
      "Evaluate deterministic portfolio construction and publication evidence.",
      "Accumulate prospective validation records before any release decision.",
    ],
    prohibitedUses: [
      "Do not treat scores, weights, or explanations as investment advice.",
      "Do not infer expected returns or performance from this snapshot.",
      "Do not use this preview for production trading or V2 replacement.",
    ],
    method: {
      name: activeRecord.scoring.method,
      weights: activeRecord.scoring.weights,
      missingDataPolicy: activeRecord.scoring.missingDataPolicy,
      minimumCoverage: activeRecord.scoring.minimumCoverage,
      normalization: activeRecord.scoring.eligibleNormalization,
    },
    validation: [
      {
        gate: "software",
        status: "pass",
        summary:
          "Formatting, type, lint, build, unit, package, browser, audit, and CodeQL gates pass.",
        evidence: ["docs/CODEX_EXECUTION_STATUS.md", "docs/decisions/RELEASE-GATES.md"],
      },
      {
        gate: "scoring-parity",
        status: "pass",
        summary: "Frozen V2 composite scores and ratings reproduced with zero mismatches.",
        evidence: ["data/reference/v2-baseline/V2_VALIDATION_FINDINGS.md"],
      },
      {
        gate: "portfolio-parity",
        status: "fail",
        summary:
          "The preserved V2 portfolio oracle is stale against the July 2026 data vintage and is not reproducible.",
        evidence: ["data/reference/v2-baseline/V2_VALIDATION_FINDINGS.md"],
      },
      {
        gate: "coverage",
        status: "pass",
        summary: `${activeRecord.scoring.eligibleSecurities} securities satisfy the explicit ${(
          activeRecord.scoring.minimumCoverage * 100
        ).toFixed(0)}% coverage gate.`,
        evidence: [relativeRecordPath],
      },
      {
        gate: "portfolio-constraints",
        status: "pass",
        summary:
          "The active portfolio reconciles exactly to one billion weight units under position and sector caps.",
        evidence: [relativeRecordPath],
      },
      {
        gate: "benchmark",
        status: "not-started",
        summary: activeRecord.benchmark.reason,
        evidence: [relativeRecordPath],
      },
      {
        gate: "point-in-time",
        status: "not-started",
        summary:
          "Filing availability, survivorship, ticker history, corporate actions, and execution timing are not yet implemented.",
        evidence: ["ROADMAP.md"],
      },
      {
        gate: "prospective",
        status: "insufficient-evidence",
        summary:
          "One immutable research snapshot exists; the 30 consecutive healthy daily builds required for cutover do not.",
        evidence: [relativeRecordPath, "MIGRATION.md"],
      },
    ],
    limitations: [
      "The active source is a preserved repository snapshot rather than a live point-in-time feed.",
      "Raw pillar transformation, normalization, and winsorization formulas are not present in the V3 repository.",
      "The model has no validated benchmark, transaction-cost, turnover, or execution record.",
      "The current-universe evidence is not survivorship-safe historical validation.",
      "One daily record is insufficient for prospective performance assessment.",
    ],
    changePolicy:
      "Any weight, pillar, missing-data, normalization, or component-definition change requires a new model version and regenerated validation evidence.",
    source,
    notice: activeRecord.notice,
  });
  const metricDictionary = MetricDictionarySchema.parse({
    dictionarySchemaVersion: "1.0.0",
    modelVersion: activeRecord.build.modelVersion,
    source,
    methodologyStatus: "component-list-preserved-transform-formulas-unavailable",
    pillars: SCORING_PILLARS.map((pillar) => {
      const metadataName = METADATA_PILLARS[pillar];
      const components = metadata.pillar_metrics[metadataName];

      if (components === undefined || components.length === 0) {
        throw new Error(`Metric metadata has no components for "${metadataName}".`);
      }

      return {
        pillar,
        displayName: metadataName,
        sourceField: SOURCE_FIELDS[pillar],
        weight: activeRecord.scoring.weights[pillar],
        interpretation: INTERPRETATIONS[pillar],
        components: components.map((component) => ({
          key: component.key,
          name: component.name,
          direction: component.higher_is_better
            ? ("higher-is-better" as const)
            : ("lower-is-better" as const),
        })),
      };
    }),
    derivedMetrics: [
      {
        key: "composite_score",
        name: "Composite score",
        definition:
          "Sum of each available pillar score times its configured weight, divided by total configured weight; strict product scoring requires all weighted pillars.",
        unit: "score points",
      },
      {
        key: "factor_coverage",
        name: "Factor coverage",
        definition: "Available configured pillar weight divided by total configured pillar weight.",
        unit: "proportion from 0 to 1",
      },
      {
        key: "weighted_contribution",
        name: "Weighted pillar contribution",
        definition: "Observed pillar score multiplied by that pillar's configured model weight.",
        unit: "weighted score points",
      },
      {
        key: "portfolio_weight",
        name: "Portfolio position weight",
        definition:
          "Final allocated integer weight units divided by the one-billion-unit portfolio scale.",
        unit: "portfolio proportion",
      },
      {
        key: "sector_weight",
        name: "Portfolio sector weight",
        definition: "Sum of final integer position weight units for securities in the sector.",
        unit: "portfolio proportion",
      },
    ],
    caveat:
      "The preserved metadata names component metrics and directionality, but does not contain the raw transformations, cross-sectional normalization, winsorization, or missing-value rules that produced each V2 pillar score.",
  });
  const modelCardPayload = deterministicJson(modelCard);
  const dictionaryPayload = deterministicJson(metricDictionary);
  // Immutable per model version AND build: each observation publishes its own
  // receipted card (same pattern as the maturity/readiness stores), so a new
  // daily build never conflicts with the version's earlier immutable records.
  const relativeRoot = join("models", modelCard.modelVersion, modelCard.activeBuildId);
  const modelCardPath = join(resolve(options.governanceRoot), relativeRoot, "model-card.json");
  const metricDictionaryPath = join(
    resolve(options.governanceRoot),
    relativeRoot,
    "metric-dictionary.json",
  );
  const publicModelCardPath = join(
    resolve(options.publicGovernanceRoot),
    relativeRoot,
    "model-card.json",
  );
  const publicDictionaryPath = join(
    resolve(options.publicGovernanceRoot),
    relativeRoot,
    "metric-dictionary.json",
  );
  const dispositions = await Promise.all([
    writeImmutable(modelCardPath, modelCardPayload),
    writeImmutable(metricDictionaryPath, dictionaryPayload),
    writeImmutable(publicModelCardPath, modelCardPayload),
    writeImmutable(publicDictionaryPath, dictionaryPayload),
  ]);

  await Promise.all([
    writeProjection(
      join(resolve(options.dashboardProjectionRoot), "active-model-card.json"),
      modelCardPayload,
    ),
    writeProjection(
      join(resolve(options.dashboardProjectionRoot), "active-metric-dictionary.json"),
      dictionaryPayload,
    ),
    writeProjection(
      join(resolve(options.publicGovernanceRoot), "active-model-card.json"),
      modelCardPayload,
    ),
    writeProjection(
      join(resolve(options.publicGovernanceRoot), "active-metric-dictionary.json"),
      dictionaryPayload,
    ),
  ]);

  return {
    modelVersion: modelCard.modelVersion,
    modelCardPath,
    metricDictionaryPath,
    disposition: dispositions.every((disposition) => disposition === "reused")
      ? "reused"
      : "published",
    modelCard,
    metricDictionary,
  };
}
