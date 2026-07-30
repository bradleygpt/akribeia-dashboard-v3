# Historical Point-in-Time Readiness

`npm run historical-readiness:generate` audits the repository's preserved V2 research fixtures and
publishes an immutable, build-linked readiness report. The report does not run a backtest or infer
performance.

## Current finding

Historical validation is blocked.

The repository contains two independently preserved cross-sectional research snapshots:

| Vintage              | Declared generation time | $0B rows | $10B rows |
| -------------------- | ------------------------ | -------: | --------: |
| June matching oracle | `2026-06-03T14:12:05`    |    1,360 |       642 |
| July V2 baseline     | `2026-07-28T17:06:46`    |    1,361 |       643 |

Every inventoried file is hashed. These captures are useful for parity and reproducibility, but
they are not a point-in-time time series:

- declared generation times omit timezone semantics;
- rows have no filing, announcement, vendor-availability, retrieval, or revision time;
- universes do not prove historical eligibility without survivorship bias;
- the security master has no permanent identifiers, ticker history, or delisting records;
- corporate actions and price-adjustment semantics are absent;
- benchmark observations and historical membership are absent;
- execution timing, liquidity, spread, slippage, commission, and transaction-cost inputs are
  absent;
- two cross-sections cannot establish a walk-forward or out-of-sample evaluation.

The audit also finds that both $0B fixtures fail the strict V3 input contract. The June file has
one null-price issue. The July file has five issues: one blank sector in snapshot metadata and two
records with blank sector and industry fields. Both $10B fixtures pass; the active product uses
the July $10B fixture. Inventory validation is deliberately separate from the production-input
contract so the report can preserve and describe invalid historical material without weakening
publication gates.

## Publication

Canonical immutable reports are written to:

```text
data/evidence/historical-readiness/builds/<build-id>/historical-readiness.json
```

The browser-accessible and dashboard projections use the same deterministic bytes. Identical
retries reuse the immutable report; conflicting bytes fail closed. Schema version `1.0.0`
hard-codes historical eligibility to `false` and requires every control after snapshot inventory
to remain blocked. A future eligibility claim therefore requires a reviewed schema and evidence
contract, not a caller-supplied override.

V2 is unchanged. No performance result, benchmark comparison, or investment claim is produced.

The functional historical-readiness tree is deployed in the owner-only V3 preview from commit
`8e9d6e6f2`, preserved as exact-tree Sites source commit `18f9951b3`, and saved as Sites version 25.
