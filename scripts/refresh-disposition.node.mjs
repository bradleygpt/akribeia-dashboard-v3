// Final disposition of a point-in-time refresh run (owner decision 2026-10-21).
//
// The PC's nightly starts the refresh as soon as its bake has published; GitHub's 05:45 UTC
// schedule stays as a backup and in practice runs hours later. When the backup (or any repeat)
// finds that observation date already has a refresh PR or a no-new-upstream-data PR -- open, or
// merged -- it must do nothing: no second PR, no stall day, no ledger entry. The ingest alone
// cannot see that while the first run's PR is still open (main still holds the previous
// observation, so the same bake ingests again), so this asks GitHub.
//
// Usage: node scripts/refresh-disposition.node.mjs --ingest-summary <file> [--repo owner/name]
// stdout: {"disposition", "observationDate", "proposal": {number, state, head} | null}
// dispositions: ingested | no-new-upstream-data | already-observed | already-proposed
// A closed-unmerged PR does not count, so a failed first attempt can be retried by the backup.
// A GitHub API failure exits 1: a run that cannot tell must not risk a duplicate PR.

import { readFile } from "node:fs/promises";

const args = process.argv.slice(2);
const flag = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined);
const summaryPath = flag("--ingest-summary");
const repo = flag("--repo") ?? process.env.GITHUB_REPOSITORY;
const token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;
if (!summaryPath || !repo) {
  process.stderr.write(
    "usage: refresh-disposition.node.mjs --ingest-summary <file> [--repo o/n]\n",
  );
  process.exit(2);
}

const ingest = JSON.parse(await readFile(summaryPath, "utf8"));
const observationDate = String(ingest.observationDate ?? ingest.observedAt ?? "").slice(0, 10);
const result = { disposition: ingest.disposition, observationDate, proposal: null };

if (ingest.disposition === "ingested" || ingest.disposition === "no-new-upstream-data") {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(observationDate)) {
    process.stderr.write(`ingest summary carries no observation date: ${JSON.stringify(ingest)}\n`);
    process.exit(1);
  }
  const heads = [`automation/point-in-time-refresh-${observationDate}-`];
  const stallHead = `automation/no-new-upstream-data-${observationDate}`;
  // Newest first; a day's PR is among the most recent, three pages is ample.
  for (let page = 1; page <= 3 && result.proposal === null; page += 1) {
    const response = await globalThis.fetch(
      `https://api.github.com/repos/${repo}/pulls?state=all&sort=created&direction=desc&per_page=100&page=${page}`,
      {
        headers: {
          accept: "application/vnd.github+json",
          "user-agent": "akribeia-refresh-disposition",
          ...(token ? { authorization: `Bearer ${token}` } : {}),
        },
      },
    );
    if (!response.ok) {
      process.stderr.write(`GitHub pull list -> HTTP ${response.status}\n`);
      process.exit(1);
    }
    const pulls = await response.json();
    const match = pulls.find(
      (pr) =>
        (heads.some((prefix) => pr.head?.ref?.startsWith(prefix)) || pr.head?.ref === stallHead) &&
        (pr.state === "open" || pr.merged_at),
    );
    if (match) {
      result.proposal = {
        number: match.number,
        state: match.merged_at ? "merged" : "open",
        head: match.head.ref,
      };
      result.disposition = "already-proposed";
    }
    if (pulls.length < 100) break;
  }
}

process.stdout.write(`${JSON.stringify(result)}\n`);
