import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

test("expanded ETF directory preserves reference-only and holdings provenance", async () => {
  const directory = JSON.parse(await read("public/data/etf-universe-expanded.json"));
  const holdings = JSON.parse(await read("public/data/etf-holdings-normalized.json"));
  const canonical = JSON.parse(await read("public/data/etf-holdings-canonical.json"));
  assert.ok(directory.totalEtfs > 151);
  assert.equal(directory.totalEtfs, directory.etfs.length);
  assert.ok(directory.etfs.every((row) => row.scoredStatus === "reference-only"));
  assert.equal(holdings.coverage.etfsWithCompleteHoldings, 0);
  assert.ok(holdings.coverage.etfsWithPartialHoldings > 0);
  assert.ok(holdings.coverage.etfsWithUnavailableHoldings > 0);
  assert.ok(holdings.coverage.sourceBreakdown.secNportRows > 30_000);
  assert.ok(holdings.rows.some((row) => row.sourceStatus === "sec-nport-equity"));
  assert.equal(canonical.coverage.canonicalEquities, 1291);
  assert.ok(canonical.coverage.equitiesCovered > 1200);
  assert.ok(holdings.rows.every((row) => Number.isFinite(row.portfolioWeight)));
});

test("ETF UI exposes status filtering and local normalized holdings", async () => {
  const source = await read("app/etfs/etf-center.tsx");
  assert.match(source, /Directory status/);
  assert.match(source, /etf-universe-expanded\.json/);
  assert.match(source, /etf-runtime\/manifest\.json/);
  assert.doesNotMatch(source, /fetch\("\/data\/etf-holdings-canonical\.json/);
  assert.match(source, /Reference-only/);
});
