# Akribeia Platform v3

A zero-cost, auditable quantitative research platform designed around reproducibility, point-in-time data, explainable scores, exact portfolio constraints, and prospective validation.

## Repository status

**Phase 2: Visible evidence preview**

V2 remains the production system. V3 now includes a working repository-data-to-dashboard preview with strict contracts, coverage-aware scoring, exact portfolio caps, immutable publication, active-build selection, runtime freshness and integrity states, a protected server-verified evidence explorer, and the first reproducible daily evidence record. V3 is developed and validated independently until all cutover gates pass.

## Core principles

1. Unknown data never silently becomes zero.
2. Every result has source, timestamp, model version, schema version, and build ID.
3. Historical tests use only information available at the decision timestamp.
4. Portfolio constraints are enforced mathematically on final weights.
5. Experimental outputs are visibly separated from validated outputs.
6. A failed build never replaces the last known-good build.
7. Routine operation remains within zero-cost service limits.

## Initial commands

```bash
npm install
npm run typecheck
npm run test
npm run build
npm run preview:generate
npm run evidence:generate
npm run governance:generate
npm run quality:generate
npm run master:generate
npm run maturity:generate
npm run historical-readiness:generate
npm run sec-identity:fetch
npm run registrants:generate
```

## Migration strategy

1. Freeze V2 outputs and fixtures.
2. Reproduce V2 in `2-compatibility` mode.
3. Introduce V3 methodology only after parity is documented.
4. Run V2 and V3 in parallel.
5. Cut over only after software, data, quant, security, and operational gates pass.

See `ROADMAP.md`, `MIGRATION.md`, and `docs/architecture/ADR-0001-separate-v3-repository.md`.
Evidence-layer details include
[`docs/evidence/SECURITY_MASTER.md`](docs/evidence/SECURITY_MASTER.md) and
[`docs/evidence/SEC_REGISTRANT_CROSSWALK.md`](docs/evidence/SEC_REGISTRANT_CROSSWALK.md),
[`docs/evidence/MATURITY_LABELS.md`](docs/evidence/MATURITY_LABELS.md), and
[`docs/evidence/HISTORICAL_READINESS.md`](docs/evidence/HISTORICAL_READINESS.md).
Execution evidence and honest readiness status are maintained in `docs/CODEX_EXECUTION_STATUS.md`.
Deployment health and recovery procedures are maintained in `docs/operations/DEPLOYMENT_AND_RECOVERY.md`.
Daily record semantics and reproduction are documented in `docs/evidence/DAILY_EVIDENCE.md`.
Model maturity, validation gates, and metric definitions are documented in `docs/evidence/MODEL_GOVERNANCE.md`.
Quality measurements and drift eligibility are documented in `docs/evidence/DATA_QUALITY_AND_DRIFT.md`.
