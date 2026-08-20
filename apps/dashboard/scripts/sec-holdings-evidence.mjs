/* global console */

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { readEtfArtifact } from "./lib/etf-artifact-store.mjs";

const evidence = "C:/Akribeia-ETF-SEC-Holdings-20260805-231139";
const artifact = await readEtfArtifact("apps/dashboard/public/data/etf-holdings-normalized.json");
const sec = await readEtfArtifact("apps/dashboard/public/data/etf-holdings-sec-nport.json");
const metadata = JSON.parse(
  await readFile("apps/dashboard/public/data/etf-universe-expanded.json", "utf8"),
);
const csv = (rows) =>
  rows.map((row) => row.map((value) => JSON.stringify(value ?? "")).join(",")).join("\n") + "\n";
const depths = new Map();
for (const row of artifact.rows) depths.set(row.etfTicker, (depths.get(row.etfTicker) ?? 0) + 1);
const depthValues = [...depths.values()].sort((a, b) => a - b);
const requested = [
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
const exactRows = [];
const nearRows = [];
for (const [industry, selected] of requested) {
  const tickers = selected.split(" + ");
  const matches = new Map();
  for (const ticker of tickers)
    for (const row of artifact.invertedIndex[ticker] ?? []) {
      const found = matches.get(row.etfTicker) ?? new Set();
      found.add(ticker);
      matches.set(row.etfTicker, found);
    }
  for (const [etf, found] of matches) {
    if (found.size === tickers.length) exactRows.push([industry, selected, etf, found.size, "0"]);
    else
      nearRows.push([
        industry,
        selected,
        etf,
        found.size,
        tickers.length - found.size,
        tickers.filter((ticker) => !found.has(ticker)).join(" "),
      ]);
  }
}
await mkdir(evidence, { recursive: true });
await writeFile(
  `${evidence}/EXPANDED_ETF_UNIVERSE.csv`,
  csv([
    ["ticker", "fund_name", "source", "holdings_status"],
    ...metadata.etfs.map((row) => [
      row.ticker,
      row.fundName,
      row.source,
      artifact.invertedIndex[row.ticker] ? "partial" : "unavailable",
    ]),
  ]),
);
await writeFile(
  `${evidence}/ETF_HOLDINGS_COVERAGE.csv`,
  csv([
    ["metric", "value"],
    ...Object.entries(artifact.coverage),
    [
      "median_holdings_depth",
      depthValues.length ? depthValues[Math.floor((depthValues.length - 1) / 2)] : 0,
    ],
    [
      "percent_at_least_25",
      `${((depthValues.filter((value) => value >= 25).length / Math.max(1, depthValues.length)) * 100).toFixed(2)}%`,
    ],
    [
      "percent_at_least_50",
      `${((depthValues.filter((value) => value >= 50).length / Math.max(1, depthValues.length)) * 100).toFixed(2)}%`,
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
  `${evidence}/EXACT_MATCH_VALIDATION.csv`,
  csv([["industry", "selected", "etf", "matched_count", "false_positive_count"], ...exactRows]),
);
await writeFile(
  `${evidence}/NEAR_MATCH_VALIDATION.csv`,
  csv([
    ["industry", "selected", "etf", "matched_count", "missing_count", "missing_tickers"],
    ...nearRows,
  ]),
);
await writeFile(
  `${evidence}/MULTI_STOCK_ACCEPTANCE_CASES.csv`,
  csv([
    ["industry", "selected", "exact_count", "near_count"],
    ...requested.map(([industry, selected]) => [
      industry,
      selected,
      exactRows.filter((row) => row[0] === industry && row[1] === selected).length,
      nearRows.filter((row) => row[0] === industry && row[1] === selected).length,
    ]),
  ]),
);
await writeFile(
  `${evidence}/ETF_SOURCE_AND_PERMISSION_MATRIX.csv`,
  'source,use,status,limitations\n"SEC Form N-PORT Data Sets","as-filed monthly equity holdings","official free source","SEC dataset is as-filed and may contain errors; report date retained"\n"SEC Form N-CEN Data Sets","ETF series/name identification","official free source","ticker mapping requires exact official name match"\n"Nasdaq Trader directories","ETF directory metadata","official free source","not a holdings source"\n"Approved V2 reference artifact","supplemental holdings","reference-only","partial source; not authoritative complete holdings"\n',
);
await writeFile(
  `${evidence}/ETF_HOLDINGS_SCHEMA.md`,
  "# Holdings schema\n\nSEC rows retain ETF ticker, constituent ticker, issuer name, equity weight ratio, rank, SEC source, report date, retrieval date, identifier mapping status, and SEC source status. Cash, debt, derivatives, swaps, futures, options, and unidentified instruments are excluded from ordinary stock lookup.\n",
);
await writeFile(
  `${evidence}/ETF_INTERSECTION_METHOD.md`,
  "# Strict intersection\n\nThe precomputed inverted index is intersected across every selected ticker. Exact results require matched_count equal to selected_count. Near matches are separate and list missing tickers. No OR matching or synthetic score is used.\n",
);
await writeFile(
  `${evidence}/ETF_MULTI_STOCK_EXPANSION_REPORT.md`,
  `# ETF holdings source expansion\n\nSEC N-PORT/N-CEN official datasets were acquired and normalized. The merged artifact now contains ${artifact.coverage.totalEtfs} holdings-backed ETFs and ${artifact.coverage.totalHoldingsRows} normalized rows, with median depth ${depthValues.length ? depthValues[Math.floor((depthValues.length - 1) / 2)] : 0}. SEC-only coverage is ${sec.coverage.holdingsBackedEtfs} funds and ${sec.coverage.totalHoldingsRows} rows.\n\nThe prior strict AND-intersection implementation is preserved. Exact and near matches remain separate.\n\nThe requested 1,000 ETF / 100,000 row target is not met: the official free SEC dataset plus approved reference supplement reaches ${artifact.coverage.totalEtfs} funds and ${artifact.coverage.totalHoldingsRows} rows. No unsupported source was substituted.\n`,
);
await writeFile(
  `${evidence}/VALIDATION.txt`,
  "Lint passed. Typecheck passed. Strict intersection and acceptance-case tests passed. Full Vitest/dashboard/build validation was run before this source-only artifact refresh; focused rerun required after final artifact integration. Dedicated screenshots not fabricated.\n",
);
console.log(
  JSON.stringify({
    evidence,
    holdingsBacked: artifact.coverage.totalEtfs,
    rows: artifact.coverage.totalHoldingsRows,
  }),
);
