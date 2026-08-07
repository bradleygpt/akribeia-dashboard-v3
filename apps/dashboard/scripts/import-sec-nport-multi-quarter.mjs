/* global console, process */

import { createReadStream } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createInterface } from "node:readline";

const sourceRoot = process.env.AKRIBEIA_SEC_NPORT_ROOT ?? "C:/Akribeia-sec-nport";
const quarters = [
  {
    id: "2026q1",
    nport: `${sourceRoot}/q1`,
    ncen: `${sourceRoot}/ncen-q1`,
    nportUrl: "https://www.sec.gov/files/dera/data/form-n-port-data-sets/2026q1_nport.zip",
    ncenUrl: "https://www.sec.gov/files/dera/data/form-n-cen-data-sets/2026q1_ncen.zip",
  },
  {
    id: "2026q2",
    nport: `${sourceRoot}/q2`,
    ncen: `${sourceRoot}/ncen`,
    nportUrl: "https://www.sec.gov/files/dera/data/form-n-port-data-sets/2026q2_nport.zip",
    ncenUrl: "https://www.sec.gov/files/dera/data/form-n-cen-data-sets/2026q2_ncen.zip",
  },
];
const outputPath = "apps/dashboard/public/data/etf-holdings-sec-nport.json";
const retrievedAt = new Date().toISOString();

function normalizeName(value) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}
function parseTsvLine(line) {
  return line.split("\t");
}
async function readTsv(path, callback) {
  const input = createReadStream(path, { encoding: "utf8" });
  const reader = createInterface({ input, crlfDelay: Infinity });
  let headers;
  for await (const line of reader) {
    if (!headers) {
      headers = parseTsvLine(line);
      continue;
    }
    if (line.length)
      await callback(
        Object.fromEntries(headers.map((key, index) => [key, parseTsvLine(line)[index] ?? ""])),
      );
  }
}

const directory = JSON.parse(
  await readFile("apps/dashboard/public/data/etf-universe-expanded.json", "utf8"),
);
const nameToTicker = new Map(
  directory.etfs.map((row) => [normalizeName(row.fundName), row.ticker]),
);
const secEtfBySeries = new Map();
for (const quarter of quarters) {
  await readTsv(`${quarter.ncen}/ETF.tsv`, async (row) => {
    const ticker = nameToTicker.get(normalizeName(row.FUND_NAME));
    if (ticker && row.SERIES_ID)
      secEtfBySeries.set(row.SERIES_ID, { ticker, fundName: row.FUND_NAME });
  });
}

const selectedByTicker = new Map();
for (const quarter of quarters) {
  const reportDateByAccession = new Map();
  await readTsv(`${quarter.nport}/SUBMISSION.tsv`, async (row) => {
    if (row.ACCESSION_NUMBER && row.REPORT_DATE)
      reportDateByAccession.set(row.ACCESSION_NUMBER, row.REPORT_DATE);
  });
  await readTsv(`${quarter.nport}/FUND_REPORTED_INFO.tsv`, async (row) => {
    const sec = secEtfBySeries.get(row.SERIES_ID);
    if (!sec) return;
    const reportDate = reportDateByAccession.get(row.ACCESSION_NUMBER) ?? "";
    const candidate = { accession: row.ACCESSION_NUMBER, quarter: quarter.id, ...sec, reportDate };
    const existing = selectedByTicker.get(sec.ticker);
    if (!existing || reportDate > existing.reportDate) selectedByTicker.set(sec.ticker, candidate);
  });
}

const rawRowsByQuarter = new Map(quarters.map((quarter) => [quarter.id, []]));
for (const quarter of quarters) {
  const selectedByAccession = new Map(
    [...selectedByTicker.values()]
      .filter((row) => row.quarter === quarter.id)
      .map((row) => [row.accession, row]),
  );
  if (!selectedByAccession.size) continue;
  const holdingIndex = new Map();
  const rawRows = rawRowsByQuarter.get(quarter.id);
  const input = createReadStream(`${quarter.nport}/FUND_REPORTED_HOLDING.tsv`, {
    encoding: "utf8",
  });
  const reader = createInterface({ input, crlfDelay: Infinity });
  let headers;
  for await (const line of reader) {
    if (!headers) {
      headers = parseTsvLine(line);
      headers.forEach((key, index) => holdingIndex.set(key, index));
      continue;
    }
    if (!line.length) continue;
    const values = parseTsvLine(line);
    const fund = selectedByAccession.get(values[holdingIndex.get("ACCESSION_NUMBER")]);
    if (!fund || values[holdingIndex.get("ASSET_CAT")] !== "EC") continue;
    const percentage = Number(values[holdingIndex.get("PERCENTAGE")]);
    if (!Number.isFinite(percentage) || percentage <= 0) continue;
    rawRows.push({
      etfTicker: fund.ticker,
      fundName: fund.fundName,
      reportDate: fund.reportDate,
      holdingId: values[holdingIndex.get("HOLDING_ID")],
      issuerName: values[holdingIndex.get("ISSUER_NAME")],
      issuerTitle: values[holdingIndex.get("ISSUER_TITLE")],
      weight: percentage / 100,
      assetCategory: "equity",
      quarter: quarter.id,
    });
  }
}

const aggregates = new Map();
let unmapped = 0;
for (const quarter of quarters) {
  const rawRows = rawRowsByQuarter.get(quarter.id);
  const wanted = new Set(rawRows.map((row) => row.holdingId));
  const tickerByHoldingId = new Map();
  await readTsv(`${quarter.nport}/IDENTIFIERS.tsv`, async (row) => {
    if (!wanted.has(row.HOLDING_ID)) return;
    const ticker = String(row.IDENTIFIER_TICKER ?? "")
      .trim()
      .toUpperCase()
      .replaceAll(".", "-");
    if (/^[A-Z][A-Z0-9-]{0,7}$/.test(ticker) && !tickerByHoldingId.has(row.HOLDING_ID))
      tickerByHoldingId.set(row.HOLDING_ID, ticker);
  });
  for (const row of rawRows) {
    const constituentTicker = tickerByHoldingId.get(row.holdingId);
    if (!constituentTicker) {
      unmapped += 1;
      continue;
    }
    const key = `${row.etfTicker}|${constituentTicker}`;
    const previous = aggregates.get(key);
    if (previous) previous.portfolioWeight += row.weight;
    else
      aggregates.set(key, {
        ...row,
        portfolioWeight: row.weight,
        constituentTicker,
        sourceAsOfDate: row.reportDate,
        sourceRetrievalDate: retrievedAt,
        tickerMappingStatus: "sec-identifier",
        sourceStatus: "sec-nport-equity",
      });
  }
}

const rowsByEtf = new Map();
for (const row of aggregates.values()) {
  const list = rowsByEtf.get(row.etfTicker) ?? [];
  list.push(row);
  rowsByEtf.set(row.etfTicker, list);
}
const rows = [];
for (const list of rowsByEtf.values()) {
  list.sort(
    (left, right) =>
      right.portfolioWeight - left.portfolioWeight ||
      left.constituentTicker.localeCompare(right.constituentTicker),
  );
  list.forEach((row, index) => rows.push({ ...row, holdingRank: index + 1 }));
}
const invertedIndex = {};
for (const row of rows)
  (invertedIndex[row.constituentTicker] ??= []).push({
    etfTicker: row.etfTicker,
    weight: row.portfolioWeight,
    holdingRank: row.holdingRank,
  });
const depths = [...rowsByEtf.values()].map((list) => list.length).sort((a, b) => a - b);
const artifact = {
  schemaVersion: "2.1.0-sec-nport-multi-quarter-equity",
  generatedAt: retrievedAt,
  source: {
    name: "SEC Form N-PORT and N-CEN Data Sets",
    datasets: quarters.map((q) => ({ id: q.id, nportUrl: q.nportUrl, ncenUrl: q.ncenUrl })),
    asOf: "latest per-fund report across 2026 Q1 and 2026 Q2 datasets",
    retrievedAt,
    permission: "Official SEC public data set; as-filed public filings.",
  },
  policy:
    "Only ordinary equity holdings with SEC identifiers are normalized. Cash, debt, derivatives, swaps, futures, options, and unidentified instruments are excluded from ordinary stock lookup.",
  coverage: {
    candidateSecEtfFunds: selectedByTicker.size,
    holdingsBackedEtfs: rowsByEtf.size,
    etfsWithCompleteHoldings: 0,
    etfsWithPartialHoldings: rowsByEtf.size,
    etfsWithUnavailableHoldings: Math.max(0, selectedByTicker.size - rowsByEtf.size),
    totalHoldingsRows: rows.length,
    unmappedEquityRows: unmapped,
    medianHoldingsDepth: depths.length ? depths[Math.floor((depths.length - 1) / 2)] : 0,
    fundsWithAtLeast25Holdings: depths.filter((value) => value >= 25).length,
    fundsWithAtLeast50Holdings: depths.filter((value) => value >= 50).length,
  },
  funds: [...selectedByTicker.values()].map((fund) => ({
    ticker: fund.ticker,
    fundName: fund.fundName,
    issuer: null,
    holdingsStatus: rowsByEtf.has(fund.ticker) ? "partial" : "unavailable",
    holdingsSource: "SEC N-PORT",
    holdingsAsOf: fund.reportDate,
    holdingsDepth: rowsByEtf.get(fund.ticker)?.length ?? 0,
    scoredStatus: "reference-only",
  })),
  invertedIndex,
  rows,
};
await mkdir("apps/dashboard/public/data", { recursive: true });
await writeFile(outputPath, `${JSON.stringify(artifact)}\n`, "utf8");
console.log(JSON.stringify(artifact.coverage));
