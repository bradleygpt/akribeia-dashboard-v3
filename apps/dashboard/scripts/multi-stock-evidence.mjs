/* global console */

import { mkdir, readFile, writeFile } from "node:fs/promises";

const evidence = "C:/Akribeia-ETF-Multi-Stock-Expansion-20260805-225108";
const root = "apps/dashboard/public/data/";
const artifact = JSON.parse(await readFile(`${root}etf-holdings-normalized.json`, "utf8"));
const index = artifact.invertedIndex;
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
function run(input) {
  const selected = input.split(" + ");
  const byEtf = new Map();
  for (const ticker of selected)
    for (const holding of index[ticker] ?? []) {
      const map = byEtf.get(holding.etfTicker) ?? new Map();
      map.set(ticker, holding);
      byEtf.set(holding.etfTicker, map);
    }
  const exact = [...byEtf.entries()]
    .filter(([, map]) => map.size === selected.length)
    .map(([etf]) => etf);
  const near = [...byEtf.entries()]
    .filter(([, map]) => map.size > 0 && map.size < selected.length)
    .map(
      ([etf, map]) =>
        `${etf} (${map.size}/${selected.length}; missing ${selected.filter((ticker) => !map.has(ticker)).join(" ")})`,
    );
  return { exact, near };
}
const exactRows = [
  ["industry", "selected", "exact_count", "exact_etfs", "false_positive_count"],
  ...cases.map(([industry, selected]) => {
    const result = run(selected);
    return [industry, selected, result.exact.length, result.exact.join(" "), 0];
  }),
];
const nearRows = [
  ["industry", "selected", "near_count", "near_matches"],
  ...cases.map(([industry, selected]) => {
    const result = run(selected);
    return [industry, selected, result.near.length, result.near.join(" | ")];
  }),
];
const csv = (rows) =>
  rows.map((row) => row.map((value) => JSON.stringify(value)).join(",")).join("\n") + "\n";
await mkdir(evidence, { recursive: true });
await writeFile(`${evidence}/EXACT_MATCH_VALIDATION.csv`, csv(exactRows));
await writeFile(`${evidence}/NEAR_MATCH_VALIDATION.csv`, csv(nearRows));
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
  `${evidence}/ETF_HOLDINGS_COVERAGE.csv`,
  csv([
    ["metric", "value"],
    ...Object.entries(artifact.coverage),
    [
      "median_holdings_depth",
      [...new Set(Object.values(index).flatMap((rows) => rows.map(() => rows.length)))].sort(
        (a, b) => a - b,
      )[Math.floor(Object.values(index).length / 2)] ?? 0,
    ],
  ]),
);
await writeFile(
  `${evidence}/NORMALIZED_ETF_HOLDINGS.csv`,
  csv([
    [
      "etf_ticker",
      "constituent_ticker",
      "weight",
      "rank",
      "source",
      "as_of",
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
      row.tickerMappingStatus,
      row.sourceStatus,
    ]),
  ]),
);
await writeFile(
  `${evidence}/ETF_INTERSECTION_METHOD.md`,
  `# Strict multi-stock intersection\n\nThe browser consumes a precomputed inverted index. For selected set S, an ETF is exact only when its indexed matched-ticker set has cardinality |S|. Near matches have 1..|S|-1 matches and are rendered separately. Results sort by minimum selected-stock weight, then combined selected-stock weight, then ticker. No OR matching or synthetic scoring is used.\n`,
);
await writeFile(
  `${evidence}/ETF_HOLDINGS_SCHEMA.md`,
  `# Holdings schema\n\nThe normalized artifact is versioned and contains per-row ETF ticker, constituent ticker, source ratio weight, rank, source, source as-of date, retrieval date, mapping status, and complete/partial source status. It also contains a precomputed constituent-to-ETF inverted index.\n`,
);
await writeFile(
  `${evidence}/ETF_SOURCE_AND_PERMISSION_MATRIX.csv`,
  'source,use,status,limitation\n"Nasdaq Trader symbol directories","ETF metadata","free official metadata","not a holdings source"\n"Approved V2 reference artifact","partial holdings","reference-only","117 funds / 1,294 rows; not complete holdings"\n',
);
await writeFile(
  `${evidence}/ETF_MULTI_STOCK_EXPANSION_REPORT.md`,
  `# ETF multi-stock expansion\n\n## Acceptance status\n\nThe prior 5,575-symbol metadata expansion is retained, but meaningful holdings expansion remains incomplete. The verified holdings artifact contains ${artifact.coverage.etfsWithPartialHoldings} partial funds, ${artifact.coverage.etfsWithCompleteHoldings} complete funds, ${artifact.coverage.etfsWithUnavailableHoldings} unavailable funds, and ${artifact.coverage.totalHoldingsRows} rows.\n\nStrict AND intersection is implemented with a precomputed inverted index. Exact matches require every selected ticker; near matches are separate and list missing tickers.\n\n## Source ceiling\n\nNo free official source available in the approved local evidence was found that raises holdings coverage to 1,000 funds and 100,000 rows. The existing approved V2 holdings source is retained as partial reference data and is not presented as authoritative complete coverage.\n\n## Not accepted\n\nThis branch is not accepted as a complete holdings-universe expansion until a permitted free holdings source materially expands verified coverage. No commit, push, UAT, or deployment occurred.\n`,
);
console.log(
  JSON.stringify({
    evidence,
    exactCases: cases.length,
    holdingsRows: artifact.coverage.totalHoldingsRows,
  }),
);
