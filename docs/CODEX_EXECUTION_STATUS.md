# Codex Execution Status

Last updated: 2026-07-30

## Whole-product completion

Estimated completion: **39%**

This estimate reflects working, tested product behavior rather than roadmap line-item count. V3 now has the Phase 0 baseline, core publication trust primitives, a deployed visible preview, complete coverage-aware scoring evidence, exact integer-unit portfolio construction, a retry-safe end-to-end publication/activation/rollback pipeline, and an accessible runtime data-status surface for the current source. It is not ready to replace V2.

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
- Retry-safe publication, manifest artifact verification, coordinated projection/activation, and product rollback, privately deployed and merged through PR #10.

## Current milestone

**Phase 1 user-facing availability and accessibility**

The current branch makes the deployed evidence state honest and usable:

1. the browser loads and validates the active pointer, manifest, and dashboard contracts;
2. runtime verification reconciles build, model, and schema lineage;
3. the browser re-hashes the dashboard and checks its exact byte size before reporting it current;
4. loading, current, stale, degraded, unavailable, and error states have distinct fail-closed behavior and plain-language guidance;
5. stale or degraded evidence remains visible as last-known-good history without being presented as current;
6. skip navigation, labelled landmarks, a table caption, keyboard-scrollable rankings, visible focus, reduced-motion behavior, and forced-color support improve accessibility;
7. the mobile layout preserves ranking columns through horizontal scrolling instead of hiding evidence;
8. a real Chrome smoke test hydrates the built worker and requires runtime verification to complete at a mobile viewport.

Implementation, complete local CI, dependency audit, and private preview deployment pass. Pull-request gates remain for this unit.

## Remaining milestones

- Replace the preserved snapshot input with scheduled, point-in-time live-source ingestion and daily orchestration once a suitable zero-cost source is established.
- Add the remaining primary V3 workflows and complete a formal accessibility audit.
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

- Vitest suite: 67 tests across 8 files pass.
- Rendered deployment and browser suite: 4 tests pass.
- Total automated tests: 71 pass.
- Current unit validation: Prettier, typecheck, lint, every workspace build, 67 Vitest tests, three rendered accessibility/integrity tests, one real-Chrome hydration smoke test, `git diff --check`, and `npm audit --audit-level=high` pass.

## Deployment status

- V2 production: unchanged.
- V3 local preview: generated and safely retried as immutable build `preview-20260728-pipeline-v4-a34fc842220f`; an interactive dev server is not currently running.
- V3 hosted preview: deployed privately at <https://akribeia-v3-evidence-preview.akribeiainsights.chatgpt.site>.
- V3 hosted preview source: validated dashboard availability commit `aa482697a`.
- V3 production: not deployed.
- Cutover: not authorized and not attempted.

## Evidence status

- V2 baseline fixtures and native parity reports: preserved.
- V3 immutable preview builds: four local manifest-addressed builds preserve artifact hashes, provenance, model/schema versions, and rollback linkage.
- V3 active local evidence: `preview-20260728-pipeline-v4-a34fc842220f` with explicit freshness age/limit, verified retry reuse, three SHA-256 artifacts, 1,000,000,000 reconciled weight units, 643 score records, and five factor-coverage reports.
- V3 hosted end-to-end pipeline evidence: deployed from the tree validated in PR #10.
- V3 hosted availability evidence: runtime pointer, manifest, schema, lineage, byte-size, and dashboard SHA-256 verification deployed from validated commit `aa482697a`.
- Published daily evidence history: not started.
- Historical validation: not started.
- Prospective validation: not started.

## Risks and assumptions

- The current visible slice uses a preserved repository snapshot, not a live market feed.
- The snapshot timestamp lacked an explicit timezone; the build recipe records it as UTC because its generation time aligns with the baseline commit chronology.
- Scoring requires all five weighted pillars for the product build; incomplete rows fail closed with explicit reasons instead of being silently renormalized. The library permits available-weight scoring only through an explicitly named policy whose output records that normalization.
- Portfolio allocation is deterministic and exact to one billionth of portfolio weight. It intentionally remains a ranked long-only allocator; transaction costs, turnover, liquidity, and benchmark-relative constraints are not yet modeled.
- Active pointer writes assume one publication coordinator; concurrent writers remain last-writer-wins. Safe retry is implemented, but scheduler locking and live-source ingestion remain future production work.
- Runtime browser verification protects the visible dashboard artifact; portfolio and score artifact integrity remains enforced by activation and the rendered deployment integrity test rather than re-downloaded in the browser.
- The Chrome smoke test covers hydration, immutable data loading, runtime verification, and a mobile viewport. A full manual assistive-technology review remains outstanding.
- All displayed results are research evidence, not investment advice or performance guarantees.
