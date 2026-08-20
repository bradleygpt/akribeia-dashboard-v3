/* global console, process */
import { createReadStream } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createInterface } from "node:readline";
import { readEtfArtifact } from "./lib/etf-artifact-store.mjs";

const sourceRoot = process.env.AKRIBEIA_SEC_NPORT_ROOT ?? "C:/Akribeia-sec-nport";
const evidence =
  process.env.AKRIBEIA_SERIES_EVIDENCE ?? "C:/Akribeia-ETF-Series-Level-EDGAR-20260806-140000";
const quarters = ["2025q1", "2025q2", "2025q3", "2025q4", "q1", "q2"];
const directory = JSON.parse(
  await readFile("apps/dashboard/public/data/etf-universe-expanded.json", "utf8"),
);
const canonical = await readEtfArtifact("apps/dashboard/public/data/etf-holdings-canonical.json");
const mf = JSON.parse(
  await readFile("data/reference/sec/2026-07-30/company_tickers_mf.json", "utf8"),
);
const currentRows = await readEtfArtifact("apps/dashboard/public/data/etf-holdings-sec-nport.json");
const etfSet = new Set(directory.etfs.map((row) => row.ticker.toUpperCase()));
const currentByEtf = new Set(currentRows.rows.map((row) => row.etfTicker));
const canonicalTickers = new Set(canonical.rows.map((row) => row.constituentTicker));
const classesByTicker = new Map();
for (const [cik, seriesId, classId, symbol] of mf.data) {
  const ticker = String(symbol ?? "")
    .trim()
    .toUpperCase();
  if (!etfSet.has(ticker)) continue;
  const list = classesByTicker.get(ticker) ?? [];
  list.push({ cik: String(cik).padStart(10, "0"), seriesId, classId, ticker });
  classesByTicker.set(ticker, list);
}
const gapTickers = [...etfSet].filter(
  (ticker) => classesByTicker.has(ticker) && !currentByEtf.has(ticker),
);
const gapClasses = gapTickers.flatMap((ticker) => classesByTicker.get(ticker));
const bySeries = new Map();
for (const row of gapClasses) {
  const key = `${row.cik}|${row.seriesId}`;
  const item = bySeries.get(key) ?? { ...row, classes: [] };
  item.classes.push(row);
  bySeries.set(key, item);
}
const byAccession = new Map();
const seriesCandidates = new Map();
const parseDate = (value) => {
  const text = String(value ?? "").trim();
  const match = text.match(/^(\d{1,2})-([A-Z]{3})-(\d{4})$/i);
  if (!match) return text;
  const months = {
    JAN: 1,
    FEB: 2,
    MAR: 3,
    APR: 4,
    MAY: 5,
    JUN: 6,
    JUL: 7,
    AUG: 8,
    SEP: 9,
    OCT: 10,
    NOV: 11,
    DEC: 12,
  };
  return `${match[3]}-${String(months[match[2].toUpperCase()] ?? 1).padStart(2, "0")}-${match[1].padStart(2, "0")}`;
};
async function readTsv(path, callback) {
  const reader = createInterface({
    input: createReadStream(path, { encoding: "utf8" }),
    crlfDelay: Infinity,
  });
  let headers;
  for await (const line of reader) {
    if (!headers) {
      headers = line.split("\t");
      continue;
    }
    if (!line) continue;
    const values = line.split("\t");
    await callback(Object.fromEntries(headers.map((key, index) => [key, values[index] ?? ""])));
  }
}
for (const quarter of quarters) {
  const dir = `${sourceRoot}/${quarter}`;
  await readTsv(`${dir}/SUBMISSION.tsv`, async (row) => {
    if (!row.ACCESSION_NUMBER || !row.REPORT_DATE) return;
    byAccession.set(`${quarter}|${row.ACCESSION_NUMBER}`, {
      ...row,
      quarter,
      reportDate: parseDate(row.REPORT_DATE),
      filingDate: parseDate(row.FILING_DATE),
    });
  });
  await readTsv(`${dir}/FUND_REPORTED_INFO.tsv`, async (row) => {
    const accession = byAccession.get(`${quarter}|${row.ACCESSION_NUMBER}`);
    if (!accession || !row.SERIES_ID) return;
    const key = [...bySeries.keys()].find((candidate) => candidate.endsWith(`|${row.SERIES_ID}`));
    if (!key) return;
    const list = seriesCandidates.get(key) ?? [];
    list.push({
      ...accession,
      seriesId: row.SERIES_ID,
      seriesName: row.SERIES_NAME,
      totalAssets: Number(row.NET_ASSETS),
    });
    seriesCandidates.set(key, list);
  });
}
const selected = new Map();
for (const [key, candidates] of seriesCandidates) {
  selected.set(
    key,
    candidates.toSorted(
      (a, b) =>
        b.reportDate.localeCompare(a.reportDate) || b.filingDate.localeCompare(a.filingDate),
    )[0],
  );
}
const wantedAccessions = new Map(
  [...selected.values()].map((row) => [`${row.quarter}|${row.ACCESSION_NUMBER}`, row]),
);
const raw = new Map();
for (const quarter of quarters) {
  const dir = `${sourceRoot}/${quarter}`;
  if (![...wantedAccessions.keys()].some((key) => key.startsWith(`${quarter}|`))) continue;
  await readTsv(`${dir}/FUND_REPORTED_HOLDING.tsv`, async (row) => {
    const fund = wantedAccessions.get(`${quarter}|${row.ACCESSION_NUMBER}`);
    if (!fund || row.ASSET_CAT !== "EC") return;
    const weight = Number(row.PERCENTAGE);
    if (!Number.isFinite(weight) || weight <= 0) return;
    const list = raw.get(`${quarter}|${row.ACCESSION_NUMBER}`) ?? [];
    list.push({
      ...row,
      weight: weight / 100,
      sourceAsOfDate: fund.reportDate,
      sourceFilingDate: fund.filingDate,
      quarter,
    });
    raw.set(`${quarter}|${row.ACCESSION_NUMBER}`, list);
  });
}
const holdingIds = new Set([...raw.values()].flat().map((row) => row.HOLDING_ID));
const identifierMap = new Map();
for (const quarter of quarters) {
  const wanted = new Set([...raw.keys()].filter((key) => key.startsWith(`${quarter}|`)));
  if (!wanted.size) continue;
  await readTsv(`${sourceRoot}/${quarter}/IDENTIFIERS.tsv`, async (row) => {
    if (!holdingIds.has(row.HOLDING_ID)) return;
    const ticker = String(row.IDENTIFIER_TICKER ?? "")
      .trim()
      .toUpperCase()
      .replaceAll(".", "-");
    if (/^[A-Z][A-Z0-9-]{0,7}$/.test(ticker))
      identifierMap.set(`${quarter}|${row.HOLDING_ID}`, ticker);
  });
}
const normalizedBySeries = new Map();
for (const [key, fund] of selected) {
  const rows = raw.get(`${fund.quarter}|${fund.ACCESSION_NUMBER}`) ?? [];
  const seen = new Map();
  for (const row of rows) {
    const ticker = identifierMap.get(`${fund.quarter}|${row.HOLDING_ID}`);
    if (!ticker || !canonicalTickers.has(ticker)) continue;
    seen.set(ticker, (seen.get(ticker) ?? 0) + row.weight);
  }
  normalizedBySeries.set(key, {
    ...fund,
    canonicalRows: [...seen.entries()].map(([ticker, weight], index) => ({
      ticker,
      weight,
      holdingRank: index + 1,
    })),
  });
}
const csv = (rows) =>
  `${rows.map((row) => row.map((value) => `"${String(value ?? "").replaceAll('"', '""')}"`).join(",")).join("\n")}\n`;
await mkdir(evidence, { recursive: true });
const seriesMaster = [
  [
    "cik",
    "series_id",
    "series_name",
    "class_id",
    "class_ticker",
    "nasdaq_etf_status",
    "active_status",
    "number_etf_classes_in_series",
    "existing_normalized_portfolio_status",
    "latest_known_filing",
    "retrieval_disposition",
  ],
];
for (const [key, item] of bySeries)
  for (const cls of item.classes) {
    const chosen = normalizedBySeries.get(key);
    seriesMaster.push([
      cls.cik,
      cls.seriesId,
      chosen?.seriesName ?? "",
      cls.classId,
      cls.ticker,
      "matched",
      "current SEC master",
      item.classes.length,
      currentByEtf.has(cls.ticker) ? "existing" : "gap",
      chosen?.ACCESSION_NUMBER ?? "",
      chosen?.canonicalRows?.length
        ? "bulk-period-portfolio-selected"
        : "no-canonical-equity-in-selected-portfolio",
    ]);
  }
await writeFile(`${evidence}/SEC_ETF_GAP_SERIES_MASTER.csv`, csv(seriesMaster));
const coverage = [
  [
    "quarter",
    "unique_series_candidates",
    "gap_series_selected",
    "classes_resolved",
    "canonical_rows_added",
  ],
];
for (const quarter of quarters) {
  const selectedQuarter = [...normalizedBySeries.values()].filter((row) => row.quarter === quarter);
  coverage.push([
    quarter,
    [...seriesCandidates.values()].flat().filter((row) => row.quarter === quarter).length,
    selectedQuarter.length,
    selectedQuarter
      .filter((row) => row.canonicalRows.length)
      .reduce(
        (sum, row) =>
          sum +
          ([...bySeries].find(([, item]) => item.seriesId === row.seriesId)?.[1].classes.length ??
            0),
        0,
      ),
    selectedQuarter.reduce((sum, row) => sum + row.canonicalRows.length, 0),
  ]);
}
await writeFile(`${evidence}/SEC_ETF_BULK_PERIOD_COVERAGE.csv`, csv(coverage));
const accessionJoin = [
  [
    "cik",
    "accession",
    "form",
    "filing_date",
    "report_date",
    "series_id",
    "class_ids",
    "matched_etf_tickers",
    "source_holdings_count",
    "canonical_holdings_count",
    "normalization_result",
    "rejection_reason",
    "selected_status",
  ],
];
for (const [key, row] of normalizedBySeries) {
  const item = bySeries.get(key);
  accessionJoin.push([
    item.cik,
    row.ACCESSION_NUMBER,
    row.SUB_TYPE,
    row.filingDate,
    row.reportDate,
    row.seriesId,
    item.classes.map((cls) => cls.classId).join(";"),
    item.classes.map((cls) => cls.ticker).join(";"),
    (raw.get(`${row.quarter}|${row.ACCESSION_NUMBER}`) ?? []).length,
    row.canonicalRows.length,
    row.canonicalRows.length ? "normalized-canonical-equity" : "no-canonical-equity",
    "",
    "selected-freshest-valid",
  ]);
}
await writeFile(`${evidence}/SEC_ETF_ACCESSION_SERIES_JOIN.csv`, csv(accessionJoin));
const seriesNormalized = [];
for (const [key, row] of normalizedBySeries) {
  const item = bySeries.get(key);
  for (const cls of item.classes)
    seriesNormalized.push({
      etfTicker: cls.ticker,
      cik: cls.cik,
      seriesId: cls.seriesId,
      classId: cls.classId,
      fundName: row.seriesName,
      accession: row.ACCESSION_NUMBER,
      reportDate: row.reportDate,
      filingDate: row.filingDate,
      rows: row.canonicalRows,
    });
}
await writeFile(
  `${evidence}/SEC_ETF_SERIES_NORMALIZED_HOLDINGS.json`,
  `${JSON.stringify({ schemaVersion: "1.0.0", source: "SEC N-PORT bulk 2025 Q1-Q4 plus existing 2026 Q1-Q2", portfolios: seriesNormalized }, null, 2)}\n`,
);
await writeFile(
  `${evidence}/SEC_ETF_SERIES_LEVEL_CHECKPOINT.json`,
  `${JSON.stringify({ schemaVersion: "1.0.0", status: "completed-bulk-series-pass", gapClasses: gapClasses.length, gapSeries: bySeries.size, gapCiks: new Set(gapClasses.map((row) => row.cik)).size, selectedSeries: normalizedBySeries.size, accessionsNormalized: normalizedBySeries.size, retrievalMode: "official-local-bulk-quarter", generatedAt: new Date().toISOString() }, null, 2)}\n`,
);
console.log(
  JSON.stringify({
    gapClasses: gapClasses.length,
    gapSeries: bySeries.size,
    gapCiks: new Set(gapClasses.map((row) => row.cik)).size,
    selectedSeries: normalizedBySeries.size,
    canonicalRows: [...normalizedBySeries.values()].reduce(
      (sum, row) => sum + row.canonicalRows.length,
      0,
    ),
  }),
);
