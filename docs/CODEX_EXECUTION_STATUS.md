# Codex Execution Status

Last updated: 2026-07-30

## Whole-product completion

Estimated completion: **60%**

This estimate reflects working, tested product behavior rather than roadmap line-item count. V3 now has the Phase 0 baseline, core publication trust primitives, a deployed visible preview, complete coverage-aware scoring evidence, exact integer-unit portfolio construction, a retry-safe end-to-end publication/activation/rollback pipeline, an accessible runtime data-status surface, protected server-side evidence capabilities, explicit deployment health and recovery operations, the first immutable daily evidence record, and versioned model-governance evidence. It is not ready to replace V2.

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
- Deep deployment health, packaged-evidence verification, and V3-only recovery procedures, privately deployed and merged through PR #13.
- Immutable daily evidence, explicit benchmark/performance limits, reproducibility reporting, and a visible evidence ledger, privately deployed and merged through PR #14.

## Current milestone

**Visible model governance**

The current branch makes model maturity, definitions, and validation limits inspectable:

1. the active daily record and reproduction digest are verified before governance generation;
2. metadata source commit, default preset, five pillars, and all active weights must reconcile;
3. versioned immutable model-card and metric-dictionary artifacts are retry-safe and conflict-closed;
4. research-preview maturity and release ineligibility are explicit;
5. scoring parity, portfolio parity, coverage, constraints, benchmark, point-in-time, and prospective gates remain independent;
6. the known V2 portfolio-parity failure is visible beside passing gates;
7. all 26 preserved component names and directions are published;
8. unavailable raw transform, normalization, winsorization, and component missing-value formulas are labeled rather than guessed;
9. the dashboard exposes validation status, limitations, component definitions, and downloadable governance JSON.

Implementation, complete local CI, governance/rendering/packaging/browser tests, dependency audit, and private preview deployment pass. Pull-request gates remain for this unit.

## Remaining milestones

- Replace the preserved snapshot input with scheduled, point-in-time live-source ingestion and daily orchestration once a suitable zero-cost source is established.
- Add the remaining primary V3 workflows and complete a formal accessibility audit.
- Add an external generative model only after provider, secret lifecycle, cost, output, and evaluation gates are approved.
- Complete final-production configuration and cutover rehearsal only after all release gates pass.
- Add quality/drift reports and a security master.
- Implement point-in-time historical controls, corporate actions, walk-forward evaluation, costs, and benchmarks.
- Accumulate prospective daily validation evidence.
- Complete release-gate certification, recovery testing, accessibility review, and operational documentation.
- Perform final V3 production cutover only with explicit authorization after all gates pass.

## Blockers

- No product blocker is active.
- Final V3 production cutover remains explicitly out of scope without user authorization.

## Test counts

- Vitest suite: 96 tests across 11 files pass.
- Rendered deployment and browser suite: 6 tests pass.
- Total automated tests: 102 pass.
- Current unit validation: Prettier, typecheck, lint, every workspace build, 96 Vitest tests, five rendered accessibility/integrity/API/package tests, one isolated-profile real-Chrome hydration smoke test, `git diff --check`, and `npm audit --audit-level=high` pass.

## Deployment status

- V2 production: unchanged.
- V3 local preview: generated and safely retried as immutable build `preview-20260728-pipeline-v4-a34fc842220f`; an interactive dev server is not currently running.
- V3 hosted preview: deployed privately at <https://akribeia-v3-evidence-preview.akribeiainsights.chatgpt.site>.
- V3 hosted preview source: validated visible-model-governance commit `f1111987f`.
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
- Published daily evidence history: one privately deployed immutable research-preview record for source date `2026-07-28`, with three artifact receipts, 643 score records, nine portfolio records, exact weights, explicit benchmark unavailability, and a verified SHA-256 reproduction report.
- Model governance: versioned model card and 26-component metric dictionary for `3.0.0-preview.3` are privately deployed with independent validation-gate states and explicit methodology gaps.
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
- The daily ledger currently contains one preserved-snapshot observation, not a prospective series. Benchmark and performance fields fail closed as unavailable/not-computed until point-in-time benchmark, interval, execution, and cost inputs exist.
- The preserved V2 metadata supplies 26 component names and directionality, but not the raw transform, normalization, winsorization, or component missing-value formulas. Governance artifacts expose this as a known methodology gap.
- All displayed results are research evidence, not investment advice or performance guarantees.
