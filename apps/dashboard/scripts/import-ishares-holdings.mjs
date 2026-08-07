/* global console */
import { mkdir, readFile, writeFile } from "node:fs/promises";

const sourceRoot = "C:/Akribeia-ishares";
const manifest = JSON.parse(await readFile(`${sourceRoot}/manifest.json`, "utf8"));
const universe = JSON.parse(
  await readFile("data/reference/v2-baseline/fixtures/universe_floor0.json", "utf8"),
);
const canonical = new Set(
  universe.rows.filter((row) => row.sector !== "ETF").map((row) => row.ticker.toUpperCase()),
);
function parseLine(line) {
  const output = [];
  let current = "",
    quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"') {
      if (quoted && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else quoted = !quoted;
    } else if (char === "," && !quoted) {
      output.push(current);
      current = "";
    } else current += char;
  }
  output.push(current);
  return output;
}
const rows = [];
const funds = [];
for (const item of manifest.products.filter((entry) => entry.status === "downloaded")) {
  const text = await readFile(item.path, "utf8");
  const lines = text.split(/\r?\n/).filter(Boolean);
  const headerIndex = lines.findIndex((line) => line.startsWith("Ticker,Name,"));
  if (headerIndex < 0) continue;
  const headers = parseLine(lines[headerIndex]);
  const index = Object.fromEntries(headers.map((name, position) => [name, position]));
  const fundRows = [];
  for (const line of lines.slice(headerIndex + 1)) {
    const values = parseLine(line);
    const assetClass = values[index["Asset Class"]] ?? "";
    const rawTicker = String(values[index.Ticker] ?? "")
      .trim()
      .toUpperCase()
      .replaceAll(".", "-");
    if (assetClass.toLowerCase() !== "equity" || !canonical.has(rawTicker)) continue;
    const weight = Number(String(values[index["Weight (%)"]] ?? "").replaceAll(",", ""));
    if (!Number.isFinite(weight) || weight <= 0) continue;
    fundRows.push({
      etfTicker: item.ticker,
      fundName: item.fundName,
      constituentTicker: rawTicker,
      constituentName: values[index.Name] ?? null,
      portfolioWeight: weight / 100,
      holdingRank: 0,
      source: "official-ishares-latest-holdings",
      sourceAsOfDate: item.asOf,
      sourceRetrievalDate: manifest.retrievedAt,
      sourceStatus: "official-issuer-complete-equity-file",
      tickerMappingStatus: "issuer-ticker",
      normalizationNotes:
        "iShares official CSV; percent weight converted to ratio; non-equity rows excluded.",
    });
  }
  const seen = new Set();
  const deduped = fundRows.filter((row) => {
    const key = `${row.etfTicker}|${row.constituentTicker}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  deduped
    .sort(
      (left, right) =>
        right.portfolioWeight - left.portfolioWeight ||
        left.constituentTicker.localeCompare(right.constituentTicker),
    )
    .forEach((row, position) => {
      row.holdingRank = position + 1;
      rows.push(row);
    });
  funds.push({
    ticker: item.ticker,
    fundName: item.fundName,
    holdingsStatus: "complete-equity-file",
    holdingsSource: "official iShares latest-holdings.csv",
    holdingsAsOf: item.asOf,
    holdingsDepth: deduped.length,
    scoredStatus: "reference-only",
    sourceUrl: item.url,
    sourceSha256: item.sha256,
  });
}
const byTicker = new Map();
for (const row of rows)
  (byTicker.get(row.etfTicker) ?? byTicker.set(row.etfTicker, []).get(row.etfTicker)).push(row);
const invertedIndex = {};
for (const row of rows)
  (invertedIndex[row.constituentTicker] ??= []).push({
    etfTicker: row.etfTicker,
    weight: row.portfolioWeight,
    holdingRank: row.holdingRank,
  });
const depths = funds.map((fund) => fund.holdingsDepth).sort((a, b) => a - b);
const artifact = {
  schemaVersion: "1.0.0-official-ishares-equity",
  generatedAt: new Date().toISOString(),
  source: {
    name: "iShares/BlackRock official product screener and issuer latest holdings CSV",
    productScreener: manifest.productScreener,
    permission:
      "Public issuer-hosted product data and latest-holdings CSV; attribution and as-of retained.",
    retrievedAt: manifest.retrievedAt,
  },
  policy:
    "Only official iShares equity rows mapped to the canonical dashboard universe are normalized. Cash, bonds, derivatives, options, and unidentified instruments are excluded from ordinary stock lookup.",
  coverage: {
    candidateIssuerEtfs: funds.length,
    holdingsBackedEtfs: funds.filter((fund) => fund.holdingsDepth > 0).length,
    etfsWithCompleteEquityFiles: funds.filter((fund) => fund.holdingsDepth > 0).length,
    totalHoldingsRows: rows.length,
    medianHoldingsDepth: depths.length ? depths[Math.floor((depths.length - 1) / 2)] : 0,
  },
  funds,
  rows,
  invertedIndex,
};
await mkdir("apps/dashboard/public/data", { recursive: true });
await writeFile(
  "apps/dashboard/public/data/etf-holdings-ishares.json",
  `${JSON.stringify(artifact)}\n`,
);
console.log(
  JSON.stringify({
    funds: funds.length,
    rows: rows.length,
    depth: artifact.coverage.medianHoldingsDepth,
  }),
);
