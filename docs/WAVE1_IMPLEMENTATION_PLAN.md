# Wave 1 Implementation Plan

## Objective

Restore the Akribeia product front door, the complete 1,361-row V2 security universe and the
authoritative V2 Market Health experience while preserving every V3 evidence, publication,
lineage, health, rollback and prospective-readiness control.

This plan follows `AKRIBEIA_CODEX_WAVE1_HANDOFF.md` and the evidence in
`docs/V2_PRODUCT_PARITY_MATRIX.md`.

## Preflight result

- Worktree was clean and detached at `a8a1fb58ffddcb10d953d6cdf4ea70be2b13bbeb`, which is the
  tip of `codex/phase-5-v2-product-parity`.
- `origin/main` is `6a504ca48a66702de5625bfad8be255c34057604`.
- Asset-binding fix `8fa2028cd24aea7495024ce32d39ba2d5b75900c` is not in `main`; it is an
  ancestor of the Wave 1 branch through `codex/phase-4-uat-release`.
- GitHub has no open pull requests. The most recent merged pull request is #29, followed by
  #28–#15 in descending order.
- The GitHub CLI is not installed; PR state was verified through GitHub's public REST API.
- V2 application and source remotes are available read-only.
- No `.env`/`.dev.vars` file is present in this worktree.
- Baseline passed before product edits:
  - `npm ci`
  - `npm run ci`: 181 Vitest tests in 25 files plus 7 rendered/browser tests, 188 total
  - `npm audit --audit-level=high`: zero vulnerabilities

## Checkpoint 1 — audit documentation

Deliver this plan and the parity matrix in a documentation-only commit:

`Document V2 product parity and Wave 1 plan`

Gate:

- Files changed are only `docs/V2_PRODUCT_PARITY_MATRIX.md` and
  `docs/WAVE1_IMPLEMENTATION_PLAN.md`.
- Formatting and whitespace checks pass.

## Checkpoint 2 — full-universe restoration

### Source and contract

- Import `data/reference/v2-baseline/fixtures/universe_floor0.json` as the immutable source.
- Parse and validate the payload before rendering. Required invariants:
  - metadata total equals row length;
  - exactly 1,361 rows and 1,361 unique non-empty tickers;
  - 1,291 stocks and 70 ETFs;
  - no duplicate tickers;
  - required ticker/name/sector/industry/market-cap and equal-weight score/rating fields are
    preserved;
  - ticker set equals the pinned current V2 payload when an online reconciliation is run.
- Do not require a V3 SEC/security-master match to display a V2 row.
- Attach provenance: V2 app SHA, V2 source SHA, bulk-data SHA, payload vintage and checksum.

### User experience

- Add a full-universe section near the product front door.
- Show the authoritative total, stock and ETF counts.
- Provide accessible search, sector filter and sort controls.
- Default to the complete universe; `$1B`/`$10B` are never implicit.
- Render a manageable page of results while every search/filter/sort operates over all 1,361 rows.
- Add no-results and validation-failure states.

### Tests and commit

- Unit tests: schema/invariants, count, ticker uniqueness, no-floor semantics, identifier report and
  search/filter/sort transformations.
- Rendered/browser tests: complete count, search, sector filter, sort, no-results, keyboard labels
  and mobile layout.
- Commit: `Restore full validated V2 security universe`.

## Checkpoint 3 — landing and navigation

### Product front door

- Replace the evidence-preview-first headline with the Akribeia quantitative-research proposition.
- Present Market Health, Full Universe and Research Preview as primary destinations.
- Retain active-build verification as a supporting trust panel, not the product's lead.
- Preserve the existing evidence sections below the restored product surface.

### Navigation and responsive behavior

- Product links first: Home, Market Health, Universe, Research Preview.
- A distinct Research Integrity group links to evidence, method, data quality and lineage.
- Keep the skip link and semantic `<nav>`.
- Desktop and mobile navigation must remain usable without clipped controls.
- Respect `prefers-reduced-motion`.

### Tests and commit

- Render/browser tests: introduction text, primary links, trust panel, loading/degraded labels,
  reduced-motion CSS and responsive viewport.
- Commit: `Restore Akribeia landing experience and navigation`.

## Checkpoint 4 — Market Health

### Calculations

Port without modifying:

- `computeBreadth` from `v2/main:src/lib/regime.ts`.
- `computeFearGreed` and its exact weights/thresholds.
- `creditCalm`.
- `macroHealth`, including the with-credit and without-credit weights.
- `vixScore`, `buffettLevel`, index percentage changes, YTD, ATH distance, PGI and SEP medians
  from `v2/main:api/market.ts`.
- ISM stale rule and PGI stale rule.

Do not add an invented earnings score. “Earnings Health” presents the existing V2 modeled
S&P 500 growth, inputs, scenarios and source dates.

### Server-side adapter

- Add `GET /api/v3/market-health`.
- Keep every external request keyless and server-side.
- Use independent timeouts and return available components when another upstream fails.
- Include generated timestamp, per-source status/as-of and a top-level
  `healthy | partial | unavailable | stale` state.
- Cache for ten minutes with one-hour stale-while-revalidate, matching V2.
- Never return a hard-coded market value as if live.
- Keep `/api/v3/health`, evidence routes and rate-limiting behavior unchanged.

### Client/UI states

- Overall Market Health uses the exact V2 Fear & Greed composite.
- Show Market Regime, Macro Health, Earnings Health, Breadth and Risk State.
- Show as-of/provenance for the universe, baked macro inputs and live adapter.
- Loading: stable skeleton/status text.
- Partial: render valid components and identify unavailable ones.
- Stale: retain data with an explicit age warning.
- Empty/unavailable/error: no fabricated score, clear recovery text and retry control.
- Responsive: one-column mobile cards, progressively wider desktop grid.

### Tests and commit

- Transformation/threshold tests pin exact V2 outputs.
- Adapter tests cover success, partial upstream failure, total failure, timeouts and cache headers.
- UI/render/browser tests cover loading, healthy, partial, stale, empty and error states.
- Commit: `Restore complete Market Health experience`.

## Checkpoint 5 — integration and restricted UAT

Run and retain exact results:

1. `npm run ci`
2. `npm audit --audit-level=high`
3. `git diff --check`
4. production dashboard build and generated Wrangler binding regression
5. full-universe reconciliation report
6. local `/api/v3/health` and `/api/v3/market-health` verification
7. desktop and mobile browser smoke tests

Release only when all gates pass:

- Build generated from the exact committed source SHA.
- Generated Wrangler config keeps `assets.binding = "ASSETS"` and
  `assets.directory = "../client"`.
- Deploy only to Worker `akribeia-v3-uat`.
- Do not modify Cloudflare Access, preview URL settings or production.
- Verify an unauthenticated UAT request is challenged/denied by Access.
- Verify the authenticated health endpoint through the existing authorized session or deployment
  tooling without printing credentials.
- Record source SHA, Cloudflare version, rollback version, health summary and browser evidence.

Then push `HEAD` to `origin/codex/phase-5-v2-product-parity` and open a pull request against
`main`. The pull request must explain that `8fa2028cd…` is included because it is still not in
`main`, include all checkpoint commits and acceptance evidence, and remain unmerged.

## Stop conditions

Stop and request the smallest owner action if implementation would require:

- production deployment or merging to `main`;
- a Cloudflare Access or preview-URL configuration change;
- exposing/rotating a credential;
- a paid service;
- a destructive migration;
- changing a V2 calculation;
- intentionally excluding a V2 capability or universe row;
- proceeding without the authoritative V2 application, source or data payload.

No stop condition was present when this plan was written.
