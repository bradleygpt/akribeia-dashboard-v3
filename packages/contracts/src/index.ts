import { z } from "zod";

const IsoDateTimeSchema = z.string().datetime({ offset: true });
const Sha256Schema = z.string().regex(/^[a-f0-9]{64}$/);
const SafeBuildIdSchema = z
  .string()
  .regex(/^[A-Za-z0-9](?:[A-Za-z0-9._-]{0,126}[A-Za-z0-9_-])?$/)
  .refine(
    (buildId) => !/^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(buildId),
    "Build ID uses a reserved cross-platform name.",
  );

export const ActiveBuildPointerSchema = z
  .object({
    activeBuildId: SafeBuildIdSchema,
    previousBuildId: SafeBuildIdSchema.nullable(),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.activeBuildId === value.previousBuildId) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Active and previous build IDs must differ.",
        path: ["previousBuildId"],
      });
    }
  });
export type ActiveBuildPointer = z.infer<typeof ActiveBuildPointerSchema>;

export const EvidenceSecurityRequestSchema = z
  .object({
    ticker: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z][A-Z0-9.-]{0,9}$/),
  })
  .strict();
export type EvidenceSecurityRequest = z.infer<typeof EvidenceSecurityRequestSchema>;

export const EvidenceExplanationRequestSchema = EvidenceSecurityRequestSchema.extend({
  focus: z.enum(["summary", "factor-contributions", "portfolio"]).default("summary"),
}).strict();
export type EvidenceExplanationRequest = z.infer<typeof EvidenceExplanationRequestSchema>;

export const EvidenceExplanationResponseSchema = z
  .object({
    buildId: SafeBuildIdSchema,
    modelVersion: z.string().min(1),
    mode: z.literal("deterministic-evidence"),
    externalModelUsed: z.literal(false),
    focus: z.enum(["summary", "factor-contributions", "portfolio"]),
    ticker: z.string().regex(/^[A-Z][A-Z0-9.-]{0,9}$/),
    explanation: z.string().min(1),
    citations: z.array(z.string().min(1)).min(1),
    notice: z.string().min(1),
  })
  .strict();
export type EvidenceExplanationResponse = z.infer<typeof EvidenceExplanationResponseSchema>;

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

export const HistoricalFixtureInventoryShapeSchema = z
  .object({
    meta: z
      .object({
        floor: z.number().nonnegative(),
        n_total: z.number().int().positive(),
      })
      .passthrough(),
    rows: z.array(z.unknown()).min(1),
  })
  .passthrough()
  .superRefine((value, context) => {
    if (value.meta.n_total !== value.rows.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Historical fixture declares ${value.meta.n_total} rows but contains ${value.rows.length}.`,
        path: ["meta", "n_total"],
      });
    }
  });

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

const DashboardSourceSchema = z
  .object({
    dataset: z.string().min(1),
    repositoryPath: z.string().min(1),
    sourceCommit: z.string().min(1),
    contentSha256: Sha256Schema,
    observedAt: IsoDateTimeSchema,
    rowCount: z.number().int().positive(),
    freshnessStatus: z.literal("current"),
    ageSeconds: z.number().int().nonnegative(),
    maxAgeSeconds: z.number().int().positive(),
  })
  .superRefine((value, context) => {
    if (value.ageSeconds > value.maxAgeSeconds) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "A current source cannot exceed its maximum freshness age.",
        path: ["ageSeconds"],
      });
    }
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
    pipeline: z.object({
      requiredArtifacts: z.tuple([
        z.literal("dashboard"),
        z.literal("portfolio"),
        z.literal("scores"),
      ]),
      freshnessGate: z.literal("fail-closed"),
      publicationMode: z.literal("atomic-immutable-directory"),
      integrityMode: z.literal("sha256-and-byte-size"),
      retryMode: z.literal("verify-and-reuse"),
      activationMode: z.literal("atomic-active-build-pointer"),
      rollbackMode: z.literal("validated-pointer-and-projection"),
    }),
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

export const EvidenceArtifactReceiptSchema = z
  .object({
    name: z.enum(["dashboard", "portfolio", "scores"]),
    path: z.string().min(1),
    sha256: Sha256Schema,
    byteSize: z.number().int().positive(),
    rowCount: z.number().int().nonnegative(),
  })
  .strict();
export type EvidenceArtifactReceipt = z.infer<typeof EvidenceArtifactReceiptSchema>;

export const BenchmarkEvidenceSchema = z.discriminatedUnion("status", [
  z
    .object({
      status: z.literal("unavailable"),
      benchmarkId: z.null(),
      observedAt: z.null(),
      return: z.null(),
      reason: z.string().min(1),
    })
    .strict(),
  z
    .object({
      status: z.literal("available"),
      benchmarkId: z.string().min(1),
      observedAt: IsoDateTimeSchema,
      return: z.number().finite(),
      reason: z.null(),
    })
    .strict(),
]);
export type BenchmarkEvidence = z.infer<typeof BenchmarkEvidenceSchema>;

export const DailyEvidenceRecordSchema = z
  .object({
    evidenceSchemaVersion: z.literal("1.0.0"),
    asOfDate: z.string().date(),
    recordedAt: IsoDateTimeSchema,
    build: z
      .object({
        buildId: SafeBuildIdSchema,
        schemaVersion: z.string().min(1),
        modelVersion: z.string().min(1),
        generatedAt: IsoDateTimeSchema,
        publishedAt: IsoDateTimeSchema,
        status: z.literal("healthy"),
        publicationDecision: z.literal("publish"),
      })
      .strict(),
    source: DashboardSourceSchema,
    artifacts: z.array(EvidenceArtifactReceiptSchema).length(3),
    scoring: ScoringSummarySchema,
    portfolio: DashboardPortfolioSchema,
    benchmark: BenchmarkEvidenceSchema,
    performance: z
      .object({
        status: z.literal("not-computed"),
        reason: z.string().min(1),
      })
      .strict(),
    maturity: z.literal("research-preview"),
    notice: z.string().min(1),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.asOfDate !== value.source.observedAt.slice(0, 10)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Evidence date must match the source observation date.",
        path: ["asOfDate"],
      });
    }

    const artifactNames = value.artifacts.map(({ name }) => name);

    if (
      new Set(artifactNames).size !== 3 ||
      !(["dashboard", "portfolio", "scores"] as const).every((name) => artifactNames.includes(name))
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Daily evidence must receipt dashboard, portfolio, and score artifacts.",
        path: ["artifacts"],
      });
    }

    const receipts = new Map(value.artifacts.map((artifact) => [artifact.name, artifact]));
    const expectedRows = {
      dashboard: 1,
      portfolio: value.portfolio.positions.length,
      scores: value.source.rowCount,
    } as const;

    for (const [name, expectedRowCount] of Object.entries(expectedRows)) {
      if (receipts.get(name as keyof typeof expectedRows)?.rowCount !== expectedRowCount) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Artifact receipt "${name}" row count does not reconcile.`,
          path: ["artifacts"],
        });
      }
    }

    if (
      value.scoring.eligibleSecurities + value.scoring.excludedSecurities !==
        value.source.rowCount ||
      value.portfolio.construction.candidateCount !== value.scoring.eligibleSecurities
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Daily score, source, and portfolio counts do not reconcile.",
        path: ["scoring"],
      });
    }
  });
export type DailyEvidenceRecord = z.infer<typeof DailyEvidenceRecordSchema>;

export const EvidenceReproducibilityReportSchema = z
  .object({
    reportSchemaVersion: z.literal("1.0.0"),
    buildId: SafeBuildIdSchema,
    asOfDate: z.string().date(),
    verifiedAt: IsoDateTimeSchema,
    evidenceRecordPath: z.string().min(1),
    evidenceRecordSha256: Sha256Schema,
    reproductionCommand: z.literal("npm run evidence:generate"),
    checks: z
      .object({
        activePointer: z.literal(true),
        manifestSchema: z.literal(true),
        publicationHealthy: z.literal(true),
        artifactDigests: z.literal(true),
        artifactSchemas: z.literal(true),
        lineage: z.literal(true),
        exactPortfolioWeights: z.literal(true),
        evidenceSchema: z.literal(true),
      })
      .strict(),
    result: z.literal("verified"),
  })
  .strict();
export type EvidenceReproducibilityReport = z.infer<typeof EvidenceReproducibilityReportSchema>;

export const MODEL_VALIDATION_GATES = [
  "software",
  "scoring-parity",
  "portfolio-parity",
  "coverage",
  "portfolio-constraints",
  "benchmark",
  "point-in-time",
  "prospective",
] as const;
export const ModelValidationGateSchema = z.enum(MODEL_VALIDATION_GATES);
export const ModelValidationStatusSchema = z.enum([
  "pass",
  "fail",
  "not-started",
  "insufficient-evidence",
]);

export const ModelCardSchema = z
  .object({
    modelCardSchemaVersion: z.literal("1.0.0"),
    modelVersion: z.string().min(1),
    title: z.string().min(1),
    maturity: z.literal("research-preview"),
    releaseEligible: z.literal(false),
    activeBuildId: SafeBuildIdSchema,
    recordedAt: IsoDateTimeSchema,
    purpose: z.string().min(1),
    intendedUses: z.array(z.string().min(1)).min(1),
    prohibitedUses: z.array(z.string().min(1)).min(1),
    method: z
      .object({
        name: z.literal("weighted-five-pillar"),
        weights: z.record(ScoringPillarSchema, z.number().finite().nonnegative()),
        missingDataPolicy: z.literal("require-complete"),
        minimumCoverage: z.literal(1),
        normalization: z.literal("total-weight"),
      })
      .strict(),
    validation: z
      .array(
        z
          .object({
            gate: ModelValidationGateSchema,
            status: ModelValidationStatusSchema,
            summary: z.string().min(1),
            evidence: z.array(z.string().min(1)),
          })
          .strict(),
      )
      .length(MODEL_VALIDATION_GATES.length),
    limitations: z.array(z.string().min(1)).min(1),
    changePolicy: z.string().min(1),
    source: z
      .object({
        repositoryPath: z.string().min(1),
        sourceCommit: z.string().min(1),
        contentSha256: Sha256Schema,
      })
      .strict(),
    notice: z.string().min(1),
  })
  .strict()
  .superRefine((value, context) => {
    const gates = value.validation.map(({ gate }) => gate);

    if (
      new Set(gates).size !== MODEL_VALIDATION_GATES.length ||
      value.validation.some(({ gate }, index) => gate !== MODEL_VALIDATION_GATES[index])
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Model validation gates must appear exactly once in canonical order.",
        path: ["validation"],
      });
    }

    const weightKeys = Object.keys(value.method.weights);
    const weightTotal = Object.values(value.method.weights).reduce(
      (sum, weight) => sum + weight,
      0,
    );

    if (
      weightKeys.length !== SCORING_PILLARS.length ||
      !SCORING_PILLARS.every((pillar) => weightKeys.includes(pillar)) ||
      Math.abs(weightTotal - 1) > 1e-12
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Model-card weights must cover every pillar and total one.",
        path: ["method", "weights"],
      });
    }
  });
export type ModelCard = z.infer<typeof ModelCardSchema>;

const MetricComponentSchema = z
  .object({
    key: z.string().min(1),
    name: z.string().min(1),
    direction: z.enum(["higher-is-better", "lower-is-better"]),
  })
  .strict();

export const MetricDictionarySchema = z
  .object({
    dictionarySchemaVersion: z.literal("1.0.0"),
    modelVersion: z.string().min(1),
    source: z
      .object({
        repositoryPath: z.string().min(1),
        sourceCommit: z.string().min(1),
        contentSha256: Sha256Schema,
      })
      .strict(),
    methodologyStatus: z.literal("component-list-preserved-transform-formulas-unavailable"),
    pillars: z
      .array(
        z
          .object({
            pillar: ScoringPillarSchema,
            displayName: z.string().min(1),
            sourceField: z.string().min(1),
            weight: z.number().finite().nonnegative(),
            interpretation: z.string().min(1),
            components: z.array(MetricComponentSchema).min(1),
          })
          .strict(),
      )
      .length(SCORING_PILLARS.length),
    derivedMetrics: z
      .array(
        z
          .object({
            key: z.string().min(1),
            name: z.string().min(1),
            definition: z.string().min(1),
            unit: z.string().min(1),
          })
          .strict(),
      )
      .min(1),
    caveat: z.string().min(1),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.pillars.some(({ pillar }, index) => pillar !== SCORING_PILLARS[index])) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Metric dictionary pillars must use canonical scoring order.",
        path: ["pillars"],
      });
    }

    const componentKeys = value.pillars.flatMap(({ components }) =>
      components.map(({ key }) => key),
    );

    if (new Set(componentKeys).size !== componentKeys.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Metric component keys must be unique.",
        path: ["pillars"],
      });
    }
  });
export type MetricDictionary = z.infer<typeof MetricDictionarySchema>;

export const V2MetricMetadataSchema = z
  .object({
    source_commit: z.string().min(1),
    default_preset: z.string().min(1),
    pillars: z.array(z.string().min(1)).length(SCORING_PILLARS.length),
    presets: z.record(
      z.object({
        weights: z.record(z.string(), z.number().finite().nonnegative()),
      }),
    ),
    pillar_metrics: z.record(
      z.array(
        z.object({
          key: z.string().min(1),
          name: z.string().min(1),
          higher_is_better: z.boolean(),
        }),
      ),
    ),
  })
  .passthrough();
export type V2MetricMetadata = z.infer<typeof V2MetricMetadataSchema>;

export const DataQualityReportSchema = z
  .object({
    reportSchemaVersion: z.literal("1.0.0"),
    buildId: SafeBuildIdSchema,
    modelVersion: z.string().min(1),
    recordedAt: IsoDateTimeSchema,
    quality: z
      .object({
        status: z.enum(["pass", "warn", "fail"]),
        rowCount: z.number().int().positive(),
        uniqueTickerCount: z.number().int().nonnegative(),
        duplicateTickers: z.array(z.string().min(1)),
        invalidPriceCount: z.number().int().nonnegative(),
        invalidMarketCapCount: z.number().int().nonnegative(),
        eligibleSecurities: z.number().int().nonnegative(),
        excludedSecurities: z.number().int().nonnegative(),
        factorCoverage: z.array(FactorCoverageSchema).length(SCORING_PILLARS.length),
        scoreDistribution: z
          .object({
            count: z.number().int().positive(),
            minimum: z.number().finite(),
            maximum: z.number().finite(),
            mean: z.number().finite(),
            median: z.number().finite(),
          })
          .strict(),
        portfolio: z
          .object({
            positionCount: z.number().int().positive(),
            totalWeightUnits: z.number().int().positive(),
            weightScale: z.number().int().positive(),
            reconciled: z.boolean(),
          })
          .strict(),
      })
      .strict(),
    drift: z.discriminatedUnion("status", [
      z
        .object({
          status: z.literal("insufficient-history"),
          availableBuilds: z.literal(1),
          requiredBuilds: z.number().int().min(2),
          baselineBuildId: z.null(),
          comparisons: z.array(z.never()).length(0),
          reason: z.string().min(1),
        })
        .strict(),
      z
        .object({
          status: z.literal("evaluated"),
          availableBuilds: z.number().int().min(2),
          requiredBuilds: z.number().int().min(2),
          baselineBuildId: SafeBuildIdSchema,
          comparisons: z
            .array(
              z
                .object({
                  metric: z.string().min(1),
                  current: z.number().finite(),
                  baseline: z.number().finite(),
                  absoluteChange: z.number().finite(),
                })
                .strict(),
            )
            .min(1),
          reason: z.null(),
        })
        .strict(),
    ]),
    notice: z.string().min(1),
  })
  .strict()
  .superRefine((value, context) => {
    const quality = value.quality;
    const countsReconcile =
      quality.uniqueTickerCount + quality.duplicateTickers.length === quality.rowCount &&
      quality.eligibleSecurities + quality.excludedSecurities === quality.rowCount &&
      quality.scoreDistribution.count === quality.eligibleSecurities;
    const passConditions =
      countsReconcile &&
      quality.duplicateTickers.length === 0 &&
      quality.invalidPriceCount === 0 &&
      quality.invalidMarketCapCount === 0 &&
      quality.portfolio.reconciled;

    if (!countsReconcile || (quality.status === "pass" && !passConditions)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Quality counts or pass status do not reconcile.",
        path: ["quality"],
      });
    }
  });
export type DataQualityReport = z.infer<typeof DataQualityReportSchema>;

const SecurityMasterTickerSchema = z.string().regex(/^[A-Z][A-Z0-9.-]{0,9}$/);

export const SecurityMasterEntrySchema = z
  .object({
    securityId: z.string().regex(/^AKR-TICKER:[A-Z][A-Z0-9.-]{0,9}$/),
    identifierStatus: z.literal("provisional-ticker-derived"),
    currentTicker: SecurityMasterTickerSchema,
    tickerEvidence: z
      .array(
        z
          .object({
            ticker: SecurityMasterTickerSchema,
            observedOn: z.string().date(),
            sourceRecordSha256: Sha256Schema,
          })
          .strict(),
      )
      .length(1),
    name: z.string().trim().min(1),
    sector: z.string().trim().min(1),
    industry: z.string().trim().min(1),
    observationStatus: z.literal("present-in-snapshot"),
    permanentIdentifiers: z
      .object({
        cik: z.null(),
        cusip: z.null(),
        isin: z.null(),
        lei: z.null(),
      })
      .strict(),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.securityId !== `AKR-TICKER:${value.currentTicker}`) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Provisional security ID must match its current ticker.",
        path: ["securityId"],
      });
    }

    if (value.tickerEvidence[0]?.ticker !== value.currentTicker) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Current ticker must match the single observed ticker.",
        path: ["tickerEvidence"],
      });
    }
  });
export type SecurityMasterEntry = z.infer<typeof SecurityMasterEntrySchema>;

export const SecurityMasterSchema = z
  .object({
    securityMasterSchemaVersion: z.literal("1.0.0"),
    buildId: SafeBuildIdSchema,
    recordedAt: IsoDateTimeSchema,
    asOfDate: z.string().date(),
    status: z.literal("provisional"),
    source: DashboardSourceSchema,
    identityPolicy: z
      .object({
        securityIdMethod: z.literal("ticker-prefix-v1"),
        identifierBasis: z.literal("current-ticker-only"),
        permanentIdentifiersAvailable: z.literal(false),
        tickerHistoryAvailable: z.literal(false),
        tickerReuseProtection: z.literal("unavailable"),
      })
      .strict(),
    coverage: z
      .object({
        securityCount: z.number().int().positive(),
        uniqueSecurityIdCount: z.number().int().positive(),
        uniqueCurrentTickerCount: z.number().int().positive(),
        provisionalIdentityCount: z.number().int().positive(),
        permanentIdentifierCount: z.literal(0),
        duplicateSecurityIds: z.array(z.string().min(1)).length(0),
        duplicateCurrentTickers: z.array(z.string().min(1)).length(0),
      })
      .strict(),
    securities: z.array(SecurityMasterEntrySchema).min(1),
    limitations: z.array(z.string().min(1)).min(3),
    notice: z.string().min(1),
  })
  .strict()
  .superRefine((value, context) => {
    const securityIds = value.securities.map(({ securityId }) => securityId);
    const tickers = value.securities.map(({ currentTicker }) => currentTicker);
    const canonicalTickers = [...tickers].sort((left, right) => left.localeCompare(right));
    const countsReconcile =
      value.coverage.securityCount === value.securities.length &&
      value.coverage.uniqueSecurityIdCount === new Set(securityIds).size &&
      value.coverage.uniqueCurrentTickerCount === new Set(tickers).size &&
      value.coverage.provisionalIdentityCount === value.securities.length &&
      value.source.rowCount === value.securities.length;

    if (
      !countsReconcile ||
      value.coverage.uniqueSecurityIdCount !== value.coverage.securityCount ||
      value.coverage.uniqueCurrentTickerCount !== value.coverage.securityCount
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Security-master coverage and identity counts must reconcile.",
        path: ["coverage"],
      });
    }

    if (
      value.asOfDate !== value.source.observedAt.slice(0, 10) ||
      value.securities.some(
        ({ tickerEvidence }) => tickerEvidence[0]?.observedOn !== value.asOfDate,
      )
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Security-master observations must match the source date.",
        path: ["asOfDate"],
      });
    }

    if (tickers.some((ticker, index) => ticker !== canonicalTickers[index])) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Security-master entries must be ordered by current ticker.",
        path: ["securities"],
      });
    }
  });
export type SecurityMaster = z.infer<typeof SecurityMasterSchema>;

export const MATURITY_LEVELS = [
  "development",
  "research-preview",
  "validation-candidate",
  "release-candidate",
  "production-approved",
] as const;
export const MaturityLevelSchema = z.enum(MATURITY_LEVELS);
export type MaturityLevel = z.infer<typeof MaturityLevelSchema>;

const MaturityRequirementSchema = z
  .object({
    key: z.string().min(1),
    status: z.enum(["pass", "blocked"]),
    detail: z.string().min(1),
    evidence: z.array(z.string().min(1)).min(1),
  })
  .strict();

export const MaturityAssessmentSchema = z
  .object({
    maturitySchemaVersion: z.literal("1.0.0"),
    buildId: SafeBuildIdSchema,
    modelVersion: z.string().min(1),
    assessedAt: IsoDateTimeSchema,
    currentLevel: MaturityLevelSchema,
    releaseEligible: z.boolean(),
    observations: z
      .object({
        immutableDailyBuilds: z.number().int().positive(),
        requiredDailyBuilds: z.number().int().min(30),
        qualityStatus: z.enum(["pass", "warn", "fail"]),
        driftStatus: z.enum(["insufficient-history", "evaluated"]),
        securityMasterStatus: z.literal("provisional"),
        permanentIdentifierCount: z.literal(0),
        modelValidationPasses: z.number().int().nonnegative(),
        modelValidationTotal: z.number().int().positive(),
      })
      .strict(),
    levels: z
      .array(
        z
          .object({
            level: MaturityLevelSchema,
            status: z.enum(["achieved", "current", "blocked"]),
            requirements: z.array(MaturityRequirementSchema).min(1),
          })
          .strict(),
      )
      .length(MATURITY_LEVELS.length),
    blockers: z.array(z.string().min(1)),
    cutover: z
      .object({
        authorized: z.boolean(),
        status: z.enum(["not-authorized", "authorized"]),
        reason: z.string().min(1),
      })
      .strict(),
    notice: z.string().min(1),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.levels.some(({ level }, index) => level !== MATURITY_LEVELS[index])) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Maturity levels must appear exactly once in canonical order.",
        path: ["levels"],
      });
    }

    const currentIndexes = value.levels
      .map(({ status }, index) => (status === "current" ? index : -1))
      .filter((index) => index >= 0);
    const currentIndex = MATURITY_LEVELS.indexOf(value.currentLevel);

    if (
      currentIndexes.length !== 1 ||
      currentIndexes[0] !== currentIndex ||
      value.levels.some(({ status }, index) =>
        index < currentIndex
          ? status !== "achieved"
          : index > currentIndex
            ? status !== "blocked"
            : status !== "current",
      )
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Maturity level statuses must reconcile with the current level.",
        path: ["levels"],
      });
    }

    const expectedReleaseEligible = currentIndex >= MATURITY_LEVELS.indexOf("release-candidate");
    if (value.releaseEligible !== expectedReleaseEligible) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Release eligibility must follow the assessed maturity level.",
        path: ["releaseEligible"],
      });
    }

    if (
      value.cutover.authorized !== (value.cutover.status === "authorized") ||
      (value.currentLevel === "production-approved" && !value.cutover.authorized)
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Production approval requires explicit cutover authorization.",
        path: ["cutover"],
      });
    }

    const expectedBlockers = value.levels
      .filter(({ status }) => status === "blocked")
      .flatMap(({ requirements }) =>
        requirements.filter(({ status }) => status === "blocked").map(({ detail }) => detail),
      );
    if (
      value.blockers.length !== expectedBlockers.length ||
      value.blockers.some((blocker, index) => blocker !== expectedBlockers[index])
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Top-level blockers must match blocked maturity requirements.",
        path: ["blockers"],
      });
    }
  });
export type MaturityAssessment = z.infer<typeof MaturityAssessmentSchema>;

export const POINT_IN_TIME_CONTROL_KEYS = [
  "snapshot-inventory",
  "snapshot-input-validity",
  "availability-timestamps",
  "point-in-time-fundamentals",
  "survivorship-universe",
  "permanent-identity-history",
  "delistings-ticker-history",
  "corporate-actions",
  "benchmark-series",
  "execution-costs",
  "walk-forward-design",
] as const;
export const PointInTimeControlKeySchema = z.enum(POINT_IN_TIME_CONTROL_KEYS);

const HistoricalSnapshotArtifactSchema = z
  .object({
    floorBillions: z.union([z.literal(0), z.literal(10)]),
    path: z.string().min(1),
    sha256: Sha256Schema,
    rowCount: z.number().int().positive(),
    strictInputContractStatus: z.enum(["pass", "fail"]),
    strictInputIssueCount: z.number().int().nonnegative(),
    strictInputIssues: z
      .array(
        z
          .object({
            path: z.string().min(1),
            message: z.string().min(1),
          })
          .strict(),
      )
      .max(50),
  })
  .strict()
  .superRefine((value, context) => {
    if (
      (value.strictInputContractStatus === "pass" && value.strictInputIssueCount !== 0) ||
      (value.strictInputContractStatus === "fail" && value.strictInputIssueCount === 0) ||
      value.strictInputIssueCount !== value.strictInputIssues.length
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Strict input status and issue count must reconcile.",
        path: ["strictInputContractStatus"],
      });
    }
  });

const HistoricalSnapshotInventorySchema = z
  .object({
    snapshotId: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
    label: z.string().min(1),
    metadataPath: z.string().min(1),
    metadataSha256: Sha256Schema,
    declaredGeneratedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/),
    timestampStatus: z.literal("timezone-unspecified"),
    sourceCommit: z.string().regex(/^[a-f0-9]{7,40}$/),
    observationKind: z.literal("cross-sectional-research-snapshot"),
    pointInTimeEligible: z.literal(false),
    artifacts: z.array(HistoricalSnapshotArtifactSchema).length(2),
    limitation: z.string().min(1),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.artifacts[0]?.floorBillions !== 0 || value.artifacts[1]?.floorBillions !== 10) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Historical snapshot artifacts must use canonical 0 and 10 billion floors.",
        path: ["artifacts"],
      });
    }
  });

const PointInTimeControlSchema = z
  .object({
    key: PointInTimeControlKeySchema,
    status: z.enum(["pass", "blocked"]),
    detail: z.string().min(1),
    evidence: z.array(z.string().min(1)).min(1),
  })
  .strict();

export const HistoricalReadinessReportSchema = z
  .object({
    historicalReadinessSchemaVersion: z.literal("1.0.0"),
    buildId: SafeBuildIdSchema,
    modelVersion: z.string().min(1),
    assessedAt: IsoDateTimeSchema,
    status: z.literal("blocked"),
    historicalValidationEligible: z.literal(false),
    inventory: z
      .object({
        snapshotCount: z.number().int().min(2),
        crossSectionOnly: z.literal(true),
        earliestDeclaredGeneratedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/),
        latestDeclaredGeneratedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/),
      })
      .strict(),
    snapshots: z.array(HistoricalSnapshotInventorySchema).min(2),
    controls: z.array(PointInTimeControlSchema).length(POINT_IN_TIME_CONTROL_KEYS.length),
    blockers: z.array(z.string().min(1)).min(1),
    conclusion: z.string().min(1),
    notice: z.string().min(1),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.controls.some(({ key }, index) => key !== POINT_IN_TIME_CONTROL_KEYS[index])) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Point-in-time controls must appear exactly once in canonical order.",
        path: ["controls"],
      });
    }

    if (
      value.controls[0]?.status !== "pass" ||
      value.controls.slice(1).some(({ status }) => status !== "blocked")
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "Schema 1.0.0 permits snapshot inventory only; every validation-readiness control must remain blocked.",
        path: ["controls"],
      });
    }

    const expectedBlockers = value.controls
      .filter(({ status }) => status === "blocked")
      .map(({ detail }) => detail);
    const declaredTimes = value.snapshots.map(({ declaredGeneratedAt }) => declaredGeneratedAt);

    if (
      value.inventory.snapshotCount !== value.snapshots.length ||
      value.inventory.earliestDeclaredGeneratedAt !== [...declaredTimes].sort()[0] ||
      value.inventory.latestDeclaredGeneratedAt !== [...declaredTimes].sort().at(-1)
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Historical snapshot inventory counts and dates must reconcile.",
        path: ["inventory"],
      });
    }

    if (
      value.blockers.length !== expectedBlockers.length ||
      value.blockers.some((blocker, index) => blocker !== expectedBlockers[index])
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Historical blockers must match blocked point-in-time controls.",
        path: ["blockers"],
      });
    }
  });
export type HistoricalReadinessReport = z.infer<typeof HistoricalReadinessReportSchema>;

const SecTickerSchema = z.string().trim().min(1).max(20);
const SecMutualFundSymbolSchema = z.string().trim().max(20);
const SecCikSchema = z.string().regex(/^\d{10}$/);
const SecSeriesIdSchema = z.string().regex(/^S\d{9}$/);
const SecClassIdSchema = z.string().regex(/^C\d{9}$/);

export const SecCompanyTickerAssociationsSchema = z.record(
  z
    .object({
      cik_str: z.number().int().nonnegative(),
      ticker: SecTickerSchema,
      title: z.string().trim().min(1),
    })
    .strict(),
);

export const SecMutualFundTickerAssociationsSchema = z
  .object({
    fields: z.tuple([
      z.literal("cik"),
      z.literal("seriesId"),
      z.literal("classId"),
      z.literal("symbol"),
    ]),
    data: z
      .array(
        z.tuple([
          z.number().int().nonnegative(),
          SecSeriesIdSchema,
          SecClassIdSchema,
          SecMutualFundSymbolSchema,
        ]),
      )
      .min(1),
  })
  .strict();

const SecSourceKindSchema = z.enum(["company-tickers", "mutual-fund-tickers"]);

export const SecIdentitySourceReceiptSchema = z
  .object({
    receiptSchemaVersion: z.literal("1.0.0"),
    snapshotId: z.string().date(),
    retrievedAt: IsoDateTimeSchema,
    sourcePolicy: z
      .object({
        provider: z.literal("U.S. Securities and Exchange Commission"),
        access: z.literal("public-no-api-key"),
        declaredUserAgent: z.literal(true),
        maxRequestsPerSecond: z.literal(10),
        accuracyGuarantee: z.literal("not-guaranteed-by-provider"),
      })
      .strict(),
    sources: z
      .array(
        z
          .object({
            kind: SecSourceKindSchema,
            uri: z.string().url(),
            path: z.string().min(1),
            retrievedAt: IsoDateTimeSchema,
            lastModifiedAt: IsoDateTimeSchema,
            sha256: Sha256Schema,
            byteSize: z.number().int().positive(),
            recordCount: z.number().int().positive(),
          })
          .strict(),
      )
      .length(2),
  })
  .strict()
  .superRefine((value, context) => {
    if (
      value.sources[0]?.kind !== "company-tickers" ||
      value.sources[1]?.kind !== "mutual-fund-tickers" ||
      value.sources[0]?.uri !== "https://www.sec.gov/files/company_tickers.json" ||
      value.sources[1]?.uri !== "https://www.sec.gov/files/company_tickers_mf.json" ||
      value.sources.some(({ retrievedAt }) => retrievedAt !== value.retrievedAt)
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "SEC identity sources must use official canonical URIs, canonical order, and one retrieval time.",
        path: ["sources"],
      });
    }
  });
export type SecIdentitySourceReceipt = z.infer<typeof SecIdentitySourceReceiptSchema>;

const SecRegistrantCompanyMatchSchema = z
  .object({
    ticker: SecurityMasterTickerSchema,
    provisionalSecurityId: z.string().regex(/^AKR-TICKER:[A-Z][A-Z0-9.-]{0,9}$/),
    sourceType: z.literal("company-ticker"),
    matchMethod: z.literal("exact-current-ticker"),
    cik: SecCikSchema,
    secTitle: z.string().trim().min(1),
    seriesId: z.null(),
    classId: z.null(),
    identityScope: z.literal("registrant-only"),
  })
  .strict();

const SecRegistrantFundMatchSchema = z
  .object({
    ticker: SecurityMasterTickerSchema,
    provisionalSecurityId: z.string().regex(/^AKR-TICKER:[A-Z][A-Z0-9.-]{0,9}$/),
    sourceType: z.literal("mutual-fund-class"),
    matchMethod: z.literal("exact-current-ticker"),
    cik: SecCikSchema,
    secTitle: z.null(),
    seriesId: SecSeriesIdSchema,
    classId: SecClassIdSchema,
    identityScope: z.literal("registered-fund-class"),
  })
  .strict();

export const SecRegistrantMatchSchema = z.discriminatedUnion("sourceType", [
  SecRegistrantCompanyMatchSchema,
  SecRegistrantFundMatchSchema,
]);

export const SecRegistrantCrosswalkSchema = z
  .object({
    crosswalkSchemaVersion: z.literal("1.0.0"),
    buildId: SafeBuildIdSchema,
    modelVersion: z.string().min(1),
    generatedAt: IsoDateTimeSchema,
    status: z.literal("partial-current-snapshot"),
    historicalIdentityEligible: z.literal(false),
    sourceReceipt: z
      .object({
        path: z.string().min(1),
        sha256: Sha256Schema,
        snapshotId: z.string().date(),
        retrievedAt: IsoDateTimeSchema,
      })
      .strict(),
    coverage: z
      .object({
        activeSecurityCount: z.number().int().positive(),
        matchedSecurityCount: z.number().int().positive(),
        unmatchedSecurityCount: z.number().int().positive(),
        ambiguousSecurityCount: z.literal(0),
        operatingCompanyCount: z.number().int().positive(),
        companyCikMatchCount: z.number().int().positive(),
        registeredFundCount: z.number().int().positive(),
        fundClassMatchCount: z.number().int().positive(),
        uniqueCikCount: z.number().int().positive(),
        registrantCoverage: z.number().min(0).max(1),
        companyCikCoverage: z.number().min(0).max(1),
        fundClassCoverage: z.number().min(0).max(1),
        operatingCompanyListingIdentityCoverage: z.literal(0),
      })
      .strict(),
    matches: z.array(SecRegistrantMatchSchema).min(1),
    unmatched: z
      .array(
        z
          .object({
            ticker: SecurityMasterTickerSchema,
            provisionalSecurityId: z.string().regex(/^AKR-TICKER:[A-Z][A-Z0-9.-]{0,9}$/),
            expectedSource: z.enum(["company-tickers", "mutual-fund-tickers"]),
            reason: z.literal("no-exact-current-ticker-match"),
          })
          .strict(),
      )
      .min(1),
    limitations: z.array(z.string().min(1)).min(4),
    notice: z.string().min(1),
  })
  .strict()
  .superRefine((value, context) => {
    const companyMatches = value.matches.filter(
      ({ sourceType }) => sourceType === "company-ticker",
    );
    const fundMatches = value.matches.filter(
      ({ sourceType }) => sourceType === "mutual-fund-class",
    );
    const unmatchedCompanies = value.unmatched.filter(
      ({ expectedSource }) => expectedSource === "company-tickers",
    );
    const unmatchedFunds = value.unmatched.filter(
      ({ expectedSource }) => expectedSource === "mutual-fund-tickers",
    );
    const tickers = value.matches.map(({ ticker }) => ticker);
    const unmatchedTickers = value.unmatched.map(({ ticker }) => ticker);
    const allTickers = [...tickers, ...unmatchedTickers];
    const canonicalTickers = [...tickers].sort((left, right) => left.localeCompare(right));
    const canonicalUnmatched = [...unmatchedTickers].sort((left, right) =>
      left.localeCompare(right),
    );
    const coverage = value.coverage;
    const countsReconcile =
      value.generatedAt === value.sourceReceipt.retrievedAt &&
      coverage.activeSecurityCount === value.matches.length + value.unmatched.length &&
      coverage.matchedSecurityCount === value.matches.length &&
      coverage.companyCikMatchCount === companyMatches.length &&
      coverage.fundClassMatchCount === fundMatches.length &&
      coverage.unmatchedSecurityCount === value.unmatched.length &&
      coverage.operatingCompanyCount === companyMatches.length + unmatchedCompanies.length &&
      coverage.registeredFundCount === fundMatches.length + unmatchedFunds.length &&
      coverage.activeSecurityCount ===
        coverage.operatingCompanyCount + coverage.registeredFundCount &&
      coverage.uniqueCikCount === new Set(value.matches.map(({ cik }) => cik)).size &&
      coverage.registrantCoverage ===
        coverage.matchedSecurityCount / coverage.activeSecurityCount &&
      coverage.companyCikCoverage ===
        coverage.companyCikMatchCount / coverage.operatingCompanyCount &&
      coverage.fundClassCoverage === coverage.fundClassMatchCount / coverage.registeredFundCount;

    if (!countsReconcile || new Set(allTickers).size !== allTickers.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "SEC registrant coverage and match counts must reconcile.",
        path: ["coverage"],
      });
    }

    if (
      tickers.some((ticker, index) => ticker !== canonicalTickers[index]) ||
      unmatchedTickers.some((ticker, index) => ticker !== canonicalUnmatched[index]) ||
      value.matches.some(
        ({ ticker, provisionalSecurityId }) => provisionalSecurityId !== `AKR-TICKER:${ticker}`,
      ) ||
      value.unmatched.some(
        ({ ticker, provisionalSecurityId }) => provisionalSecurityId !== `AKR-TICKER:${ticker}`,
      )
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "SEC registrant matches must use canonical ticker order and research IDs.",
        path: ["matches"],
      });
    }
  });
export type SecRegistrantCrosswalk = z.infer<typeof SecRegistrantCrosswalkSchema>;

const SecAccessionNumberSchema = z.string().regex(/^\d{10}-\d{2}-\d{6}$/);

export const SecSubmissionHistorySchema = z
  .object({
    cik: SecCikSchema,
    name: z.string().trim().min(1),
    tickers: z.array(SecTickerSchema),
    exchanges: z.array(z.string()),
    filings: z
      .object({
        recent: z
          .object({
            accessionNumber: z.array(SecAccessionNumberSchema).min(1),
            filingDate: z.array(z.string().date()).min(1),
            reportDate: z.array(z.union([z.string().date(), z.literal("")])).min(1),
            acceptanceDateTime: z.array(IsoDateTimeSchema).min(1),
            form: z.array(z.string().trim().min(1)).min(1),
            primaryDocument: z.array(z.string()).min(1),
          })
          .passthrough(),
      })
      .passthrough(),
  })
  .passthrough()
  .superRefine((value, context) => {
    const recent = value.filings.recent;
    const expected = recent.accessionNumber.length;
    const aligned = [
      recent.filingDate,
      recent.reportDate,
      recent.acceptanceDateTime,
      recent.form,
      recent.primaryDocument,
    ].every(({ length }) => length === expected);

    if (!aligned) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "SEC submission recent-filing columns must have equal lengths.",
        path: ["filings", "recent"],
      });
    }
  });
export type SecSubmissionHistory = z.infer<typeof SecSubmissionHistorySchema>;

export const SecSubmissionSourceReceiptSchema = z
  .object({
    receiptSchemaVersion: z.literal("1.0.0"),
    snapshotId: z.string().date(),
    retrievedAt: IsoDateTimeSchema,
    sourcePolicy: z
      .object({
        provider: z.literal("U.S. Securities and Exchange Commission"),
        api: z.literal("EDGAR Submissions"),
        access: z.literal("public-no-api-key"),
        declaredUserAgent: z.literal(true),
        maxRequestsPerSecond: z.literal(10),
        updateSchedule: z.literal("real-time-as-disseminated"),
      })
      .strict(),
    sources: z
      .array(
        z
          .object({
            cik: SecCikSchema,
            uri: z.string().url(),
            path: z.string().min(1),
            retrievedAt: IsoDateTimeSchema,
            sha256: Sha256Schema,
            byteSize: z.number().int().positive(),
            recentFilingCount: z.number().int().positive(),
          })
          .strict(),
      )
      .min(1),
  })
  .strict()
  .superRefine((value, context) => {
    const ciks = value.sources.map(({ cik }) => cik);
    const canonical = [...ciks].sort((left, right) => left.localeCompare(right));
    const sourcesValid = value.sources.every(
      ({ cik, uri, retrievedAt }, index) =>
        cik === canonical[index] &&
        uri === `https://data.sec.gov/submissions/CIK${cik}.json` &&
        retrievedAt === value.retrievedAt,
    );

    if (!sourcesValid || new Set(ciks).size !== ciks.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "SEC submission sources must use unique canonical CIKs and official URIs.",
        path: ["sources"],
      });
    }
  });
export type SecSubmissionSourceReceipt = z.infer<typeof SecSubmissionSourceReceiptSchema>;

const FilingAvailabilityRecordSchema = z
  .object({
    accessionNumber: SecAccessionNumberSchema,
    form: z.enum(["10-K", "10-K/A", "10-Q", "10-Q/A", "8-K", "8-K/A"]),
    filingDate: z.string().date(),
    reportDate: z.string().date().nullable(),
    acceptedAt: IsoDateTimeSchema,
    primaryDocument: z.string(),
    availabilityBasis: z.literal("edgar-acceptance-time"),
    eligibleAtCutoff: z.literal(true),
  })
  .strict();

export const FilingAvailabilityReportSchema = z
  .object({
    reportSchemaVersion: z.literal("1.0.0"),
    buildId: SafeBuildIdSchema,
    modelVersion: z.string().min(1),
    generatedAt: IsoDateTimeSchema,
    decisionCutoffAt: IsoDateTimeSchema,
    status: z.literal("partial-retrospective-metadata"),
    historicalValidationEligible: z.literal(false),
    sourceReceipt: z
      .object({
        path: z.string().min(1),
        sha256: Sha256Schema,
        snapshotId: z.string().date(),
        retrievedAt: IsoDateTimeSchema,
      })
      .strict(),
    selection: z
      .object({
        policy: z.literal("dashboard-top-scores-and-active-portfolio"),
        topScoreTickerCount: z.number().int().positive(),
        portfolioTickerCount: z.number().int().positive(),
        selectedTickerCount: z.number().int().positive(),
        submissionHistoryCount: z.number().int().positive(),
        unmatchedTickerCount: z.number().int().nonnegative(),
      })
      .strict(),
    entries: z
      .array(
        z
          .object({
            ticker: SecurityMasterTickerSchema,
            provisionalSecurityId: z.string().regex(/^AKR-TICKER:[A-Z][A-Z0-9.-]{0,9}$/),
            cik: SecCikSchema,
            secName: z.string().trim().min(1),
            tickerPresentInSubmission: z.boolean(),
            latestPeriodic: FilingAvailabilityRecordSchema.nullable(),
            latestCurrent: FilingAvailabilityRecordSchema.nullable(),
            filingsAfterCutoffExcluded: z.number().int().nonnegative(),
          })
          .strict(),
      )
      .min(1),
    unmatched: z.array(
      z
        .object({
          ticker: SecurityMasterTickerSchema,
          reason: z.literal("no-exact-sec-registrant-match"),
        })
        .strict(),
    ),
    coverage: z
      .object({
        selectedTickerCount: z.number().int().positive(),
        submissionHistoryCount: z.number().int().positive(),
        tickerVerifiedCount: z.number().int().nonnegative(),
        periodicFilingAvailableCount: z.number().int().nonnegative(),
        currentFilingAvailableCount: z.number().int().nonnegative(),
        excludedPostCutoffFilingCount: z.number().int().nonnegative(),
        submissionCoverage: z.number().min(0).max(1),
      })
      .strict(),
    limitations: z.array(z.string().min(1)).min(4),
    notice: z.string().min(1),
  })
  .strict()
  .superRefine((value, context) => {
    const entryTickers = value.entries.map(({ ticker }) => ticker);
    const unmatchedTickers = value.unmatched.map(({ ticker }) => ticker);
    const allTickers = [...entryTickers, ...unmatchedTickers];
    const sortedEntries = [...entryTickers].sort((left, right) => left.localeCompare(right));
    const sortedUnmatched = [...unmatchedTickers].sort((left, right) => left.localeCompare(right));
    const acceptedAtOrBeforeCutoff = value.entries.every(({ latestPeriodic, latestCurrent }) =>
      [latestPeriodic, latestCurrent]
        .filter((filing) => filing !== null)
        .every((filing) => Date.parse(filing.acceptedAt) <= Date.parse(value.decisionCutoffAt)),
    );
    const coverage = value.coverage;
    const countsReconcile =
      value.generatedAt === value.sourceReceipt.retrievedAt &&
      value.selection.selectedTickerCount === allTickers.length &&
      value.selection.submissionHistoryCount === value.entries.length &&
      value.selection.unmatchedTickerCount === value.unmatched.length &&
      coverage.selectedTickerCount === allTickers.length &&
      coverage.submissionHistoryCount === value.entries.length &&
      coverage.tickerVerifiedCount ===
        value.entries.filter(({ tickerPresentInSubmission }) => tickerPresentInSubmission).length &&
      coverage.periodicFilingAvailableCount ===
        value.entries.filter(({ latestPeriodic }) => latestPeriodic !== null).length &&
      coverage.currentFilingAvailableCount ===
        value.entries.filter(({ latestCurrent }) => latestCurrent !== null).length &&
      coverage.excludedPostCutoffFilingCount ===
        value.entries.reduce(
          (count, { filingsAfterCutoffExcluded }) => count + filingsAfterCutoffExcluded,
          0,
        ) &&
      coverage.submissionCoverage === value.entries.length / allTickers.length;

    if (
      !countsReconcile ||
      !acceptedAtOrBeforeCutoff ||
      new Set(allTickers).size !== allTickers.length
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Filing availability coverage, cutoff eligibility, and counts must reconcile.",
        path: ["coverage"],
      });
    }

    if (
      entryTickers.some((ticker, index) => ticker !== sortedEntries[index]) ||
      unmatchedTickers.some((ticker, index) => ticker !== sortedUnmatched[index]) ||
      value.entries.some(
        ({ ticker, provisionalSecurityId }) => provisionalSecurityId !== `AKR-TICKER:${ticker}`,
      )
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Filing availability records must use canonical ticker order and research IDs.",
        path: ["entries"],
      });
    }
  });
export type FilingAvailabilityReport = z.infer<typeof FilingAvailabilityReportSchema>;

const UNIVERSE_MEMBERSHIP_CONTROL_KEYS = [
  "snapshot-membership-observed",
  "eligibility-rules",
  "membership-effective-intervals",
  "identity-continuity",
  "delisting-evidence",
  "survivorship-bias-control",
] as const;

export const UniverseMembershipReadinessSchema = z
  .object({
    reportSchemaVersion: z.literal("1.0.0"),
    buildId: SafeBuildIdSchema,
    modelVersion: z.string().min(1),
    assessedAt: IsoDateTimeSchema,
    status: z.literal("observed-change-not-survivorship-controlled"),
    survivorshipBiasControlled: z.literal(false),
    historicalValidationEligible: z.literal(false),
    comparison: z
      .object({
        earlierSnapshotId: z.literal("june-oracle"),
        laterSnapshotId: z.literal("july-baseline"),
        earlierTickerCount: z.number().int().positive(),
        laterTickerCount: z.number().int().positive(),
        continuingTickerCount: z.number().int().positive(),
        entrantCount: z.number().int().nonnegative(),
        exitCount: z.number().int().nonnegative(),
        unionTickerCount: z.number().int().positive(),
        jaccardContinuity: z.number().min(0).max(1),
        entrantRate: z.number().min(0).max(1),
        exitRate: z.number().min(0).max(1),
        commonTickerClassificationChangeCount: z.number().int().nonnegative(),
      })
      .strict(),
    entrants: z.array(
      z
        .object({
          ticker: SecurityMasterTickerSchema,
          name: z.string().trim().min(1),
          laterMarketCapB: z.number().nonnegative(),
        })
        .strict(),
    ),
    exits: z.array(
      z
        .object({
          ticker: SecurityMasterTickerSchema,
          name: z.string().trim().min(1),
          earlierMarketCapB: z.number().nonnegative(),
        })
        .strict(),
    ),
    controls: z
      .array(
        z
          .object({
            key: z.enum([...UNIVERSE_MEMBERSHIP_CONTROL_KEYS]),
            status: z.enum(["pass", "blocked"]),
            detail: z.string().min(1),
          })
          .strict(),
      )
      .length(6),
    limitations: z.array(z.string().min(1)).min(4),
    notice: z.string().min(1),
  })
  .strict()
  .superRefine((value, context) => {
    const comparison = value.comparison;
    const entrantTickers = value.entrants.map(({ ticker }) => ticker);
    const exitTickers = value.exits.map(({ ticker }) => ticker);
    const canonicalEntrants = [...entrantTickers].sort((left, right) => left.localeCompare(right));
    const canonicalExits = [...exitTickers].sort((left, right) => left.localeCompare(right));
    const tickerSetsValid =
      new Set(entrantTickers).size === entrantTickers.length &&
      new Set(exitTickers).size === exitTickers.length &&
      entrantTickers.every((ticker) => !exitTickers.includes(ticker));
    const countsReconcile =
      comparison.entrantCount === value.entrants.length &&
      comparison.exitCount === value.exits.length &&
      comparison.earlierTickerCount === comparison.continuingTickerCount + comparison.exitCount &&
      comparison.laterTickerCount === comparison.continuingTickerCount + comparison.entrantCount &&
      comparison.unionTickerCount ===
        comparison.continuingTickerCount + comparison.entrantCount + comparison.exitCount &&
      comparison.jaccardContinuity ===
        comparison.continuingTickerCount / comparison.unionTickerCount &&
      comparison.entrantRate === comparison.entrantCount / comparison.laterTickerCount &&
      comparison.exitRate === comparison.exitCount / comparison.earlierTickerCount;
    const controlKeys = value.controls.map(({ key }) => key);
    const controlsValid =
      controlKeys.every((key, index) => key === UNIVERSE_MEMBERSHIP_CONTROL_KEYS[index]) &&
      value.controls[0]?.status === "pass" &&
      value.controls.slice(1).every(({ status }) => status === "blocked");

    if (
      !countsReconcile ||
      comparison.commonTickerClassificationChangeCount > comparison.continuingTickerCount ||
      !tickerSetsValid ||
      !controlsValid
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Universe membership counts and fail-closed controls must reconcile.",
        path: ["comparison"],
      });
    }
    if (
      entrantTickers.some((ticker, index) => ticker !== canonicalEntrants[index]) ||
      exitTickers.some((ticker, index) => ticker !== canonicalExits[index])
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Universe entrants and exits must use canonical ticker order.",
        path: ["entrants"],
      });
    }
  });
export type UniverseMembershipReadiness = z.infer<typeof UniverseMembershipReadinessSchema>;

const CORPORATE_ACTION_CONTROL_KEYS = [
  "receipted-snapshot-prices",
  "split-events",
  "cash-distributions",
  "mergers-spinoffs",
  "delistings",
  "adjusted-total-return-series",
] as const;

export const CorporateActionReadinessSchema = z
  .object({
    reportSchemaVersion: z.literal("1.0.0"),
    buildId: SafeBuildIdSchema,
    modelVersion: z.string().min(1),
    assessedAt: IsoDateTimeSchema,
    status: z.literal("blocked-unverified-adjustments"),
    corporateActionsControlled: z.literal(false),
    historicalValidationEligible: z.literal(false),
    comparison: z
      .object({
        earlierSnapshotId: z.literal("june-oracle"),
        laterSnapshotId: z.literal("july-baseline"),
        commonTickerCount: z.number().int().positive(),
        priceRatioLowerBoundary: z.literal(0.5),
        priceRatioUpperBoundary: z.literal(2),
        impliedSharesRatioLowerBoundary: z.literal(0.5),
        impliedSharesRatioUpperBoundary: z.literal(2),
        stableMarketCapRelativeBand: z.literal(0.15),
      })
      .strict(),
    observations: z
      .array(
        z
          .object({
            ticker: SecurityMasterTickerSchema,
            name: z.string().trim().min(1),
            signal: z.enum([
              "possible-share-count-discontinuity",
              "price-and-market-cap-discontinuity",
            ]),
            earlierPrice: z.number().positive(),
            laterPrice: z.number().positive(),
            priceRatio: z.number().positive(),
            earlierMarketCapB: z.number().positive(),
            laterMarketCapB: z.number().positive(),
            marketCapRatio: z.number().positive(),
            impliedSharesRatio: z.number().positive(),
            verifiedCorporateAction: z.literal(null),
          })
          .strict(),
      )
      .min(1),
    coverage: z
      .object({
        thresholdObservationCount: z.number().int().positive(),
        possibleShareCountDiscontinuityCount: z.number().int().nonnegative(),
        priceAndMarketCapDiscontinuityCount: z.number().int().nonnegative(),
        verifiedCorporateActionCount: z.literal(0),
        verifiedAdjustedSeriesCount: z.literal(0),
      })
      .strict(),
    controls: z
      .array(
        z
          .object({
            key: z.enum([...CORPORATE_ACTION_CONTROL_KEYS]),
            status: z.enum(["pass", "blocked"]),
            detail: z.string().min(1),
          })
          .strict(),
      )
      .length(CORPORATE_ACTION_CONTROL_KEYS.length),
    limitations: z.array(z.string().min(1)).min(4),
    notice: z.string().min(1),
  })
  .strict()
  .superRefine((value, context) => {
    const possibleCount = value.observations.filter(
      ({ signal }) => signal === "possible-share-count-discontinuity",
    ).length;
    const priceAndCapCount = value.observations.length - possibleCount;
    const tickers = value.observations.map(({ ticker }) => ticker);
    const canonicalTickers = [...tickers].sort((left, right) => left.localeCompare(right));
    const controlsValid =
      value.controls.every(({ key }, index) => key === CORPORATE_ACTION_CONTROL_KEYS[index]) &&
      value.controls[0]?.status === "pass" &&
      value.controls.slice(1).every(({ status }) => status === "blocked");
    const observationsValid = value.observations.every((observation) => {
      const priceRatio = observation.laterPrice / observation.earlierPrice;
      const marketCapRatio = observation.laterMarketCapB / observation.earlierMarketCapB;
      const impliedSharesRatio =
        observation.laterMarketCapB /
        observation.laterPrice /
        (observation.earlierMarketCapB / observation.earlierPrice);
      const extremePrice =
        priceRatio <= value.comparison.priceRatioLowerBoundary ||
        priceRatio >= value.comparison.priceRatioUpperBoundary;
      const extremeShares =
        impliedSharesRatio <= value.comparison.impliedSharesRatioLowerBoundary ||
        impliedSharesRatio >= value.comparison.impliedSharesRatioUpperBoundary;
      const stableMarketCap =
        Math.abs(marketCapRatio - 1) <= value.comparison.stableMarketCapRelativeBand;

      return (
        observation.priceRatio === priceRatio &&
        observation.marketCapRatio === marketCapRatio &&
        observation.impliedSharesRatio === impliedSharesRatio &&
        extremePrice &&
        (observation.signal === "possible-share-count-discontinuity"
          ? extremeShares && stableMarketCap
          : !extremeShares && !stableMarketCap)
      );
    });

    if (
      value.coverage.thresholdObservationCount !== value.observations.length ||
      value.coverage.possibleShareCountDiscontinuityCount !== possibleCount ||
      value.coverage.priceAndMarketCapDiscontinuityCount !== priceAndCapCount ||
      new Set(tickers).size !== tickers.length ||
      tickers.some((ticker, index) => ticker !== canonicalTickers[index]) ||
      !controlsValid ||
      !observationsValid
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "Corporate-action observations, coverage, and fail-closed controls must reconcile.",
        path: ["observations"],
      });
    }
  });
export type CorporateActionReadiness = z.infer<typeof CorporateActionReadinessSchema>;

const EXIT_DISPOSITION_CONTROL_KEYS = [
  "current-sec-association",
  "permanent-listing-identity",
  "ticker-effective-intervals",
  "delisting-events",
  "merger-successor-terms",
] as const;

export const ExitDispositionReadinessSchema = z
  .object({
    reportSchemaVersion: z.literal("1.0.0"),
    buildId: SafeBuildIdSchema,
    modelVersion: z.string().min(1),
    assessedAt: IsoDateTimeSchema,
    generatedAt: IsoDateTimeSchema,
    status: z.literal("partial-current-association-not-disposition-history"),
    historicalDelistingControlled: z.literal(false),
    historicalTickerHistoryEligible: z.literal(false),
    sourceReceipt: z
      .object({
        snapshotId: z.string().min(1),
        retrievedAt: IsoDateTimeSchema,
        lastModifiedAt: IsoDateTimeSchema,
        sha256: Sha256Schema,
        byteSize: z.number().int().positive(),
        recordCount: z.number().int().positive(),
      })
      .strict(),
    coverage: z
      .object({
        observedExitCount: z.number().int().positive(),
        currentSecAssociationCount: z.number().int().nonnegative(),
        unmatchedCurrentAssociationCount: z.number().int().nonnegative(),
        historicalDispositionResolvedCount: z.literal(0),
      })
      .strict(),
    entries: z
      .array(
        z
          .object({
            ticker: SecurityMasterTickerSchema,
            snapshotName: z.string().trim().min(1),
            earlierMarketCapB: z.number().positive(),
            currentAssociationStatus: z.enum(["present", "unmatched"]),
            currentSecAssociation: z
              .object({
                cik: z.string().regex(/^\d{10}$/),
                title: z.string().trim().min(1),
              })
              .strict()
              .nullable(),
            historicalDispositionStatus: z.literal("unverified"),
          })
          .strict(),
      )
      .min(1),
    controls: z
      .array(
        z
          .object({
            key: z.enum([...EXIT_DISPOSITION_CONTROL_KEYS]),
            status: z.enum(["pass", "blocked"]),
            detail: z.string().min(1),
          })
          .strict(),
      )
      .length(EXIT_DISPOSITION_CONTROL_KEYS.length),
    limitations: z.array(z.string().min(1)).min(4),
    notice: z.string().min(1),
  })
  .strict()
  .superRefine((value, context) => {
    const presentCount = value.entries.filter(
      ({ currentAssociationStatus }) => currentAssociationStatus === "present",
    ).length;
    const tickers = value.entries.map(({ ticker }) => ticker);
    const sorted = [...tickers].sort((left, right) => left.localeCompare(right));
    const entriesValid = value.entries.every(
      ({ currentAssociationStatus, currentSecAssociation }) =>
        (currentAssociationStatus === "present" && currentSecAssociation !== null) ||
        (currentAssociationStatus === "unmatched" && currentSecAssociation === null),
    );
    const controlsValid =
      value.controls.every(({ key }, index) => key === EXIT_DISPOSITION_CONTROL_KEYS[index]) &&
      value.controls[0]?.status === "pass" &&
      value.controls.slice(1).every(({ status }) => status === "blocked");

    if (
      value.coverage.observedExitCount !== value.entries.length ||
      value.coverage.currentSecAssociationCount !== presentCount ||
      value.coverage.unmatchedCurrentAssociationCount !== value.entries.length - presentCount ||
      new Set(tickers).size !== tickers.length ||
      tickers.some((ticker, index) => ticker !== sorted[index]) ||
      !entriesValid ||
      !controlsValid
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Exit disposition coverage, entries, and fail-closed controls must reconcile.",
        path: ["entries"],
      });
    }
  });
export type ExitDispositionReadiness = z.infer<typeof ExitDispositionReadinessSchema>;

const EXECUTION_COST_CONTROL_KEYS = [
  "exact-target-weights",
  "capital-base",
  "prior-holdings",
  "execution-calendar",
  "executable-prices",
  "liquidity-slippage",
  "fees-taxes",
] as const;

export const ExecutionCostReadinessSchema = z
  .object({
    reportSchemaVersion: z.literal("1.0.0"),
    buildId: SafeBuildIdSchema,
    modelVersion: z.string().min(1),
    generatedAt: IsoDateTimeSchema,
    decisionObservedAt: IsoDateTimeSchema,
    status: z.literal("blocked-no-execution-economics"),
    executionRecorded: z.literal(false),
    netPerformanceEligible: z.literal(false),
    portfolio: z
      .object({
        positionCount: z.number().int().positive(),
        totalTargetWeightUnits: z.number().int().positive(),
        weightScale: z.number().int().positive(),
        capitalBase: z.literal(null),
        priorHoldingsAvailable: z.literal(false),
        assumedExecutionAt: z.literal(null),
        observedExecutionAt: z.literal(null),
        pricedExecutionCount: z.literal(0),
        turnover: z.literal(null),
        grossReturn: z.literal(null),
        transactionCost: z.literal(null),
        netReturn: z.literal(null),
      })
      .strict(),
    targets: z
      .array(
        z
          .object({
            rank: z.number().int().positive(),
            ticker: SecurityMasterTickerSchema,
            sector: z.string().trim().min(1),
            targetWeight: z.number().positive(),
            targetWeightUnits: z.number().int().positive(),
            researchSnapshotPrice: z.number().positive(),
            executionPrice: z.literal(null),
            tradeQuantity: z.literal(null),
            estimatedCost: z.literal(null),
          })
          .strict(),
      )
      .min(1),
    controls: z
      .array(
        z
          .object({
            key: z.enum([...EXECUTION_COST_CONTROL_KEYS]),
            status: z.enum(["pass", "blocked"]),
            detail: z.string().min(1),
          })
          .strict(),
      )
      .length(EXECUTION_COST_CONTROL_KEYS.length),
    limitations: z.array(z.string().min(1)).min(4),
    notice: z.string().min(1),
  })
  .strict()
  .superRefine((value, context) => {
    const units = value.targets.reduce((sum, target) => sum + target.targetWeightUnits, 0);
    const tickers = value.targets.map(({ ticker }) => ticker);
    const targetsValid = value.targets.every(
      ({ rank, targetWeight, targetWeightUnits }, index) =>
        rank === index + 1 && targetWeight === targetWeightUnits / value.portfolio.weightScale,
    );
    const controlsValid =
      value.controls.every(({ key }, index) => key === EXECUTION_COST_CONTROL_KEYS[index]) &&
      value.controls[0]?.status === "pass" &&
      value.controls.slice(1).every(({ status }) => status === "blocked");

    if (
      value.portfolio.positionCount !== value.targets.length ||
      value.portfolio.totalTargetWeightUnits !== units ||
      new Set(tickers).size !== tickers.length ||
      !targetsValid ||
      !controlsValid
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Execution targets, null economics, and fail-closed controls must reconcile.",
        path: ["portfolio"],
      });
    }
  });
export type ExecutionCostReadiness = z.infer<typeof ExecutionCostReadinessSchema>;

const BENCHMARK_PROXY_TICKERS = [
  "ITOT",
  "IVV",
  "SCHB",
  "SPLG",
  "SPTM",
  "SPY",
  "VOO",
  "VTI",
] as const;

const BENCHMARK_READINESS_CONTROL_KEYS = [
  "receipted-candidate-prices",
  "current-sec-fund-associations",
  "benchmark-mandate",
  "observation-availability-times",
  "distributions-corporate-actions",
  "total-return-series",
  "evaluation-interval",
  "portfolio-execution-alignment",
] as const;

export const BenchmarkReadinessSchema = z
  .object({
    reportSchemaVersion: z.literal("1.0.0"),
    buildId: SafeBuildIdSchema,
    modelVersion: z.string().min(1),
    assessedAt: IsoDateTimeSchema,
    identityObservedAt: IsoDateTimeSchema,
    status: z.literal("candidate-proxies-not-return-series"),
    benchmarkSelected: z.literal(false),
    benchmarkReturnEligible: z.literal(false),
    comparison: z
      .object({
        earlierSnapshotId: z.literal("june-oracle"),
        laterSnapshotId: z.literal("july-baseline"),
        earlierEtfCount: z.number().int().positive(),
        laterEtfCount: z.number().int().positive(),
        candidateCount: z.number().int().positive(),
        observedPriceComparisonCount: z.number().int().positive(),
        totalReturnObservationCount: z.literal(0),
        selectedBenchmarkId: z.literal(null),
      })
      .strict(),
    candidates: z
      .array(
        z
          .object({
            ticker: z.enum([...BENCHMARK_PROXY_TICKERS]),
            name: z.string().trim().min(1),
            candidateRole: z.literal("broad-us-equity-proxy"),
            earlierPrice: z.number().positive(),
            laterPrice: z.number().positive(),
            observedPriceChange: z.number().finite(),
            currentSecFundAssociation: z
              .object({
                cik: z.string().regex(/^\d{10}$/),
                seriesId: z.string().regex(/^S\d{9}$/),
                classId: z.string().regex(/^C\d{9}$/),
              })
              .strict()
              .nullable(),
            benchmarkSelected: z.literal(false),
            adjustedPricesAvailable: z.literal(false),
            distributionsAvailable: z.literal(false),
            totalReturn: z.literal(null),
          })
          .strict(),
      )
      .length(BENCHMARK_PROXY_TICKERS.length),
    coverage: z
      .object({
        candidateCount: z.number().int().positive(),
        currentSecFundAssociationCount: z.number().int().nonnegative(),
        unmatchedCurrentAssociationCount: z.number().int().nonnegative(),
        observedPriceComparisonCount: z.number().int().positive(),
        totalReturnObservationCount: z.literal(0),
      })
      .strict(),
    controls: z
      .array(
        z
          .object({
            key: z.enum([...BENCHMARK_READINESS_CONTROL_KEYS]),
            status: z.enum(["pass", "partial", "blocked"]),
            detail: z.string().min(1),
          })
          .strict(),
      )
      .length(BENCHMARK_READINESS_CONTROL_KEYS.length),
    limitations: z.array(z.string().min(1)).min(5),
    notice: z.string().min(1),
  })
  .strict()
  .superRefine((value, context) => {
    const associationCount = value.candidates.filter(
      ({ currentSecFundAssociation }) => currentSecFundAssociation !== null,
    ).length;
    const candidatesValid = value.candidates.every(
      ({ ticker, earlierPrice, laterPrice, observedPriceChange }, index) =>
        ticker === BENCHMARK_PROXY_TICKERS[index] &&
        observedPriceChange === laterPrice / earlierPrice - 1,
    );
    const coverageValid =
      value.comparison.candidateCount === value.candidates.length &&
      value.comparison.observedPriceComparisonCount === value.candidates.length &&
      value.coverage.candidateCount === value.candidates.length &&
      value.coverage.currentSecFundAssociationCount === associationCount &&
      value.coverage.unmatchedCurrentAssociationCount ===
        value.candidates.length - associationCount &&
      value.coverage.observedPriceComparisonCount === value.candidates.length;
    const controlsValid =
      value.controls.every(({ key }, index) => key === BENCHMARK_READINESS_CONTROL_KEYS[index]) &&
      value.controls[0]?.status === "pass" &&
      value.controls[1]?.status === "partial" &&
      value.controls.slice(2).every(({ status }) => status === "blocked");

    if (!candidatesValid || !coverageValid || !controlsValid) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Benchmark candidates, coverage, and fail-closed controls must reconcile.",
        path: ["candidates"],
      });
    }
  });
export type BenchmarkReadiness = z.infer<typeof BenchmarkReadinessSchema>;

const WALK_FORWARD_CONTROL_KEYS = [
  "strict-cross-section-inventory",
  "filing-availability",
  "survivorship-aware-universe",
  "identity-actions-exits",
  "execution-and-costs",
  "benchmark-total-return",
  "walk-forward-protocol",
  "out-of-sample-calendar",
] as const;

export const WalkForwardReadinessSchema = z
  .object({
    reportSchemaVersion: z.literal("1.0.0"),
    buildId: SafeBuildIdSchema,
    modelVersion: z.string().min(1),
    assessedAt: IsoDateTimeSchema,
    status: z.literal("blocked-no-eligible-folds"),
    walkForwardEligible: z.literal(false),
    outOfSampleEligible: z.literal(false),
    calendar: z
      .object({
        snapshotCount: z.literal(2),
        pointInTimeEligibleSnapshotCount: z.literal(0),
        candidateFoldCount: z.literal(0),
        eligibleFoldCount: z.literal(0),
        evaluatedFoldCount: z.literal(0),
        performanceComparisonCount: z.literal(0),
      })
      .strict(),
    snapshots: z
      .array(
        z
          .object({
            snapshotId: z.enum(["june-oracle", "july-baseline"]),
            declaredGeneratedAt: z.string().datetime({ local: true }),
            timestampStatus: z.literal("timezone-unspecified"),
            pointInTimeEligible: z.literal(false),
          })
          .strict(),
      )
      .length(2),
    sourceReports: z
      .array(
        z
          .object({
            name: z.enum([
              "historical-readiness",
              "filing-availability",
              "universe-membership",
              "corporate-action-readiness",
              "exit-disposition-readiness",
              "execution-cost-readiness",
              "benchmark-readiness",
            ]),
            status: z.string().min(1),
            eligibilityClaim: z.literal(false),
          })
          .strict(),
      )
      .length(7),
    controls: z
      .array(
        z
          .object({
            key: z.enum([...WALK_FORWARD_CONTROL_KEYS]),
            status: z.enum(["partial", "blocked"]),
            detail: z.string().min(1),
          })
          .strict(),
      )
      .length(WALK_FORWARD_CONTROL_KEYS.length),
    limitations: z.array(z.string().min(1)).min(5),
    notice: z.string().min(1),
  })
  .strict()
  .superRefine((value, context) => {
    const snapshotOrder = value.snapshots.map(({ snapshotId }) => snapshotId);
    const sourceOrder = value.sourceReports.map(({ name }) => name);
    const expectedSources = [
      "historical-readiness",
      "filing-availability",
      "universe-membership",
      "corporate-action-readiness",
      "exit-disposition-readiness",
      "execution-cost-readiness",
      "benchmark-readiness",
    ];
    const controlsValid =
      value.controls.every(({ key }, index) => key === WALK_FORWARD_CONTROL_KEYS[index]) &&
      value.controls.slice(0, 2).every(({ status }) => status === "partial") &&
      value.controls.slice(2).every(({ status }) => status === "blocked");

    if (
      snapshotOrder.join(",") !== "june-oracle,july-baseline" ||
      sourceOrder.some((name, index) => name !== expectedSources[index]) ||
      !controlsValid
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Walk-forward source lineage, calendar, and controls must remain fail closed.",
        path: ["controls"],
      });
    }
  });
export type WalkForwardReadiness = z.infer<typeof WalkForwardReadinessSchema>;

const PROSPECTIVE_CONTROL_KEYS = [
  "immutable-daily-ledger",
  "independent-observation-window",
  "executable-portfolio-records",
  "costed-net-returns",
  "approved-benchmark-comparisons",
  "monthly-validation-reports",
  "prospective-protocol",
  "model-drift-retirement-rules",
] as const;

const PROSPECTIVE_CERTIFICATION_KEYS = [
  "thirty-immutable-observation-days",
  "thirty-executable-portfolio-records",
  "thirty-costed-return-observations",
  "thirty-approved-benchmark-comparisons",
  "one-monthly-validation-report",
  "frozen-prospective-protocol",
  "approved-drift-retirement-policy",
] as const;

export const ProspectiveReadinessSchema = z
  .object({
    reportSchemaVersion: z.literal("1.0.0"),
    buildId: SafeBuildIdSchema,
    modelVersion: z.string().min(1),
    assessedAt: IsoDateTimeSchema,
    status: z.literal("blocked-insufficient-prospective-history"),
    prospectiveValidationEligible: z.literal(false),
    certificationEligible: z.literal(false),
    requirements: z
      .object({
        immutableDailyObservationDays: z.literal(30),
        executablePortfolioRecords: z.literal(30),
        costedReturnObservations: z.literal(30),
        approvedBenchmarkComparisons: z.literal(30),
        monthlyValidationReports: z.literal(1),
      })
      .strict(),
    progress: z
      .object({
        immutableDailyEvidenceRecordCount: z.number().int().nonnegative(),
        uniqueObservationDayCount: z.number().int().nonnegative(),
        remainingObservationDayCount: z.number().int().nonnegative(),
        executablePortfolioRecordCount: z.literal(0),
        costedReturnObservationCount: z.literal(0),
        approvedBenchmarkComparisonCount: z.literal(0),
        monthlyValidationReportCount: z.literal(0),
        earliestObservationDate: z.string().date().nullable(),
        latestObservationDate: z.string().date().nullable(),
      })
      .strict(),
    observations: z.array(
      z
        .object({
          asOfDate: z.string().date(),
          buildId: SafeBuildIdSchema,
          modelVersion: z.string().min(1),
          recordedAt: IsoDateTimeSchema,
          evidenceRecordPath: z.string().min(1),
          evidenceRecordSha256: Sha256Schema,
          reproducibilityReportPath: z.string().min(1),
          reproductionVerified: z.literal(true),
          executionRecorded: z.literal(false),
          costedReturnComputed: z.literal(false),
          approvedBenchmarkCompared: z.literal(false),
        })
        .strict(),
    ),
    sourceReports: z
      .array(
        z
          .object({
            name: z.enum([
              "daily-evidence",
              "execution-cost-readiness",
              "benchmark-readiness",
              "walk-forward-readiness",
            ]),
            status: z.string().min(1),
            eligibilityClaim: z.literal(false),
          })
          .strict(),
      )
      .length(4),
    controls: z
      .array(
        z
          .object({
            key: z.enum([...PROSPECTIVE_CONTROL_KEYS]),
            status: z.enum(["partial", "blocked"]),
            detail: z.string().min(1),
          })
          .strict(),
      )
      .length(PROSPECTIVE_CONTROL_KEYS.length),
    certificationConditions: z
      .array(
        z
          .object({
            key: z.enum([...PROSPECTIVE_CERTIFICATION_KEYS]),
            requiredCount: z.number().int().positive().nullable(),
            observedCount: z.number().int().nonnegative(),
            satisfied: z.literal(false),
            detail: z.string().min(1),
          })
          .strict(),
      )
      .length(PROSPECTIVE_CERTIFICATION_KEYS.length),
    limitations: z.array(z.string().min(1)).min(5),
    notice: z.string().min(1),
  })
  .strict()
  .superRefine((value, context) => {
    const observationOrder = value.observations.map(
      ({ asOfDate, buildId }) => `${asOfDate}/${buildId}`,
    );
    const canonicalObservationOrder = [...observationOrder].sort((left, right) =>
      left.localeCompare(right),
    );
    const uniqueDays = new Set(value.observations.map(({ asOfDate }) => asOfDate));
    const sourceOrder = value.sourceReports.map(({ name }) => name);
    const expectedSourceOrder = [
      "daily-evidence",
      "execution-cost-readiness",
      "benchmark-readiness",
      "walk-forward-readiness",
    ];
    const controlsValid =
      value.controls.every(({ key }, index) => key === PROSPECTIVE_CONTROL_KEYS[index]) &&
      value.controls[0]?.status === "partial" &&
      value.controls.slice(1).every(({ status }) => status === "blocked");
    const conditionsValid =
      value.certificationConditions.every(
        ({ key }, index) => key === PROSPECTIVE_CERTIFICATION_KEYS[index],
      ) &&
      value.certificationConditions[0]?.requiredCount === 30 &&
      value.certificationConditions[0]?.observedCount ===
        value.progress.uniqueObservationDayCount &&
      value.certificationConditions[1]?.requiredCount === 30 &&
      value.certificationConditions[2]?.requiredCount === 30 &&
      value.certificationConditions[3]?.requiredCount === 30 &&
      value.certificationConditions[4]?.requiredCount === 1 &&
      value.certificationConditions[5]?.requiredCount === null &&
      value.certificationConditions[6]?.requiredCount === null &&
      value.certificationConditions.slice(1).every(({ observedCount }) => observedCount === 0);
    const earliest = value.observations.at(0)?.asOfDate ?? null;
    const latest = value.observations.at(-1)?.asOfDate ?? null;
    const progressValid =
      value.progress.immutableDailyEvidenceRecordCount === value.observations.length &&
      value.progress.uniqueObservationDayCount === uniqueDays.size &&
      value.progress.remainingObservationDayCount ===
        Math.max(0, value.requirements.immutableDailyObservationDays - uniqueDays.size) &&
      value.progress.earliestObservationDate === earliest &&
      value.progress.latestObservationDate === latest;

    if (
      observationOrder.some((entry, index) => entry !== canonicalObservationOrder[index]) ||
      new Set(observationOrder).size !== observationOrder.length ||
      sourceOrder.some((name, index) => name !== expectedSourceOrder[index]) ||
      !controlsValid ||
      !conditionsValid ||
      !progressValid
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "Prospective observation progress, source lineage, and certification controls must reconcile.",
        path: ["progress"],
      });
    }
  });
export type ProspectiveReadiness = z.infer<typeof ProspectiveReadinessSchema>;

export const DailyObservationCollectionReceiptSchema = z
  .object({
    receiptSchemaVersion: z.literal("1.0.0"),
    attemptedAt: IsoDateTimeSchema,
    disposition: z.enum(["collected", "no-op-duplicate-date", "blocked-backdated-date"]),
    candidate: z
      .object({
        asOfDate: z.string().date(),
        observedAt: IsoDateTimeSchema,
        buildId: SafeBuildIdSchema,
        modelVersion: z.string().min(1),
      })
      .strict(),
    ledger: z
      .object({
        observationDates: z.array(z.string().date()),
        latestObservationDate: z.string().date().nullable(),
        observationDayCountBefore: z.number().int().nonnegative(),
        observationDayCountAfter: z.number().int().nonnegative(),
      })
      .strict(),
    dailyEvidence: z
      .object({
        disposition: z.enum(["published", "reused"]),
        evidencePath: z.string().min(1),
        reproducibilityReportPath: z.string().min(1),
      })
      .strict()
      .nullable(),
    prospectiveReadiness: z
      .object({
        disposition: z.enum(["published", "reused"]),
        reportPath: z.string().min(1),
        uniqueObservationDayCount: z.number().int().nonnegative(),
        remainingObservationDayCount: z.number().int().nonnegative(),
      })
      .strict()
      .nullable(),
    reason: z.string().min(1),
  })
  .strict()
  .superRefine((value, context) => {
    const dates = value.ledger.observationDates;
    const canonicalDates = [...dates].sort((left, right) => left.localeCompare(right));
    const uniqueDates = new Set(dates);
    const latest = dates.at(-1) ?? null;
    const ledgerValid =
      dates.every((date, index) => date === canonicalDates[index]) &&
      uniqueDates.size === dates.length &&
      value.ledger.latestObservationDate === latest &&
      value.ledger.observationDayCountBefore === dates.length;
    const candidateAlreadyExists = uniqueDates.has(value.candidate.asOfDate);
    const candidateIsBackdated =
      latest !== null && value.candidate.asOfDate < latest && !candidateAlreadyExists;
    const collectedValid =
      value.disposition === "collected" &&
      !candidateAlreadyExists &&
      !candidateIsBackdated &&
      value.ledger.observationDayCountAfter === dates.length + 1 &&
      value.dailyEvidence !== null &&
      value.prospectiveReadiness !== null &&
      value.prospectiveReadiness.uniqueObservationDayCount === dates.length + 1 &&
      value.prospectiveReadiness.remainingObservationDayCount ===
        Math.max(0, 30 - (dates.length + 1));
    const duplicateValid =
      value.disposition === "no-op-duplicate-date" &&
      candidateAlreadyExists &&
      value.ledger.observationDayCountAfter === dates.length &&
      value.dailyEvidence === null &&
      value.prospectiveReadiness === null;
    const backdatedValid =
      value.disposition === "blocked-backdated-date" &&
      candidateIsBackdated &&
      value.ledger.observationDayCountAfter === dates.length &&
      value.dailyEvidence === null &&
      value.prospectiveReadiness === null;

    if (!ledgerValid || (!collectedValid && !duplicateValid && !backdatedValid)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Daily observation collection disposition and ledger progress must reconcile.",
        path: ["ledger"],
      });
    }
  });
export type DailyObservationCollectionReceipt = z.infer<
  typeof DailyObservationCollectionReceiptSchema
>;

// ---------------------------------------------------------------------------
// Phase 12A — Institutional Intelligence (13F)
// ---------------------------------------------------------------------------

const ThirteenFFormSchema = z.enum(["13F-HR", "13F-HR/A"]);
const CusipSchema = z.string().regex(/^[0-9A-Z]{9}$/);

export const InstitutionalManagerDirectorySchema = z
  .object({
    directorySchemaVersion: z.literal("1.0.0"),
    policy: z
      .object({
        selectionBasis: z.string().min(1),
        knownExclusions: z
          .array(z.object({ name: z.string().min(1), reason: z.string().min(1) }).strict())
          .min(0),
      })
      .strict(),
    managers: z
      .array(
        z
          .object({
            cik: SecCikSchema,
            name: z.string().trim().min(1),
            category: z.enum([
              "conglomerate",
              "macro",
              "activist",
              "long-short-equity",
              "value",
              "growth",
              "event-driven",
              "family-office",
            ]),
            note: z.string().optional(),
          })
          .strict(),
      )
      .min(1),
  })
  .strict()
  .superRefine((value, context) => {
    const ciks = value.managers.map(({ cik }) => cik);
    if (new Set(ciks).size !== ciks.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Institutional manager directory CIKs must be unique.",
        path: ["managers"],
      });
    }
  });
export type InstitutionalManagerDirectory = z.infer<typeof InstitutionalManagerDirectorySchema>;

export const ThirteenFSourceReceiptSchema = z
  .object({
    receiptSchemaVersion: z.literal("1.0.0"),
    snapshotId: z.string().date(),
    retrievedAt: IsoDateTimeSchema,
    sourcePolicy: z
      .object({
        provider: z.literal("U.S. Securities and Exchange Commission"),
        api: z.literal("EDGAR Archives"),
        access: z.literal("public-no-api-key"),
        declaredUserAgent: z.literal(true),
        maxRequestsPerSecond: z.literal(10),
      })
      .strict(),
    filings: z
      .array(
        z
          .object({
            cik: SecCikSchema,
            accessionNumber: SecAccessionNumberSchema,
            form: ThirteenFFormSchema,
            filingDate: z.string().date(),
            periodOfReport: z.string().date(),
            documents: z
              .array(
                z
                  .object({
                    role: z.enum(["filing-index", "primary-document", "information-table"]),
                    uri: z.string().url(),
                    path: z.string().min(1),
                    sha256: Sha256Schema,
                    byteSize: z.number().int().positive(),
                  })
                  .strict(),
              )
              .min(3),
          })
          .strict(),
      )
      .min(1),
  })
  .strict()
  .superRefine((value, context) => {
    const accessions = value.filings.map(({ accessionNumber }) => accessionNumber);
    if (new Set(accessions).size !== accessions.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "13F source receipts must not contain duplicate accessions.",
        path: ["filings"],
      });
    }
  });
export type ThirteenFSourceReceipt = z.infer<typeof ThirteenFSourceReceiptSchema>;

const InstitutionalPositionSchema = z
  .object({
    instrumentKey: z.string().min(1),
    cusip: CusipSchema,
    nameOfIssuer: z.string().min(1),
    titleOfClass: z.string().min(1),
    instrumentType: z.enum(["shares", "principal", "put", "call"]),
    shares: z.number().nonnegative(),
    valueUsd: z.number().nonnegative(),
    identity: z
      .object({
        status: z.enum(["resolved", "unresolved", "excluded-contaminated"]),
        ticker: SecTickerSchema.nullable(),
        method: z.enum(["registrant-title-exact", "none"]),
      })
      .strict(),
  })
  .strict();
export type InstitutionalPosition = z.infer<typeof InstitutionalPositionSchema>;

const InstitutionalDeltaSchema = z
  .object({
    instrumentKey: z.string().min(1),
    cusip: CusipSchema,
    nameOfIssuer: z.string().min(1),
    instrumentType: z.enum(["shares", "principal", "put", "call"]),
    classification: z.enum(["NEW", "INCREASED", "REDUCED", "EXITED", "UNCHANGED"]),
    priorShares: z.number().nonnegative().nullable(),
    currentShares: z.number().nonnegative().nullable(),
    shareChange: z.number().nullable(),
    shareChangePct: z.number().nullable(),
    priorValueUsd: z.number().nonnegative().nullable(),
    currentValueUsd: z.number().nonnegative().nullable(),
    identityTicker: SecTickerSchema.nullable(),
  })
  .strict();
export type InstitutionalDelta = z.infer<typeof InstitutionalDeltaSchema>;

const InstitutionalManagerPeriodSchema = z
  .object({
    periodOfReport: z.string().date(),
    effectiveState: z.enum(["usable", "indeterminate-amendment"]),
    filings: z
      .array(
        z
          .object({
            accessionNumber: SecAccessionNumberSchema,
            form: ThirteenFFormSchema,
            filingDate: z.string().date(),
            amendmentType: z.enum(["RESTATEMENT", "NEW HOLDINGS", "NOT-AN-AMENDMENT", "UNSTATED"]),
            valueUnit: z.enum(["dollars", "thousands"]),
            reportedPositionRows: z.number().int().nonnegative(),
            contributesToEffectiveSet: z.boolean(),
          })
          .strict(),
      )
      .min(1),
    positionCount: z.number().int().nonnegative(),
    displayedPositionCount: z.number().int().nonnegative(),
    totalValueUsd: z.number().nonnegative(),
    topHoldingConcentrationPct: z.number().min(0).max(100).nullable(),
    top10ConcentrationPct: z.number().min(0).max(100).nullable(),
    positions: z.array(InstitutionalPositionSchema),
  })
  .strict();
export type InstitutionalManagerPeriod = z.infer<typeof InstitutionalManagerPeriodSchema>;

const InstitutionalManagerSchema = z
  .object({
    cik: SecCikSchema,
    name: z.string().min(1),
    category: z.string().min(1),
    note: z.string().optional(),
    filerNameFromSec: z.string().min(1),
    periods: z.array(InstitutionalManagerPeriodSchema).min(1),
    deltas: z
      .object({
        fromPeriod: z.string().date(),
        toPeriod: z.string().date(),
        state: z.enum(["computed", "insufficient-history", "indeterminate-amendment"]),
        entries: z.array(InstitutionalDeltaSchema),
        displayedEntryCount: z.number().int().nonnegative(),
        totalEntryCount: z.number().int().nonnegative(),
      })
      .strict()
      .nullable(),
  })
  .strict();
export type InstitutionalManager = z.infer<typeof InstitutionalManagerSchema>;

const InstitutionalStockRollupSchema = z
  .object({
    ticker: SecTickerSchema,
    secTitle: z.string().min(1),
    holderCount: z.number().int().positive(),
    holders: z
      .array(
        z
          .object({
            cik: SecCikSchema,
            managerName: z.string().min(1),
            valueUsd: z.number().nonnegative(),
            shares: z.number().nonnegative(),
            portfolioWeightPct: z.number().min(0).max(100).nullable(),
            latestClassification: z
              .enum(["NEW", "INCREASED", "REDUCED", "EXITED", "UNCHANGED"])
              .nullable(),
          })
          .strict(),
      )
      .min(1),
    aggregateValueUsd: z.number().nonnegative(),
    directionOfTravel: z
      .object({
        added: z.number().int().nonnegative(),
        increased: z.number().int().nonnegative(),
        reduced: z.number().int().nonnegative(),
        exited: z.number().int().nonnegative(),
        unchanged: z.number().int().nonnegative(),
        withoutHistory: z.number().int().nonnegative(),
      })
      .strict(),
  })
  .strict();
export type InstitutionalStockRollup = z.infer<typeof InstitutionalStockRollupSchema>;

export const InstitutionalIntelligenceSchema = z
  .object({
    artifactSchemaVersion: z.literal("1.0.0"),
    generatedAt: IsoDateTimeSchema,
    sourceReceipt: z
      .object({ path: z.string().min(1), sha256: Sha256Schema, snapshotId: z.string().date() })
      .strict(),
    valueUnitPolicy: z.literal(
      "filing-date-2023-01-03-boundary: filings dated on/after 2023-01-03 report whole dollars; earlier filings report thousands and are normalized by 1000",
    ),
    reportingLagPolicy: z.literal(
      "13F filings are due up to 45 days after quarter end and describe quarter-end long positions only; they are never current positioning",
    ),
    displayCaps: z
      .object({
        positionsPerManager: z.number().int().positive(),
        deltasPerManager: z.number().int().positive(),
      })
      .strict(),
    coverage: z
      .object({
        managerCount: z.number().int().positive(),
        filingsProcessed: z.number().int().positive(),
        amendmentsProcessed: z.number().int().nonnegative(),
        amendmentsSuperseding: z.number().int().nonnegative(),
        duplicateAccessionsRejected: z.number().int().nonnegative(),
        positionRowsParsed: z.number().int().positive(),
        uniqueInstruments: z.number().int().positive(),
        resolvedInstruments: z.number().int().nonnegative(),
        unresolvedInstruments: z.number().int().nonnegative(),
        excludedContaminatedInstruments: z.number().int().nonnegative(),
      })
      .strict(),
    managers: z.array(InstitutionalManagerSchema).min(1),
    stockRollups: z.array(InstitutionalStockRollupSchema),
  })
  .strict();
export type InstitutionalIntelligence = z.infer<typeof InstitutionalIntelligenceSchema>;

// ---------------------------------------------------------------------------
// Phase 12B — Alpha Decay Lab (prospective, fail-closed)
// ---------------------------------------------------------------------------

export const AlphaDecayVintageSchema = z
  .object({
    vintageSchemaVersion: z.literal("1.0.0"),
    observationDate: z.string().date(),
    capturedAt: IsoDateTimeSchema,
    signalId: z.literal("akribeia-composite-v3"),
    modelVersion: z.string().min(1),
    sourceBuildId: SafeBuildIdSchema,
    sourceScoresSha256: Sha256Schema,
    universeCount: z.number().int().positive(),
    securities: z
      .array(
        z
          .object({
            ticker: SecTickerSchema,
            rank: z.number().int().positive(),
            score: z.number(),
            sector: z.string().min(1),
            price: z.number().positive(),
            marketCapB: z.number().nonnegative().nullable(),
            eligible: z.boolean(),
          })
          .strict(),
      )
      .min(1),
  })
  .strict()
  .superRefine((value, context) => {
    const tickers = value.securities.map(({ ticker }) => ticker);
    const ranks = value.securities.map(({ rank }) => rank);
    const ranksValid = [...ranks].sort((a, b) => a - b).every((rank, index) => rank === index + 1);
    if (new Set(tickers).size !== tickers.length || !ranksValid) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Alpha decay vintages need unique tickers and dense 1..N ranks.",
        path: ["securities"],
      });
    }
    if (value.securities.length !== value.universeCount) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "universeCount must equal the captured security count.",
        path: ["universeCount"],
      });
    }
  });
export type AlphaDecayVintage = z.infer<typeof AlphaDecayVintageSchema>;

const AlphaDecayHorizonSchema = z
  .object({
    horizonTradingDays: z.number().int().positive(),
    state: z.enum(["computed", "insufficient-history"]),
    vintagesUsed: z.number().int().nonnegative(),
    vintagesRequired: z.number().int().positive(),
    meanRankIc: z.number().nullable(),
    hitRate: z.number().min(0).max(1).nullable(),
    topMinusBottomQuintileSpread: z.number().nullable(),
    excludedForMissingForwardWindow: z.number().int().nonnegative(),
  })
  .strict();

export const AlphaDecayReportSchema = z
  .object({
    reportSchemaVersion: z.literal("1.0.0"),
    generatedAt: IsoDateTimeSchema,
    signalId: z.literal("akribeia-composite-v3"),
    methodology: z.literal(
      "spearman-rank-ic-prospective-only: statistics use contemporaneously captured immutable vintages and receipted forward prices; no hindsight reconstruction",
    ),
    policy: z
      .object({
        minVintagesForDecayCurve: z.number().int().positive(),
        minVintagesForPersistence: z.number().int().positive(),
        minCrossSectionPerCohort: z.number().int().positive(),
        horizonsTradingDays: z.array(z.number().int().positive()).min(1),
      })
      .strict(),
    ledger: z
      .object({
        vintageCount: z.number().int().nonnegative(),
        firstObservationDate: z.string().date().nullable(),
        latestObservationDate: z.string().date().nullable(),
        observationDates: z.array(z.string().date()),
      })
      .strict(),
    overallState: z.enum(["insufficient-history", "partially-computed", "computed"]),
    horizons: z.array(AlphaDecayHorizonSchema).min(1),
    rankPersistence: z
      .object({
        state: z.enum(["computed", "insufficient-history"]),
        vintagePairsUsed: z.number().int().nonnegative(),
        vintagePairsRequired: z.number().int().positive(),
        meanRankAutocorrelation: z.number().nullable(),
      })
      .strict(),
    halfLife: z
      .object({
        state: z.enum(["computed", "not-well-defined", "insufficient-history"]),
        halfLifeTradingDays: z.number().positive().nullable(),
      })
      .strict(),
    cohorts: z
      .array(
        z
          .object({
            dimension: z.enum(["sector"]),
            cohort: z.string().min(1),
            state: z.enum(["computed", "insufficient-coverage", "insufficient-history"]),
            crossSection: z.number().int().nonnegative(),
            meanRankIc21d: z.number().nullable(),
          })
          .strict(),
      )
      .min(0),
  })
  .strict();
export type AlphaDecayReport = z.infer<typeof AlphaDecayReportSchema>;
