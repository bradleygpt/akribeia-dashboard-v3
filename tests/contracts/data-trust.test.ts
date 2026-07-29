import { describe, expect, it } from "vitest";
import { BuildManifestSchema, FreshnessSchema } from "../../packages/contracts/src/index.js";

const sha256 = "0".repeat(64);
const evaluatedAt = "2026-07-29T17:00:00Z";

const healthyManifest: BuildManifest = {
  buildId: "2026-07-29T170000Z",
  schemaVersion: "3.0.0",
  modelVersion: "3.0.0",
  generatedAt: "2026-07-29T16:59:00Z",
  publishedAt: "2026-07-29T17:00:00Z",
  status: "healthy",
  publication: {
    decision: "publish",
    evaluatedAt,
    reasons: [],
  },
  files: {
    scores: {
      path: "scores.json.gz",
      sha256,
      byteSize: 128,
      rowCount: 1,
      status: "current",
      freshness: {
        status: "current",
        observedAt: "2026-07-29T16:58:00Z",
        retrievedAt: "2026-07-29T16:59:00Z",
        evaluatedAt,
        ageSeconds: 120,
        maxAgeSeconds: 3600,
        reason: null,
      },
      provenance: [
        {
          sourceId: "akribeia-data",
          sourceType: "first-party",
          retrievedAt: "2026-07-29T16:59:00Z",
          sourceVersion: "a1304c5",
        },
      ],
    },
  },
};

describe("data trust contracts", () => {
  it("accepts a healthy publishable manifest", () => {
    expect(BuildManifestSchema.safeParse(healthyManifest).success).toBe(true);
  });

  it("rejects publishing stale artifacts", () => {
    const staleManifest = structuredClone(healthyManifest);

    staleManifest.status = "healthy";
    staleManifest.files.scores.status = "stale";
    staleManifest.files.scores.freshness.status = "stale";
    staleManifest.files.scores.freshness.ageSeconds = 7200;
    staleManifest.files.scores.freshness.reason = "Source exceeded freshness policy.";

    expect(BuildManifestSchema.safeParse(staleManifest).success).toBe(false);
  });

  it("requires a previous build when holding last-known-good", () => {
    const heldManifest = structuredClone(healthyManifest);

    delete heldManifest.publishedAt;
    heldManifest.status = "degraded";
    heldManifest.publication.decision = "hold-last-known-good";
    heldManifest.publication.reasons = ["Primary data is stale."];
    heldManifest.files.scores.status = "stale";
    heldManifest.files.scores.freshness.status = "stale";
    heldManifest.files.scores.freshness.ageSeconds = 7200;
    heldManifest.files.scores.freshness.reason = "Primary data is stale.";

    expect(BuildManifestSchema.safeParse(heldManifest).success).toBe(false);
  });

  it("rejects unavailable data that claims an observation", () => {
    const result = FreshnessSchema.safeParse({
      status: "unavailable",
      observedAt: "2026-07-29T16:58:00Z",
      retrievedAt: "2026-07-29T16:59:00Z",
      evaluatedAt,
      ageSeconds: 120,
      maxAgeSeconds: 3600,
      reason: "Source did not return usable data.",
    });

    expect(result.success).toBe(false);
  });
});
