# Codex Execution Status

Last updated: 2026-07-30

## Whole-product completion

Estimated completion: **34%**

This estimate reflects working, tested product behavior rather than roadmap line-item count. V3 now has the Phase 0 baseline, core publication trust primitives, a deployed visible preview, complete coverage-aware scoring evidence, exact integer-unit portfolio construction, and a retry-safe end-to-end publication/activation/rollback pipeline for the current data source. It is not ready to replace V2.

## Completed milestones

- Phase 0 V2 baseline and parity evidence captured.
- Canonical formatting, type, lint, test, build, dependency, and CodeQL gates.
- Data trust, freshness, provenance, manifest, and publication contracts.
- Deterministic manifest evaluation with last-known-good behavior.
- Atomic immutable build publication.
- Atomic active-build selection and validated one-step rollback.
- Real-repository-data-to-dashboard vertical slice, privately deployed and merged through PR #7.
- Coverage-aware scoring, factor reporting, and per-security contribution lineage, privately deployed and merged through PR #8.
- Exact integer-unit portfolio construction and infeasibility evidence, privately deployed and merged through PR #9.

## Current milestone

**Phase 1 end-to-end pipeline hardening**

The current branch completes the operational path used by the visible slice:

1. activation re-hashes and byte-checks every immutable artifact before moving the pointer;
2. deterministic retries verify and reuse an exact build without overwriting it;
3. a conflicting retry fails closed if manifest or artifact contents differ;
4. stale input, failed projection, and failed activation preserve last-known-good state;
5. product rollback updates both the active pointer and dashboard projection, with recovery on projection failure;
6. success evidence reconciles freshness, provenance, scoring, portfolio, manifest, publication, activation, and projection;
7. the dashboard exposes source age, freshness limits, artifact integrity, retry mode, activation, and rollback;
8. a new immutable `preview.4` build preserves the exact-portfolio build as its rollback target.

Implementation, complete local CI, dependency audit, and private preview deployment pass. Pull-request gates remain for this unit.

## Remaining milestones

- Replace the preserved snapshot input with scheduled, point-in-time live-source ingestion and daily orchestration once a suitable zero-cost source is established.
- Add all primary V3 user workflows, degraded states, accessibility checks, and browser smoke coverage.
- Add protected server-side API and AI capabilities without exposed secrets.
- Establish preview and production deployment operations, health checks, and rollback procedures.
- Deliver the immutable daily evidence layer, model cards, metric dictionary, drift, and maturity labels.
- Implement point-in-time historical controls, corporate actions, walk-forward evaluation, costs, and benchmarks.
- Accumulate prospective daily validation evidence.
- Complete release-gate certification, recovery testing, accessibility review, and operational documentation.
- Perform final V3 production cutover only with explicit authorization after all gates pass.

## Blockers

- No product blocker is active.
- Final V3 production cutover remains explicitly out of scope without user authorization.

## Test counts

- Vitest suite: 56 tests across 7 files pass.
- Rendered deployment artifact suite: 2 tests pass.
- Total automated tests: 58 pass.
- Current unit validation status: Prettier, typecheck, lint, 58 automated tests, every workspace build, artifact-integrity checks, `git diff --check`, and `npm audit --audit-level=high` pass.

## Deployment status

- V2 production: unchanged.
- V3 local preview: generated and safely retried as immutable build `preview-20260728-pipeline-v4-a34fc842220f`; an interactive dev server is not currently running.
- V3 hosted preview: deployed privately at <https://akribeia-v3-evidence-preview.akribeiainsights.chatgpt.site>.
- V3 hosted preview source: validated end-to-end pipeline commit `41d8c0f55`.
- V3 production: not deployed.
- Cutover: not authorized and not attempted.

## Evidence status

- V2 baseline fixtures and native parity reports: preserved.
- V3 immutable preview builds: four local manifest-addressed builds preserve artifact hashes, provenance, model/schema versions, and rollback linkage.
- V3 active local evidence: `preview-20260728-pipeline-v4-a34fc842220f` with explicit freshness age/limit, verified retry reuse, three SHA-256 artifacts, 1,000,000,000 reconciled weight units, 643 score records, and five factor-coverage reports.
- V3 hosted end-to-end pipeline evidence: deployed from validated commit `41d8c0f55`.
- Published daily evidence history: not started.
- Historical validation: not started.
- Prospective validation: not started.

## Risks and assumptions

- The current visible slice uses a preserved repository snapshot, not a live market feed.
- The snapshot timestamp lacked an explicit timezone; the build recipe records it as UTC because its generation time aligns with the baseline commit chronology.
- Scoring requires all five weighted pillars for the product build; incomplete rows fail closed with explicit reasons instead of being silently renormalized. The library permits available-weight scoring only through an explicitly named policy whose output records that normalization.
- Portfolio allocation is deterministic and exact to one billionth of portfolio weight. It intentionally remains a ranked long-only allocator; transaction costs, turnover, liquidity, and benchmark-relative constraints are not yet modeled.
- Active pointer writes assume one publication coordinator; concurrent writers remain last-writer-wins. Safe retry is implemented, but scheduler locking and live-source ingestion remain future production work.
- All displayed results are research evidence, not investment advice or performance guarantees.
