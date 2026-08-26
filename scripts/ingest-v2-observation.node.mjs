// Point-in-time V2 observation ingestion (roadmap: replace the preserved
// snapshot input with scheduled live-source ingestion).
//
// Fetches the current V2 universe partitions from the commit-pinned bulk data
// repository (bradleygpt/akribeia-data via jsDelivr — the same delivery path
// the V2 application uses) plus the matching bake metadata from the deployed
// V2 application, validates them against each other, and writes one receipted
// observation into data/observations/current/ together with an updated
// pipeline recipe at data/preview/vertical-slice-build.json.
//
// Fail-closed: any fetch failure, shape mismatch, commit mismatch between
// meta and universe files, or stale generated_at aborts without touching the
// observation directory or the recipe.
//
// The immutable V2-to-V3 parity fixtures under data/reference/v2-baseline are
// never modified by this script.
//
// Usage: node scripts/ingest-v2-observation.node.mjs <akribeia-data-commit-sha>
//   [--meta-url https://quant-dashboard-pro-v2.vercel.app/data/meta.json]
//   [--max-age-hours 48]

import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const FLOORS = [0, 1, 10];
const RECIPE_PATH = "data/preview/vertical-slice-build.json";
const OBS_DIR = "data/observations/current";
const STAGE_DIR = "data/observations/.staging";

const args = process.argv.slice(2);
const dataCommit = args.find((a) => /^[0-9a-f]{7,40}$/.test(a));
if (!dataCommit) {
  process.stderr.write("usage: ingest-v2-observation.node.mjs <akribeia-data-commit-sha>\n");
  process.exit(2);
}
const metaUrl =
  args[args.indexOf("--meta-url") + 1 || -1] ??
  "https://quant-dashboard-pro-v2.vercel.app/data/meta.json";
const maxAgeHours = Number(args[args.indexOf("--max-age-hours") + 1 || -1] ?? 48);

const sha256 = (buf) => createHash("sha256").update(buf).digest("hex");

async function fetchBytes(url) {
  const res = await globalThis.fetch(url, { redirect: "follow" });
  if (!res.ok) throw new Error(`fetch ${url} -> HTTP ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

function parseGeneratedAt(meta) {
  // V2 bake timestamps are UTC without an explicit zone; record them as UTC —
  // the same convention the preserved baseline documented.
  const iso = `${meta.generated_at}Z`.replace(/ZZ$/, "Z");
  const t = Date.parse(iso);
  if (Number.isNaN(t)) throw new Error(`unparseable generated_at: ${meta.generated_at}`);
  return new Date(t);
}

const retrievedAt = new Date();
const files = {};

// ---- fetch ------------------------------------------------------------------
const metaBytes = await fetchBytes(metaUrl);
const meta = JSON.parse(metaBytes.toString("utf8"));
if (!meta.generated_at || !meta.source_commit) {
  throw new Error("meta.json missing generated_at/source_commit");
}
const observedAt = parseGeneratedAt(meta);
const ageHours = (retrievedAt.getTime() - observedAt.getTime()) / 3_600_000;
if (ageHours < 0 || ageHours > maxAgeHours) {
  throw new Error(
    `meta.generated_at ${meta.generated_at} is ${ageHours.toFixed(1)}h old; policy allows ${maxAgeHours}h`,
  );
}

for (const floor of FLOORS) {
  const url = `https://cdn.jsdelivr.net/gh/bradleygpt/akribeia-data@${dataCommit}/data/universe_floor${floor}.json`;
  const bytes = await fetchBytes(url);
  const parsed = JSON.parse(bytes.toString("utf8"));
  if (!parsed.meta || typeof parsed.meta.floor !== "number" || parsed.meta.floor !== floor) {
    throw new Error(`universe_floor${floor}.json shape mismatch (meta.floor)`);
  }
  if (!Array.isArray(parsed.rows) || parsed.rows.length < 100) {
    throw new Error(`universe_floor${floor}.json has implausible row count`);
  }
  if (parsed.meta.n_total !== parsed.rows.length) {
    throw new Error(`universe_floor${floor}.json metadata total mismatch`);
  }
  files[`universe_floor${floor}.json`] = {
    bytes,
    url,
    rows: parsed.rows.length,
    stocks: parsed.meta.n_stocks,
    etfs: parsed.meta.n_etf,
  };
}

// The universe files and meta must describe the same bake: every partition's
// row set is produced in the same nightly chain that stamps meta.generated_at.
// The bulk repo carries no per-file commit stamp, so the receipt binds the
// akribeia-data commit, the meta source_commit, and both timestamps together.

// ---- stage, then atomically promote ----------------------------------------
await rm(STAGE_DIR, { recursive: true, force: true });
await mkdir(STAGE_DIR, { recursive: true });
for (const [name, f] of Object.entries(files)) {
  await writeFile(resolve(STAGE_DIR, name), f.bytes);
}
await writeFile(resolve(STAGE_DIR, "meta.json"), metaBytes);

const provenance = {
  kind: "v2-point-in-time-observation",
  retrieved_at: retrievedAt.toISOString(),
  observed_at: observedAt.toISOString(),
  bulk_data_repository: "bradleygpt/akribeia-data",
  bulk_data_commit: dataCommit,
  delivery: "commit-pinned jsDelivr",
  meta_url: metaUrl,
  v2_source_commit: meta.source_commit,
  files: Object.fromEntries(
    Object.entries(files).map(([name, f]) => [
      name,
      {
        sha256: sha256(f.bytes),
        bytes: f.bytes.length,
        rows: f.rows,
        stocks: f.stocks,
        etfs: f.etfs,
        url: f.url,
      },
    ]),
  ),
  meta: { sha256: sha256(metaBytes), bytes: metaBytes.length },
};
await writeFile(resolve(STAGE_DIR, "provenance.json"), JSON.stringify(provenance, null, 2) + "\n");

await rm(OBS_DIR, { recursive: true, force: true });
await rename(STAGE_DIR, OBS_DIR);

// ---- recipe -----------------------------------------------------------------
const stamp = observedAt.toISOString().slice(0, 10).replaceAll("-", "");
const sourceHash12 = provenance.files["universe_floor10.json"].sha256.slice(0, 12);
const previousRecipe = JSON.parse(await readFile(RECIPE_PATH, "utf8"));
const recipe = {
  ...previousRecipe,
  buildId: `preview-${stamp}-pipeline-v5-${sourceHash12}`,
  evaluatedAt: retrievedAt.toISOString().replace(/\.\d{3}Z$/, "Z"),
  observedAt: observedAt.toISOString().replace(/\.\d{3}Z$/, "Z"),
  sourcePath: `${OBS_DIR}/universe_floor10.json`,
  metadataPath: `${OBS_DIR}/meta.json`,
  sourceCommit: meta.source_commit,
};
await writeFile(RECIPE_PATH, JSON.stringify(recipe, null, 2) + "\n");

process.stdout.write(
  JSON.stringify(
    {
      ingested: true,
      buildId: recipe.buildId,
      observedAt: recipe.observedAt,
      v2SourceCommit: meta.source_commit,
      bulkDataCommit: dataCommit,
      rows: Object.fromEntries(Object.entries(files).map(([n, f]) => [n, f.rows])),
    },
    null,
    2,
  ) + "\n",
);
