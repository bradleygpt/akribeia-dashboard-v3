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

export const ScoringPillarSchema = z.enum([
  "valuation",
  "growth",
  "profitability",
  "momentum",
  "revisions",
]);
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
});

export const VerticalSliceDashboardSchema = z
  .object({
    buildId: z.string().min(1),
    generatedAt: IsoDateTimeSchema,
    schemaVersion: z.string().min(1),
    modelVersion: z.string().min(1),
    status: z.literal("healthy"),
    source: z.object({
      dataset: z.string().min(1),
      repositoryPath: z.string().min(1),
      sourceCommit: z.string().min(1),
      contentSha256: Sha256Schema,
      observedAt: IsoDateTimeSchema,
      rowCount: z.number().int().positive(),
      freshnessStatus: z.literal("current"),
    }),
    scoring: z.object({
      method: z.literal("weighted-five-pillar"),
      weights: z.record(ScoringPillarSchema, z.number().nonnegative()),
      missingDataPolicy: z.literal("require-complete"),
      minimumCoverage: z.literal(1),
      eligibleSecurities: z.number().int().nonnegative(),
      excludedSecurities: z.number().int().nonnegative(),
      averageCoverage: z.number().min(0).max(1),
    }),
    portfolio: z.object({
      constraints: z.object({
        maxPositionWeight: z.number().positive().max(1),
        maxSectorWeight: z.number().positive().max(1),
      }),
      totalWeight: z.number().positive().max(1),
      positions: z.array(DashboardPortfolioPositionSchema).min(1),
      sectorWeights: z.record(z.string(), z.number().positive().max(1)),
    }),
    topScores: z.array(DashboardSecuritySchema).min(1),
    notice: z.string().min(1),
  })
  .superRefine((value, context) => {
    const portfolioWeight = value.portfolio.positions.reduce(
      (sum, position) => sum + position.weight,
      0,
    );

    if (
      Math.abs(portfolioWeight - 1) > 1e-10 ||
      Math.abs(value.portfolio.totalWeight - 1) > 1e-10
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "The published portfolio must be fully invested.",
        path: ["portfolio", "totalWeight"],
      });
    }

    value.portfolio.positions.forEach((position, index) => {
      if (position.weight > value.portfolio.constraints.maxPositionWeight + 1e-12) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Position "${position.ticker}" exceeds the position cap.`,
          path: ["portfolio", "positions", index, "weight"],
        });
      }
    });

    Object.entries(value.portfolio.sectorWeights).forEach(([sector, weight]) => {
      if (weight > value.portfolio.constraints.maxSectorWeight + 1e-12) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Sector "${sector}" exceeds the sector cap.`,
          path: ["portfolio", "sectorWeights", sector],
        });
      }
    });
  });
export type VerticalSliceDashboard = z.infer<typeof VerticalSliceDashboardSchema>;
