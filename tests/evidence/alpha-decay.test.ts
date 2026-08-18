import { createHash } from "node:crypto";
import { mkdtempSync, mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  ALPHA_DECAY_POLICY,
  captureAlphaDecayVintage,
  generateAlphaDecayReport,
  spearmanRankIc,
} from "@akribeia/evidence";

const scratchRoots: string[] = [];
afterEach(() => {
  for (const root of scratchRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

function scratch(prefix: string): string {
  const root = mkdtempSync(join(tmpdir(), prefix));
  scratchRoots.push(root);
  return root;
}

describe("spearman rank IC", () => {
  it("is +1 when rank 1 earns the best forward return and -1 when inverted", () => {
    const aligned = [1, 2, 3, 4, 5].map((rank) => ({ rank, forwardReturn: 1 / rank }));
    const inverted = [1, 2, 3, 4, 5].map((rank) => ({ rank, forwardReturn: rank }));
    expect(spearmanRankIc(aligned)).toBeCloseTo(1, 10);
    expect(spearmanRankIc(inverted)).toBeCloseTo(-1, 10);
  });
});

function writePublishedBuild(root: string, observedAt: string, securityCount: number): void {
  const securities = Array.from({ length: securityCount }, (_, index) => ({
    ticker: `TST${String(index).padStart(3, "0")}`,
    name: `Test Security ${index}`,
    sector: index % 2 === 0 ? "Technology" : "Healthcare",
    industry: "Test",
    score: 10 - index * 0.01,
    price: 100 + index,
    marketCapB: 50,
    eligible: true,
  }));
  const scores = {
    buildId: "test-build-1",
    generatedAt: "2026-08-18T00:00:00Z",
    schemaVersion: "test",
    modelVersion: "3.0.0-test",
    scoring: {},
    source: { observedAt },
    securities,
  };
  const scoresPayload = JSON.stringify(scores);
  const buildRoot = join(root, "builds", "test-build-1");
  mkdirSync(buildRoot, { recursive: true });
  writeFileSync(join(buildRoot, "scores.json"), scoresPayload);
  writeFileSync(
    join(buildRoot, "manifest.json"),
    JSON.stringify({
      buildId: "test-build-1",
      modelVersion: "3.0.0-test",
      files: {
        scores: {
          path: "scores.json",
          sha256: createHash("sha256").update(scoresPayload).digest("hex"),
        },
      },
    }),
  );
  writeFileSync(join(root, "active-build.json"), JSON.stringify({ activeBuildId: "test-build-1" }));
}

describe("alpha decay vintage capture", () => {
  it("captures a checksum-verified vintage immutably and refuses duplicates and backdates", async () => {
    const publishedDataRoot = scratch("akribeia-published-");
    const vintagesRoot = join(scratch("akribeia-vintages-"), "vintages");
    writePublishedBuild(publishedDataRoot, "2026-08-18T17:00:00Z", 40);

    const first = await captureAlphaDecayVintage({
      publishedDataRoot,
      vintagesRoot,
      capturedAt: "2026-08-18T18:00:00.000Z",
    });
    expect(first.disposition).toBe("captured");
    expect(first.universeCount).toBe(40);
    expect(readdirSync(vintagesRoot)).toEqual(["2026-08-18.json"]);

    const duplicate = await captureAlphaDecayVintage({
      publishedDataRoot,
      vintagesRoot,
      capturedAt: "2026-08-18T19:00:00.000Z",
    });
    expect(duplicate.disposition).toBe("duplicate-date");
    expect(readdirSync(vintagesRoot)).toEqual(["2026-08-18.json"]);

    writePublishedBuild(publishedDataRoot, "2026-08-10T17:00:00Z", 40);
    // Rewrite of the same fixture path changes bytes; recreate cleanly instead.
    rmSync(join(publishedDataRoot, "builds"), { recursive: true, force: true });
    writePublishedBuild(publishedDataRoot, "2026-08-10T17:00:00Z", 40);
    const backdated = await captureAlphaDecayVintage({
      publishedDataRoot,
      vintagesRoot,
      capturedAt: "2026-08-18T20:00:00.000Z",
    });
    expect(backdated.disposition).toBe("blocked-backdated-date");
    expect(readdirSync(vintagesRoot)).toEqual(["2026-08-18.json"]);
  });

  it("refuses a scores artifact that fails its manifest checksum", async () => {
    const publishedDataRoot = scratch("akribeia-published-bad-");
    const vintagesRoot = join(scratch("akribeia-vintages-bad-"), "vintages");
    writePublishedBuild(publishedDataRoot, "2026-08-18T17:00:00Z", 40);
    const scoresPath = join(publishedDataRoot, "builds", "test-build-1", "scores.json");
    writeFileSync(scoresPath, JSON.stringify({ tampered: true }));

    await expect(
      captureAlphaDecayVintage({
        publishedDataRoot,
        vintagesRoot,
        capturedAt: "2026-08-18T18:00:00.000Z",
      }),
    ).rejects.toThrow(/manifest checksum/);
  });
});

function writeVintage(
  vintagesRoot: string,
  observationDate: string,
  dayIndex: number,
  tickerCount: number,
): void {
  // Deterministic synthetic world: rank i grows at a rate decreasing in i, so
  // top-ranked names outperform at every horizon and IC is strongly positive.
  const securities = Array.from({ length: tickerCount }, (_, index) => {
    const rank = index + 1;
    const dailyGrowth = 0.002 - 0.00003 * rank;
    return {
      ticker: `TST${String(index).padStart(3, "0")}`,
      rank,
      score: 10 - index * 0.01,
      sector: index % 2 === 0 ? "Technology" : "Healthcare",
      price: 100 * Math.pow(1 + dailyGrowth, dayIndex),
      marketCapB: 50,
      eligible: true,
    };
  });
  const vintage = {
    vintageSchemaVersion: "1.0.0",
    observationDate,
    capturedAt: `${observationDate}T18:00:00.000Z`,
    signalId: "akribeia-composite-v3",
    modelVersion: "3.0.0-test",
    sourceBuildId: "test-build-1",
    sourceScoresSha256: createHash("sha256").update(observationDate).digest("hex"),
    universeCount: tickerCount,
    securities,
  };
  writeFileSync(join(vintagesRoot, `${observationDate}.json`), JSON.stringify(vintage));
}

function isoDateFromOffset(startIso: string, offsetDays: number): string {
  const date = new Date(Date.parse(`${startIso}T00:00:00Z`) + offsetDays * 86_400_000);
  return date.toISOString().slice(0, 10);
}

describe("alpha decay report", () => {
  it("fails closed everywhere on an empty ledger", async () => {
    const vintagesRoot = join(scratch("akribeia-report-empty-"), "vintages");
    mkdirSync(vintagesRoot, { recursive: true });
    const report = await generateAlphaDecayReport({
      vintagesRoot,
      generatedAt: "2026-08-18T18:00:00.000Z",
    });
    expect(report.overallState).toBe("insufficient-history");
    expect(report.ledger.vintageCount).toBe(0);
    expect(report.horizons.every(({ state }) => state === "insufficient-history")).toBe(true);
    expect(report.horizons.every(({ meanRankIc }) => meanRankIc === null)).toBe(true);
    expect(report.rankPersistence.state).toBe("insufficient-history");
    expect(report.halfLife.state).toBe("insufficient-history");
  });

  it("fails closed with a single vintage — no metric renders from one observation", async () => {
    const vintagesRoot = join(scratch("akribeia-report-one-"), "vintages");
    mkdirSync(vintagesRoot, { recursive: true });
    writeVintage(vintagesRoot, "2026-08-18", 0, 60);
    const report = await generateAlphaDecayReport({
      vintagesRoot,
      generatedAt: "2026-08-18T18:00:00.000Z",
    });
    expect(report.overallState).toBe("insufficient-history");
    expect(report.ledger.vintageCount).toBe(1);
    expect(report.horizons.every(({ meanRankIc }) => meanRankIc === null)).toBe(true);
  });

  it("computes short-horizon statistics deterministically once enough vintages exist", async () => {
    const vintagesRoot = join(scratch("akribeia-report-full-"), "vintages");
    mkdirSync(vintagesRoot, { recursive: true });
    for (let day = 0; day < 60; day += 1) {
      writeVintage(vintagesRoot, isoDateFromOffset("2026-05-01", day), day, 60);
    }

    const report = await generateAlphaDecayReport({
      vintagesRoot,
      generatedAt: "2026-08-18T18:00:00.000Z",
    });
    const reportAgain = await generateAlphaDecayReport({
      vintagesRoot,
      generatedAt: "2026-08-18T18:00:00.000Z",
    });
    expect(JSON.stringify(report)).toBe(JSON.stringify(reportAgain));

    const horizon5 = report.horizons.find(({ horizonTradingDays }) => horizonTradingDays === 5);
    expect(horizon5?.state).toBe("computed");
    expect(horizon5?.vintagesUsed).toBeGreaterThanOrEqual(ALPHA_DECAY_POLICY.minVintagesForDecayCurve);
    expect(horizon5?.meanRankIc).toBeGreaterThan(0.9);
    expect(horizon5?.hitRate).toBeGreaterThan(0.9);
    expect(horizon5?.topMinusBottomQuintileSpread).toBeGreaterThan(0);

    const horizon126 = report.horizons.find(({ horizonTradingDays }) => horizonTradingDays === 126);
    expect(horizon126?.state).toBe("insufficient-history");
    expect(horizon126?.meanRankIc).toBeNull();

    expect(report.overallState).toBe("partially-computed");
    expect(report.rankPersistence.state).toBe("computed");
    expect(report.rankPersistence.meanRankAutocorrelation).toBeCloseTo(1, 5);

    const cohorts = report.cohorts.filter(({ state }) => state === "computed");
    expect(report.cohorts.length).toBeGreaterThan(0);
    for (const cohort of cohorts) {
      expect(cohort.meanRankIc21d).not.toBeNull();
    }
  });
});
