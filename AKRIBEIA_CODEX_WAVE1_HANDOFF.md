# Akribeia V3 — Codex Wave 1 Product-Parity Handoff

**Prepared:** 2026-07-30  
**Owner:** Bradley Hartnett  
**Repository:** `bradleygpt/akribeia-dashboard-v3`  
**Local path:** `C:\Users\bmhar\OneDrive\Desktop\Akribeia\Akribeia Dashboard\akribeia-platform-v3`

## Mission

Restore every valuable V2 capability into V3 while retaining the V3 trust, integrity, publication, lineage, governance, testing, and fail-closed evidence foundation.

The current V3 UAT is a **Trust Core Preview**, not a replacement for V2.

> V3 must preserve everything good about V2 and place the V3 trust architecture underneath it. A narrower product is not acceptable.

## Current known state

Codex must verify every item below before making changes.

### Repository and branch state

Last known working branch:

```text
codex/phase-4-uat-release
```

Last known UAT asset-binding fix:

```text
8fa2028cd24aea7495024ce32d39ba2d5b75900c
Fix Cloudflare asset binding for UAT health
```

Last known `main` commit before that fix:

```text
6a504ca48a66702de5625bfad8be255c34057604
```

Do not assume the fix is merged. Verify Git and GitHub state first.

### UAT

```text
https://akribeia-v3-uat.akribeia-insights.workers.dev
```

Known state at handoff:

- UAT deployed successfully.
- Cloudflare Access requires an emailed one-time code.
- The allow policy is restricted to `bmhartnett1990@gmail.com`.
- The production Worker URL must remain restricted.
- Preview URLs should remain disabled.
- The UAT health endpoint passed all current integrity checks.
- The last known automated suite passed 188 tests.
- Prospective evidence remains intentionally blocked at 1 of 30 observation days.

### Cloudflare Worker

```text
Worker name: akribeia-v3-uat
Account ID: 60a274eca74a0c70d5678d63f9b4ed10
Known good version: 1bda4ea5-a750-4345-9b3a-2ec524ea3d19
Rollback version: 0a9b7988-058b-4def-bbbd-09190945d58d
```

Never print, expose, commit, rotate, or request secret credentials unless a genuine blocker requires owner action.

## Why Wave 1 exists

The current V3 build proved the trust and release architecture, but it reduced the product to a narrow evidence-first vertical slice.

Known deficiencies:

- Only the preserved `$10B` market-cap-floor universe is active, approximately 643 securities.
- The original landing-page introduction is missing.
- Market Health is missing.
- The broader V2 dataset is missing.
- Much of the V2 navigation and product surface is missing.

This was acceptable for proving the V3 foundation. It is not acceptable for replacing V2.

The owner confirms that the APIs used by V2 remain available.

## Full product-parity release gate

V3 cannot be described as complete, production-ready, or a V2 replacement until all of the following are restored or explicitly replaced with an owner-approved superior implementation.

### Product and data

- Original landing-page concept and introduction
- Primary navigation
- Full validated V2 security universe
- Market Health overview
- Market regime
- Macro health
- Earnings health
- Market breadth
- Risk state
- Full screener, search, sorting, and filtering
- Security-detail pages
- Risk and radar visualizations
- Sector analytics
- ETF Center
- Crypto-cycle views
- Pundits
- Polymarket
- Doppelgänger
- Complete supporting datasets
- Complete supporting APIs and server-side behavior
- Loading, empty, degraded, stale, and error states
- Responsive and accessible behavior

### Engineering and evidence

- Calculation parity
- Data and row-count reconciliation
- Route parity
- API-response parity
- Interaction parity
- Screenshot and browser-regression coverage
- V3 manifests, lineage, receipts, publication, rollback, and health checks retained
- No silent data reduction
- No fabricated metrics or placeholder production data
- No production cutover without explicit owner approval

Wave 1 covers the front door, Market Health, and full-universe restoration. Later waves cover the remaining core research and differentiated features.

## Wave 1 scope

Wave 1 is complete only when all of the following are delivered together.

### A. Product-parity inventory

Create:

```text
docs/V2_PRODUCT_PARITY_MATRIX.md
```

Inventory and map:

- V2 routes
- Page sections
- Components
- User interactions
- APIs
- Datasets
- Calculations
- Scheduled jobs
- Environment variables
- Caching behavior
- Error/loading states
- Mobile/responsive behavior
- V3 equivalent or restoration target
- Status: present, partial, missing, intentionally changed
- Evidence: file paths, tests, screenshots, API examples
- Owner decision required, where applicable

Trace actual imports, route registration, API handlers, data flows, and runtime use. Do not rely on names alone.

### B. Full security universe

Replace the 643-security restricted subset as the user-facing coverage universe with the complete validated V2 universe.

Requirements:

- Discover the authoritative V2 universe source.
- Document exact inclusion and exclusion logic.
- Reconcile identifiers across V2 and V3.
- Preserve ticker, name, exchange, sector, industry, market cap, score fields, and required metadata.
- Identify duplicates, delisted symbols, stale symbols, unsupported asset classes, and missing identifiers.
- Do not invent a target row count.
- Derive the correct count from authoritative V2 inputs and document it.
- Explain every exclusion.
- Add tests that prevent accidental future narrowing.
- Keep evidence receipts, schema validation, lineage, and fail-closed behavior.

### C. Landing page and navigation

- Restore the original Akribeia value proposition and introductory presentation.
- Restore primary navigation to product areas that exist.
- Do not make internal evidence controls the main customer-facing product.
- Retain visible trust/evidence indicators in a supporting role.
- Preserve responsive behavior.
- Add browser tests for the introduction, navigation, loading state, error state, and core links.
- Use V2 as the source of truth; document material visual or behavioral differences.

### D. Market Health

Restore the complete Market Health experience with real data from existing V2 APIs or V3-compatible server adapters.

At minimum:

- Overall market-health state
- Market regime
- Macro health
- Earnings health
- Breadth
- Risk state
- As-of timestamps
- Appropriate user-facing provenance
- Freshness and stale-data handling
- Loading, empty, unavailable, and partial-data behavior
- Responsive presentation
- Tests for transformations, thresholds, rendering, and degraded states

Do not approximate or redefine V2 calculations without documenting the difference and obtaining owner approval.

### E. Preserve the V3 trust core

The following must continue to work:

- `/api/v3/health`
- Active build pointer
- Manifest verification
- Score-artifact verification
- Portfolio-artifact verification
- Schema checks
- Lineage checks
- Immutable publication behavior
- Rollback procedure
- Prospective observation collection
- Honest prospective-readiness blocker
- Cloudflare static-asset binding
- Restricted UAT access

## Discovery rules for V2 source and APIs

Inspect, in order:

1. The V3 repository for preserved V2 source, fixtures, snapshots, docs, routes, and API references.
2. Parent or sibling Akribeia directories available to the selected local project.
3. A separate V2 repository, if added to the desktop project.
4. Existing `.env.example`, deployment config, API adapters, serverless functions, and documentation.
5. The deployed V2 application only as a behavioral reference, never as the sole source of calculation truth.

If V2 source is separate, use a multi-repository desktop project or ask the owner to add that repository. Do not copy the entire V2 repository into V3.

### Secrets

- Never print secret values.
- Never commit `.env` files.
- Never move API keys into client-side code.
- Prefer existing server-side environment-variable names.
- Redact secrets from logs and reports.
- Do not rotate credentials without explicit owner instruction.

## Required implementation sequence

Use one primary agent/thread initially. Avoid parallel implementation until the parity inventory identifies truly independent work.

### Checkpoint 0 — Preflight

Run and report:

```powershell
git status --short --branch
git remote -v
git log --oneline --decorate -15
git branch --all
gh pr list --state open
gh pr list --state merged --limit 15
```

Verify whether commit `8fa2028cd24aea7495024ce32d39ba2d5b75900c` is in `main`.

Discover and run the repository-defined install, lint, typecheck, unit, browser, build, audit, and health-verification commands. Do not guess command names when package scripts define them.

Do not begin Wave 1 on a dirty or unexplained working tree.

### Checkpoint 1 — Audit and parity matrix

- Inspect the complete V2 and V3 surface.
- Create `docs/V2_PRODUCT_PARITY_MATRIX.md`.
- Create `docs/WAVE1_IMPLEMENTATION_PLAN.md`.
- Record authoritative sources for the full universe and Market Health.
- Identify missing permissions, keys, repositories, or files.
- Commit documentation separately.

Recommended commit:

```text
Document V2 product parity and Wave 1 plan
```

### Checkpoint 2 — Full-universe restoration

- Implement authoritative full-universe ingestion/adaptation.
- Preserve V3 contracts and evidence.
- Add reconciliation reports and tests.
- Prove no arbitrary `$10B` user-facing floor remains unless explicitly selected as a filter.

Recommended commit:

```text
Restore full validated V2 security universe
```

### Checkpoint 3 — Landing and navigation

- Restore the introduction and product front door.
- Restore navigation.
- Preserve trust indicators as supporting UI.
- Add responsive/browser tests.

Recommended commit:

```text
Restore Akribeia landing experience and navigation
```

### Checkpoint 4 — Market Health

- Restore all Market Health transformations and UI.
- Integrate real APIs through server-side adapters.
- Add freshness, degraded-state, calculation, and browser tests.

Recommended commit:

```text
Restore complete Market Health experience
```

### Checkpoint 5 — Integration and UAT

- Run the complete test suite.
- Build production artifacts.
- Verify generated Wrangler asset binding.
- Run dependency audit.
- Reconcile the full universe.
- Verify all V3 health checks.
- Verify restricted UAT remains restricted.
- Deploy only to `akribeia-v3-uat`.
- Do not deploy to production.
- Record deployed source SHA, Cloudflare version, rollback version, test results, and acceptance evidence.

Recommended commit:

```text
Complete Wave 1 parity validation and UAT readiness
```

## Git workflow

Create this branch only after preflight:

```text
codex/phase-5-v2-product-parity
```

Preferred base:

- `main`, after the UAT asset-binding fix is merged; or
- the asset-binding branch temporarily, only if still unmerged and documented.

Rules:

- Keep the working tree clean between checkpoints.
- Use separate commits for audit, universe, landing/navigation, Market Health, and validation.
- Do not force-push.
- Do not rewrite shared history.
- Do not merge to `main` without explicit owner approval.
- Codex may push the feature branch and open a PR after all required checks pass.
- Include the parity matrix and UAT evidence in the PR description.

## Testing and acceptance

Discover and preserve all existing test commands. The previous known baseline was 188 passing automated tests. Wave 1 must add tests, not replace the baseline with a smaller suite.

Required categories:

- Schema and contract tests
- Universe inclusion/exclusion tests
- Identifier-reconciliation tests
- Market Health transformation tests
- Threshold and regime tests
- Freshness/staleness tests
- API-adapter tests
- Loading/error/partial-data UI tests
- Landing/navigation browser tests
- Responsive browser tests
- Health-endpoint tests
- Generated Wrangler configuration regression test
- Full build verification
- Dependency audit

Acceptance evidence must include:

- Exact commands and exit codes
- Test counts
- Build output
- Reconciled security count
- Exclusion report
- Screenshots or browser artifacts for landing and Market Health
- UAT URL
- Source commit
- Cloudflare version
- Health-response summary
- Known limitations

Do not claim parity from a successful build alone.

## Design and product rules

- V2 is the behavioral and capability baseline.
- V3 should improve architecture without shrinking the product.
- Preserve Akribeia branding and explanatory strength.
- Lead customer-facing pages with useful market insight, not internal release mechanics.
- Keep evidence, lineage, and quality visible where useful but secondary on the landing page.
- Do not use placeholder charts, fabricated trends, random numbers, or silently mocked production data.
- Maintain accessible labels, keyboard behavior, readable contrast, and responsive layouts.
- Avoid a generic template redesign that erases the original product identity.

## Cost and execution discipline

- Start with one primary Codex thread.
- Do not launch multiple editing agents against the same files.
- Use a read-only/review subagent only after the inventory exists.
- Reuse the same thread within a checkpoint.
- Save large logs to files and summarize them in chat.
- Do not repeatedly reinstall dependencies without evidence.
- Do not perform unrelated broad refactors.
- Do not upgrade frameworks or add paid services unless required and approved.
- Prefer existing dependencies and patterns.
- Stop and report rather than burning credits on an ambiguous missing source.

## Mandatory stop conditions

Stop and request owner input before:

- Production deployment
- Destructive database or storage migration
- Deleting preserved V2 data or fixtures
- Changing Cloudflare Access policy
- Enabling public preview URLs
- Adding a paid external service
- Rotating or exposing an API credential
- Redefining a V2 calculation
- Intentionally excluding part of the V2 universe
- Replacing a V2 capability rather than restoring it
- Merging to `main`
- Continuing after discovering the authoritative V2 source is unavailable

A blocker report must include:

1. Exact blocker
2. Files and commands inspected
3. Why it cannot be resolved safely
4. Smallest owner action required
5. Work that can continue independently

## Required status-report format

At the end of every checkpoint:

```text
CHECKPOINT:
STATUS:
SOURCE SHA:
BRANCH:
FILES CHANGED:
COMMANDS RUN:
TESTS:
DATA RECONCILIATION:
USER-VISIBLE RESULT:
UNRESOLVED ITEMS:
NEXT ACTION:
```

Use evidence, not adjectives. Do not report overall completion as a percentage unless the denominator is the full parity matrix.

## Definition of Wave 1 done

Wave 1 is done only when:

- The evidence-backed parity matrix exists.
- The full authoritative V2 security universe is active and reconciled.
- The landing-page introduction is restored.
- Primary navigation is restored.
- Complete Market Health is restored with real data.
- Market regime, macro, earnings, breadth, and risk states work.
- Loading, stale, partial, empty, and error states work.
- New tests pass alongside the existing baseline.
- V3 health and evidence controls still pass.
- UAT is deployed and remains private.
- Preview URLs remain disabled.
- The PR is reviewable with documented evidence.
- The owner approves every intentional difference.

Wave 1 completion does not mean full V2 parity. Remaining Waves 2–4 must remain open in the parity matrix.

## Later waves

### Wave 2 — Core research workflows

- Full screener
- Search, sorting, filtering, comparison
- Security-detail pages
- Risk/radar visualizations
- Sector analytics
- ETF Center

### Wave 3 — Differentiated capabilities

- Crypto-cycle views
- Polymarket
- Pundits
- Doppelgänger
- Remaining alternative-data surfaces

### Wave 4 — Full certification and cutover decision

- Route-by-route parity
- Complete data/API reconciliation
- Calculation parity
- Interaction and screenshot regression
- Responsive/accessibility certification
- Full UAT acceptance
- Documented intentional differences
- Explicit V2 cutover approval

## First-turn instruction

Begin with preflight and audit. Do not jump directly into a landing-page rewrite.

Use `AKRIBEIA_CODEX_WAVE1_AUDIT_PROMPT.txt` to start the first thread. After the audit has been reviewed and blockers resolved, use `AKRIBEIA_CODEX_WAVE1_EXECUTE_PROMPT.txt` in the same thread.
