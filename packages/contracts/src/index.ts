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
    } else if (statuses.some((status) => status === "stale" || status === "fallback")) {
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
