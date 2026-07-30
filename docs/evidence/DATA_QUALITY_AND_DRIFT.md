# Data Quality and Drift

`npm run quality:generate` verifies the active daily evidence, model-card lineage, and receipted
score artifact before producing a versioned quality report.

The report measures row and ticker uniqueness, invalid price and market-cap counts, eligibility,
factor coverage, score distribution, and exact portfolio-weight reconciliation. Identical retries
reuse immutable bytes; mismatched receipts, lineage, or existing bytes fail closed.

Temporal drift requires at least two comparable immutable model observations. The current report
therefore records `insufficient-history`, a null baseline, and no comparisons. It does not turn
cross-sectional dispersion within one snapshot into a time-series drift claim.

Canonical reports are stored at:

```text
data/evidence/quality/builds/<build-id>/quality-drift.json
```

The dashboard and browser-accessible active projection use the exact same report bytes. These
quality checks describe research evidence; they do not establish investment performance.

The report is deployed in the owner-only V3 preview from functional commit `187a0635d`, preserved
as exact-tree Sites source commit `5c75e023e` and saved as Sites version 19. V2 is unchanged.
