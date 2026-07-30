import { createHash } from "node:crypto";
import { access, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ArtifactFile, BuildManifest } from "../../packages/contracts/src/index.js";
import {
  publishBuildAtomically,
  publishBuildIdempotently,
} from "../../packages/publisher/src/index.js";

const evaluatedAt = "2026-07-29T19:10:00Z";

let rootDirectory = "";

beforeEach(async () => {
  rootDirectory = await mkdtemp(join(tmpdir(), "akribeia-atomic-publisher-"));
});

afterEach(async () => {
  await rm(rootDirectory, {
    recursive: true,
    force: true,
  });
});

function hash(payload: Uint8Array): string {
  return createHash("sha256").update(payload).digest("hex");
}

function fixture() {
  const payload = new TextEncoder().encode(JSON.stringify([{ symbol: "AAPL", score: 91 }]));

  const artifact: ArtifactFile = {
    path: "scores/scores.json",
    sha256: hash(payload),
    byteSize: payload.byteLength,
    rowCount: 1,
    status: "current",
    freshness: {
      status: "current",
      observedAt: "2026-07-29T19:08:00Z",
      retrievedAt: "2026-07-29T19:09:00Z",
      evaluatedAt,
      ageSeconds: 120,
      maxAgeSeconds: 3600,
      reason: null,
    },
    provenance: [
      {
        sourceId: "akribeia-data",
        sourceType: "first-party",
        retrievedAt: "2026-07-29T19:09:00Z",
        sourceVersion: "79f12e27e",
      },
    ],
  };

  const manifest: BuildManifest = {
    buildId: "build-atomic-001",
    schemaVersion: "3.0.0",
    modelVersion: "3.0.0",
    generatedAt: "2026-07-29T19:09:00Z",
    publishedAt: evaluatedAt,
    status: "healthy",
    publication: {
      decision: "publish",
      evaluatedAt,
      reasons: [],
    },
    files: {
      scores: artifact,
    },
  };

  return {
    manifest,
    payload,
  };
}

describe("atomic build publisher", () => {
  it("promotes a complete verified build with one directory rename", async () => {
    const { manifest, payload } = fixture();

    const result = await publishBuildAtomically({
      rootDirectory,
      manifest,
      artifacts: {
        scores: payload,
      },
    });

    expect(result.buildId).toBe("build-atomic-001");

    const persistedPayload = await readFile(join(result.buildDirectory, "scores", "scores.json"));

    expect(hash(persistedPayload)).toBe(manifest.files.scores.sha256);

    const persistedManifest = JSON.parse(
      await readFile(result.manifestPath, "utf8"),
    ) as BuildManifest;

    expect(persistedManifest).toEqual(manifest);

    const remainingStagingDirectories = await readdir(join(rootDirectory, ".staging"));

    expect(remainingStagingDirectories).toEqual([]);
  });

  it("rejects an artifact whose SHA-256 does not match", async () => {
    const { manifest, payload } = fixture();

    manifest.files.scores.sha256 = "0".repeat(64);

    await expect(
      publishBuildAtomically({
        rootDirectory,
        manifest,
        artifacts: {
          scores: payload,
        },
      }),
    ).rejects.toThrow("SHA-256 mismatch");

    await expect(access(join(rootDirectory, "builds", manifest.buildId))).rejects.toBeDefined();
  });

  it("rejects unsafe artifact paths", async () => {
    const { manifest, payload } = fixture();

    manifest.files.scores.path = "../outside.json";

    await expect(
      publishBuildAtomically({
        rootDirectory,
        manifest,
        artifacts: {
          scores: payload,
        },
      }),
    ).rejects.toThrow("Unsafe artifact path");
  });

  it("rejects manifests that are not approved for publication", async () => {
    const { manifest, payload } = fixture();

    manifest.files.scores.status = "delayed";
    manifest.files.scores.freshness.status = "delayed";
    manifest.files.scores.freshness.reason = "Provider delivery delay.";
    manifest.status = "degraded";
    manifest.publication = {
      decision: "block",
      evaluatedAt,
      reasons: ["Provider delivery delay."],
    };
    delete manifest.publishedAt;

    await expect(
      publishBuildAtomically({
        rootDirectory,
        manifest,
        artifacts: {
          scores: payload,
        },
      }),
    ).rejects.toThrow("Atomic publication requires a healthy manifest");
  });

  it("requires payload keys to match manifest file keys", async () => {
    const { manifest } = fixture();

    await expect(
      publishBuildAtomically({
        rootDirectory,
        manifest,
        artifacts: {},
      }),
    ).rejects.toThrow("Artifact payload keys must exactly match manifest file keys");
  });

  it("never overwrites an existing immutable build", async () => {
    const { manifest, payload } = fixture();

    const existingBuildDirectory = join(rootDirectory, "builds", manifest.buildId);

    await mkdir(existingBuildDirectory, {
      recursive: true,
    });

    const sentinelPath = join(existingBuildDirectory, "sentinel.txt");

    await writeFile(sentinelPath, "preserve");

    await expect(
      publishBuildAtomically({
        rootDirectory,
        manifest,
        artifacts: {
          scores: payload,
        },
      }),
    ).rejects.toThrow("already exists");

    expect(await readFile(sentinelPath, "utf8")).toBe("preserve");
  });

  it("reuses an exact immutable build on a safe retry", async () => {
    const { manifest, payload } = fixture();
    const first = await publishBuildIdempotently({
      rootDirectory,
      manifest,
      artifacts: {
        scores: payload,
      },
    });
    const before = await readFile(first.manifestPath, "utf8");
    const second = await publishBuildIdempotently({
      rootDirectory,
      manifest,
      artifacts: {
        scores: payload,
      },
    });

    expect(first.disposition).toBe("published");
    expect(second).toEqual({
      ...first,
      disposition: "reused",
    });
    expect(await readFile(second.manifestPath, "utf8")).toBe(before);
  });

  it("rejects an idempotent retry whose immutable manifest changed", async () => {
    const { manifest, payload } = fixture();

    await publishBuildIdempotently({
      rootDirectory,
      manifest,
      artifacts: {
        scores: payload,
      },
    });

    await expect(
      publishBuildIdempotently({
        rootDirectory,
        manifest: {
          ...manifest,
          modelVersion: "3.0.1",
        },
        artifacts: {
          scores: payload,
        },
      }),
    ).rejects.toThrow("different immutable manifest");
  });
});
