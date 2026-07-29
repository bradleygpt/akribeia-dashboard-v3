import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { BuildManifest } from "../../packages/contracts/src/index.js";
import {
  ACTIVE_BUILD_POINTER_FILENAME,
  activateBuild,
  rollbackActiveBuild,
  type ActiveBuildPointer,
} from "../../packages/publisher/src/index.js";

const renameFailure = vi.hoisted(() => ({
  failNextPointerRename: false,
  observed: false,
}));

vi.mock("node:fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs/promises")>();

  return {
    ...actual,
    rename: async (
      oldPath: Parameters<typeof actual.rename>[0],
      newPath: Parameters<typeof actual.rename>[1],
    ) => {
      if (
        renameFailure.failNextPointerRename &&
        oldPath.toString().includes(".active-build.json.") &&
        oldPath.toString().endsWith(".tmp")
      ) {
        renameFailure.failNextPointerRename = false;
        renameFailure.observed = true;
        throw new Error("Simulated pointer rename failure.");
      }

      return actual.rename(oldPath, newPath);
    },
  };
});

const evaluatedAt = "2026-07-29T20:00:00Z";
const artifactPayload = '[{"symbol":"AAPL","score":91}]\n';
const artifactSha256 = "6f83dc7c5a9559c2592449cc47d04bd90ca5bba8db1b89af91fdbb5f0ca7cfa5";

let rootDirectory = "";

beforeEach(async () => {
  renameFailure.failNextPointerRename = false;
  renameFailure.observed = false;
  rootDirectory = await mkdtemp(join(tmpdir(), "akribeia-active-build-"));
});

afterEach(async () => {
  await rm(rootDirectory, {
    recursive: true,
    force: true,
  });
});

function healthyManifest(buildId: string): BuildManifest {
  return {
    buildId,
    schemaVersion: "3.0.0",
    modelVersion: "3.0.0",
    generatedAt: "2026-07-29T19:59:00Z",
    publishedAt: evaluatedAt,
    status: "healthy",
    publication: {
      decision: "publish",
      evaluatedAt,
      reasons: [],
    },
    files: {
      scores: {
        path: "scores.json",
        sha256: artifactSha256,
        byteSize: Buffer.byteLength(artifactPayload),
        rowCount: 1,
        status: "current",
        freshness: {
          status: "current",
          observedAt: "2026-07-29T19:58:00Z",
          retrievedAt: "2026-07-29T19:59:00Z",
          evaluatedAt,
          ageSeconds: 120,
          maxAgeSeconds: 3600,
          reason: null,
        },
        provenance: [
          {
            sourceId: "akribeia-data",
            sourceType: "first-party",
            retrievedAt: "2026-07-29T19:59:00Z",
            sourceVersion: "active-build-fixture",
          },
        ],
      },
    },
  };
}

async function createBuild(
  buildId: string,
  manifest: unknown = healthyManifest(buildId),
): Promise<string> {
  const buildDirectory = join(rootDirectory, "builds", buildId);

  await mkdir(buildDirectory, { recursive: true });
  await writeFile(join(buildDirectory, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  await writeFile(join(buildDirectory, "scores.json"), artifactPayload);

  return buildDirectory;
}

async function readPointer(): Promise<ActiveBuildPointer> {
  return JSON.parse(
    await readFile(join(rootDirectory, ACTIVE_BUILD_POINTER_FILENAME), "utf8"),
  ) as ActiveBuildPointer;
}

async function directorySnapshot(directory: string): Promise<Record<string, string>> {
  const entries = await readdir(directory, {
    recursive: true,
    withFileTypes: true,
  });
  const snapshot: Record<string, string> = {};

  for (const entry of entries) {
    if (entry.isFile()) {
      const relativePath = join(entry.parentPath, entry.name).slice(directory.length + 1);
      snapshot[relativePath] = await readFile(join(entry.parentPath, entry.name), "utf8");
    }
  }

  return snapshot;
}

describe("active-build pointer", () => {
  it("activates a valid healthy published build with deterministic JSON", async () => {
    const buildDirectory = await createBuild("build-001");

    const result = await activateBuild({
      rootDirectory,
      buildId: "build-001",
    });

    expect(result).toEqual({
      operation: "activate",
      activeBuildId: "build-001",
      previousBuildId: null,
      pointerPath: join(rootDirectory, ACTIVE_BUILD_POINTER_FILENAME),
      buildDirectory,
      manifestPath: join(buildDirectory, "manifest.json"),
    });
    expect(await readFile(result.pointerPath, "utf8")).toBe(
      '{\n  "activeBuildId": "build-001",\n  "previousBuildId": null\n}\n',
    );
  });

  it("replaces the pointer and preserves the previous active build ID", async () => {
    await createBuild("build-001");
    await createBuild("build-002");
    await activateBuild({ rootDirectory, buildId: "build-001" });

    const result = await activateBuild({ rootDirectory, buildId: "build-002" });

    expect(result.activeBuildId).toBe("build-002");
    expect(result.previousBuildId).toBe("build-001");
    expect(await readPointer()).toEqual({
      activeBuildId: "build-002",
      previousBuildId: "build-001",
    });
  });

  it("revalidates repeat activation without erasing rollback history", async () => {
    await createBuild("build-001");
    const activeBuildDirectory = await createBuild("build-002");
    await activateBuild({ rootDirectory, buildId: "build-001" });
    await activateBuild({ rootDirectory, buildId: "build-002" });

    const result = await activateBuild({ rootDirectory, buildId: "build-002" });

    expect(result).toEqual({
      operation: "activate",
      activeBuildId: "build-002",
      previousBuildId: "build-001",
      pointerPath: join(rootDirectory, ACTIVE_BUILD_POINTER_FILENAME),
      buildDirectory: activeBuildDirectory,
      manifestPath: join(activeBuildDirectory, "manifest.json"),
    });
    expect(result.activeBuildId).not.toBe(result.previousBuildId);
    expect(await readPointer()).toEqual({
      activeBuildId: "build-002",
      previousBuildId: "build-001",
    });

    await writeFile(join(activeBuildDirectory, "manifest.json"), "{}\n");

    await expect(
      activateBuild({
        rootDirectory,
        buildId: "build-002",
      }),
    ).rejects.toThrow("Malformed build manifest");
    expect(await readPointer()).toEqual({
      activeBuildId: "build-002",
      previousBuildId: "build-001",
    });
  });

  it("rolls back to the validated previous build", async () => {
    await createBuild("build-001");
    await createBuild("build-002");
    await activateBuild({ rootDirectory, buildId: "build-001" });
    await activateBuild({ rootDirectory, buildId: "build-002" });

    const result = await rollbackActiveBuild({ rootDirectory });

    expect(result.operation).toBe("rollback");
    expect(result.rolledBackFromBuildId).toBe("build-002");
    expect(result.activeBuildId).toBe("build-001");
    expect(result.previousBuildId).toBe("build-002");
    expect(await readPointer()).toEqual({
      activeBuildId: "build-001",
      previousBuildId: "build-002",
    });
  });

  it("rejects a missing target build", async () => {
    await expect(
      activateBuild({
        rootDirectory,
        buildId: "missing-build",
      }),
    ).rejects.toThrow('Build "missing-build" does not exist');
  });

  it("rejects a malformed target manifest", async () => {
    await createBuild("build-malformed", {
      buildId: "build-malformed",
    });

    await expect(
      activateBuild({
        rootDirectory,
        buildId: "build-malformed",
      }),
    ).rejects.toThrow("Malformed build manifest");
  });

  it.each([
    ["degraded", "delayed"],
    ["failed", "unavailable"],
  ] as const)("rejects a %s target build", async (status, artifactStatus) => {
    const manifest = healthyManifest(`build-${status}`);

    manifest.status = status;
    manifest.files.scores.status = artifactStatus;
    manifest.files.scores.freshness.status = artifactStatus;
    manifest.files.scores.freshness.reason = `${status} fixture`;
    manifest.publication = {
      decision: "block",
      evaluatedAt,
      reasons: [`${status} fixture`],
    };
    delete manifest.publishedAt;

    if (status === "failed") {
      manifest.files.scores.freshness.observedAt = null;
      manifest.files.scores.freshness.ageSeconds = null;
    }

    await createBuild(manifest.buildId, manifest);

    await expect(
      activateBuild({
        rootDirectory,
        buildId: manifest.buildId,
      }),
    ).rejects.toThrow("is not eligible for activation");
  });

  it("rejects a healthy target without a publish decision", async () => {
    const manifest = healthyManifest("build-blocked");

    manifest.publication = {
      decision: "block",
      evaluatedAt,
      reasons: ["Publication was not approved."],
    };
    delete manifest.publishedAt;
    await createBuild(manifest.buildId, manifest);

    await expect(
      activateBuild({
        rootDirectory,
        buildId: manifest.buildId,
      }),
    ).rejects.toThrow("is not eligible for activation");
  });

  it.each(["../escape", ".staging", "nested/build", "C:\\escape", "build."])(
    "rejects unsafe build ID %s",
    async (buildId) => {
      await expect(
        activateBuild({
          rootDirectory,
          buildId,
        }),
      ).rejects.toThrow("Unsafe build ID");
    },
  );

  it("rejects a target whose manifest has a different build ID", async () => {
    await createBuild("build-requested", healthyManifest("build-other"));

    await expect(
      activateBuild({
        rootDirectory,
        buildId: "build-requested",
      }),
    ).rejects.toThrow('does not match requested build ID "build-requested"');
  });

  it("refuses rollback when no previous build exists", async () => {
    await createBuild("build-001");
    await activateBuild({ rootDirectory, buildId: "build-001" });

    await expect(rollbackActiveBuild({ rootDirectory })).rejects.toThrow(
      "active-build pointer has no previous build",
    );
  });

  it("refuses rollback when the previous build is no longer valid", async () => {
    await createBuild("build-001");
    await createBuild("build-002");
    await activateBuild({ rootDirectory, buildId: "build-001" });
    await activateBuild({ rootDirectory, buildId: "build-002" });
    await writeFile(join(rootDirectory, "builds", "build-001", "manifest.json"), "{}\n");

    await expect(rollbackActiveBuild({ rootDirectory })).rejects.toThrow(
      "Malformed build manifest",
    );
    expect(await readPointer()).toEqual({
      activeBuildId: "build-002",
      previousBuildId: "build-001",
    });
  });

  it("leaves no pointer temporary files after a failed operation", async () => {
    await createBuild("build-001");
    renameFailure.failNextPointerRename = true;

    await expect(
      activateBuild({
        rootDirectory,
        buildId: "build-001",
      }),
    ).rejects.toThrow("Simulated pointer rename failure");

    expect(renameFailure.observed).toBe(true);
    expect(
      (await readdir(rootDirectory)).filter(
        (entry) => entry.startsWith(`.${ACTIVE_BUILD_POINTER_FILENAME}.`) && entry.endsWith(".tmp"),
      ),
    ).toEqual([]);
  });

  it("never modifies immutable build contents during activation or rollback", async () => {
    const firstBuildDirectory = await createBuild("build-001");
    const secondBuildDirectory = await createBuild("build-002");
    const before = {
      first: await directorySnapshot(firstBuildDirectory),
      second: await directorySnapshot(secondBuildDirectory),
    };

    await activateBuild({ rootDirectory, buildId: "build-001" });
    await activateBuild({ rootDirectory, buildId: "build-002" });
    await rollbackActiveBuild({ rootDirectory });

    expect(await directorySnapshot(firstBuildDirectory)).toEqual(before.first);
    expect(await directorySnapshot(secondBuildDirectory)).toEqual(before.second);
  });
});
