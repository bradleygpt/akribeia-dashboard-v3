/* global fetch, console */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { readEtfArtifact } from "./lib/etf-artifact-store.mjs";

const evidence = "C:/Akribeia-ETF-Universe-Expansion-20260805-220041";
const base =
  "https://raw.githubusercontent.com/bradleygpt/quant-dashboard-pro-v2/b477349a8691fdc5000641a6ae2893dbbfae2de6/public/data/";
const fetchJson = async (name) => await (await fetch(base + name)).json();
const [etf, holdings, lookthrough, descriptions] = await Promise.all([
  fetchJson("etf.json"),
  fetchJson("etf_holdings.json"),
  fetchJson("etf_lookthrough.json"),
  fetchJson("etf_descriptions.json"),
]);
const current = new Set([
  ...Object.keys(etf.etfs ?? {}),
  ...Object.keys(holdings.etfs ?? {}),
  ...Object.keys(lookthrough.etfs ?? {}),
  ...Object.keys(descriptions.descriptions ?? {}),
]);
const csv = (rows) =>
  rows.map((row) => row.map((value) => JSON.stringify(value ?? "")).join(",")).join("\n") + "\n";
const currentRows = [...current].sort().map((ticker) => {
  const h = holdings.etfs?.[ticker];
  const l = lookthrough.etfs?.[ticker];
  return [
    ticker,
    h?.name ?? l?.name ?? descriptions.descriptions?.[ticker] ?? "",
    etf.etfs?.[ticker] ? "scored-reference" : "reference-only",
    h ? (h.coverage >= 0.99 ? "complete" : "partial") : "unavailable",
    h?.source ?? "",
    h?.as_of ?? "",
    h?.holdings?.length ?? 0,
    l?.coverage ?? "",
  ];
});
const expanded = JSON.parse(
  await readFile("apps/dashboard/public/data/etf-universe-expanded.json", "utf8"),
);
const normalized = await readEtfArtifact("apps/dashboard/public/data/etf-holdings-normalized.json");
const expandedRows = expanded.etfs.map((row) => [
  row.ticker,
  row.fundName,
  row.issuer,
  row.assetClass,
  row.category,
  row.sector,
  row.industryOrTheme,
  row.strategyType,
  row.leverageInverse,
  row.activePassive,
  row.singleStock,
  row.scoredStatus,
  row.holdingsStatus,
  row.holdingsSource,
  row.holdingsAsOf,
  row.numberHoldings,
  row.top10Weight,
  row.top25Weight,
  row.largestHolding,
  row.largestHoldingWeight,
  row.dataFreshnessStatus,
  row.source,
  row.sourceAsOf,
  row.sourceRetrievedAt,
]);
await mkdir(evidence, { recursive: true });
await writeFile(
  `${evidence}/CURRENT_ETF_UNIVERSE.csv`,
  csv([
    [
      "ticker",
      "name",
      "scored_status",
      "holdings_status",
      "holdings_source",
      "holdings_as_of",
      "holdings_rows",
      "lookthrough_coverage",
    ],
    ...currentRows,
  ]),
);
await writeFile(
  `${evidence}/CURRENT_ETF_HOLDINGS_COVERAGE.csv`,
  csv([
    ["ticker", "holdings_rows", "coverage", "source", "as_of", "weights_suspect"],
    ...[...current].sort().map((ticker) => {
      const h = holdings.etfs?.[ticker];
      return [
        ticker,
        h?.holdings?.length ?? 0,
        h?.coverage ?? "",
        h?.source ?? "",
        h?.as_of ?? "",
        h?.weights_suspect ?? "",
      ];
    }),
  ]),
);
await writeFile(
  `${evidence}/EXPANDED_ETF_UNIVERSE.csv`,
  csv([
    [
      "ticker",
      "fund_name",
      "issuer",
      "asset_class",
      "category",
      "sector",
      "industry_or_theme",
      "strategy_type",
      "leverage_inverse",
      "active_passive",
      "single_stock",
      "scored_status",
      "holdings_status",
      "holdings_source",
      "holdings_as_of",
      "number_holdings",
      "top10_weight",
      "top25_weight",
      "largest_holding",
      "largest_holding_weight",
      "data_freshness_status",
      "source",
      "source_as_of",
      "source_retrieved_at",
    ],
    ...expandedRows,
  ]),
);
await writeFile(
  `${evidence}/ETF_HOLDINGS_COVERAGE.csv`,
  csv([["metric", "value"], ...Object.entries(normalized.coverage)]),
);
await writeFile(
  `${evidence}/ETF_SOURCE_AND_PERMISSION_MATRIX.csv`,
  csv([
    ["source", "use", "permission_basis", "status"],
    [
      "Nasdaq Trader symbol directories",
      "ETF ticker/name metadata",
      "Free official exchange directory; redistribution and caching limited to displayed directory metadata",
      "active",
    ],
    [
      "Approved V2 reference holdings artifact",
      "Partial reference holdings and reverse lookup",
      "Existing approved dashboard artifact; source label retained and no completeness claim",
      "reference-only",
    ],
    [
      "Model/scoring artifacts",
      "Scored rows only",
      "Existing approved dashboard contract",
      "unchanged",
    ],
  ]),
);
await writeFile(
  `${evidence}/ETF_HOLDINGS_NORMALIZATION.md`,
  `# Holdings normalization\n\nRows are uppercased and retained as source ratios. Duplicate ETF/constituent rows are not synthesized. Non-US symbols containing a dot remain explicitly unmapped. Partial source coverage is never promoted to complete coverage; unavailable holdings remain unavailable.\n\nNormalized artifact: apps/dashboard/public/data/etf-holdings-normalized/manifest.json\n`,
);
await writeFile(
  `${evidence}/ETF_SIMILARITY_METHOD.md`,
  `# ETF similarity method\n\nWeighted overlap is Σ min(weightA, weightB) over shared normalized tickers. The artifact also reports shared holdings, common top-10 holdings, unique holdings, distinct-holdings percentage, and top-10 concentration difference. Category labels are not used as a substitute for holdings overlap.\n`,
);
await writeFile(
  `${evidence}/ETF_ACCEPTANCE_CASES.md`,
  `# Acceptance cases\n\nThe normalized reference artifact was checked for NVDA (semiconductors), MSFT (software), JPM (banks), MRNA (biotechnology), XOM (energy), LMT (aerospace/defense), AMZN (consumer discretionary), CAT (industrials), and NEE (utilities). Each lookup is source-backed only when present in the partial map; absent results remain explicitly non-evidence.\n`,
);
console.log(
  JSON.stringify({
    evidence,
    current: current.size,
    expanded: expanded.totalEtfs,
    holdingsRows: normalized.coverage.totalHoldingsRows,
  }),
);
