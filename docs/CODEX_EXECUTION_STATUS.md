# Codex Execution Status

Last updated: 2026-07-30

## Whole-product completion

Estimated completion: **48%**

This estimate reflects working, tested product behavior rather than roadmap line-item count. V3 now has the Phase 0 baseline, core publication trust primitives, a deployed visible preview, complete coverage-aware scoring evidence, exact integer-unit portfolio construction, a retry-safe end-to-end publication/activation/rollback pipeline, an accessible runtime data-status surface, protected server-side evidence capabilities, and explicit deployment health and recovery operations for the current source. It is not ready to replace V2.

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
- Runtime freshness/integrity states, responsive accessibility improvements, and real-Chrome smoke coverage, privately deployed and merged through PR #11.
- Protected server evidence lookup and deterministic cited explanations, privately deployed and merged through PR #12.

## Current milestone

**Deployment health and recovery operations**

The current branch makes the isolated V3 deployment inspectable and recoverable:

1. `/api/v3/health` now performs deep pointer, manifest, score, portfolio, schema, and lineage verification;
2. a tampered active artifact produces a fail-closed `503` health result;
3. the built deployment package must contain the worker entrypoint and exact hosting metadata;
4. packaged active evidence must match source bytes and every manifest digest and size;
5. the deployment runbook defines exact validation, source, packaging, save, deploy, and status-poll requirements;
6. application rollback procedures preserve coordinated pointer and dashboard projection state;
7. hosted rollback procedures redeploy a previously validated saved version without rebuilding or rewriting history;
8. explicit failure rules prevent V2 modification or V3 cutover when checks, health, security, or recovery evidence is incomplete.

Implementation, complete local CI, dependency audit, and private preview deployment pass. Pull-request gates remain for this unit.

## Remaining milestones

- Replace the preserved snapshot input with scheduled, point-in-time live-source ingestion and daily orchestration once a suitable zero-cost source is established.
- Add the remaining primary V3 workflows and complete a formal accessibility audit.
- Add an external generative model only after provider, secret lifecycle, cost, output, and evaluation gates are approved.
- Complete final-production configuration and cutover rehearsal only after all release gates pass.
- Deliver the immutable daily evidence layer, model cards, metric dictionary, drift, and maturity labels.
- Implement point-in-time historical controls, corporate actions, walk-forward evaluation, costs, and benchmarks.
- Accumulate prospective daily validation evidence.
- Complete release-gate certification, recovery testing, accessibility review, and operational documentation.
- Perform final V3 production cutover only with explicit authorization after all gates pass.

## Blockers

- No product blocker is active.
- Final V3 production cutover remains explicitly out of scope without user authorization.

## Test counts

- Vitest suite: 82 tests across 9 files pass.
- Rendered deployment and browser suite: 6 tests pass.
- Total automated tests: 88 pass.
- Current unit validation: Prettier, typecheck, lint, every workspace build, 82 Vitest tests, five rendered accessibility/integrity/API/package tests, one isolated-profile real-Chrome hydration smoke test, `git diff --check`, and `npm audit --audit-level=high` pass.

## Deployment status

- V2 production: unchanged.
- V3 local preview: generated and safely retried as immutable build `preview-20260728-pipeline-v4-a34fc842220f`; an interactive dev server is not currently running.
- V3 hosted preview: deployed privately at <https://akribeia-v3-evidence-preview.akribeiainsights.chatgpt.site>.
- V3 hosted preview source: validated deployment-health commit `25879907b`.
- V3 production: not deployed.
- Cutover: not authorized and not attempted.

## Evidence status

- V2 baseline fixtures and native parity reports: preserved.
- V3 immutable preview builds: four local manifest-addressed builds preserve artifact hashes, provenance, model/schema versions, and rollback linkage.
- V3 active local evidence: `preview-20260728-pipeline-v4-a34fc842220f` with explicit freshness age/limit, verified retry reuse, three SHA-256 artifacts, 1,000,000,000 reconciled weight units, 643 score records, and five factor-coverage reports.
- V3 hosted end-to-end pipeline evidence: deployed from the tree validated in PR #10.
- V3 hosted availability evidence: runtime pointer, manifest, schema, lineage, byte-size, and dashboard SHA-256 verification deployed from the tree validated in PR #11.
- V3 protected evidence API: server-verified lookup and deterministic explanation routes deployed privately from validated commit `14703cc0f`.
- V3 deep deployment health: pointer, manifest, artifact integrity, schema, and lineage verification deployed privately from validated commit `25879907b`.
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
- Protected routes rely on the owner-only Sites access gate for authentication. The custom client header is a CSRF barrier, not a secret.
- The zero-cost rate limiter is bounded and effective per worker isolate, but it is not a globally durable quota.
- External generative AI is intentionally disabled; no provider secret, paid request, or unverifiable generated claim is present.
- All displayed results are research evidence, not investment advice or performance guarantees.
