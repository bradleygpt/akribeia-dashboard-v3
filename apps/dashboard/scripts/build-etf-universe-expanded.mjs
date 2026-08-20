/* global fetch, URL, console */

import { mkdir, writeFile } from "node:fs/promises";
import { writeEtfArtifact } from "./lib/etf-artifact-store.mjs";

const SOURCES = [
  {
    url: "https://www.nasdaqtrader.com/dynamic/symdir/nasdaqlisted.txt",
    symbol: "Symbol",
    name: "Security Name",
    etf: "ETF",
    delimiter: "|",
  },
  {
    url: "https://www.nasdaqtrader.com/dynamic/symdir/otherlisted.txt",
    symbol: "ACT Symbol",
    name: "Security Name",
    etf: "ETF",
    delimiter: "|",
  },
];

function parseDelimited(text, delimiter) {
  const [header, ...lines] = text.trim().split(/\r?\n/);
  const fields = header.split(delimiter);
  return lines
    .filter((line) => line && !line.startsWith("File Creation Time"))
    .map((line) => {
      const values = line.split(delimiter);
      return Object.fromEntries(fields.map((field, index) => [field, values[index] ?? ""]));
    });
}

const retrievedAt = new Date().toISOString();
const asOf = retrievedAt.slice(0, 10);
const rows = new Map();
for (const source of SOURCES) {
  const response = await fetch(source.url, { headers: { accept: "text/plain" } });
  if (!response.ok) throw new Error(`${source.url} returned ${response.status}`);
  for (const item of parseDelimited(await response.text(), source.delimiter)) {
    const ticker = item[source.symbol].trim().toUpperCase();
    if (!ticker || item[source.etf] !== "Y" || item["Test Issue"] === "Y") continue;
    const name = item[source.name].trim();
    rows.set(ticker, {
      ticker,
      fundName: name,
      issuer: null,
      assetClass: "ETF",
      category: null,
      sector: null,
      industryOrTheme: null,
      strategyType: null,
      leverageInverse: /\b(2x|3x|leveraged|inverse|short)\b/i.test(name),
      activePassive: null,
      singleStock: /single stock|single-stock/i.test(name),
      scoredStatus: "reference-only",
      holdingsStatus: "unavailable",
      holdingsSource: null,
      holdingsAsOf: null,
      numberHoldings: null,
      top10Weight: null,
      top25Weight: null,
      largestHolding: null,
      largestHoldingWeight: null,
      dataFreshnessStatus: "current-symbol-directory",
      source: source.url,
      sourceAsOf: asOf,
      sourceRetrievedAt: retrievedAt,
    });
  }
}

const output = {
  schemaVersion: "1.0.0",
  generatedAt: retrievedAt,
  source: {
    name: "Nasdaq Trader symbol directories",
    urls: SOURCES.map(({ url }) => url),
    asOf,
    retrievedAt,
    permission:
      "Free official exchange symbol-directory metadata; holdings are not asserted by this artifact.",
  },
  policy: {
    scored: "Only existing approved dashboard model rows are scored.",
    holdings:
      "Reference-only directory rows have unavailable holdings unless an approved official holdings artifact is present.",
  },
  totalEtfs: rows.size,
  etfs: [...rows.values()].sort((left, right) => left.ticker.localeCompare(right.ticker)),
};

const holdingsUrl =
  "https://raw.githubusercontent.com/bradleygpt/quant-dashboard-pro-v2/b477349a8691fdc5000641a6ae2893dbbfae2de6/public/data/etf_holdings.json";
const holdingsResponse = await fetch(holdingsUrl, { headers: { accept: "application/json" } });
if (!holdingsResponse.ok) throw new Error(`${holdingsUrl} returned ${holdingsResponse.status}`);
const holdingsPayload = await holdingsResponse.json();
const holdingsRows = [];
let completeHoldings = 0;
let partialHoldings = 0;
for (const [etfTicker, datum] of Object.entries(holdingsPayload.etfs ?? {})) {
  const holdings = Array.isArray(datum.holdings) ? datum.holdings : [];
  const coverage = typeof datum.coverage === "number" ? datum.coverage : null;
  if (coverage !== null && coverage >= 0.99) completeHoldings += 1;
  else if (holdings.length > 0) partialHoldings += 1;
  for (const [index, holding] of holdings.entries()) {
    const ticker = String(holding.t ?? "")
      .trim()
      .toUpperCase();
    const weight = Number(holding.w);
    if (!ticker || !Number.isFinite(weight) || weight < 0) continue;
    holdingsRows.push({
      etfTicker,
      constituentTicker: ticker,
      constituentName: null,
      portfolioWeight: weight,
      holdingRank: index + 1,
      source: "approved V2 reference artifact; source label preserved as yfinance top-holdings",
      sourceAsOfDate: datum.as_of ?? null,
      sourceRetrievalDate: retrievedAt,
      sourceStatus: "approved-reference-partial",
      normalizationNotes:
        "Ticker uppercased; weight retained as source ratio; coverage is not treated as complete.",
      tickerMappingStatus: ticker.includes(".") ? "unmapped-non-US-symbol" : "normalized",
    });
  }
}
const holdingsArtifact = {
  schemaVersion: "1.0.0",
  generatedAt: retrievedAt,
  policy:
    "Existing approved V2 reference holdings are retained as partial reference data; no synthetic or complete holdings claim is made.",
  source: {
    url: holdingsUrl,
    name: "Approved V2 reference artifact",
    asOf: "per-row",
    retrievedAt,
  },
  coverage: {
    totalEtfs: rows.size,
    etfsWithCompleteHoldings: completeHoldings,
    etfsWithPartialHoldings: partialHoldings,
    etfsWithUnavailableHoldings: Math.max(0, rows.size - completeHoldings - partialHoldings),
    totalHoldingsRows: holdingsRows.length,
    unmappedConstituents: holdingsRows.filter((row) => row.tickerMappingStatus !== "normalized")
      .length,
    staleHoldings: holdingsRows.filter((row) => row.sourceAsOfDate && row.sourceAsOfDate < asOf)
      .length,
  },
  invertedIndex: Object.fromEntries(
    [
      ...holdingsRows.reduce((index, row) => {
        const list = index.get(row.constituentTicker) ?? [];
        list.push({
          etfTicker: row.etfTicker,
          weight: row.portfolioWeight,
          holdingRank: row.holdingRank,
        });
        index.set(row.constituentTicker, list);
        return index;
      }, new Map()),
    ].sort(([left], [right]) => left.localeCompare(right)),
  ),
  rows: holdingsRows,
};

await mkdir(new URL("../public/data/", import.meta.url), { recursive: true });
await writeFile(
  new URL("../public/data/etf-universe-expanded.json", import.meta.url),
  `${JSON.stringify(output)}\n`,
  "utf8",
);
await writeEtfArtifact(
  new URL("../public/data/etf-holdings-normalized.json", import.meta.url),
  holdingsArtifact,
);
console.log(JSON.stringify({ totalEtfs: output.totalEtfs, asOf, retrievedAt }));
