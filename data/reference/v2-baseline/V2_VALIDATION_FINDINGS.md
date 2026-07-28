# V2 Baseline Validation Findings

## Scoring parity

Status: PASS

All configured floors and presets reproduced the baked V2 composite scores and ratings with zero mismatches.

## Portfolio parity

Status: FAIL — stale oracle/data-vintage mismatch

- Oracle generated_at: 2026-06-03T14:13:23
- Oracle Git commit: cb4a146a9f562a6487e8a86e0d613a2f97fa0ea4
- Frozen V2 application commit: b477349a8691fdc5000641a6ae2893dbbfae2de6
- Frozen bulk-data commit: a1304c59706a93f6b2aae775743f511c61539845
- Frozen bulk-data publication date: 2026-07-25T04:50:09Z
- Exact comparisons: 775
- Near comparisons: 2
- Numeric mismatches: 1457

The mismatches include prices, market values, composites, ratings, factor scores, and portfolio allocations.

The oracle contains no as-of date, source commit, data commit, or model version. It was generated from a June 3 data vintage and was not regenerated when the deployed universe changed.

Conclusion: the current V2 portfolio validation command is not reproducible against the July 2026 deployed universe because its Python oracle is stale.
