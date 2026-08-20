import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  ETF_ARTIFACT_MAX_SHARD_BYTES,
  readEtfArtifactSync,
} from "../../apps/dashboard/scripts/lib/etf-artifact-store.mjs";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const dataRoot = resolve(repositoryRoot, "apps/dashboard/public/data");
const sha256 = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");

const expected = {
  canonical: {
    sourceBytes: 50_547_861,
    sourceSha256: "61c811aa030c041ade2e8d92165ea2f69c814059b28954d99b8cd0cedeffe720",
    logicalSha256: "61c811aa030c041ade2e8d92165ea2f69c814059b28954d99b8cd0cedeffe720",
    funds: 1_286,
    rows: 96_586,
    index: 1_287,
    fundsSha256: "48bfdedb0b916a462f3aa90fb800ef984a6cb91d3affc6c7d76cc232e3118b8b",
    rowsSha256: "189c3a8c08fe66d39399edef3a82bf7963a5c03363ce8608cbc21c7b38a9f0df",
    indexSha256: "1730c950dbd7c4cb71c3c1e982cecd804902888402c9ac27c8688963f70014ad",
  },
  normalized: {
    sourceBytes: 42_810_078,
    sourceSha256: "7004b2d0097dced965a74a73820d0570507027629765abe38622dd8ccd7fa94a",
    logicalSha256: "d0c0a975150a48106dfef6f6b31aff5273cc29cc963e57b9eeaa2620f95a3d1d",
    rows: 76_485,
    index: 6_895,
    rowsSha256: "bfaa460fd10f90310674d7d1cd2f0470e5c322173d2f7679e17ec5b76d69f11f",
    indexSha256: "f96cbfb37bf985487ce25cf1e443e16e4563f0aeac20aa2453e9aefcedbd9abb",
  },
  "sec-nport": {
    sourceBytes: 30_529_065,
    sourceSha256: "630f02b45d54253beae741054872edd7bce61cc100d4035b57576c4d018a2c08",
    logicalSha256: "7a755f753cd40f9e1773a75b65cc66536ef4da9b38cf0213c4948068ede13a51",
    funds: 1_984,
    rows: 53_226,
    index: 6_794,
    fundsSha256: "7abd287cfcdb4700088a14e9abef364aadd202cafbc1f8db2369125e8af076fe",
    rowsSha256: "db3ae9b514288ad69acd21ca991549b4f9301a98bf45782c7cb54727a42d4c98",
    indexSha256: "74e50f27b04f91b1375fde8f5f7836c770d8c0cd3c50cc0444e4686a4438bbbd",
  },
  ishares: {
    sourceBytes: 12_209_990,
    sourceSha256: "3042b42224ac4691d3c56de69d849b77469dd3a5eefa194fadf1c3cf00b35f71",
    logicalSha256: "3b251ac63b39798b552e69a094117ce80fc7db081af2a3ba7e8fe9326b18272a",
    funds: 254,
    rows: 22_061,
    index: 1_263,
    fundsSha256: "671f86e069c7a5a418d0c7f57a07c5dac20891061bcc96c02537ae599620b0e4",
    rowsSha256: "8abab6d9efa9055759db03af0bc4de9e511d74ba6074121ed64cf8e404c274ed",
    indexSha256: "d36fbdb6c4396d4d4c8f77e8f48b53d17748e51b6a0444e3ea4f8e2380c528cb",
  },
} as const;

describe("ETF source artifact sharding", () => {
  for (const [name, baseline] of Object.entries(expected)) {
    it(`reconstructs ${name} without changing any rows, funds, or index entries`, () => {
      const legacyPath = resolve(dataRoot, `etf-holdings-${name}.json`);
      const directory = resolve(dataRoot, `etf-holdings-${name}`);
      const manifest = JSON.parse(readFileSync(resolve(directory, "manifest.json"), "utf8"));
      const artifact = readEtfArtifactSync(legacyPath) as {
        funds?: unknown[];
        rows: unknown[];
        invertedIndex: Record<string, unknown>;
      };

      expect(existsSync(legacyPath)).toBe(false);
      expect(manifest.source).toEqual({
        bytes: baseline.sourceBytes,
        sha256: baseline.sourceSha256,
      });
      expect(sha256(artifact)).toBe(baseline.logicalSha256);
      expect(artifact.rows).toHaveLength(baseline.rows);
      expect(Object.keys(artifact.invertedIndex)).toHaveLength(baseline.index);
      expect(sha256(artifact.rows)).toBe(baseline.rowsSha256);
      expect(sha256(artifact.invertedIndex)).toBe(baseline.indexSha256);
      if ("funds" in baseline) {
        expect(artifact.funds).toHaveLength(baseline.funds);
        expect(sha256(artifact.funds)).toBe(baseline.fundsSha256);
      }

      const shardRecords = manifest.sections.flatMap(
        (section: { shards?: Array<{ filename: string; bytes: number }> }) => section.shards ?? [],
      );
      expect(shardRecords.length).toBeGreaterThan(0);
      expect(
        shardRecords.every(
          (record: { filename: string; bytes: number }) =>
            record.bytes === statSync(resolve(directory, record.filename)).size &&
            record.bytes <= ETF_ARTIFACT_MAX_SHARD_BYTES,
        ),
      ).toBe(true);
    });
  }
});
