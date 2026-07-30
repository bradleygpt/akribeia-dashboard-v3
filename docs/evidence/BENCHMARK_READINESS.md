# Benchmark Readiness

The benchmark-readiness report inventories broad U.S. equity proxy candidates present in both
receipted `$10B` research snapshots. It does not select, endorse, or calculate a benchmark.

Eight candidate labels are present in both snapshots: `ITOT`, `IVV`, `SCHB`, `SPLG`, `SPTM`,
`SPY`, `VOO`, and `VTI`. Six have an exact current SEC registered-fund series/class association;
`SPLG` and `SPY` are unmatched in the captured current SEC association source.

## Reproduction

```bash
npm run benchmark-readiness:generate
```

The generator verifies both source snapshots against their historical-readiness SHA-256 receipts,
validates membership and SEC crosswalk lineage, and writes immutable build-addressed evidence
plus coordinated dashboard and public projections.

Current result:

| Measurement                        | Result |
| ---------------------------------- | -----: |
| ETF labels in the June snapshot    |     55 |
| ETF labels in the July snapshot    |     55 |
| Broad U.S. equity proxy candidates |      8 |
| Current SEC fund associations      |      6 |
| Selected benchmarks                |      0 |
| Total-return observations          |      0 |

Canonical output:

```text
data/evidence/benchmark-readiness/builds/<build-id>/benchmark-readiness.json
```

## Fail-closed boundary

The report preserves each candidate's two observed snapshot prices and their arithmetic price
change as a source comparison. That comparison is explicitly not a price return, total return, or
performance record.

Benchmark publication remains blocked until there is an approved benchmark mandate, point-in-time
identity, record-level availability timing, distributions and corporate actions, an independently
reproducible adjusted total-return series, a defined evaluation interval, and timestamp alignment
with an executed and costed portfolio. No candidate observation may be used to infer portfolio or
benchmark performance.
