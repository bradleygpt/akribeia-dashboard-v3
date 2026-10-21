// Advance the V2 reference pin (owner decision 2026-10-21).
//
// Market Health (market_static.json, pgi_money_market.json) and the research-reference routes
// (27 datasets) read quant-dashboard-pro-v2 public/data at V2_APP_COMMIT, compiled into the
// Worker. Nothing advanced it, so the watchdog's lapsed_pin (3 market sessions, aged by the
// pinned commit's own date) fired every few sessions. The point-in-time refresh now runs this:
//
//   1. find the newest HEALTHY nightly bake on pro-v2 main: a "data: nightly local bake ..."
//      commit whose chain ran validate (Phase E pushes only after validate + publish). Not a
//      later non-data commit: the watchdog would read the pin as fresher than its data;
//   2. never move backwards: it must be newer than the current pin;
//   3. every pinned file must answer HTTP 200 at it, parse as JSON and fit the route's 2 MB cap;
//   4. only then replace the SHA in the two Worker files and the two tests that assert it, all
//      together (the refresh's own CI gate then validates the change like any other).
//
// Any failed check KEEPS the old pin: disposition "kept", reason given, exit 0 -- the refresh
// must never fail over the pin. Usage:
//   node scripts/advance-v2-pin.node.mjs [--commit <sha>] [--dry-run] [--summary-path <file>]

import { Buffer } from "node:buffer";
import { readFile, writeFile } from "node:fs/promises";

const REPO = "bradleygpt/quant-dashboard-pro-v2";
const WORKERS = [
  "apps/dashboard/worker/market-health-api.ts",
  "apps/dashboard/worker/research-reference-api.ts",
];
const TESTS = [
  "tests/dashboard/market-health-api.test.ts",
  "tests/dashboard/research-workflows.test.ts",
];
const SOURCE_LIMIT_BYTES = 2_000_000; // research-reference-api.ts DEFAULT_SOURCE_LIMIT
const HEALTHY_BAKE = /^data: nightly local bake \S+ \(chain: [^)]*\bvalidate\b[^)]*\)/;
const PIN = /V2_APP_COMMIT = "([0-9a-f]{40})"/;

const args = process.argv.slice(2);
const flag = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined);
const dryRun = args.includes("--dry-run");
const summaryPath = flag("--summary-path");
const token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;

const say = (line) => process.stderr.write(`${line}\n`);

async function github(path) {
  const response = await globalThis.fetch(`https://api.github.com/repos/${REPO}/${path}`, {
    headers: {
      accept: "application/vnd.github+json",
      "user-agent": "akribeia-v2-pin",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
  });
  if (!response.ok) throw new Error(`GitHub ${path} -> HTTP ${response.status}`);
  return response.json();
}

/** Every pro-v2 public/data file the Worker reads at V2_APP_COMMIT. */
async function pinnedFiles() {
  const health = await readFile(WORKERS[0], "utf8");
  const research = await readFile(WORKERS[1], "utf8");
  const files = [...health.matchAll(/\$\{V2_APP_COMMIT\}\/public\/data\/([a-z0-9_]+\.json)/g)].map(
    (m) => m[1],
  );
  const datasets = research.match(/const DATASETS = \{([\s\S]*?)\} as const/);
  if (!datasets) throw new Error("DATASETS not found in research-reference-api.ts");
  // earnings datasets come from the bulk-data repo at BULK_DATA_COMMIT, not from this pin
  const bulk = research.match(/EARNINGS_DATASETS = new Set<Dataset>\(\[([^\]]*)\]/);
  const bulkKeys = new Set([...(bulk?.[1] ?? "").matchAll(/"([a-z-]+)"/g)].map((m) => m[1]));
  for (const [, key, file] of datasets[1].matchAll(/"?([a-z0-9-]+)"?:\s*"([a-z0-9_]+\.json)"/g)) {
    if (!bulkKeys.has(key)) files.push(file);
  }
  return [...new Set(files)];
}

async function main() {
  const summary = { disposition: "kept", from: null, to: null, files_checked: 0, failures: [] };
  const finish = async () => {
    const text = JSON.stringify(summary, null, 2);
    if (summaryPath) await writeFile(summaryPath, `${text}\n`);
    process.stdout.write(`${JSON.stringify(summary)}\n`);
  };

  try {
    const pins = await Promise.all(
      WORKERS.map(async (p) => (await readFile(p, "utf8")).match(PIN)?.[1]),
    );
    if (!pins[0] || pins[0] !== pins[1])
      throw new Error(`Worker pins disagree or are missing: ${pins}`);
    summary.from = pins[0];

    let candidate = flag("--commit");
    let candidateDate;
    if (candidate) {
      const commit = await github(`commits/${candidate}`);
      candidate = commit.sha;
      candidateDate = commit.commit.committer.date;
      if (!HEALTHY_BAKE.test(commit.commit.message))
        throw new Error(`${candidate.slice(0, 9)} is not a healthy nightly bake commit`);
    } else {
      const commits = await github("commits?sha=main&per_page=60");
      const bake = commits.find((c) => HEALTHY_BAKE.test(c.commit.message));
      if (!bake) throw new Error("no healthy nightly bake among pro-v2's last 60 commits");
      candidate = bake.sha;
      candidateDate = bake.commit.committer.date;
    }
    summary.to = candidate;
    summary.to_date = candidateDate;
    say(
      `current pin ${summary.from.slice(0, 9)} | newest healthy bake ${candidate.slice(0, 9)} (${candidateDate})`,
    );

    if (candidate === summary.from) {
      summary.disposition = "unchanged";
      return await finish();
    }
    const current = await github(`commits/${summary.from}`);
    if (Date.parse(candidateDate) <= Date.parse(current.commit.committer.date))
      throw new Error(`newest bake ${candidate.slice(0, 9)} is not newer than the pin`);

    const files = await pinnedFiles();
    for (const file of files) {
      const url = `https://raw.githubusercontent.com/${REPO}/${candidate}/public/data/${file}`;
      try {
        const response = await globalThis.fetch(url);
        const body = await response.text();
        if (!response.ok) summary.failures.push(`${file}: HTTP ${response.status}`);
        else if (Buffer.byteLength(body) > SOURCE_LIMIT_BYTES)
          summary.failures.push(
            `${file}: ${Buffer.byteLength(body)} bytes > ${SOURCE_LIMIT_BYTES}`,
          );
        else JSON.parse(body);
      } catch (error) {
        summary.failures.push(`${file}: ${error instanceof Error ? error.message : error}`);
      }
    }
    summary.files_checked = files.length;
    say(
      `${files.length} pinned files checked at ${candidate.slice(0, 9)}: ${summary.failures.length} failed`,
    );
    if (summary.failures.length > 0) {
      summary.reason = "a pinned file failed at the newest bake";
      return await finish();
    }

    const edits = [];
    for (const path of [...WORKERS, ...TESTS]) {
      const text = await readFile(path, "utf8");
      const count = text.split(summary.from).length - 1;
      if (count === 0) throw new Error(`${path} does not contain the current pin`);
      edits.push([path, text.split(summary.from).join(candidate), count]);
    }
    if (!dryRun) for (const [path, text] of edits) await writeFile(path, text);
    summary.disposition = dryRun ? "would-advance" : "advanced";
    summary.edited = Object.fromEntries(edits.map(([path, , count]) => [path, count]));
  } catch (error) {
    summary.disposition = "kept";
    summary.reason = error instanceof Error ? error.message : String(error);
  }
  await finish();
}

await main();
