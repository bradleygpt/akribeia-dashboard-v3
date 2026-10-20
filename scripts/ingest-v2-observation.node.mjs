// Point-in-time V2 observation ingestion (roadmap: replace the preserved
// snapshot input with scheduled live-source ingestion).
//
// Fetches the current V2 universe partitions from the commit-pinned bulk data
// repository (bradleygpt/akribeia-data via jsDelivr — the same delivery path
// the V2 application uses) plus the matching bake metadata, validates them
// against each other, and writes one receipted observation into
// data/observations/current/ together with an updated pipeline recipe at
// data/preview/vertical-slice-build.json.
//
// Source of the bake metadata: one V2 source commit (--v2-commit). The nightly
// bake commits public/data/meta.json and public/data/freshness_manifest.json to
// bradleygpt/quant-dashboard-pro-v2, and the manifest's `blob` block names the
// akribeia-data commit V2 serves plus every universe file's SHA-256. Reading
// both from that one commit binds meta, data commit and bytes together; each
// partition must hash to the manifest's digest. This replaced reading meta.json
// from the deployed V2 app, which returns HTTP 402 DEPLOYMENT_DISABLED since
// 2026-10-14 and failed every scheduled refresh from then on.
//
// Fail-closed: any fetch failure, shape mismatch, commit or digest mismatch
// between the V2 manifest and the universe files, or stale generated_at aborts
// without touching the observation directory or the recipe.
//
// The immutable V2-to-V3 parity fixtures under data/reference/v2-baseline are
// never modified by this script.
//
// Usage: node scripts/ingest-v2-observation.node.mjs --v2-commit <quant-dashboard-pro-v2-sha>
//   [<akribeia-data-commit-sha>]   (optional; must equal the V2 manifest's pin)
//   [--max-age-hours 48]
// Legacy explicit form (no manifest binding):
//   node scripts/ingest-v2-observation.node.mjs <akribeia-data-commit-sha> --meta-url <url>

import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const FLOORS = [0, 1, 10];
const RECIPE_PATH = "data/preview/vertical-slice-build.json";
const OBS_DIR = "data/observations/current";
const STAGE_DIR = "data/observations/.staging";

const V2_REPOSITORY = "bradleygpt/quant-dashboard-pro-v2";
const BULK_DATA_REPOSITORY = "bradleygpt/akribeia-data";

const args = process.argv.slice(2);
const FLAGS = ["--v2-commit", "--meta-url", "--max-age-hours"];
const flag = (name) => {
  const index = args.indexOf(name);
  return index === -1 ? undefined : args[index + 1];
};
const flagValueIndexes = new Set(
  FLAGS.map((name) => args.indexOf(name)).flatMap((index) => (index === -1 ? [] : [index + 1])),
);
const positional = args.filter((a, index) => !FLAGS.includes(a) && !flagValueIndexes.has(index));
const usage = () => {
  process.stderr.write(
    "usage: ingest-v2-observation.node.mjs --v2-commit <sha> [<akribeia-data-commit-sha>]\n" +
      "   or: ingest-v2-observation.node.mjs <akribeia-data-commit-sha> --meta-url <url>\n",
  );
  process.exit(2);
};
const v2Commit = flag("--v2-commit");
const explicitDataCommit = positional.find((a) => /^[0-9a-f]{7,40}$/.test(a));
if (v2Commit !== undefined && !/^[0-9a-f]{40}$/.test(v2Commit)) usage();
if (v2Commit === undefined && (!explicitDataCommit || flag("--meta-url") === undefined)) usage();
const maxAgeHours = Number(flag("--max-age-hours") ?? 48);

const sha256 = (buf) => createHash("sha256").update(buf).digest("hex");
const v2RawUrl = (path) => `https://raw.githubusercontent.com/${V2_REPOSITORY}/${v2Commit}/${path}`;

async function fetchBytes(url) {
  const res = await globalThis.fetch(url, { redirect: "follow" });
  if (!res.ok) throw new Error(`fetch ${url} -> HTTP ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

// The bulk-data pin V2 serves at this commit, with each universe file's digest.
let blob = null;
if (v2Commit !== undefined) {
  const manifest = JSON.parse(
    (await fetchBytes(v2RawUrl("public/data/freshness_manifest.json"))).toString("utf8"),
  );
  blob = manifest.blob;
  if (!blob || !/^[0-9a-f]{40}$/.test(blob.commit_sha ?? "") || typeof blob.files !== "object") {
    throw new Error(`V2 ${v2Commit} freshness_manifest.json has no usable blob pin`);
  }
  if (explicitDataCommit && !blob.commit_sha.startsWith(explicitDataCommit)) {
    throw new Error(
      `akribeia-data ${explicitDataCommit} is not the commit V2 ${v2Commit} serves (${blob.commit_sha})`,
    );
  }
}
const dataCommit = blob?.commit_sha ?? explicitDataCommit;
const metaUrl = flag("--meta-url") ?? v2RawUrl("public/data/meta.json");

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
  const name = `universe_floor${floor}.json`;
  const url = `https://cdn.jsdelivr.net/gh/${BULK_DATA_REPOSITORY}@${dataCommit}/data/${name}`;
  const bytes = await fetchBytes(url);
  const pinned = blob?.files?.[name];
  if (blob && (!pinned || sha256(bytes) !== pinned.sha256)) {
    throw new Error(`${name} does not match the SHA-256 V2 ${v2Commit} pins for it`);
  }
  if (blob && !/^\d{4}-\d{2}-\d{2}$/.test(pinned.as_of ?? "")) {
    throw new Error(`V2 ${v2Commit} records no as_of data date for ${name}`);
  }
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
    asOf: pinned?.as_of ?? null,
  };
}

// The universe files and meta must describe the same bake: every partition's
// row set is produced in the same nightly chain that stamps meta.generated_at.
// The bulk repo carries no per-file commit stamp, so the receipt binds the
// akribeia-data commit, the meta source_commit, and both timestamps together.
// With --v2-commit the V2 manifest's per-file as_of is recorded beside each
// digest. observed_at (and the build id's date) stays the observation run date,
// meta.generated_at; data_as_of is the files' own data date -- the OLDEST
// partition's as_of -- and is what freshness is measured from downstream.
// The ingest's own --max-age-hours check stays on the run: it guards against
// ingesting from a stalled V2 bake, and on a Monday the newest market data is
// legitimately Friday's.
const asOfDates = Object.values(files).map((f) => f.asOf);
const dataAsOf = blob ? `${asOfDates.toSorted()[0]}T00:00:00Z` : undefined;

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
  bulk_data_repository: BULK_DATA_REPOSITORY,
  bulk_data_commit: dataCommit,
  delivery: "commit-pinned jsDelivr",
  meta_url: metaUrl,
  v2_source_commit: meta.source_commit,
  ...(dataAsOf ? { data_as_of: dataAsOf } : {}),
  ...(blob
    ? {
        v2_repository: V2_REPOSITORY,
        v2_commit: v2Commit,
        v2_blob_version: blob.version ?? null,
        v2_blob_published_at: blob.published_at ?? null,
      }
    : {}),
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
        ...(f.asOf ? { as_of: f.asOf } : {}),
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
// A legacy-form ingest must not inherit the previous observation's data date.
delete previousRecipe.dataAsOf;
const recipe = {
  ...previousRecipe,
  // v6: model 3.1.0 (ETFs not applicable, input-less pillars dropped), 2026-10-20.
  buildId: `preview-${stamp}-pipeline-v6-${sourceHash12}`,
  evaluatedAt: retrievedAt.toISOString().replace(/\.\d{3}Z$/, "Z"),
  observedAt: observedAt.toISOString().replace(/\.\d{3}Z$/, "Z"),
  ...(dataAsOf ? { dataAsOf } : {}),
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
      dataAsOf: recipe.dataAsOf ?? null,
      v2SourceCommit: meta.source_commit,
      bulkDataCommit: dataCommit,
      rows: Object.fromEntries(Object.entries(files).map(([n, f]) => [n, f.rows])),
    },
    null,
    2,
  ) + "\n",
);
