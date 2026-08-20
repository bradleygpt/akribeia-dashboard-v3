import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  exactIntersection,
  nearIntersection,
} from "../../apps/dashboard/app/etfs/multi-stock-intersection";
import { readEtfArtifactSync } from "../../apps/dashboard/scripts/lib/etf-artifact-store.mjs";

const canonical = readEtfArtifactSync("apps/dashboard/public/data/etf-holdings-canonical.json");
const manifest = JSON.parse(
  readFileSync("apps/dashboard/public/data/etf-runtime/manifest.json", "utf8"),
);
const index = JSON.parse(
  readFileSync("apps/dashboard/public/data/etf-runtime/ticker-etf-index.json", "utf8"),
);
const tickers = JSON.parse(
  readFileSync("apps/dashboard/public/data/etf-runtime/canonical-ticker-dictionary.json", "utf8"),
);
const etfs = JSON.parse(
  readFileSync("apps/dashboard/public/data/etf-runtime/etf-dictionary.json", "utf8"),
);

describe("ETF runtime sharding", () => {
  it("reconciles manifest counts and shard limits", () => {
    expect(manifest.retainedEtfs).toBe(canonical.coverage.retainedEtfs);
    expect(manifest.canonicalHoldingsRows).toBe(canonical.rows.length);
    expect(manifest.totalShardRows).toBe(canonical.rows.length);
    expect(
      manifest.shards.every((shard: { bytes: number }) => shard.bytes < 25 * 1024 * 1024),
    ).toBe(true);
  });

  it("keeps dictionary IDs and inverted index entries valid", () => {
    expect(etfs.etfs).toHaveLength(canonical.funds.length);
    for (const entries of Object.values(index.index) as Array<Array<{ etfId: number }>>) {
      for (const entry of entries) {
        expect(entry.etfId).toBeGreaterThanOrEqual(0);
        expect(entry.etfId).toBeLessThan(etfs.etfs.length);
      }
    }
    expect(tickers.tickers).toHaveLength(
      new Set(canonical.rows.map((row: { constituentTicker: string }) => row.constituentTicker))
        .size,
    );
  });

  it("preserves monolith exact and near-match results through the compact index", () => {
    const runtimeIndex = Object.fromEntries(
      Object.entries(index.index).map(([tickerId, entries]) => [
        tickers.tickers[Number(tickerId)],
        (entries as Array<{ etfId: number; weight: number; holdingRank: number }>).map((entry) => ({
          etfTicker: etfs.etfs[entry.etfId].ticker,
          weight: entry.weight,
          holdingRank: entry.holdingRank,
        })),
      ]),
    );
    const cases = [["NVDA"], ["NVDA", "AMD"], ["MSFT", "AMZN", "GOOGL"], ["CWEN-A", "VFS"]];
    for (const selected of cases) {
      const oldExact = exactIntersection(selected, canonical.invertedIndex)
        .map((row) => row.etfTicker)
        .sort();
      const newExact = exactIntersection(selected, runtimeIndex)
        .map((row) => row.etfTicker)
        .sort();
      const oldNear = nearIntersection(selected, canonical.invertedIndex)
        .map((row) => row.etfTicker)
        .sort();
      const newNear = nearIntersection(selected, runtimeIndex)
        .map((row) => row.etfTicker)
        .sort();
      expect(newExact).toEqual(oldExact);
      expect(newNear).toEqual(oldNear);
    }
  });
});
