# Codex Execution Status

Last updated: 2026-07-30

## Whole-product completion

Estimated completion: **95%**

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
entrants and exits, receipted corporate-action and exit-disposition diagnostics, and explicit
execution-cost readiness that never converts missing costs into zero, plus a visible inventory of
benchmark proxy candidates that never converts snapshot price changes into returns. It is not
ready to replace V2. A consolidated fold gate now prevents partial Phase 3 evidence from becoming
a walk-forward or out-of-sample claim. A prospective-readiness gate now makes the live evidence clock explicit without treating one preserved receipt as a validation series. The current unit adds a duplicate-safe, backfill-blocking collection command and a scheduled GitHub workflow that opens reviewable evidence pull requests only when the active source date genuinely advances.

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
- Receipted corporate-action comparability diagnostics, five visible discontinuities, and zero
  synthetic adjustments, privately deployed and merged through PR #23.
- Receipted observed-exit disposition diagnostics, 11 current SEC associations, two unresolved
  labels, and zero inferred historical dispositions, privately deployed and merged through PR
  #24.
- Exact portfolio targets with explicit null execution, turnover, cost, and net-performance
  fields, privately deployed and merged through PR #25.
- Eight benchmark proxy candidates with zero selected benchmarks or inferred returns, privately
  deployed and merged through PR #26.
- Consolidated walk-forward readiness with zero eligible folds or performance comparisons, privately
  deployed and merged through PR #27.
- Prospective validation readiness with one of 30 immutable observation dates, zero invented execution or performance records, and explicit certification blockers, merged through PR #28.

## Current milestone

**Daily prospective observation collection**

The current branch adds a fail-closed observation collector and zero-cost GitHub orchestration:

1. the active dashboard artifact is checksum verified before its source observation date is trusted;
2. an existing date produces an auditable no-op receipt and cannot inflate the independent-day count;
3. a previously unseen date older than the latest ledger date is blocked before any evidence write;
4. a genuinely newer date publishes the immutable daily record and regenerates prospective readiness;
5. every collection attempt can emit a machine-readable receipt with before/after ledger counts;
6. a scheduled/manual GitHub workflow uploads the receipt for every run;
7. only a genuinely new observation creates a validated feature branch and reviewable pull request;
8. no workflow pushes directly to main, fabricates source data, modifies V2, deploys production, or claims performance.

The current preserved source date remains `2026-07-28`, so the first scheduled run is expected to be
an honest no-op until a new point-in-time source build is published.

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
- Approve and version the prospective protocol, execution convention, benchmark mandate, monthly review template, and model drift/retirement rules.
- Accumulate 30 distinct immutable prospective daily observations with executable portfolios, costed returns, and aligned benchmark comparisons.
- Complete release-gate certification, recovery testing, accessibility review, and operational documentation.
- Perform final V3 production cutover only with explicit authorization after all gates pass.

## Blockers

- No implementation blocker is active for the current repository unit.
- Historical validation is blocked by missing point-in-time source, identity, corporate-action,
  benchmark, and execution evidence.
- Realistic execution and net-performance evidence is blocked by missing capital-base, prior
  holdings, market-calendar, executable-price, liquidity, slippage, fee, and tax inputs.
- Benchmark comparison is blocked by the absence of an approved benchmark mandate, point-in-time
  fund identity, record-level availability timestamps, distributions, adjusted total-return
  series, an evaluation interval, and portfolio-execution alignment.
- The observed 14 entrants and 13 exits have no eligibility-effective intervals or verified event
  semantics; they cannot support a survivorship-controlled backtest.
- Five extreme price observations have no authoritative corporate-action event or adjustment
  evidence; no historical return may be computed from them.
- Two observed exits have no current exact SEC association, but no exit has authoritative
  historical disposition evidence.
- Filing-availability coverage is currently limited to 12 visible tickers and is retrospective
  metadata rather than acquisition-time pipeline telemetry.
- Eleven active tickers do not have an exact association in the captured SEC ticker files.
- Permanent exchange-listing identity remains unavailable for all operating companies.
- Prospective certification is blocked at one of 30 observation days, with zero executable portfolio records, zero costed returns, zero approved benchmark comparisons, and zero monthly validation reports. Automated collection now refuses duplicates and backfills, but it cannot advance until the active source date genuinely changes.
- Final V3 production cutover remains explicitly out of scope without user authorization.

## Test counts

- Main-branch baseline after PR #28: 174 Vitest tests across 24 files plus 6 rendered/browser tests, 180 total.
- Current daily-collection unit adds 7 deterministic Vitest tests in one new file.
- Expected post-patch suite: 181 Vitest tests across 25 files plus 6 rendered/browser tests, 187 total.
- Full current-unit validation remains pending in the source repository.

## Deployment status

- V2 production: unchanged.
- V3 local preview: generated and safely retried as immutable build `preview-20260728-pipeline-v4-a34fc842220f`; an interactive dev server is not currently running.
- V3 hosted preview: deployed privately at <https://akribeia-v3-evidence-preview.akribeiainsights.chatgpt.site>.
- V3 hosted preview source: exact PR #26 head `499515472`, preserved in Sites source commit
  `f216ea19f` and deployed as version 40.
- The merged walk-forward-readiness tree is deployed owner-only.
- The prospective-readiness handoff patch is not yet committed or deployed.
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
- Exit disposition: 11 of 13 observed exits have a current exact SEC association; BLD and HOLX do
  not. All 13 historical dispositions remain unverified. Visible evidence is privately deployed.
- Execution-cost readiness: nine exact targets reconcile to 1,000,000,000 weight units. Priced
  executions remain zero, and share quantities, turnover, gross return, transaction costs, and net
  return remain explicitly unavailable. Immutable evidence and the visible dashboard projection
  are deployed privately.
- Benchmark readiness: eight candidate proxies are present in both receipted snapshots; six have a
  current exact SEC fund association and two remain unmatched. No benchmark is selected, total
  return observations remain zero, and the immutable evidence and visible dashboard projection are
  deployed privately.
- Walk-forward readiness: seven source reports reconcile locally to two ineligible snapshots, zero
  candidate folds, zero eligible or evaluated folds, and zero performance comparisons. Immutable
  evidence and the visible dashboard gate are deployed privately.
- Historical validation: blocked by the readiness report; no backtest or performance comparison
  is claimed.
- Prospective validation: readiness is now represented explicitly as one of 30 immutable observation days, zero executable portfolio records, zero costed-return observations, zero approved benchmark comparisons, and zero monthly validation reports. The elapsed prospective series itself has not started under an approved frozen protocol.

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
- Current SEC association presence or absence cannot establish historical listing, ticker,
  delisting, merger, or terminal-value events.
- Research snapshot prices are not executable prices. No capital base, prior holdings, execution
  rule, timestamped fill records, liquidity model, slippage model, or fee schedule exists, so the
  product must not infer trades, zero costs, or net performance.
- Candidate ETF snapshot-price changes are not benchmark returns. Current SEC series/class
  associations do not prove historical identity, and the repository has no distribution,
  reinvestment, adjusted-price, or total-return series.
- Both $0B fixtures fail the strict input contract: June has one null-price issue and July has five
  classification issues. They are inventoried as historical material but are not used by the
  active $10B product build.
- All displayed results are research evidence, not investment advice or performance guarantees.
