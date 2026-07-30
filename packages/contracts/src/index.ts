import { z } from "zod";

const IsoDateTimeSchema = z.string().datetime({ offset: true });
const Sha256Schema = z.string().regex(/^[a-f0-9]{64}$/);

export const DataStatusSchema = z.enum([
  "current",
  "delayed",
  "stale",
  "fallback",
  "unavailable",
  "invalid",
]);
export type DataStatus = z.infer<typeof DataStatusSchema>;

export const SourceProvenanceSchema = z
  .object({
    sourceId: z.string().min(1),
    sourceType: z.enum(["first-party", "exchange", "regulator", "vendor", "derived", "manual"]),
    retrievedAt: IsoDateTimeSchema,
    sourceVersion: z.string().min(1).optional(),
    sourceUri: z.string().min(1).optional(),
    contentSha256: Sha256Schema.optional(),
  })
  .superRefine((value, context) => {
    if (value.sourceVersion === undefined && value.contentSha256 === undefined) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Provenance requires sourceVersion or contentSha256.",
        path: ["sourceVersion"],
      });
    }
  });
export type SourceProvenance = z.infer<typeof SourceProvenanceSchema>;

export const FreshnessSchema = z
  .object({
    status: DataStatusSchema,
    observedAt: IsoDateTimeSchema.nullable(),
    retrievedAt: IsoDateTimeSchema,
    evaluatedAt: IsoDateTimeSchema,
    ageSeconds: z.number().int().nonnegative().nullable(),
    maxAgeSeconds: z.number().int().positive(),
    reason: z.string().min(1).nullable(),
  })
  .superRefine((value, context) => {
    if (
      (value.status === "current" || value.status === "stale") &&
      (value.observedAt === null || value.ageSeconds === null)
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: `${value.status} data requires observedAt and ageSeconds.`,
        path: ["observedAt"],
      });
    }

    if (
      value.status === "current" &&
      value.ageSeconds !== null &&
      value.ageSeconds > value.maxAgeSeconds
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Current data cannot exceed maxAgeSeconds.",
        path: ["ageSeconds"],
      });
    }

    if (
      value.status === "stale" &&
      value.ageSeconds !== null &&
      value.ageSeconds <= value.maxAgeSeconds
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Stale data must exceed maxAgeSeconds.",
        path: ["ageSeconds"],
      });
    }

    if (value.status !== "current" && value.reason === null) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Non-current data requires a reason.",
        path: ["reason"],
      });
    }

    if (
      value.status === "unavailable" &&
      (value.observedAt !== null || value.ageSeconds !== null)
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Unavailable data cannot claim an observation time or age.",
        path: ["observedAt"],
      });
    }
  });
export type Freshness = z.infer<typeof FreshnessSchema>;

export const ArtifactFileSchema = z
  .object({
    path: z.string().min(1),
    sha256: Sha256Schema,
    byteSize: z.number().int().nonnegative(),
    rowCount: z.number().int().nonnegative().optional(),
    status: DataStatusSchema,
    freshness: FreshnessSchema,
    provenance: z.array(SourceProvenanceSchema).min(1),
  })
  .superRefine((value, context) => {
    if (value.status !== value.freshness.status) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Artifact status must match freshness status.",
        path: ["status"],
      });
    }
  });
export type ArtifactFile = z.infer<typeof ArtifactFileSchema>;

export const PublicationDecisionSchema = z.enum(["publish", "hold-last-known-good", "block"]);
export type PublicationDecision = z.infer<typeof PublicationDecisionSchema>;

export const PublicationSchema = z
  .object({
    decision: PublicationDecisionSchema,
    evaluatedAt: IsoDateTimeSchema,
    reasons: z.array(z.string().min(1)).default([]),
    previousBuildId: z.string().min(1).optional(),
  })
  .superRefine((value, context) => {
    if (value.decision === "hold-last-known-good" && value.previousBuildId === undefined) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Holding last-known-good requires previousBuildId.",
        path: ["previousBuildId"],
      });
    }

    if (value.decision !== "publish" && value.reasons.length === 0) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "A non-publish decision requires at least one reason.",
        path: ["reasons"],
      });
    }
  });
export type Publication = z.infer<typeof PublicationSchema>;

export const BuildManifestSchema = z
  .object({
    buildId: z.string().min(1),
    schemaVersion: z.string().min(1),
    modelVersion: z.string().min(1),
    generatedAt: IsoDateTimeSchema,
    publishedAt: IsoDateTimeSchema.optional(),
    status: z.enum(["healthy", "degraded", "failed"]),
    publication: PublicationSchema,
    files: z.record(ArtifactFileSchema),
  })
  .superRefine((value, context) => {
    const files = Object.values(value.files);

    if (files.length === 0) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "A build manifest requires at least one artifact.",
        path: ["files"],
      });
      return;
    }

    const statuses = files.map((file) => file.status);

    let expectedStatus: "healthy" | "degraded" | "failed" = "healthy";

    if (statuses.some((status) => status === "unavailable" || status === "invalid")) {
      expectedStatus = "failed";
    } else if (
      statuses.some((status) => status === "delayed" || status === "stale" || status === "fallback")
    ) {
      expectedStatus = "degraded";
    }

    if (value.status !== expectedStatus) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Build status must be ${expectedStatus} for its artifact statuses.`,
        path: ["status"],
      });
    }

    if (value.publication.decision === "publish") {
      if (value.status !== "healthy") {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Only a healthy build may be published.",
          path: ["publication", "decision"],
        });
      }

      if (value.publishedAt === undefined) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "A published build requires publishedAt.",
          path: ["publishedAt"],
        });
      }
    } else if (value.publishedAt !== undefined) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "A blocked or held build cannot have publishedAt.",
        path: ["publishedAt"],
      });
    }
  });
export type BuildManifest = z.infer<typeof BuildManifestSchema>;

export const FactorObservationSchema = z.object({
  securityId: z.string().min(1),
  ticker: z.string().min(1),
  factor: z.string().min(1),
  value: z.number().finite().nullable(),
  status: DataStatusSchema,
  periodEnd: z.string().date().nullable(),
  availableFrom: IsoDateTimeSchema.nullable(),
  retrievedAt: IsoDateTimeSchema,
  source: z.string().min(1),
  buildId: z.string().min(1),
});
export type FactorObservation = z.infer<typeof FactorObservationSchema>;

export const SCORING_PILLARS = [
  "valuation",
  "growth",
  "profitability",
  "momentum",
  "revisions",
] as const;
export const ScoringPillarSchema = z.enum(SCORING_PILLARS);
export type ScoringPillar = z.infer<typeof ScoringPillarSchema>;

export const V2BaselineUniverseRowSchema = z.object({
  ticker: z.string().trim().min(1),
  name: z.string().trim().min(1),
  sector: z.string().trim().min(1),
  industry: z.string().trim().min(1),
  marketCapB: z.number().finite().nonnegative(),
  price: z.number().finite().positive(),
  pillars: z.object({
    Valuation: z.number().finite().nullable(),
    Growth: z.number().finite().nullable(),
    Profitability: z.number().finite().nullable(),
    Momentum: z.number().finite().nullable(),
    "EPS Revisions": z.number().finite().nullable(),
  }),
});
export type V2BaselineUniverseRow = z.infer<typeof V2BaselineUniverseRowSchema>;

export const V2BaselineUniverseSnapshotSchema = z
  .object({
    meta: z.object({
      floor: z.number().nonnegative(),
      n_total: z.number().int().positive(),
      n_stocks: z.number().int().nonnegative(),
      n_etf: z.number().int().nonnegative(),
      sectors: z.array(z.string().trim().min(1)).min(1),
    }),
    rows: z.array(V2BaselineUniverseRowSchema).min(1),
  })
  .superRefine((value, context) => {
    if (value.meta.n_total !== value.rows.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Metadata declares ${value.meta.n_total} rows but the snapshot contains ${value.rows.length}.`,
        path: ["meta", "n_total"],
      });
    }

    if (value.meta.n_stocks + value.meta.n_etf !== value.meta.n_total) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Stock and ETF counts must add up to n_total.",
        path: ["meta"],
      });
    }

    const seenTickers = new Set<string>();

    value.rows.forEach((row, index) => {
      if (seenTickers.has(row.ticker)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Duplicate ticker "${row.ticker}".`,
          path: ["rows", index, "ticker"],
        });
      }
      seenTickers.add(row.ticker);

      if (!value.meta.sectors.includes(row.sector)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Sector "${row.sector}" is absent from snapshot metadata.`,
          path: ["rows", index, "sector"],
        });
      }
    });
  });
export type V2BaselineUniverseSnapshot = z.infer<typeof V2BaselineUniverseSnapshotSchema>;

export const V2BaselineMetadataSchema = z
  .object({
    generated_at: z.string().min(1),
    source_commit: z.string().min(1),
    default_preset: z.string().min(1),
    pillars: z.array(z.string().min(1)).min(1),
  })
  .passthrough();
export type V2BaselineMetadata = z.infer<typeof V2BaselineMetadataSchema>;

export const VerticalSliceBuildRecipeSchema = z.object({
  buildId: z.string().min(1),
  evaluatedAt: IsoDateTimeSchema,
  observedAt: IsoDateTimeSchema,
  maxAgeSeconds: z.number().int().positive(),
  sourcePath: z.string().min(1),
  metadataPath: z.string().min(1),
  outputRoot: z.string().min(1),
  projectionPath: z.string().min(1),
  sourceCommit: z.string().min(1),
  schemaVersion: z.string().min(1),
  modelVersion: z.string().min(1),
});
export type VerticalSliceBuildRecipe = z.infer<typeof VerticalSliceBuildRecipeSchema>;

const DashboardSecuritySchema = z.object({
  ticker: z.string().min(1),
  name: z.string().min(1),
  sector: z.string().min(1),
  industry: z.string().min(1),
  score: z.number().finite(),
  coverage: z.number().min(0).max(1),
  missingPillars: z.array(ScoringPillarSchema),
  price: z.number().positive(),
  marketCapB: z.number().nonnegative(),
});

const DashboardPortfolioPositionSchema = DashboardSecuritySchema.extend({
  weight: z.number().positive().max(1),
  weightUnits: z.number().int().positive(),
  maxWeight: z.number().positive().max(1),
  maxWeightUnits: z.number().int().positive(),
});

export const ScoreExclusionReasonSchema = z.enum([
  "below-minimum-coverage",
  "missing-required-pillar",
  "no-observed-weight",
]);
export type ScoreExclusionReason = z.infer<typeof ScoreExclusionReasonSchema>;

export const ScoreContributionSchema = z.object({
  pillar: ScoringPillarSchema,
  value: z.number().finite().nullable(),
  weight: z.number().finite().nonnegative(),
  weightedValue: z.number().finite().nullable(),
  status: z.enum(["available", "missing"]),
});
export type ScoreContribution = z.infer<typeof ScoreContributionSchema>;

export const PublishedScoredSecuritySchema = z
  .object({
    ticker: z.string().min(1),
    name: z.string().min(1),
    sector: z.string().min(1),
    industry: z.string().min(1),
    score: z.number().finite().nullable(),
    coverage: z.number().min(0).max(1),
    availableWeight: z.number().finite().nonnegative(),
    totalWeight: z.number().finite().positive(),
    eligible: z.boolean(),
    missingPillars: z.array(ScoringPillarSchema),
    exclusionReasons: z.array(ScoreExclusionReasonSchema),
    normalization: z.enum(["total-weight", "available-weight", "not-scored"]),
    contributions: z.array(ScoreContributionSchema).length(SCORING_PILLARS.length),
    price: z.number().positive(),
    marketCapB: z.number().nonnegative(),
  })
  .superRefine((value, context) => {
    const contributionPillars = new Set(value.contributions.map(({ pillar }) => pillar));

    if (
      contributionPillars.size !== SCORING_PILLARS.length ||
      value.contributions.some(({ pillar }, index) => pillar !== SCORING_PILLARS[index])
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Every scoring pillar must appear exactly once in canonical order.",
        path: ["contributions"],
      });
    }

    value.contributions.forEach((contribution, index) => {
      const isConsistent =
        contribution.status === "available"
          ? contribution.value !== null &&
            contribution.weightedValue !== null &&
            Math.abs(contribution.weightedValue - contribution.value * contribution.weight) <= 1e-12
          : contribution.value === null && contribution.weightedValue === null;

      if (!isConsistent) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Contribution for "${contribution.pillar}" is inconsistent with its availability.`,
          path: ["contributions", index],
        });
      }
    });

    const expectedMissing = value.contributions
      .filter(({ status, weight }) => status === "missing" && weight > 0)
      .map(({ pillar }) => pillar);

    if (
      expectedMissing.length !== value.missingPillars.length ||
      expectedMissing.some((pillar) => !value.missingPillars.includes(pillar))
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "missingPillars must match missing positively weighted contributions.",
        path: ["missingPillars"],
      });
    }

    const expectedAvailableWeight = value.contributions.reduce(
      (sum, contribution) =>
        contribution.status === "available" ? sum + contribution.weight : sum,
      0,
    );
    const expectedTotalWeight = value.contributions.reduce(
      (sum, contribution) => sum + contribution.weight,
      0,
    );

    if (
      Math.abs(value.availableWeight - expectedAvailableWeight) > 1e-12 ||
      Math.abs(value.totalWeight - expectedTotalWeight) > 1e-12 ||
      Math.abs(value.coverage - expectedAvailableWeight / expectedTotalWeight) > 1e-12
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Published score coverage must reconcile with its pillar contributions.",
        path: ["coverage"],
      });
    }

    if (value.eligible) {
      if (
        value.score === null ||
        value.exclusionReasons.length > 0 ||
        value.normalization === "not-scored"
      ) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "An eligible security requires a score and no exclusion reasons.",
          path: ["eligible"],
        });
      }

      const weightedSum = value.contributions.reduce(
        (sum, contribution) => sum + (contribution.weightedValue ?? 0),
        0,
      );
      const denominator =
        value.normalization === "available-weight" ? value.availableWeight : value.totalWeight;

      if (value.score !== null && Math.abs(value.score - weightedSum / denominator) > 1e-12) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Published score must reconcile with its weighted contributions.",
          path: ["score"],
        });
      }
    } else if (
      value.score !== null ||
      value.exclusionReasons.length === 0 ||
      value.normalization !== "not-scored"
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "An ineligible security must be unscored with an explicit exclusion reason.",
        path: ["eligible"],
      });
    }
  });
export type PublishedScoredSecurity = z.infer<typeof PublishedScoredSecuritySchema>;

export const FactorCoverageSchema = z.object({
  pillar: ScoringPillarSchema,
  sourceField: z.string().min(1),
  weight: z.number().finite().nonnegative(),
  availableSecurities: z.number().int().nonnegative(),
  missingSecurities: z.number().int().nonnegative(),
  coverage: z.number().min(0).max(1),
});
export type FactorCoverage = z.infer<typeof FactorCoverageSchema>;

const ScoringSummarySchema = z
  .object({
    method: z.literal("weighted-five-pillar"),
    weights: z.record(ScoringPillarSchema, z.number().finite().nonnegative()),
    missingDataPolicy: z.enum(["require-complete", "renormalize-explicitly"]),
    minimumCoverage: z.number().min(0).max(1),
    eligibleNormalization: z.enum(["total-weight", "available-weight"]),
    eligibleSecurities: z.number().int().nonnegative(),
    excludedSecurities: z.number().int().nonnegative(),
    averageCoverage: z.number().min(0).max(1),
    factorCoverage: z.array(FactorCoverageSchema).length(SCORING_PILLARS.length),
  })
  .superRefine((value, context) => {
    const factorPillars = new Set(value.factorCoverage.map(({ pillar }) => pillar));

    if (factorPillars.size !== SCORING_PILLARS.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Factor coverage must report every scoring pillar exactly once.",
        path: ["factorCoverage"],
      });
    }

    const expectedNormalization =
      value.missingDataPolicy === "renormalize-explicitly" ? "available-weight" : "total-weight";

    if (value.eligibleNormalization !== expectedNormalization) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: `The ${value.missingDataPolicy} policy requires ${expectedNormalization} normalization.`,
        path: ["eligibleNormalization"],
      });
    }

    value.factorCoverage.forEach((factor, index) => {
      const configuredWeight = value.weights[factor.pillar];

      if (configuredWeight === undefined || Math.abs(factor.weight - configuredWeight) > 1e-12) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Coverage weight for "${factor.pillar}" does not match the scoring model.`,
          path: ["factorCoverage", index, "weight"],
        });
      }
    });
  });

const DashboardSourceSchema = z.object({
  dataset: z.string().min(1),
  repositoryPath: z.string().min(1),
  sourceCommit: z.string().min(1),
  contentSha256: Sha256Schema,
  observedAt: IsoDateTimeSchema,
  rowCount: z.number().int().positive(),
  freshnessStatus: z.literal("current"),
});

export const PublishedScoresArtifactSchema = z
  .object({
    buildId: z.string().min(1),
    generatedAt: IsoDateTimeSchema,
    schemaVersion: z.string().min(1),
    modelVersion: z.string().min(1),
    scoring: ScoringSummarySchema,
    securities: z.array(PublishedScoredSecuritySchema).min(1),
    source: DashboardSourceSchema,
  })
  .superRefine((value, context) => {
    if (value.securities.length !== value.source.rowCount) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Published scores must contain one record for every source security.",
        path: ["securities"],
      });
    }

    const eligible = value.securities.filter(({ eligible }) => eligible).length;
    const averageCoverage =
      value.securities.reduce((sum, security) => sum + security.coverage, 0) /
      value.securities.length;

    if (
      eligible !== value.scoring.eligibleSecurities ||
      value.securities.length - eligible !== value.scoring.excludedSecurities ||
      Math.abs(averageCoverage - value.scoring.averageCoverage) > 1e-12
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Published score eligibility counts do not reconcile.",
        path: ["scoring"],
      });
    }

    value.scoring.factorCoverage.forEach((factor, index) => {
      if (
        factor.availableSecurities + factor.missingSecurities !== value.source.rowCount ||
        Math.abs(factor.coverage - factor.availableSecurities / value.source.rowCount) > 1e-12
      ) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Coverage for "${factor.pillar}" does not reconcile with the source universe.`,
          path: ["scoring", "factorCoverage", index],
        });
      }
    });

    value.securities.forEach((security, securityIndex) => {
      const violatesCoverage = security.coverage + 1e-12 < value.scoring.minimumCoverage;
      const violatesCompleteness =
        value.scoring.missingDataPolicy === "require-complete" &&
        security.missingPillars.length > 0;

      if (
        security.contributions.some((contribution) => {
          const configuredWeight = value.scoring.weights[contribution.pillar];

          return (
            configuredWeight === undefined ||
            Math.abs(contribution.weight - configuredWeight) > 1e-12
          );
        }) ||
        (security.eligible && (violatesCoverage || violatesCompleteness)) ||
        (security.eligible && security.normalization !== value.scoring.eligibleNormalization)
      ) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Security "${security.ticker}" does not follow the published scoring policy.`,
          path: ["securities", securityIndex],
        });
      }
    });
  });
export type PublishedScoresArtifact = z.infer<typeof PublishedScoresArtifactSchema>;

const PortfolioSectorCapacitySchema = z.object({
  sector: z.string().min(1),
  candidateCapacity: z.number().nonnegative(),
  candidateCapacityUnits: z.number().int().nonnegative(),
  cappedCapacity: z.number().nonnegative(),
  cappedCapacityUnits: z.number().int().nonnegative(),
});

const DashboardPortfolioSchema = z
  .object({
    constraints: z.object({
      maxPositionWeight: z.number().positive().max(1),
      maxSectorWeight: z.number().positive().max(1),
    }),
    totalWeight: z.literal(1),
    totalWeightUnits: z.number().int().positive(),
    positions: z.array(DashboardPortfolioPositionSchema).min(1),
    sectorWeights: z.record(z.string(), z.number().positive().max(1)),
    sectorWeightUnits: z.record(z.string(), z.number().int().positive()),
    construction: z.object({
      method: z.literal("ranked-greedy-integer-units-v1"),
      weightScale: z.literal(1_000_000_000),
      candidateCount: z.number().int().positive(),
      sectorCount: z.number().int().positive(),
      maximumFeasibleWeight: z.number().min(1),
      maximumFeasibleWeightUnits: z.number().int().min(1_000_000_000),
      sectorCapacities: z.array(PortfolioSectorCapacitySchema).min(1),
      bindingPositionIds: z.array(z.string().min(1)),
      bindingSectors: z.array(z.string().min(1)),
    }),
  })
  .superRefine((value, context) => {
    const scale = value.construction.weightScale;
    const expectedPositionCapUnits = Math.round(value.constraints.maxPositionWeight * scale);
    const expectedSectorCapUnits = Math.round(value.constraints.maxSectorWeight * scale);
    const positionWeightUnits = value.positions.reduce(
      (sum, position) => sum + position.weightUnits,
      0,
    );

    if (
      Math.abs(value.constraints.maxPositionWeight * scale - expectedPositionCapUnits) > 1e-6 ||
      Math.abs(value.constraints.maxSectorWeight * scale - expectedSectorCapUnits) > 1e-6
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Portfolio caps must be representable in the published integer weight scale.",
        path: ["constraints"],
      });
    }

    if (
      value.totalWeightUnits !== scale ||
      positionWeightUnits !== scale ||
      Math.abs(value.positions.reduce((sum, position) => sum + position.weight, 0) - 1) > 1e-12
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "The published portfolio must reconcile exactly to one integer weight scale.",
        path: ["totalWeightUnits"],
      });
    }

    const derivedSectorUnits = new Map<string, number>();

    value.positions.forEach((position, index) => {
      if (
        position.weightUnits > expectedPositionCapUnits ||
        position.weightUnits > position.maxWeightUnits ||
        position.maxWeightUnits > expectedPositionCapUnits ||
        position.weight !== position.weightUnits / scale ||
        position.maxWeight !== position.maxWeightUnits / scale
      ) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Position "${position.ticker}" does not reconcile with its exact cap.`,
          path: ["positions", index],
        });
      }

      derivedSectorUnits.set(
        position.sector,
        (derivedSectorUnits.get(position.sector) ?? 0) + position.weightUnits,
      );
    });

    const publishedSectors = new Set([
      ...Object.keys(value.sectorWeights),
      ...Object.keys(value.sectorWeightUnits),
    ]);

    if (
      publishedSectors.size !== derivedSectorUnits.size ||
      [...publishedSectors].some((sector) => !derivedSectorUnits.has(sector))
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Published sector keys must match the constructed positions.",
        path: ["sectorWeights"],
      });
    }

    for (const [sector, units] of derivedSectorUnits) {
      if (
        units > expectedSectorCapUnits ||
        value.sectorWeightUnits[sector] !== units ||
        value.sectorWeights[sector] !== units / scale
      ) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Sector "${sector}" does not reconcile with its exact cap.`,
          path: ["sectorWeights", sector],
        });
      }
    }

    const capacitySectors = new Set(
      value.construction.sectorCapacities.map(({ sector }) => sector),
    );
    const maximumFeasibleWeightUnits = value.construction.sectorCapacities.reduce(
      (sum, capacity, index) => {
        if (
          capacity.candidateCapacity !== capacity.candidateCapacityUnits / scale ||
          capacity.cappedCapacity !== capacity.cappedCapacityUnits / scale ||
          capacity.cappedCapacityUnits !==
            Math.min(capacity.candidateCapacityUnits, expectedSectorCapUnits)
        ) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            message: `Capacity evidence for "${capacity.sector}" is inconsistent.`,
            path: ["construction", "sectorCapacities", index],
          });
        }

        return sum + capacity.cappedCapacityUnits;
      },
      0,
    );

    if (
      capacitySectors.size !== value.construction.sectorCapacities.length ||
      capacitySectors.size !== value.construction.sectorCount ||
      value.construction.candidateCount < value.positions.length ||
      value.construction.maximumFeasibleWeightUnits !== maximumFeasibleWeightUnits ||
      value.construction.maximumFeasibleWeight !== maximumFeasibleWeightUnits / scale
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Portfolio construction evidence does not reconcile.",
        path: ["construction"],
      });
    }

    const expectedBindingPositionIds = value.positions
      .filter((position) => position.weightUnits === position.maxWeightUnits)
      .map((position) => position.ticker);
    const expectedBindingSectors = [...derivedSectorUnits]
      .filter(([, units]) => units === expectedSectorCapUnits)
      .map(([sector]) => sector)
      .sort();

    if (
      value.construction.bindingPositionIds.length !== expectedBindingPositionIds.length ||
      value.construction.bindingPositionIds.some(
        (id, index) => id !== expectedBindingPositionIds[index],
      ) ||
      value.construction.bindingSectors.length !== expectedBindingSectors.length ||
      value.construction.bindingSectors.some(
        (sector, index) => sector !== expectedBindingSectors[index],
      )
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Binding portfolio constraints do not reconcile with final weights.",
        path: ["construction"],
      });
    }
  });

export const PublishedPortfolioArtifactSchema = z
  .object({
    buildId: z.string().min(1),
    generatedAt: IsoDateTimeSchema,
    schemaVersion: z.string().min(1),
    modelVersion: z.string().min(1),
    scoring: ScoringSummarySchema,
    portfolio: DashboardPortfolioSchema,
    source: DashboardSourceSchema,
  })
  .superRefine((value, context) => {
    if (value.portfolio.construction.candidateCount !== value.scoring.eligibleSecurities) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Portfolio candidate count must match eligible scored securities.",
        path: ["portfolio", "construction", "candidateCount"],
      });
    }
  });
export type PublishedPortfolioArtifact = z.infer<typeof PublishedPortfolioArtifactSchema>;

export const VerticalSliceDashboardSchema = z
  .object({
    buildId: z.string().min(1),
    generatedAt: IsoDateTimeSchema,
    schemaVersion: z.string().min(1),
    modelVersion: z.string().min(1),
    status: z.literal("healthy"),
    source: DashboardSourceSchema,
    scoring: ScoringSummarySchema,
    portfolio: DashboardPortfolioSchema,
    topScores: z.array(DashboardSecuritySchema).min(1),
    notice: z.string().min(1),
  })
  .superRefine((value, context) => {
    if (value.portfolio.construction.candidateCount !== value.scoring.eligibleSecurities) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Portfolio candidate count must match eligible scored securities.",
        path: ["portfolio", "construction", "candidateCount"],
      });
    }
  });
export type VerticalSliceDashboard = z.infer<typeof VerticalSliceDashboardSchema>;
