// Data-freshness dead-man (audit 2026-10-20, finding E1).
//
// Ages the ACTIVE build's data on the checked-out branch against the build's own
// maxAgeSeconds window: the universe files' data date (recipe dataAsOf) when the build
// records one, else the observation date. Nothing alerted before this: main's data sat past
// its 7-day window for about 33 of the 54 days to 2026-10-20, 14 of them with every
// workflow green, and the only signal was GitHub's failure email for a scheduled run.
//
// Usage: node scripts/data-freshness.node.mjs   (exit 1 and a STALE line when past window)

import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

const RECIPE_PATH = "data/preview/vertical-slice-build.json";
const DAY_SECONDS = 86_400;

/** @param {{buildId: string, observedAt: string, dataAsOf?: string, maxAgeSeconds: number}} recipe */
export function freshnessVerdict(recipe, now = new Date()) {
  const basis = recipe.dataAsOf ?? recipe.observedAt;
  const basisLabel = recipe.dataAsOf === undefined ? "observation date" : "files' data date";
  const dataTime = Date.parse(basis);
  if (!Number.isFinite(dataTime) || !(recipe.maxAgeSeconds > 0)) {
    return {
      stale: true,
      ageSeconds: null,
      message: `Active build ${recipe.buildId} has no usable data date or freshness window.`,
    };
  }
  const ageSeconds = Math.max(0, Math.floor((now.getTime() - dataTime) / 1000));
  const stale = ageSeconds > recipe.maxAgeSeconds;
  const days = (seconds) => (seconds / DAY_SECONDS).toFixed(1);
  return {
    stale,
    ageSeconds,
    message:
      `Active build ${recipe.buildId}: data as of ${basis.slice(0, 10)} (${basisLabel}) is ` +
      `${days(ageSeconds)} days old; the window is ${days(recipe.maxAgeSeconds)} days` +
      (stale ? " -- STALE." : "."),
  };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const recipe = JSON.parse(await readFile(RECIPE_PATH, "utf8"));
  const verdict = freshnessVerdict(recipe);
  process.stdout.write(`${verdict.message}\n`);
  process.exitCode = verdict.stale ? 1 : 0;
}
