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
    // 588 stocks + 55 ETFs; ETFs carry no stock-model pillars and are never scored (3.1.0).
    expect(verified.scoring.notApplicableSecurities).toBe(55);
    // Five fixture stocks have a pillar with no observed inputs (CTRA, BK Momentum; COF, PSTG
    // Growth; FISV Growth and Profitability). Each keeps >= 60% of its weight, so all 588 score.
    expect(verified.scoring.eligibleSecurities).toBe(588);
    expect(verified.scoring.missingDataPolicy).toBe("renormalize-explicitly");
    expect(verified.scoring.minimumCoverage).toBe(0.6);
    expect(verified.scoring.eligibleNormalization).toBe("available-weight");
    expect(
      Object.fromEntries(
        verified.scoring.factorCoverage.map(({ pillar, availableSecurities }) => [
          pillar,
          availableSecurities,
        ]),
      ),
    ).toEqual({ valuation: 588, growth: 585, profitability: 587, momentum: 586, revisions: 588 });
    expect(verified.portfolio.totalWeight).toBe(1);
    expect(verified.portfolio.totalWeightUnits).toBe(1_000_000_000);
    expect(verified.portfolio.construction).toMatchObject({
      method: "ranked-greedy-integer-units-v1",
      weightScale: 1_000_000_000,
      // candidates are the eligible stocks; ETFs are never portfolio candidates (3.1.0)
      candidateCount: verified.scoring.eligibleSecurities,
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

  it("drops a pillar with no observed inputs and renormalizes the rest explicitly", async () => {
    type Row = {
      ticker: string;
      sector: string;
      pillars: Record<string, number | null>;
      raw: Record<string, number | null>;
    };
    const source = JSON.parse(
      await readFile(resolve("data/reference/v2-baseline/fixtures/universe_floor10.json"), "utf8"),
    ) as { rows: Row[] };
    const meta = JSON.parse(
      await readFile(resolve("data/reference/v2-baseline/fixtures/meta.json"), "utf8"),
    ) as { pillar_metrics: Record<string, Array<{ key: string }>> };
    const clearInputs = (row: Row, group: string) => {
      for (const { key } of meta.pillar_metrics[group] ?? []) row.raw[key] = null;
    };
    const alreadyAffected = new Set(["CTRA", "COF", "FISV", "BK", "PSTG"]);
    const [dropped, excludedRow] = source.rows.filter(
      ({ sector, ticker }) => sector !== "ETF" && !alreadyAffected.has(ticker),
    );
    if (dropped === undefined || excludedRow === undefined) throw new Error("fixture rows");
    // V2 still publishes a Growth score for this row; with no Growth input observed it is unusable.
    clearInputs(dropped, "Growth");
    expect(dropped.pillars.Growth).not.toBeNull();
    for (const group of ["Growth", "Profitability", "Momentum"]) clearInputs(excludedRow, group);
    const sourcePath = join(temporaryDirectory, "universe-with-inputless-pillars.json");
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
    const renormalized = scores.securities.find(({ ticker }) => ticker === dropped.ticker);
    const excluded = scores.securities.find(({ ticker }) => ticker === excludedRow.ticker);
    const remaining = ["Valuation", "Profitability", "Momentum", "EPS Revisions"].map(
      (group) => dropped.pillars[group] ?? Number.NaN,
    );

    // 588 stocks (55 ETFs are not applicable and sit outside the coverage population).
    expect(scores.scoring.eligibleSecurities).toBe(587);
    expect(scores.scoring.excludedSecurities).toBe(1 + 55);
    expect(scores.scoring.notApplicableSecurities).toBe(55);
    expect(growthCoverage).toMatchObject({
      sourceField: "pillars.Growth",
      availableSecurities: 583,
      missingSecurities: 5,
      coverage: 583 / 588,
    });
    expect(renormalized).toMatchObject({
      coverage: 0.8,
      eligible: true,
      missingPillars: ["growth"],
      exclusionReasons: [],
      normalization: "available-weight",
    });
    expect(renormalized?.contributions.find(({ pillar }) => pillar === "growth")).toMatchObject({
      value: null,
      weightedValue: null,
      status: "missing",
    });
    expect(renormalized?.score).toBeCloseTo(
      remaining.reduce((sum, value) => sum + value, 0) / remaining.length,
      12,
    );
    expect(excluded).toMatchObject({
      score: null,
      coverage: 0.4,
      eligible: false,
      missingPillars: ["growth", "profitability", "momentum"],
      exclusionReasons: ["below-minimum-coverage"],
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

  it("never scores or ranks an ETF on its placeholder pillars", async () => {
    const result = await runVerticalSlice({ ...recipe(), buildId: "preview-etf-not-applicable" });
    const scores = PublishedScoresArtifactSchema.parse(
      JSON.parse(await readFile(join(result.buildDirectory, "scores.json"), "utf8")) as unknown,
    );
    const etfs = scores.securities.filter(({ sector }) => sector === "ETF");

    expect(etfs).toHaveLength(55);
    for (const etf of etfs) {
      expect(etf).toMatchObject({
        score: null,
        eligible: false,
        coverage: 0,
        exclusionReasons: ["not-applicable-etf"],
        normalization: "not-scored",
      });
      expect(
        etf.contributions.every(({ status, value }) => status === "missing" && value === null),
      ).toBe(true);
    }
    expect(result.dashboard.topScores.some(({ sector }) => sector === "ETF")).toBe(false);
    expect(result.dashboard.portfolio.positions.some(({ sector }) => sector === "ETF")).toBe(false);
  });

  it("refuses to score when the pillar inputs cannot be checked", async () => {
    const meta = JSON.parse(
      await readFile(resolve("data/reference/v2-baseline/fixtures/meta.json"), "utf8"),
    ) as Record<string, unknown>;
    delete meta.pillar_metrics;
    const metadataPath = join(temporaryDirectory, "meta-without-pillar-metrics.json");
    await writeFile(metadataPath, `${JSON.stringify(meta)}\n`);
    await expect(
      runVerticalSlice({ ...recipe(), buildId: "preview-no-pillar-metrics", metadataPath }),
    ).rejects.toThrow("no pillar_metrics");

    const source = JSON.parse(
      await readFile(resolve("data/reference/v2-baseline/fixtures/universe_floor10.json"), "utf8"),
    ) as { rows: Array<{ sector: string; raw?: unknown }> };
    const stock = source.rows.find(({ sector }) => sector !== "ETF");
    if (stock !== undefined) delete stock.raw;
    const sourcePath = join(temporaryDirectory, "universe-without-raw.json");
    await writeFile(sourcePath, `${JSON.stringify(source)}\n`);
    await expect(
      runVerticalSlice({ ...recipe(), buildId: "preview-no-raw", sourcePath }),
    ).rejects.toThrow("no raw inputs");
  });

  it("ages the source from its data date and records it beside the observation", async () => {
    const result = await runVerticalSlice({
      ...recipe(),
      buildId: "preview-data-date",
      dataAsOf: "2026-07-27T00:00:00Z",
    });
    const scores = PublishedScoresArtifactSchema.parse(
      JSON.parse(
        await readFile(
          join(recipe().outputRoot, "builds", "preview-data-date", "scores.json"),
          "utf8",
        ),
      ),
    );

    expect(result.dashboard.source.observedAt).toBe("2026-07-28T17:06:46Z");
    expect(result.dashboard.source.dataAsOf).toBe("2026-07-27T00:00:00Z");
    // 2026-07-27T00:00:00Z -> 2026-07-30T03:38:40Z
    expect(result.dashboard.source.ageSeconds).toBe(272_320);
    expect(scores.source.dataAsOf).toBe("2026-07-27T00:00:00Z");
  });

  it("omits the data date entirely for recipes that predate it", async () => {
    const result = await runVerticalSlice(recipe());

    expect(result.dashboard.source).not.toHaveProperty("dataAsOf");
    // 2026-07-28T17:06:46Z -> 2026-07-30T03:38:40Z
    expect(result.dashboard.source.ageSeconds).toBe(124_314);
  });

  it("fails closed when the data date is past the window even if the run is recent", async () => {
    await expect(
      runVerticalSlice({
        ...recipe(),
        buildId: "preview-old-data",
        dataAsOf: "2026-07-20T00:00:00Z",
      }),
    ).rejects.toThrow("Source snapshot is stale by policy");
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
