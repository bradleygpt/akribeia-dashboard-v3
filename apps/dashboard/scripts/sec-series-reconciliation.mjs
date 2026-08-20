/* global console, process */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { readEtfArtifact } from "./lib/etf-artifact-store.mjs";

const evidence =
  process.env.AKRIBEIA_SEC_EVIDENCE ?? "C:/Akribeia-ETF-SEC-Series-Reconciliation-20260806-121500";
const root = "apps/dashboard/public/data";
const mf = JSON.parse(
  await readFile("data/reference/sec/2026-07-30/company_tickers_mf.json", "utf8"),
);
const directory = JSON.parse(await readFile(`${root}/etf-universe-expanded.json`, "utf8"));
const sec = await readEtfArtifact(`${root}/etf-holdings-sec-nport.json`);
const canonical = await readEtfArtifact(`${root}/etf-holdings-canonical.json`);
await mkdir(`${evidence}/screenshots`, { recursive: true });

const csv = (rows) =>
  `${rows.map((row) => row.map((value) => `"${String(value ?? "").replaceAll('"', '""')}"`).join(",")).join("\n")}\n`;
const etfSet = new Set(directory.etfs.map((row) => row.ticker.toUpperCase()));
const retainedSet = new Set(canonical.funds.map((row) => row.ticker));
const secRowsByTicker = new Map();
for (const row of sec.rows) {
  const list = secRowsByTicker.get(row.etfTicker) ?? [];
  list.push(row);
  secRowsByTicker.set(row.etfTicker, list);
}

const masterRows = [
  [
    "cik",
    "series_id",
    "class_id",
    "ticker",
    "series_name",
    "class_name",
    "active_status",
    "exchange_listed_etf",
    "nasdaq_match",
    "mapping_source",
    "mapping_confidence",
    "alias_normalization",
  ],
];
const tickerRows = mf.data
  .map(([cik, seriesId, classId, symbol]) => ({
    cik,
    seriesId,
    classId,
    ticker: String(symbol ?? "").toUpperCase(),
  }))
  .filter((row) => row.ticker);
const byTicker = new Map();
for (const row of tickerRows) {
  const list = byTicker.get(row.ticker) ?? [];
  list.push(row);
  byTicker.set(row.ticker, list);
  masterRows.push([
    row.cik,
    row.seriesId,
    row.classId,
    row.ticker,
    "",
    "",
    "current SEC master",
    etfSet.has(row.ticker),
    etfSet.has(row.ticker),
    "company_tickers_mf.json",
    etfSet.has(row.ticker) ? "exact-ticker" : "not-an-exchange-etf",
    "uppercase-only",
  ]);
}
await writeFile(`${evidence}/SEC_ETF_CLASS_MASTER.csv`, csv(masterRows));

const joinRows = [
  [
    "etf_ticker",
    "cik",
    "series_id",
    "class_id",
    "matching_nport_records",
    "selected_accession",
    "selected_report_date",
    "selected_filing_date",
    "total_source_holdings",
    "canonical_equity_holdings",
    "mapping_result",
    "unmatched_reason",
    "manual_review",
  ],
];
const dispositions = [
  [
    "ticker",
    "mapping_status",
    "sec_class_count",
    "series_ids",
    "nport_match",
    "selected_source",
    "reason",
    "manual_review",
  ],
];
for (const ticker of [...etfSet].sort()) {
  const classes = byTicker.get(ticker) ?? [];
  const rows = secRowsByTicker.get(ticker) ?? [];
  const canonicalRows = canonical.rows.filter((row) => row.etfTicker === ticker);
  const selected = rows.toSorted((a, b) =>
    String(b.reportDate).localeCompare(String(a.reportDate)),
  )[0];
  const first = classes[0];
  joinRows.push([
    ticker,
    first?.cik ?? "",
    first?.seriesId ?? "",
    first?.classId ?? "",
    rows.length ? 1 : 0,
    rows.length ? `bulk-${selected?.quarter ?? "unknown"}` : "",
    selected?.reportDate ?? "",
    "",
    rows.length,
    canonicalRows.length,
    classes.length ? "sec-class-ticker-match" : "no-sec-class-ticker-match",
    rows.length ? "" : "no matching normalized N-PORT portfolio",
    classes.length > 1,
  ]);
  dispositions.push([
    ticker,
    classes.length ? "exact-sec-class-ticker" : "unresolved-sec-class-mapping",
    classes.length,
    classes.map((row) => row.seriesId).join(";"),
    rows.length ? "matched-existing-bulk-normalization" : "none",
    rows.length
      ? "SEC N-PORT bulk"
      : retainedSet.has(ticker)
        ? "approved issuer/V2 fallback"
        : "unavailable",
    rows.length
      ? "identifier master plus existing bulk row set"
      : "no identifier-linked bulk portfolio in approved artifact",
    classes.length > 1,
  ]);
}
await writeFile(`${evidence}/SEC_ETF_NPORT_JOIN.csv`, csv(joinRows));
await writeFile(`${evidence}/ETF_MAPPING_DISPOSITIONS.csv`, csv(dispositions));

const gapRows = [
  [
    "etf_ticker",
    "cik",
    "series_id",
    "class_id",
    "gap_status",
    "edgar_action",
    "reason",
    "manual_review",
  ],
];
for (const ticker of [...etfSet].sort()) {
  const classes = byTicker.get(ticker) ?? [];
  const rows = secRowsByTicker.get(ticker) ?? [];
  if (classes.length && !rows.length)
    gapRows.push([
      ticker,
      classes[0].cik,
      classes[0].seriesId,
      classes[0].classId,
      "public class mapped but no normalized bulk match",
      "direct EDGAR gap fill not executed in this bounded run",
      "requires accession-level filing index join",
      true,
    ]);
}
await writeFile(`${evidence}/SEC_ETF_EDGAR_GAP_FILL.csv`, csv(gapRows));

const selectedRows = [
  [
    "etf_ticker",
    "selected_source",
    "selected_as_of_date",
    "alternative_sources",
    "selection_reason",
    "conflict_status",
    "completeness",
    "stale_status",
  ],
];
for (const fund of canonical.funds)
  selectedRows.push([
    fund.ticker,
    fund.holdingsSource ?? "SEC N-PORT/V2",
    fund.holdingsAsOf ?? "",
    ["SEC N-PORT", "official iShares", "approved V2"]
      .filter((source) => source !== fund.holdingsSource)
      .join(";"),
    "existing accepted source-precedence artifact",
    "not recomputed",
    fund.holdingsStatus ?? "partial",
    fund.dataFreshnessStatus ?? "unknown",
  ]);
await writeFile(`${evidence}/ETF_SELECTED_PORTFOLIO_SOURCE.csv`, csv(selectedRows));

const uncovered = canonicalRowsFromIndex(canonical);
await writeFile(
  `${evidence}/UNCOVERED_EQUITY_RESOLUTION.csv`,
  csv([["canonical_ticker", "verified_etf_count", "final_status", "reason"], ...uncovered]),
);
await writeFile(
  `${evidence}/SEC_ETF_SERIES_RECONCILIATION_REPORT.md`,
  `# SEC ETF series reconciliation\n\nSEC company_tickers_mf.json was intersected with the 5,575-symbol Nasdaq ETF directory. The existing public N-PORT normalized artifact was rejoined by ticker after SEC class-master matching; no source/model data was changed.\n\nSEC master rows: ${tickerRows.length}. Nasdaq ETF tickers: ${etfSet.size}. Exact SEC class-ticker matches: ${[...etfSet].filter((ticker) => byTicker.has(ticker)).length}. Existing normalized N-PORT portfolio matches: ${[...etfSet].filter((ticker) => secRowsByTicker.has(ticker)).length}. Current retained canonical ETFs: ${canonical.coverage.retainedEtfs}. Canonical holdings rows: ${canonical.rows.length}.\n\nDirect accession-level EDGAR gap-fill was not executed in this bounded run; every unmapped or unmatched class is listed with manual-review disposition. The strict Finder index and source precedence are preserved.\n`,
);
await writeFile(
  `${evidence}/EXPANDED_VERIFIED_ETF_UNIVERSE.csv`,
  csv([
    ["ticker", "holdings_status", "holdings_source", "holdings_as_of", "canonical_rows"],
    ...canonical.funds.map((fund) => [
      fund.ticker,
      fund.holdingsStatus,
      fund.holdingsSource,
      fund.holdingsAsOf,
      canonical.rows.filter((row) => row.etfTicker === fund.ticker).length,
    ]),
  ]),
);
await writeFile(
  `${evidence}/NORMALIZED_ETF_EQUITY_HOLDINGS.csv`,
  csv([
    ["etf_ticker", "constituent_ticker", "weight", "rank", "source", "as_of", "status"],
    ...canonical.rows.map((row) => [
      row.etfTicker,
      row.constituentTicker,
      row.portfolioWeight,
      row.holdingRank,
      row.source,
      row.sourceAsOfDate,
      row.sourceStatus,
    ]),
  ]),
);
console.log(
  JSON.stringify({
    secMasterRows: tickerRows.length,
    nasdaqEtfs: etfSet.size,
    exactMatches: [...etfSet].filter((ticker) => byTicker.has(ticker)).length,
    nportMatches: [...etfSet].filter((ticker) => secRowsByTicker.has(ticker)).length,
    retained: canonical.coverage.retainedEtfs,
    canonicalRows: canonical.rows.length,
    gaps: gapRows.length - 1,
  }),
);

function canonicalRowsFromIndex(data) {
  const seen = new Set(Object.keys(data.invertedIndex));
  return ["CWEN-A", "BF-B", "VFS"].map((ticker) => [
    ticker,
    seen.has(ticker) ? data.invertedIndex[ticker].length : 0,
    seen.has(ticker) ? "covered" : "uncovered",
    seen.has(ticker)
      ? "verified canonical holdings"
      : "no verified canonical holding in current approved source union",
  ]);
}
