/* global console, process */
import { readFile, writeFile } from "node:fs/promises";

const seriesEvidence =
  process.env.AKRIBEIA_SERIES_EVIDENCE ?? "C:/Akribeia-ETF-Series-Level-EDGAR-20260806-140000";
const canonicalPath = "apps/dashboard/public/data/etf-holdings-canonical.json";
const canonical = JSON.parse(await readFile(canonicalPath, "utf8"));
const series = JSON.parse(
  await readFile(`${seriesEvidence}/SEC_ETF_SERIES_NORMALIZED_HOLDINGS.json`, "utf8"),
);
const existing = new Set(canonical.funds.map((fund) => fund.ticker));
const additions = series.portfolios.filter(
  (portfolio) => portfolio.rows.length > 0 && !existing.has(portfolio.etfTicker),
);
for (const portfolio of additions) {
  const rows = portfolio.rows;
  const weights = rows.map((row) => row.weight);
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  canonical.funds.push({
    ticker: portfolio.etfTicker,
    fundName: portfolio.fundName || portfolio.etfTicker,
    issuer: null,
    assetClass: "ETF",
    category: null,
    sector: null,
    industryOrTheme: null,
    strategyType: null,
    leverageInverse: false,
    activePassive: null,
    singleStock: false,
    equalWeight: false,
    scoredStatus: "reference-only",
    holdingsStatus: "partial",
    holdingsSource: "SEC N-PORT bulk 2025 Q1-Q4",
    holdingsAsOf: portfolio.reportDate,
    holdingsDepth: rows.length,
    reportedPortfolioWeightCoverage: total,
    numberHoldings: rows.length,
    top10Weight: weights.slice(0, 10).reduce((sum, weight) => sum + weight, 0),
    top25Weight: weights.slice(0, 25).reduce((sum, weight) => sum + weight, 0),
    largestHolding: rows[0]?.ticker ?? null,
    largestHoldingWeight: rows[0]?.weight ?? null,
    dataFreshnessStatus: "stale",
  });
  for (const row of rows)
    canonical.rows.push({
      etfTicker: portfolio.etfTicker,
      constituentTicker: row.ticker,
      constituentName: null,
      portfolioWeight: row.weight,
      holdingRank: row.holdingRank,
      source: "SEC N-PORT bulk 2025 Q1-Q4",
      sourceAsOfDate: portfolio.reportDate,
      sourceRetrievalDate: new Date().toISOString(),
      sourceStatus: "sec-nport-equity-stale",
      normalizationNotes: "Series-level accession portfolio; canonical equity projection.",
      tickerMappingStatus: "sec-identifier",
    });
}
canonical.rows.sort(
  (left, right) =>
    left.etfTicker.localeCompare(right.etfTicker) ||
    left.holdingRank - right.holdingRank ||
    left.constituentTicker.localeCompare(right.constituentTicker),
);
canonical.invertedIndex = {};
for (const row of canonical.rows)
  (canonical.invertedIndex[row.constituentTicker] ??= []).push({
    etfTicker: row.etfTicker,
    weight: row.portfolioWeight,
    holdingRank: row.holdingRank,
  });
canonical.coverage.retainedEtfs = canonical.funds.length;
canonical.coverage.equitiesCovered = Object.keys(canonical.invertedIndex).length;
canonical.coverage.equitiesUncovered =
  canonical.coverage.canonicalEquities - canonical.coverage.equitiesCovered;
canonical.coverage.candidateHoldingsBackedEtfs =
  canonical.coverage.candidateHoldingsBackedEtfs + additions.length;
await writeFile(canonicalPath, `${JSON.stringify(canonical)}\n`, "utf8");
console.log(
  JSON.stringify({
    additions: additions.length,
    retainedEtfs: canonical.funds.length,
    rows: canonical.rows.length,
    equitiesCovered: canonical.coverage.equitiesCovered,
  }),
);
