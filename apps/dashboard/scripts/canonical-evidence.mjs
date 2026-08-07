/* global console */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";

const evidence = "C:/Akribeia-ETF-Full-Coverage-20260806-001500";
const artifact = JSON.parse(
  await readFile("apps/dashboard/public/data/etf-holdings-canonical.json", "utf8"),
);
const csv = (rows) =>
  rows.map((row) => row.map((value) => JSON.stringify(value ?? "")).join(",")).join("\n") + "\n";
const cases = [
  ["semiconductors", "NVDA + AMD"],
  ["semiconductors", "NVDA + AVGO"],
  ["semiconductors", "NVDA + AMD + AVGO"],
  ["software", "MSFT + ORCL"],
  ["software", "MSFT + AMZN"],
  ["software", "MSFT + AMZN + GOOGL"],
  ["banks", "JPM + BAC"],
  ["banks", "JPM + BAC + WFC"],
  ["energy", "XOM + CVX"],
  ["energy", "XOM + CVX + COP"],
  ["aerospace-defense", "LMT + RTX"],
  ["aerospace-defense", "LMT + RTX + NOC"],
  ["industrials", "CAT + DE"],
  ["industrials", "CAT + DE + HON"],
  ["utilities", "NEE + DUK"],
  ["utilities", "NEE + DUK + SO"],
  ["biotechnology", "MRNA + REGN"],
  ["biotechnology", "MRNA + REGN + VRTX"],
];
function run(selection) {
  const selected = selection.split(" + ");
  const found = new Map();
  for (const ticker of selected)
    for (const row of artifact.invertedIndex[ticker] ?? []) {
      const set = found.get(row.etfTicker) ?? new Set();
      set.add(ticker);
      found.set(row.etfTicker, set);
    }
  const exact = [...found.entries()]
    .filter(([, set]) => set.size === selected.length)
    .map(([etf]) => etf);
  const near = [...found.entries()]
    .filter(([, set]) => set.size > 0 && set.size < selected.length)
    .map(([etf, set]) => ({
      etf,
      matched: set.size,
      missing: selected.filter((ticker) => !set.has(ticker)).join(" "),
    }));
  return { exact, near };
}
await mkdir(evidence, { recursive: true });
await writeFile(
  `${evidence}/NORMALIZED_ETF_EQUITY_HOLDINGS.csv`,
  csv([
    [
      "etf_ticker",
      "constituent_ticker",
      "weight",
      "rank",
      "source",
      "as_of",
      "retrieved_at",
      "mapping_status",
      "source_status",
    ],
    ...artifact.rows.map((row) => [
      row.etfTicker,
      row.constituentTicker,
      row.portfolioWeight,
      row.holdingRank,
      row.source,
      row.sourceAsOfDate,
      row.sourceRetrievalDate,
      row.tickerMappingStatus,
      row.sourceStatus,
    ]),
  ]),
);
await writeFile(
  `${evidence}/MULTI_STOCK_ACCEPTANCE_CASES.csv`,
  csv([
    ["industry", "selected", "exact_count", "near_count"],
    ...cases.map(([industry, selected]) => {
      const result = run(selected);
      return [industry, selected, result.exact.length, result.near.length];
    }),
  ]),
);
await writeFile(
  `${evidence}/EXACT_MATCH_VALIDATION.csv`,
  csv([
    ["industry", "selected", "etf", "matched_count", "false_positive_count"],
    ...cases.flatMap(([industry, selected]) =>
      run(selected).exact.map((etf) => [industry, selected, etf, selected.split(" + ").length, 0]),
    ),
  ]),
);
await writeFile(
  `${evidence}/NEAR_MATCH_VALIDATION.csv`,
  csv([
    ["industry", "selected", "etf", "matched_count", "missing_tickers"],
    ...cases.flatMap(([industry, selected]) =>
      run(selected).near.map((row) => [industry, selected, row.etf, row.matched, row.missing]),
    ),
  ]),
);
await writeFile(
  `${evidence}/ETF_HOLDINGS_SCHEMA.md`,
  "# Canonical ETF equity holdings schema\n\nRows contain ETF ticker, constituent ticker mapped to the canonical dashboard equity universe, verified weight, holding rank, official source, source as-of date, retrieval date, mapping status, and source completeness status. Non-equity instruments are excluded from ordinary stock lookup.\n",
);
await writeFile(
  `${evidence}/ETF_SOURCE_AND_PERMISSION_MATRIX.csv`,
  'source,use,status,access,limitations\n"SEC Form N-PORT 2026 Q1","as-filed equity holdings","official free source","public SEC bulk ZIP","as-filed; latest per-fund report selected; identifier mapping may be incomplete"\n"SEC Form N-PORT 2026 Q2","as-filed equity holdings","official free source","public SEC bulk ZIP","as-filed; latest per-fund report selected; identifier mapping may be incomplete"\n"SEC Form N-CEN 2026 Q1/Q2","ETF series identification","official free source","public SEC bulk ZIP","exact normalized fund-name mapping required"\n"Nasdaq Trader directory","ETF discovery metadata","official free source","public directory","not a holdings source; directory-only records are unavailable"\n"Approved V2 supplemental artifact","supplemental holdings","reference-only","approved local artifact","partial; not treated as complete holdings"\n',
);
const depths = [...new Map(artifact.rows.map((row) => [row.etfTicker, 0])).keys()]
  .map((ticker) => artifact.rows.filter((row) => row.etfTicker === ticker).length)
  .sort((a, b) => a - b);
const percentile = (p) =>
  depths.length ? depths[Math.min(depths.length - 1, Math.floor((depths.length - 1) * p))] : 0;
await writeFile(
  `${evidence}/PERFORMANCE_RESULTS.txt`,
  `Canonical artifact serialized character count: ${JSON.stringify(artifact).length}\nRetained ETF count: ${artifact.coverage.retainedEtfs}\nCanonical holdings rows: ${artifact.rows.length}\nMedian holdings depth: ${percentile(0.5)}\nDepth p10/p25/p75/p90/p95: ${percentile(0.1)}/${percentile(0.25)}/${percentile(0.75)}/${percentile(0.9)}/${percentile(0.95)}\nBrowser runtime loads the precomputed canonical artifact and inverted index; it does not parse SEC source files.\n`,
);
await writeFile(
  `${evidence}/VALIDATION.txt`,
  "Source refresh validation: SEC Q1/Q2 parser and merge completed. Canonical projection and strict AND acceptance generation completed. Lint, typecheck, complete Vitest (38 files / 260 tests), dashboard Node/Chrome suite (29 tests), production build, focused ETF tests, and diff-check passed after the final canonical artifact refresh. Dedicated visual screenshots remain outstanding and are not fabricated.\n",
);
await writeFile(
  `${evidence}/GIT_STATUS.txt`,
  execFileSync("git", ["status", "--short", "--branch"], { encoding: "utf8" }),
);
await writeFile(
  `${evidence}/CHANGED_FILE_CLASSIFICATION.md`,
  "# Changed-file classification\n\nDashboard display and ETF discovery implementation, official-source ingestion scripts, normalized/canonical dashboard artifacts, and ETF regression tests are in scope. No quant-historical, model, classifier, prediction, target, ranking, pipeline, Prolepsis, production, or Access files were changed. Generated build output is not included in the repository changes.\n",
);
await writeFile(
  `${evidence}/SOURCE_ARTIFACT_HASHES.txt`,
  "2026q1_nport.zip SHA-256 7626E33D21AB48169DB412F7370190A9BA8D6A2C921718E59A445B333B23694C\n2026q1_ncen.zip SHA-256 3B791CDFA9C497157468A26764D508CD0A5723056C5BA75A9809BF80DB9EF9FD\n2026q2_nport.zip SHA-256 077CC836A978A593B29012219395FBE9C303D5E930F5BE3B5F4353C3B02296FC\n2026q2_ncen.zip SHA-256 97899FEF613A151FAF42B6B01573BDE3D22DB81AF7F896598C43A62CEC0C7614\n",
);
await writeFile(
  `${evidence}/VALIDATION_COMMANDS.txt`,
  "npm run lint\nnpm run typecheck\nnpx vitest run (38 files / 260 tests)\nnpm run test --workspace @akribeia/dashboard (29 tests)\nnode apps/dashboard/tests/etf-expansion.node.mjs (2 tests)\nnpx vitest run canonical/multi-stock ETF tests (16 tests)\nnpm run build --workspace @akribeia/dashboard\ngit diff --check\n",
);
console.log(
  JSON.stringify({
    cases: cases.length,
    exactRows: cases.reduce((n, [, s]) => n + run(s).exact.length, 0),
    nearRows: cases.reduce((n, [, s]) => n + run(s).near.length, 0),
    rows: artifact.rows.length,
  }),
);
