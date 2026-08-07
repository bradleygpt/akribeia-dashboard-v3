/* global console */

import { readFile, writeFile } from "node:fs/promises";

const legacy = JSON.parse(
  await readFile("apps/dashboard/public/data/etf-holdings-normalized.json", "utf8"),
);
const sec = JSON.parse(
  await readFile("apps/dashboard/public/data/etf-holdings-sec-nport.json", "utf8"),
);
const issuer = JSON.parse(
  await readFile("apps/dashboard/public/data/etf-holdings-ishares.json", "utf8"),
);
const byKey = new Map();
const secEtfTickers = new Set(sec.rows.map((row) => row.etfTicker));
const issuerEtfTickers = new Set(issuer.rows.map((row) => row.etfTicker));
for (const row of legacy.rows.filter(
  (item) =>
    item.sourceStatus !== "sec-nport-equity" &&
    !secEtfTickers.has(item.etfTicker) &&
    !issuerEtfTickers.has(item.etfTicker),
)) {
  byKey.set(`${row.etfTicker}|${row.constituentTicker}`, row);
}
for (const row of sec.rows)
  if (!issuerEtfTickers.has(row.etfTicker))
    byKey.set(`${row.etfTicker}|${row.constituentTicker}`, row);
for (const row of issuer.rows) byKey.set(`${row.etfTicker}|${row.constituentTicker}`, row);
const rows = [...byKey.values()];
const byEtf = new Map();
for (const row of rows) {
  const list = byEtf.get(row.etfTicker) ?? [];
  list.push(row);
  byEtf.set(row.etfTicker, list);
}
for (const list of byEtf.values())
  list
    .sort(
      (left, right) =>
        right.portfolioWeight - left.portfolioWeight ||
        left.constituentTicker.localeCompare(right.constituentTicker),
    )
    .forEach((row, index) => {
      row.holdingRank = index + 1;
    });
const invertedIndex = {};
for (const row of rows)
  (invertedIndex[row.constituentTicker] ??= []).push({
    etfTicker: row.etfTicker,
    weight: row.portfolioWeight,
    holdingRank: row.holdingRank,
  });
const depths = [...byEtf.values()].map((list) => list.length).sort((left, right) => left - right);
const artifact = {
  schemaVersion: "2.0.0-zero-cost-multi-source",
  generatedAt: new Date().toISOString(),
  policy:
    "SEC N-PORT equity holdings are preferred; approved V2 reference rows supplement funds not present in SEC N-PORT. All source status and as-of fields remain attached; no complete claim is made for partial data.",
  sources: [issuer.source, sec.source, legacy.source],
  coverage: {
    totalEtfs: new Set(rows.map((row) => row.etfTicker)).size,
    etfsWithCompleteHoldings: 0,
    etfsWithPartialHoldings: byEtf.size,
    etfsWithUnavailableHoldings: 5575 - byEtf.size,
    totalHoldingsRows: rows.length,
    medianHoldingsDepth: depths.length ? depths[Math.floor((depths.length - 1) / 2)] : 0,
    fundsWithAtLeast25Holdings: depths.filter((value) => value >= 25).length,
    fundsWithAtLeast50Holdings: depths.filter((value) => value >= 50).length,
    sourceBreakdown: {
      secNportRows: sec.rows.length,
      officialIssuerRows: issuer.rows.length,
      approvedV2Rows: legacy.rows.filter((item) => item.sourceStatus !== "sec-nport-equity").length,
    },
  },
  invertedIndex,
  rows,
};
await writeFile(
  "apps/dashboard/public/data/etf-holdings-normalized.json",
  `${JSON.stringify(artifact)}\n`,
  "utf8",
);
console.log(JSON.stringify(artifact.coverage));
