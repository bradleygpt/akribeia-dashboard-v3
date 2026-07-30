import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
  BuildManifestSchema,
  PublishedScoresArtifactSchema,
  VerticalSliceDashboardSchema,
} from "../../packages/contracts/src/index.js";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  rollbackVerticalSlice,
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
    expect(result.publicationDisposition).toBe("published");
    expect(verified).toEqual(result.dashboard);
    expect(verified.source.rowCount).toBe(643);
    expect(verified.scoring.eligibleSecurities).toBeGreaterThan(600);
    expect(verified.scoring.missingDataPolicy).toBe("require-complete");
    expect(verified.scoring.eligibleNormalization).toBe("total-weight");
    expect(verified.scoring.factorCoverage).toHaveLength(5);
    expect(verified.scoring.factorCoverage.every(({ coverage }) => coverage === 1)).toBe(true);
    expect(verified.portfolio.totalWeight).toBe(1);
    expect(verified.portfolio.totalWeightUnits).toBe(1_000_000_000);
    expect(verified.portfolio.construction).toMatchObject({
      method: "ranked-greedy-integer-units-v1",
      weightScale: 1_000_000_000,
      candidateCount: 643,
    });
    expect(
      Math.max(...verified.portfolio.positions.map((position) => position.weightUnits)),
    ).toBeLessThanOrEqual(120_000_000);
    expect(Math.max(...Object.values(verified.portfolio.sectorWeightUnits))).toBeLessThanOrEqual(
      300_000_000,
    );
    expect(JSON.parse(await readFile(result.pointerPath, "utf8")) as unknown).toEqual({
      activeBuildId: "preview-integration-test",
      previousBuildId: null,
    });
    expect(JSON.parse(await readFile(result.projectionPath, "utf8")) as unknown).toEqual(
      result.dashboard,
    );
    const manifest = BuildManifestSchema.parse(
      JSON.parse(await readFile(result.manifestPath, "utf8")) as unknown,
    );

    expect(manifest.publication).toMatchObject({
      decision: "publish",
      evaluatedAt: recipe().evaluatedAt,
      reasons: [],
    });
    for (const artifact of Object.values(manifest.files)) {
      expect(artifact.status).toBe("current");
      expect(artifact.freshness).toMatchObject({
        status: "current",
        observedAt: recipe().observedAt,
        evaluatedAt: recipe().evaluatedAt,
        maxAgeSeconds: recipe().maxAgeSeconds,
      });
      expect(artifact.provenance).toEqual([
        expect.objectContaining({
          sourceId: "v2-baseline-universe-floor10",
          sourceVersion: recipe().sourceCommit,
          contentSha256: result.dashboard.source.contentSha256,
        }),
      ]);
    }

    const tampered = structuredClone(result.dashboard);
    const sector = Object.keys(tampered.portfolio.sectorWeightUnits)[0];

    expect(sector).toBeDefined();
    if (sector === undefined) {
      throw new Error("Expected a published portfolio sector.");
    }
    tampered.portfolio.sectorWeightUnits[sector] -= 1;
    expect(VerticalSliceDashboardSchema.safeParse(tampered).success).toBe(false);
  });

  it("retries the same deterministic build without overwriting immutable evidence", async () => {
    const first = await runVerticalSlice({
      ...recipe(),
      buildId: "preview-idempotent-retry",
    });
    const manifestBefore = await readFile(first.manifestPath, "utf8");
    const second = await runVerticalSlice({
      ...recipe(),
      buildId: "preview-idempotent-retry",
    });

    expect(first.publicationDisposition).toBe("published");
    expect(second.publicationDisposition).toBe("reused");
    expect(second.dashboard).toEqual(first.dashboard);
    expect(await readFile(second.manifestPath, "utf8")).toBe(manifestBefore);
    expect(
      JSON.parse(await readFile(join(recipe().outputRoot, "active-build.json"), "utf8")) as unknown,
    ).toEqual({
      activeBuildId: "preview-idempotent-retry",
      previousBuildId: null,
    });
  });

  it("publishes factor-level coverage and explicit exclusions without renormalizing", async () => {
    const source = JSON.parse(
      await readFile(resolve("data/reference/v2-baseline/fixtures/universe_floor10.json"), "utf8"),
    ) as {
      rows: Array<{ ticker: string; pillars: { Growth: number | null } }>;
    };
    const excludedTicker = source.rows[0].ticker;
    source.rows[0].pillars.Growth = null;
    const sourcePath = join(temporaryDirectory, "universe-with-missing-growth.json");
    await writeFile(sourcePath, `${JSON.stringify(source, null, 2)}\n`);

    const result = await runVerticalSlice({
      ...recipe(),
      buildId: "preview-missing-factor-test",
      sourcePath,
    });
    const scores = PublishedScoresArtifactSchema.parse(
      JSON.parse(await readFile(join(result.buildDirectory, "scores.json"), "utf8")) as unknown,
    );
    const growthCoverage = scores.scoring.factorCoverage.find(({ pillar }) => pillar === "growth");
    const excluded = scores.securities.find(({ ticker }) => ticker === excludedTicker);

    expect(scores.scoring.eligibleSecurities).toBe(642);
    expect(scores.scoring.excludedSecurities).toBe(1);
    expect(growthCoverage).toMatchObject({
      sourceField: "pillars.Growth",
      availableSecurities: 642,
      missingSecurities: 1,
      coverage: 642 / 643,
    });
    expect(excluded).toMatchObject({
      score: null,
      coverage: 0.8,
      eligible: false,
      missingPillars: ["growth"],
      exclusionReasons: ["below-minimum-coverage", "missing-required-pillar"],
      normalization: "not-scored",
    });

    const tampered = structuredClone(scores);
    const eligibleSecurity = tampered.securities.find(({ eligible }) => eligible);

    expect(eligibleSecurity).toBeDefined();
    if (eligibleSecurity === undefined) {
      throw new Error("Expected an eligible security in the scoring artifact.");
    }
    eligibleSecurity.score = (eligibleSecurity.score ?? 0) + 1;
    expect(PublishedScoresArtifactSchema.safeParse(tampered).success).toBe(false);
  });

  it("fails closed before publication when the repository snapshot is stale", async () => {
    const active = await runVerticalSlice({
      ...recipe(),
      buildId: "preview-stale-last-known-good",
    });
    const activeProjection = await readFile(active.projectionPath, "utf8");

    await expect(
      runVerticalSlice({
        ...recipe(),
        buildId: "preview-stale-candidate",
        evaluatedAt: "2026-08-30T03:38:40Z",
      }),
    ).rejects.toThrow("Source snapshot is stale by policy");

    expect(
      JSON.parse(await readFile(join(recipe().outputRoot, "active-build.json"), "utf8")) as unknown,
    ).toEqual({
      activeBuildId: "preview-stale-last-known-good",
      previousBuildId: null,
    });
    expect(await readFile(active.projectionPath, "utf8")).toBe(activeProjection);
    await expect(
      readFile(join(recipe().outputRoot, "builds", "preview-stale-candidate", "manifest.json")),
    ).rejects.toBeDefined();
  });

  it("fails closed with capacity evidence when exact caps are infeasible", async () => {
    const source = JSON.parse(
      await readFile(resolve("data/reference/v2-baseline/fixtures/universe_floor10.json"), "utf8"),
    ) as {
      meta: { n_total: number; n_stocks: number; n_etf: number; sectors: string[] };
      rows: Array<{ sector: string }>;
    };
    source.rows = source.rows.slice(0, 3);
    source.meta.n_total = source.rows.length;
    source.meta.n_stocks = source.rows.length;
    source.meta.n_etf = 0;
    source.meta.sectors = [...new Set(source.rows.map(({ sector }) => sector))];
    const sourcePath = join(temporaryDirectory, "infeasible-universe.json");
    await writeFile(sourcePath, `${JSON.stringify(source, null, 2)}\n`);

    await expect(
      runVerticalSlice({
        ...recipe(),
        buildId: "preview-infeasible-portfolio-test",
        sourcePath,
      }),
    ).rejects.toThrow("Candidate capacity reaches only");
    await expect(readFile(join(recipe().outputRoot, "active-build.json"))).rejects.toBeDefined();
  });

  it("rolls back the active pointer and dashboard projection as one product operation", async () => {
    const first = await runVerticalSlice({
      ...recipe(),
      buildId: "preview-rollback-first",
    });
    const second = await runVerticalSlice({
      ...recipe(),
      buildId: "preview-rollback-second",
      evaluatedAt: "2026-07-30T03:39:40Z",
    });

    expect(second.dashboard.buildId).toBe("preview-rollback-second");

    const rollback = await rollbackVerticalSlice(recipe().outputRoot, recipe().projectionPath);

    expect(rollback.pointer).toMatchObject({
      operation: "rollback",
      activeBuildId: "preview-rollback-first",
      previousBuildId: "preview-rollback-second",
      rolledBackFromBuildId: "preview-rollback-second",
    });
    expect(rollback.dashboard).toEqual(first.dashboard);
    expect(JSON.parse(await readFile(recipe().projectionPath, "utf8")) as unknown).toEqual(
      first.dashboard,
    );
  });

  it("preserves the last-known-good pointer when projection or rollback projection fails", async () => {
    await runVerticalSlice({
      ...recipe(),
      buildId: "preview-projection-first",
    });
    const blockedProjectionPath = join(temporaryDirectory, "blocked-projection");
    await mkdir(blockedProjectionPath);

    await expect(
      runVerticalSlice({
        ...recipe(),
        buildId: "preview-projection-second",
        evaluatedAt: "2026-07-30T03:39:40Z",
        projectionPath: blockedProjectionPath,
      }),
    ).rejects.toBeDefined();
    expect(
      JSON.parse(await readFile(join(recipe().outputRoot, "active-build.json"), "utf8")) as unknown,
    ).toEqual({
      activeBuildId: "preview-projection-first",
      previousBuildId: null,
    });
    expect(
      JSON.parse(
        await readFile(
          join(recipe().outputRoot, "builds", "preview-projection-second", "manifest.json"),
          "utf8",
        ),
      ),
    ).toMatchObject({
      buildId: "preview-projection-second",
      publication: { decision: "publish" },
    });

    await runVerticalSlice({
      ...recipe(),
      buildId: "preview-projection-third",
      evaluatedAt: "2026-07-30T03:40:40Z",
    });

    await expect(
      rollbackVerticalSlice(recipe().outputRoot, blockedProjectionPath),
    ).rejects.toBeDefined();
    expect(
      JSON.parse(await readFile(join(recipe().outputRoot, "active-build.json"), "utf8")) as unknown,
    ).toEqual({
      activeBuildId: "preview-projection-third",
      previousBuildId: "preview-projection-first",
    });
  });

  it("restores the prior projection when final pointer activation fails", async () => {
    await mkdir(recipe().outputRoot, { recursive: true });
    await mkdir(join(recipe().outputRoot, "active-build.json"));

    await expect(
      runVerticalSlice({
        ...recipe(),
        buildId: "preview-activation-failure",
      }),
    ).rejects.toThrow("is not a regular file");
    await expect(readFile(recipe().projectionPath)).rejects.toBeDefined();
    expect(
      BuildManifestSchema.parse(
        JSON.parse(
          await readFile(
            join(recipe().outputRoot, "builds", "preview-activation-failure", "manifest.json"),
            "utf8",
          ),
        ) as unknown,
      ).publication.decision,
    ).toBe("publish");
  });
});
