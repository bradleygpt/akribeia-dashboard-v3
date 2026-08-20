/* global Buffer, console */
import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { readEtfArtifact } from "./lib/etf-artifact-store.mjs";

const root = "apps/dashboard/public/data";
const out = `${root}/etf-runtime`;
const canonical = await readEtfArtifact(`${root}/etf-holdings-canonical.json`);
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const writeJson = async (name, value) => {
  const bytes = Buffer.from(`${JSON.stringify(value)}\n`);
  await writeFile(`${out}/${name}`, bytes);
  return { filename: name, bytes: bytes.length, sha256: hash(bytes) };
};
await mkdir(out, { recursive: true });
const tickers = [...new Set(canonical.rows.map((row) => row.constituentTicker))].sort();
const etfs = canonical.funds.map((fund, id) => ({
  id,
  ticker: fund.ticker,
  fundName: fund.fundName ?? fund.name ?? fund.ticker,
  issuer: fund.issuer ?? null,
  holdingsStatus: fund.holdingsStatus ?? "partial",
  holdingsSource: fund.holdingsSource ?? null,
  holdingsAsOf: fund.holdingsAsOf ?? null,
  numberHoldings: fund.numberHoldings ?? null,
  scoredStatus: fund.scoredStatus ?? "reference-only",
  shardId: Math.floor(id / 100),
}));
const tickerId = new Map(tickers.map((ticker, id) => [ticker, id]));
const etfId = new Map(etfs.map((fund) => [fund.ticker, fund.id]));
const rowsByEtf = new Map(etfs.map((fund) => [fund.id, []]));
for (const row of canonical.rows) {
  const id = etfId.get(row.etfTicker);
  const constituentId = tickerId.get(row.constituentTicker);
  if (id === undefined || constituentId === undefined)
    throw new Error(`Unknown dictionary ID for ${row.etfTicker}/${row.constituentTicker}`);
  rowsByEtf.get(id).push({
    tickerId: constituentId,
    weight: row.portfolioWeight,
    holdingRank: row.holdingRank,
    source: row.source,
    sourceAsOfDate: row.sourceAsOfDate,
    sourceStatus: row.sourceStatus,
  });
}
const index = Object.fromEntries(
  tickers.map((ticker, id) => [
    id,
    (canonical.invertedIndex[ticker] ?? []).map((entry) => ({
      etfId: etfId.get(entry.etfTicker),
      weight: entry.weight,
      holdingRank: entry.holdingRank,
    })),
  ]),
);
const shardRecords = [];
for (let start = 0; start < etfs.length; start += 100) {
  const end = Math.min(start + 100, etfs.length);
  const name = `etf-holdings-${String(start / 100).padStart(2, "0")}.json`;
  shardRecords.push(
    await writeJson(name, {
      schemaVersion: "1.0.0",
      startId: start,
      endId: end - 1,
      portfolios: Object.fromEntries(
        etfs.slice(start, end).map((fund) => [fund.id, rowsByEtf.get(fund.id)]),
      ),
    }),
  );
}
const dictionaryRecord = await writeJson("canonical-ticker-dictionary.json", {
  schemaVersion: "1.0.0",
  tickers,
});
const etfRecord = await writeJson("etf-dictionary.json", { schemaVersion: "1.0.0", etfs });
const indexRecord = await writeJson("ticker-etf-index.json", { schemaVersion: "1.0.0", index });
const summaryRecord = await writeJson("etf-summary.json", {
  schemaVersion: "1.0.0",
  coverage: canonical.coverage,
  etfs,
});
const manifest = {
  schemaVersion: "1.0.0",
  generatedAt: new Date().toISOString(),
  canonicalUniverseHash: hash(Buffer.from(JSON.stringify(tickers))),
  retainedEtfs: etfs.length,
  canonicalHoldingsRows: canonical.rows.length,
  dictionary: [dictionaryRecord, etfRecord],
  index: indexRecord,
  summary: summaryRecord,
  shards: shardRecords,
  totalShardRows: [...rowsByEtf.values()].reduce((sum, rows) => sum + rows.length, 0),
};
await writeFile(`${out}/manifest.json`, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(
  JSON.stringify({
    retainedEtfs: etfs.length,
    rows: canonical.rows.length,
    shards: shardRecords.length,
    largestShardBytes: Math.max(...shardRecords.map((record) => record.bytes)),
  }),
);
