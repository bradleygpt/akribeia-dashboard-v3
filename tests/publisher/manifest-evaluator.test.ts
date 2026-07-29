import { describe, expect, it } from "vitest";
import type { ArtifactFile, BuildManifest } from "../../packages/contracts/src/index.js";
import { evaluateManifest } from "../../packages/publisher/src/index.js";

const evaluatedAt = "2026-07-29T18:40:00Z";
const sha256 = "0".repeat(64);

function currentArtifact(): ArtifactFile {
  return {
    path: "scores.json.gz",
    sha256,
    byteSize: 128,
    rowCount: 1,
    status: "current",
    freshness: {
      status: "current",
      observedAt: "2026-07-29T18:38:00Z",
      retrievedAt: "2026-07-29T18:39:00Z",
      evaluatedAt,
      ageSeconds: 120,
      maxAgeSeconds: 3600,
      reason: null,
    },
    provenance: [
      {
        sourceId: "akribeia-data",
        sourceType: "first-party",
        retrievedAt: "2026-07-29T18:39:00Z",
        sourceVersion: "c4f1b0113",
      },
    ],
  };
}

function previousManifest(): BuildManifest {
  return {
    buildId: "build-previous",
    schemaVersion: "3.0.0",
    modelVersion: "3.0.0",
    generatedAt: "2026-07-28T18:39:00Z",
    publishedAt: "2026-07-28T18:40:00Z",
    status: "healthy",
    publication: {
      decision: "publish",
      evaluatedAt: "2026-07-28T18:40:00Z",
      reasons: [],
    },
    files: {
      scores: currentArtifact(),
    },
  };
}

function candidateInput() {
  return {
    buildId: "build-current",
    schemaVersion: "3.0.0",
    modelVersion: "3.0.0",
    generatedAt: "2026-07-29T18:39:00Z",
    evaluatedAt,
    requiredArtifacts: ["scores"],
    files: {
      scores: currentArtifact(),
    },
  };
}

describe("manifest evaluator", () => {
  it("publishes a complete healthy build", () => {
    const result = evaluateManifest(candidateInput());

    expect(result.decision).toBe("publish");
    expect(result.activeBuildId).toBe("build-current");
    expect(result.candidateManifest?.status).toBe("healthy");
    expect(result.candidateManifest?.publishedAt).toBe(evaluatedAt);
  });

  it("holds the last-known-good build when data is delayed", () => {
    const input = candidateInput();

    input.files.scores.status = "delayed";
    input.files.scores.freshness.status = "delayed";
    input.files.scores.freshness.reason = "Provider delivery delay.";

    const result = evaluateManifest({
      ...input,
      previousManifest: previousManifest(),
    });

    expect(result.decision).toBe("hold-last-known-good");
    expect(result.activeBuildId).toBe("build-previous");
    expect(result.candidateManifest?.status).toBe("degraded");
    expect(result.candidateManifest?.publication.previousBuildId).toBe("build-previous");
  });

  it("holds the last-known-good build when the candidate fails", () => {
    const input = candidateInput();

    input.files.scores.status = "unavailable";
    input.files.scores.freshness.status = "unavailable";
    input.files.scores.freshness.observedAt = null;
    input.files.scores.freshness.ageSeconds = null;
    input.files.scores.freshness.reason = "Source unavailable.";

    const result = evaluateManifest({
      ...input,
      previousManifest: previousManifest(),
    });

    expect(result.decision).toBe("hold-last-known-good");
    expect(result.activeBuildId).toBe("build-previous");
    expect(result.candidateManifest?.status).toBe("failed");
  });

  it("blocks an incomplete build without a fallback", () => {
    const result = evaluateManifest({
      ...candidateInput(),
      files: {},
    });

    expect(result.decision).toBe("block");
    expect(result.activeBuildId).toBeNull();
    expect(result.candidateManifest).toBeNull();
    expect(result.reasons).toContain("Missing required artifact: scores.");
  });

  it("fails closed when an artifact violates its schema", () => {
    const result = evaluateManifest({
      ...candidateInput(),
      files: {
        scores: {
          path: "scores.json.gz",
        },
      },
      previousManifest: previousManifest(),
    });

    expect(result.decision).toBe("hold-last-known-good");
    expect(result.activeBuildId).toBe("build-previous");
    expect(result.candidateManifest).toBeNull();
    expect(result.reasons.some((reason) => reason.startsWith("scores: invalid artifact"))).toBe(
      true,
    );
  });
});
