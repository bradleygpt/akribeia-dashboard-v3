import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import {
  AlphaDecayReportSchema,
  AlphaDecayVintageSchema,
  type AlphaDecayReport,
  type AlphaDecayVintage,
} from "@akribeia/contracts";

export const ALPHA_DECAY_POLICY = {
  minVintagesForDecayCurve: 40,
  minVintagesForPersistence: 12,
  minCrossSectionPerCohort: 30,
  horizonsTradingDays: [5, 10, 21, 42, 63, 126],
} as const;

// A horizon of h trading days maps to roughly h * 7/5 calendar days. A paired
// vintage must land within this tolerance of the target calendar distance or
// the (vintage, horizon) pair is excluded and counted — never approximated.
const CALENDAR_TOLERANCE_DAYS = 2;

function hasErrorCode(error: unknown, code: string): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === code
  );
}

export interface CaptureAlphaDecayVintageOptions {
  publishedDataRoot: string;
  vintagesRoot: string;
  capturedAt: string;
}

export interface CaptureAlphaDecayVintageResult {
  disposition: "captured" | "duplicate-date" | "blocked-backdated-date";
  observationDate: string;
  vintagePath: string | null;
  universeCount: number;
}

export async function captureAlphaDecayVintage(
  options: CaptureAlphaDecayVintageOptions,
): Promise<CaptureAlphaDecayVintageResult> {
  const publishedDataRoot = resolve(options.publishedDataRoot);
  const activePointer = JSON.parse(
    await readFile(join(publishedDataRoot, "active-build.json"), "utf8"),
  ) as { activeBuildId: string };
  const buildRoot = join(publishedDataRoot, "builds", activePointer.activeBuildId);
  const manifest = JSON.parse(await readFile(join(buildRoot, "manifest.json"), "utf8")) as {
    buildId: string;
    modelVersion: string;
    files: Record<string, { path: string; sha256: string }>;
  };
  if (manifest.buildId !== activePointer.activeBuildId) {
    throw new Error("Active build manifest does not match the active-build pointer.");
  }
  const scoresFile = manifest.files.scores;
  if (scoresFile === undefined) {
    throw new Error("Active build manifest lists no scores artifact.");
  }

  const scoresBytes = await readFile(join(buildRoot, scoresFile.path));
  const scoresSha256 = createHash("sha256").update(scoresBytes).digest("hex");
  if (scoresSha256 !== scoresFile.sha256) {
    throw new Error("Active scores artifact fails its manifest checksum; refusing to capture.");
  }

  const scores = JSON.parse(scoresBytes.toString("utf8")) as {
    modelVersion: string;
    source: { observedAt: string };
    securities: Array<{
      ticker: string;
      score: number;
      sector: string;
      price: number;
      marketCapB: number | null;
      eligible: boolean;
    }>;
  };

  const observationDate = scores.source.observedAt.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(observationDate)) {
    throw new Error(`Active scores artifact has an unusable source date "${observationDate}".`);
  }

  const ranked = scores.securities
    .filter(({ eligible, price }) => eligible && Number.isFinite(price) && price > 0)
    .sort((left, right) => right.score - left.score || left.ticker.localeCompare(right.ticker))
    .map((security, index) => ({
      ticker: security.ticker,
      rank: index + 1,
      score: security.score,
      sector: security.sector,
      price: security.price,
      marketCapB: security.marketCapB,
      eligible: security.eligible,
    }));

  const vintage: AlphaDecayVintage = AlphaDecayVintageSchema.parse({
    vintageSchemaVersion: "1.0.0",
    observationDate,
    capturedAt: options.capturedAt,
    signalId: "akribeia-composite-v3",
    modelVersion: scores.modelVersion,
    sourceBuildId: activePointer.activeBuildId,
    sourceScoresSha256: scoresSha256,
    universeCount: ranked.length,
    securities: ranked,
  });

  const vintagesRoot = resolve(options.vintagesRoot);
  await mkdir(vintagesRoot, { recursive: true });
  const existingDates = (await readdir(vintagesRoot))
    .filter((name) => /^\d{4}-\d{2}-\d{2}\.json$/.test(name))
    .map((name) => name.slice(0, 10))
    .sort();
  const latest = existingDates.at(-1);

  if (existingDates.includes(observationDate)) {
    return {
      disposition: "duplicate-date",
      observationDate,
      vintagePath: join(vintagesRoot, `${observationDate}.json`),
      universeCount: ranked.length,
    };
  }
  if (latest !== undefined && observationDate < latest) {
    return {
      disposition: "blocked-backdated-date",
      observationDate,
      vintagePath: null,
      universeCount: ranked.length,
    };
  }

  const vintagePath = join(vintagesRoot, `${observationDate}.json`);
  const payload = `${JSON.stringify(vintage, null, 2)}\n`;
  try {
    await writeFile(vintagePath, payload, { flag: "wx" });
  } catch (error) {
    if (hasErrorCode(error, "EEXIST")) {
      throw new Error(`Immutable alpha-decay vintage conflict at "${vintagePath}".`, {
        cause: error,
      });
    }
    throw error;
  }

  return { disposition: "captured", observationDate, vintagePath, universeCount: ranked.length };
}

export async function loadAlphaDecayVintages(vintagesRoot: string): Promise<AlphaDecayVintage[]> {
  let names: string[];
  try {
    names = await readdir(resolve(vintagesRoot));
  } catch (error) {
    if (hasErrorCode(error, "ENOENT")) {
      return [];
    }
    throw error;
  }
  const vintages: AlphaDecayVintage[] = [];
  for (const name of names.filter((candidate) => /^\d{4}-\d{2}-\d{2}\.json$/.test(candidate)).sort()) {
    const vintage = AlphaDecayVintageSchema.parse(
      JSON.parse(await readFile(join(resolve(vintagesRoot), name), "utf8")),
    );
    if (`${vintage.observationDate}.json` !== name) {
      throw new Error(`Alpha-decay vintage file "${name}" disagrees with its observation date.`);
    }
    vintages.push(vintage);
  }
  return vintages;
}

function calendarDaysBetween(fromIsoDate: string, toIsoDate: string): number {
  return Math.round(
    (Date.parse(`${toIsoDate}T00:00:00Z`) - Date.parse(`${fromIsoDate}T00:00:00Z`)) / 86_400_000,
  );
}

export function spearmanRankIc(pairs: Array<{ rank: number; forwardReturn: number }>): number {
  const n = pairs.length;
  if (n < 2) {
    throw new Error("Spearman rank IC needs at least two observations.");
  }
  const returnRanks = new Map<number, number>();
  pairs
    .map(({ forwardReturn }, index) => ({ forwardReturn, index }))
    .sort((left, right) => right.forwardReturn - left.forwardReturn || left.index - right.index)
    .forEach(({ index }, position) => returnRanks.set(index, position + 1));

  const signalMean = pairs.reduce((sum, { rank }) => sum + rank, 0) / n;
  const returnMean = (n + 1) / 2;
  let covariance = 0;
  let signalVariance = 0;
  let returnVariance = 0;
  pairs.forEach(({ rank }, index) => {
    const returnRank = returnRanks.get(index) as number;
    // Rank 1 = best signal; invert so a positive IC means top-ranked names
    // earn higher forward returns.
    const signalDeviation = signalMean - rank;
    const returnDeviation = returnMean - returnRank;
    covariance += signalDeviation * returnDeviation;
    signalVariance += signalDeviation * signalDeviation;
    returnVariance += returnDeviation * returnDeviation;
  });
  if (signalVariance === 0 || returnVariance === 0) {
    return 0;
  }
  return covariance / Math.sqrt(signalVariance * returnVariance);
}

interface HorizonObservation {
  ic: number;
  hitRate: number;
  quintileSpread: number;
  sectorPairs: Map<string, Array<{ rank: number; forwardReturn: number }>>;
}

function computeHorizonObservation(
  fromVintage: AlphaDecayVintage,
  toVintage: AlphaDecayVintage,
  minCrossSection: number,
): HorizonObservation | null {
  const toPrices = new Map(toVintage.securities.map(({ ticker, price }) => [ticker, price]));
  const pairs: Array<{ rank: number; forwardReturn: number; sector: string }> = [];
  for (const security of fromVintage.securities) {
    const forwardPrice = toPrices.get(security.ticker);
    if (forwardPrice === undefined) {
      continue;
    }
    pairs.push({
      rank: security.rank,
      forwardReturn: forwardPrice / security.price - 1,
      sector: security.sector,
    });
  }
  if (pairs.length < minCrossSection) {
    return null;
  }

  const ic = spearmanRankIc(pairs);
  const sortedByRank = pairs.slice().sort((left, right) => left.rank - right.rank);
  const quintileSize = Math.floor(sortedByRank.length / 5);
  const topQuintile = sortedByRank.slice(0, quintileSize);
  const bottomQuintile = sortedByRank.slice(-quintileSize);
  const mean = (values: number[]): number =>
    values.reduce((sum, value) => sum + value, 0) / values.length;
  const medianReturn = pairs
    .map(({ forwardReturn }) => forwardReturn)
    .sort((left, right) => left - right)[Math.floor(pairs.length / 2)];

  const sectorPairs = new Map<string, Array<{ rank: number; forwardReturn: number }>>();
  for (const pair of pairs) {
    const bucket = sectorPairs.get(pair.sector) ?? [];
    bucket.push({ rank: pair.rank, forwardReturn: pair.forwardReturn });
    sectorPairs.set(pair.sector, bucket);
  }

  return {
    ic,
    hitRate:
      topQuintile.filter(({ forwardReturn }) => forwardReturn > medianReturn).length /
      topQuintile.length,
    quintileSpread:
      mean(topQuintile.map(({ forwardReturn }) => forwardReturn)) -
      mean(bottomQuintile.map(({ forwardReturn }) => forwardReturn)),
    sectorPairs,
  };
}

export interface GenerateAlphaDecayReportOptions {
  vintagesRoot: string;
  generatedAt: string;
}

export async function generateAlphaDecayReport(
  options: GenerateAlphaDecayReportOptions,
): Promise<AlphaDecayReport> {
  const vintages = await loadAlphaDecayVintages(options.vintagesRoot);
  const policy = ALPHA_DECAY_POLICY;
  const byDate = new Map(vintages.map((vintage) => [vintage.observationDate, vintage]));
  const dates = vintages.map(({ observationDate }) => observationDate);

  const horizons: AlphaDecayReport["horizons"] = [];
  const cohortIcs = new Map<string, number[]>();

  for (const horizon of policy.horizonsTradingDays) {
    const targetCalendarDays = Math.round((horizon * 7) / 5);
    const observations: HorizonObservation[] = [];
    let excluded = 0;

    for (const fromVintage of vintages) {
      const match = dates.find((candidate) => {
        const distance = calendarDaysBetween(fromVintage.observationDate, candidate);
        return distance >= targetCalendarDays - CALENDAR_TOLERANCE_DAYS &&
          distance <= targetCalendarDays + CALENDAR_TOLERANCE_DAYS;
      });
      if (match === undefined) {
        excluded += 1;
        continue;
      }
      const observation = computeHorizonObservation(
        fromVintage,
        byDate.get(match) as AlphaDecayVintage,
        policy.minCrossSectionPerCohort,
      );
      if (observation === null) {
        excluded += 1;
        continue;
      }
      observations.push(observation);
      if (horizon === 21) {
        for (const [sector, pairs] of observation.sectorPairs) {
          if (pairs.length >= policy.minCrossSectionPerCohort) {
            const bucket = cohortIcs.get(sector) ?? [];
            bucket.push(spearmanRankIc(pairs));
            cohortIcs.set(sector, bucket);
          } else {
            cohortIcs.set(sector, cohortIcs.get(sector) ?? []);
          }
        }
      }
    }

    const computed = observations.length >= policy.minVintagesForDecayCurve;
    const mean = (values: number[]): number =>
      values.reduce((sum, value) => sum + value, 0) / values.length;
    horizons.push({
      horizonTradingDays: horizon,
      state: computed ? "computed" : "insufficient-history",
      vintagesUsed: observations.length,
      vintagesRequired: policy.minVintagesForDecayCurve,
      meanRankIc: computed ? mean(observations.map(({ ic }) => ic)) : null,
      hitRate: computed ? mean(observations.map(({ hitRate }) => hitRate)) : null,
      topMinusBottomQuintileSpread: computed
        ? mean(observations.map(({ quintileSpread }) => quintileSpread))
        : null,
      excludedForMissingForwardWindow: excluded,
    });
  }

  const persistencePairs: number[] = [];
  for (let index = 0; index + 1 < vintages.length; index += 1) {
    const current = vintages[index];
    const next = vintages[index + 1];
    const nextRanks = new Map(next.securities.map(({ ticker, rank }) => [ticker, rank]));
    const pairs = current.securities
      .filter(({ ticker }) => nextRanks.has(ticker))
      .map(({ rank, ticker }) => ({
        rank,
        forwardReturn: -(nextRanks.get(ticker) as number),
      }));
    if (pairs.length >= policy.minCrossSectionPerCohort) {
      persistencePairs.push(spearmanRankIc(pairs));
    }
  }
  const persistenceComputed = persistencePairs.length >= policy.minVintagesForPersistence;

  const computedHorizons = horizons.filter(({ state }) => state === "computed");
  let halfLife: AlphaDecayReport["halfLife"];
  if (computedHorizons.length !== horizons.length) {
    halfLife = { state: "insufficient-history", halfLifeTradingDays: null };
  } else {
    const first = computedHorizons[0];
    const firstIc = first.meanRankIc as number;
    const rising = computedHorizons.some(
      ({ meanRankIc }) => (meanRankIc as number) > firstIc + Math.abs(firstIc) * 0.2,
    );
    if (firstIc <= 0 || rising) {
      halfLife = { state: "not-well-defined", halfLifeTradingDays: null };
    } else {
      let halfLifeTradingDays: number | null = null;
      for (let index = 1; index < computedHorizons.length; index += 1) {
        const previous = computedHorizons[index - 1];
        const current = computedHorizons[index];
        const previousIc = previous.meanRankIc as number;
        const currentIc = current.meanRankIc as number;
        if (currentIc <= firstIc / 2) {
          const span = previousIc - currentIc;
          const fraction = span === 0 ? 1 : (previousIc - firstIc / 2) / span;
          halfLifeTradingDays =
            previous.horizonTradingDays +
            fraction * (current.horizonTradingDays - previous.horizonTradingDays);
          break;
        }
      }
      halfLife =
        halfLifeTradingDays === null
          ? { state: "not-well-defined", halfLifeTradingDays: null }
          : { state: "computed", halfLifeTradingDays };
    }
  }

  const horizon21Computed = horizons.some(
    ({ horizonTradingDays, state }) => horizonTradingDays === 21 && state === "computed",
  );
  const cohorts = [...cohortIcs.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([sector, ics]) => {
      const crossSection = ics.length;
      if (!horizon21Computed) {
        return {
          dimension: "sector" as const,
          cohort: sector,
          state: "insufficient-history" as const,
          crossSection,
          meanRankIc21d: null,
        };
      }
      if (crossSection < policy.minVintagesForDecayCurve) {
        return {
          dimension: "sector" as const,
          cohort: sector,
          state: "insufficient-coverage" as const,
          crossSection,
          meanRankIc21d: null,
        };
      }
      return {
        dimension: "sector" as const,
        cohort: sector,
        state: "computed" as const,
        crossSection,
        meanRankIc21d: ics.reduce((sum, value) => sum + value, 0) / ics.length,
      };
    });

  const computedCount = horizons.filter(({ state }) => state === "computed").length;
  const report: AlphaDecayReport = {
    reportSchemaVersion: "1.0.0",
    generatedAt: options.generatedAt,
    signalId: "akribeia-composite-v3",
    methodology:
      "spearman-rank-ic-prospective-only: statistics use contemporaneously captured immutable vintages and receipted forward prices; no hindsight reconstruction",
    policy: {
      minVintagesForDecayCurve: policy.minVintagesForDecayCurve,
      minVintagesForPersistence: policy.minVintagesForPersistence,
      minCrossSectionPerCohort: policy.minCrossSectionPerCohort,
      horizonsTradingDays: [...policy.horizonsTradingDays],
    },
    ledger: {
      vintageCount: vintages.length,
      firstObservationDate: dates.at(0) ?? null,
      latestObservationDate: dates.at(-1) ?? null,
      observationDates: dates,
    },
    overallState:
      computedCount === 0
        ? "insufficient-history"
        : computedCount === horizons.length
          ? "computed"
          : "partially-computed",
    horizons,
    rankPersistence: {
      state: persistenceComputed ? "computed" : "insufficient-history",
      vintagePairsUsed: persistencePairs.length,
      vintagePairsRequired: policy.minVintagesForPersistence,
      meanRankAutocorrelation: persistenceComputed
        ? persistencePairs.reduce((sum, value) => sum + value, 0) / persistencePairs.length
        : null,
    },
    halfLife,
    cohorts,
  };

  return AlphaDecayReportSchema.parse(report);
}
