import { z } from "zod";

export const DataStatusSchema = z.enum([
  "current",
  "delayed",
  "stale",
  "fallback",
  "unavailable",
]);

export const BuildManifestSchema = z.object({
  buildId: z.string().min(1),
  schemaVersion: z.string().min(1),
  modelVersion: z.string().min(1),
  generatedAt: z.string().datetime(),
  publishedAt: z.string().datetime().optional(),
  status: z.enum(["healthy", "degraded", "failed"]),
  files: z.record(z.object({
    path: z.string().min(1),
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
    rowCount: z.number().int().nonnegative().optional(),
  })),
});

export type BuildManifest = z.infer<typeof BuildManifestSchema>;

export const FactorObservationSchema = z.object({
  securityId: z.string().min(1),
  ticker: z.string().min(1),
  factor: z.string().min(1),
  value: z.number().finite().nullable(),
  status: DataStatusSchema,
  periodEnd: z.string().date().nullable(),
  availableFrom: z.string().datetime().nullable(),
  retrievedAt: z.string().datetime(),
  source: z.string().min(1),
  buildId: z.string().min(1),
});

export type FactorObservation = z.infer<typeof FactorObservationSchema>;
