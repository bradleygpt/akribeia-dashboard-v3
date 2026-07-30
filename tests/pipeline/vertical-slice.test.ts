import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  runVerticalSlice,
  verifyPublishedVerticalSlice,
} from "../../packages/pipeline/src/index.js";

let temporaryDirectory = "";

beforeEach(async () => {
  temporaryDirectory = await mkdtemp(join(tmpdir(), "akribeia-vertical-slice-"));
});

afterEach(async () => {
  await rm(temporaryDirectory, {
    recursive: true,
    force: true,
  });
});

function recipe() {
  return {
    buildId: "preview-integration-test",
    evaluatedAt: "2026-07-30T03:38:40Z",
    observedAt: "2026-07-28T17:06:46Z",
    maxAgeSeconds: 604800,
    sourcePath: resolve("data/reference/v2-baseline/fixtures/universe_floor10.json"),
    metadataPath: resolve("data/reference/v2-baseline/fixtures/meta.json"),
    outputRoot: join(temporaryDirectory, "published"),
    projectionPath: join(temporaryDirectory, "active-dashboard.json"),
    sourceCommit: "0de8cd6",
    schemaVersion: "3.0.0-preview.1",
    modelVersion: "3.0.0-preview.1",
  } as const;
}

describe("visible vertical-slice pipeline", () => {
  it("publishes and activates scored real repository data", async () => {
    const result = await runVerticalSlice(recipe());
    const verified = await verifyPublishedVerticalSlice(recipe().outputRoot);

    expect(result.buildId).toBe("preview-integration-test");
    expect(verified).toEqual(result.dashboard);
    expect(verified.source.rowCount).toBe(643);
    expect(verified.scoring.eligibleSecurities).toBeGreaterThan(600);
    expect(verified.scoring.missingDataPolicy).toBe("require-complete");
    expect(verified.portfolio.totalWeight).toBeCloseTo(1, 12);
    expect(
      Math.max(...verified.portfolio.positions.map((position) => position.weight)),
    ).toBeLessThanOrEqual(0.12);
    expect(Math.max(...Object.values(verified.portfolio.sectorWeights))).toBeLessThanOrEqual(0.3);
    expect(JSON.parse(await readFile(result.pointerPath, "utf8")) as unknown).toEqual({
      activeBuildId: "preview-integration-test",
      previousBuildId: null,
    });
    expect(JSON.parse(await readFile(result.projectionPath, "utf8")) as unknown).toEqual(
      result.dashboard,
    );
  });

  it("fails closed before publication when the repository snapshot is stale", async () => {
    await expect(
      runVerticalSlice({
        ...recipe(),
        evaluatedAt: "2026-08-30T03:38:40Z",
      }),
    ).rejects.toThrow("Source snapshot is stale by policy");

    await expect(readFile(join(recipe().outputRoot, "active-build.json"))).rejects.toBeDefined();
  });
});
