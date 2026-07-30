# Codex Execution Status

Last updated: 2026-07-30

## Whole-product completion

Estimated completion: **84%**

This estimate reflects working, tested product behavior rather than roadmap line-item count. V3 now
has the Phase 0 baseline, core publication trust primitives, a deployed visible preview, complete
coverage-aware scoring evidence, exact integer-unit portfolio construction, a retry-safe
end-to-end publication/activation/rollback pipeline, an accessible runtime data-status surface,
protected server-side evidence capabilities, explicit deployment health and recovery operations,
the first immutable daily evidence record, versioned model-governance evidence, an active-build
quality report with honest drift eligibility, a provisional security master, fail-closed evidence
maturity labels, an immutable audit of historical point-in-time readiness, and a checksum-pinned
current SEC registrant crosswalk with explicit unresolved coverage, a bounded filing-availability
control that excludes post-cutoff filings, and a deterministic comparison of observed universe
entrants and exits. It is not ready to replace V2.

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
- Versioned model card, 26-component metric dictionary, validation-gate ledger, and visible methodology limits, privately deployed and merged through PR #15.
- Active-build data quality, honest insufficient-history drift status, and visible report evidence, privately deployed and merged through PR #16.
- Provisional ticker-only security master, immutable identity evidence, and visible permanent-identifier limits, privately deployed and merged through PR #17.
- Fail-closed evidence maturity labels, explicit release transitions, and non-overridable cutover
  blocking, privately deployed and merged through PR #18.
- Immutable point-in-time readiness inventory, strict-contract issue evidence, and ten
  fail-closed historical controls, privately deployed and merged through PR #19.
- Checksum-pinned SEC registrant sources, exact association coverage, visible unmatched records,
  and explicit identity limits, privately deployed and merged through PR #20.
- Checksum-pinned SEC filing histories, cutoff-aware selected-set availability, and visible
  post-cutoff exclusions, privately deployed and merged through PR #21.
- Receipted universe-membership comparison, 14 observed entrants, 13 observed exits, and five
  explicit survivorship blockers, privately deployed and merged through PR #22.

## Current milestone

**Corporate-action price comparability**

The current branch uses the two receipted `$10B` cross-sections to expose concrete price
comparability risks without inventing corporate actions:

1. historical-readiness and universe-membership lineage must reconcile;
2. both strict-contract-valid source files must pass their SHA-256 and row-count receipts;
3. all 629 continuing ticker labels are compared;
4. five price ratios cross the explicit `0.5×`/`2.0×` boundary;
5. three have extreme implied-share changes with market capitalization inside a 15% stability
   band; two move price and market capitalization together;
6. every observation remains unverified and no adjustment factor is synthesized;
7. split, distribution, merger/spin-off, delisting, and adjusted-series controls remain blocked;
8. the responsive dashboard exposes exact ratios and the fail-closed interpretation.

Implementation, complete local CI, contract/generator/rendering/packaging/browser tests,
dependency audit, and functional owner-only deployment pass. Final repository commit,
exact-commit hosted deployment, and pull-request gates remain for this unit.

## Remaining milestones

- Replace the preserved snapshot input with scheduled, point-in-time live-source ingestion and daily orchestration once a suitable zero-cost source is established.
- Add the remaining primary V3 workflows and complete a formal accessibility audit.
- Add an external generative model only after provider, secret lifecycle, cost, output, and evaluation gates are approved.
- Complete final-production configuration and cutover rehearsal only after all release gates pass.
- Acquire or build point-in-time fundamentals, survivorship-aware membership, corporate actions,
  benchmarks, execution inputs, and a sufficiently long evaluation calendar.
- Acquire or build permanent listing identifiers and point-in-time ticker/listing history; a CIK
  identifies a registrant and does not resolve this requirement.
- Implement walk-forward/out-of-sample evaluation only after those inputs satisfy the readiness
  contract.
- Accumulate prospective daily validation evidence.
- Complete release-gate certification, recovery testing, accessibility review, and operational documentation.
- Perform final V3 production cutover only with explicit authorization after all gates pass.

## Blockers

- No implementation blocker is active for the current repository unit.
- Historical validation is blocked by missing point-in-time source, identity, corporate-action,
  benchmark, and execution evidence.
- The observed 14 entrants and 13 exits have no eligibility-effective intervals or verified event
  semantics; they cannot support a survivorship-controlled backtest.
- Five extreme price observations have no authoritative corporate-action event or adjustment
  evidence; no historical return may be computed from them.
- Filing-availability coverage is currently limited to 12 visible tickers and is retrospective
  metadata rather than acquisition-time pipeline telemetry.
- Eleven active tickers do not have an exact association in the captured SEC ticker files.
- Permanent exchange-listing identity remains unavailable for all operating companies.
- Final V3 production cutover remains explicitly out of scope without user authorization.

## Test counts

- Vitest suite: 142 tests across 19 files pass.
- Rendered deployment and browser suite: 6 tests pass.
- Total automated tests: 148 pass.
- Current unit validation: Prettier, typecheck, lint, every workspace build, 142 Vitest tests,
  five rendered accessibility/integrity/API/package tests, one isolated-profile real-Chrome
  hydration smoke test, `git diff --check`, and `npm audit --audit-level=high` pass.

## Deployment status

- V2 production: unchanged.
- V3 local preview: generated and safely retried as immutable build `preview-20260728-pipeline-v4-a34fc842220f`; an interactive dev server is not currently running.
- V3 hosted preview: deployed privately at <https://akribeia-v3-evidence-preview.akribeiainsights.chatgpt.site>.
- V3 hosted preview source: exact PR #22 head `f1a9c342a`, preserved in Sites source commit
  `6027e2496` and deployed as version 32.
- Current corporate-action functional tree `53428bda3` is preserved in Sites source commit
  `10cb4e19c` and deployed owner-only as version 33.
- Hosted deployment status is successful. The current package passed an isolated-profile
  real-Chrome smoke test locally; a signed-in interactive browser was unavailable for a separate
  hosted-page smoke check.
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
- Data quality: active report passes row uniqueness, value validity, coverage, score distribution,
  and portfolio reconciliation checks; temporal drift is correctly blocked by insufficient history
  and the report is privately deployed.
- Security master: 643 unique ticker-derived research identities are generated locally with no
  collisions; all remain provisional because permanent identifiers and ticker history are absent.
  The evidence and visible identity ledger are privately deployed.
- Evidence maturity: the active assessment labels the build `research-preview`, not release
  eligible, with one of 30 daily builds and 11 explicit blockers. The assessment and visible
  maturity ladder are privately deployed.
- Historical readiness: two research cross-sections and four fixture files are locally
  inventoried with deterministic SHA-256 evidence. Ten controls remain blocked; the report cannot
  claim historical eligibility. The immutable report and visible readiness ledger are privately
  deployed.
- SEC registrant crosswalk: the immutable `2026-07-30` source receipt verifies 10,432 company and
  28,427 mutual-fund association records. Exact matching resolves 632 of 643 active records to 595
  unique CIKs; all 11 unmatched tickers, current-snapshot scope, and zero historical eligibility
  are preserved in the evidence and privately deployed.
- Filing availability: 11 EDGAR submission histories with 10,097 recent filing records are
  checksum-pinned locally. The current report covers 11 of 12 selected visible tickers, provides
  eligible periodic/current acceptance timestamps for all 11, and excludes 12 post-cutoff
  filings. The visible report is privately deployed.
- Universe membership: the June and July `$10B` files are receipted and strict-contract valid.
  They expose 629 continuing ticker labels, 14 observed entrants, and 13 observed exits. Five
  survivorship controls remain blocked, historical eligibility stays false, and the visible
  evidence is privately deployed.
- Corporate-action readiness: five extreme price changes are measured locally. Three show possible
  implied-share discontinuities and two move with market capitalization; verified action and
  adjusted-series counts remain zero. Visible evidence is privately deployed.
- Historical validation: blocked by the readiness report; no backtest or performance comparison
  is claimed.
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
- The source has no permanent issuer/listing identifier or ticker history. Current security IDs are
  deterministic research identifiers within a ticker-only scope, not permanent identities.
- The SEC crosswalk is a current, periodically updated association snapshot. A CIK identifies a
  filer or registrant, not an exchange listing; fund series/class identifiers do not provide
  point-in-time trading or corporate-action history.
- Exact matching intentionally leaves 11 records unresolved. No issuer-name, fuzzy, or
  hand-maintained fallback is used.
- SEC acceptance timestamps provide a defensible availability boundary, but this retrospective
  capture does not prove acquisition or model-ingestion timing. Current submission histories can
  be revised and are not as-was API snapshots.
- The preserved June and July captures have timezone-unspecified generation metadata and no
  record-level availability times. They are reproducibility fixtures, not a point-in-time series.
- Observed cross-section membership changes are not verified constituent events. Market-cap
  thresholds, coverage differences, ticker changes, corporate actions, or delistings may explain
  them; ticker equality does not establish permanent identity continuity.
- The corporate-action signals use rounded market capitalization divided by price, not reported
  shares outstanding. They diagnose comparability risk and must not become synthetic adjustments.
- Both $0B fixtures fail the strict input contract: June has one null-price issue and July has five
  classification issues. They are inventoried as historical material but are not used by the
  active $10B product build.
- All displayed results are research evidence, not investment advice or performance guarantees.
