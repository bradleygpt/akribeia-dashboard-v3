# Wave 2 Core Research Product Parity

## Checkpoint 0 baseline

- V3 base: `origin/main` at merge commit `0fc7d16687d68155cb8ee012678c69f9e9fbab7a`
  (merged PR #30).
- Wave 2 branch: `codex/phase-6-v2-core-research-parity`.
- Authoritative V2 application: `v2/main` at
  `b477349a8691fdc5000641a6ae2893dbbfae2de6`.
- Authoritative V2 bake/source: `v2-source/main` at
  `1858840c581f406492dec2e809830d05764ad3d9`.
- V2 bulk-data pointer: `public/data/freshness_manifest.json`; the manifest, not an inferred
  filename, selects the bulk data commit and versioned shard manifest.
- Reconciled no-floor population: 1,361 unique tickers, 1,291 stocks and 70 scored ETFs.
- GitHub main-branch `validate` and CodeQL JavaScript/TypeScript checks were successful at the base
  SHA. There were no open pull requests at preflight.
- `preview_urls` remains `false`; the existing Worker `ASSETS` binding and `../client` directory
  are invariants.

## Capability inventory and restoration contract

Status values in this document are `present`, `partial`, `missing`, and `intentionally changed`.
An intentional difference requires owner approval before it may be called parity.

### Full securities screener

| Evidence field | V2 behavior | V3 target / acceptance |
| --- | --- | --- |
| Route | `screener` tab selected through `src/tabs/registry.tsx` and store tab state | `/research`, directly loadable and refresh-safe |
| Components | `ScreenerTab`, `SortableTable`, `ThematicExplorer`, `NlScreener`, `IndexBadges`, `RatingBadge`, `GradePill` | `app/research/research-workbench.tsx` plus server-loaded authoritative fixture |
| Data | Store `rows`, `meta.screener`, floor-specific sector metadata; row shape contains identity, asset type, price/FV/QBP, model scores, five pillars/grades and raw factors | Exact 1,361-row fixture and `meta.json`; no product-level market-cap exclusion |
| Search | Case-insensitive ticker or name substring; V2 uppercases both sides | Ticker, company/fund name and industry substring |
| Filters | Multi-select rating, sector and FV verdict; under-QBP; any simultaneous ranges in the 20-entry `filterable_metrics` catalog. Percent display inputs are divided by 100. Missing metric values pass range filters, matching V2 pandas behavior. | Restore the same catalog, valid bounds, multi-select semantics, null behavior, clear active-filter state and reset |
| Presets | Custom plus nine metadata-defined screens: Undervalued Strong Buys, Foundational Stocks, Growth at Reasonable Price, Value Plays, Momentum Leaders, High Quality Compounders, Dividend Candidates, Aggressive Growth and Cautious / Defensive | Use preserved metadata rather than reinterpreted predicates |
| Sorting | Default composite descending. Every displayed column sorts; strings default ascending, numbers descending. Sort is stable, and null/nonfinite values are always last in either direction. | Deterministic sort with ticker/stable tie-break and documented null-last behavior |
| Scale | `SortableTable` automatically virtualizes above 60 rows; fixed 33px row height, eight-row overscan, sticky header/first column and 2,100px minimum desktop table | Incremental rendering or virtualization over all rows; no count narrowing |
| States | Universe spinner; explicit zero-row result; baked snapshot metadata supplies vintage/staleness | Loading, stale/partial provenance, empty result, error and retry semantics |
| Responsive/accessibility | Horizontally scrollable semantic table; pill buttons and labeled inputs | Keyboard-operable controls; mobile cards/table; semantic count/status announcements |
| Current status | V2 authoritative | **partial**: full population, search, models, six screens, basic filters, incremental loading and detail links exist; metadata-driven ranges, V2 nine-screen set, multi-select filters and active-filter ledger remain |

### Comparison workflow

| Evidence field | V2 behavior | V3 target / acceptance |
| --- | --- | --- |
| V2 baseline | V2 ETF comparison accepts two to five funds. The stock screener has no distinct registered compare route or shareable URL; selection-order semantics are therefore a V3 usability addition, not a claimed V2 route. | Screener selection in deterministic insertion order, duplicate prevention, maximum four stocks/ETFs, removal and reset |
| Metrics | ETF compare uses expense ratio, AUM, yield, 1/3/6/12-month momentum, YTD, three-year return and price; missing values are `N/A` | Security compare uses same-vintage score/model, sector, valuation, buy point, five pillars and available risk, with explicit missing/date disclosure |
| Route/state | V2 comparison is in-memory tab state | Preserve device state and encode comparison tickers/model in the URL so direct loads and refreshes restore safely; this is an intentional V3 improvement |
| Responsive/accessibility | Wide table plus return bars | Scrollable semantic table/cards and accessible metric values |
| Current status | ETF compare present in V2; general security compare is a Wave 2 requirement | **partial**: four-name selection/removal exists; URL restore, reset, model-correct comparison values and vintage disclosure remain |

### Security detail

| Evidence field | V2 behavior | V3 target / acceptance |
| --- | --- | --- |
| Route | `detail` tab and selected ticker in store; search suggestions transition between tickers | Durable `/research/[ticker]` and ETF-specific `/etfs/[ticker]` deep links |
| Components | `StockDetailTab`, `QuarterlyEarningsCard`, `FcfQuality`, `ThesisPanel`, `StructuredReview`, `AiNarrative`, `IndexBadges` | Server identity/snapshot plus bounded client adapters and accessible visualizations |
| APIs | `/api/quote` and `/api/quotes` for keyless Yahoo quote/history; optional `/api/ai` is not required for deterministic parity | `/api/v3/quote`, `/api/v3/quotes`; no browser secrets and no fabricated AI text |
| Datasets/shapes | Manifest-selected `detail/floor{floor}/{ticker}.json`; `prices/{ticker}.json` `{dates,close}`; `detail_timeseries/{ticker}.json` daily `{date,close,fair_value,buy_point}`; quarterly, FCF, thesis, correlations and index membership datasets | Identity, classification, score/rating, FV/QBP, five pillars/grades, factors, live quote/history and exact risk; only show deep datasets when their authoritative shard is available |
| Calculations | RSI(14), SMA50/200 and `computeRisk`; point-in-time FV/QBP remain distinct from live values | Preserve scales/definitions and label baked versus live vintages |
| Visuals | Price/FV/QBP/SMA line chart, volume bars, RSI, seven risk metrics and five-axis radar on 0–12 | Responsive canvas/SVG with an accessible table equivalent |
| States | Ticker search, detail spinner, no price history, stale quarterly warning and unavailable optional datasets | Unsupported ticker, loading, partial/stale, empty, error and retry |
| Current status | V2 authoritative | **partial**: durable route, identity, factors, pillars, live price/history/risk and peers exist; ticker transition, radar geometry/rank context and deep-shard state remain |

### Risk and radar

| Evidence field | V2 behavior | V3 target / acceptance |
| --- | --- | --- |
| Source | `src/lib/risk.ts`; `StockDetailTab`; `risk_radar.json` | Exact TypeScript port plus pinned reference adapter |
| Price risk | Daily returns; sample standard deviation; 252 trading days; 4% risk-free rate; Sharpe, downside-only Sortino, annualized volatility, max/current drawdown, CAGR and Calmar; fewer than 30 closes returns unavailable | Deterministic fixture comparison and sparse-data tests |
| Radar | Valuation, Growth, Profitability, Momentum and EPS Revisions; range 0–12; higher is better for every already-normalized pillar. Missing scores are disclosed and must not imply a real zero. | Geometry derived only from finite values; textual table includes score, grade, range and direction |
| Risk Radar feed | Severity/category/direction/horizon/watch/source rows from pinned V2 JSON | `/risk` with loading, filter, unavailable and retry behavior |
| Current status | V2 authoritative | **partial**: exact price-risk port and Risk Radar feed exist; full radar geometry, sparse-axis handling and deterministic render evidence remain |

### Sector analytics

| Evidence field | V2 behavior | V3 target / acceptance |
| --- | --- | --- |
| Route/component | `sectors` tab; `SectorTab` and `SortableTable` | `/sectors` |
| Data | Stock rows only; `sector_narratives.json` for dated narrative; no ETF rows | Reconcile all 1,291 stocks and explicitly report `Unclassified` handling |
| Aggregates | Count, total market cap, estimated earnings from positive trailing P/E, aggregate P/E, average/median composite, sample dispersion, rating counts and average five-pillar scores | Exact constituent-derived calculations with sum-of-count invariant |
| Visuals | Ranked sector cards; market-cap/earnings dual-axis chart; valuation snapshot; quality distribution; expandable full constituent table | Ranking, cross-sector scale/quality views and constituent drill-down |
| Drill-down | Selected sector expands a sortable table of all constituents and links to detail | Filter/sort constituents and preserve direct detail navigation |
| States | Missing narrative is omitted; empty/no sector is nonselectable; baked vintage applies | Provenance, stale/partial, empty and retry for optional narrative feed |
| Current status | V2 authoritative | **partial**: aggregates/rankings/ratings/pillars and extremes exist; full constituent table, filters and narratives remain |

### ETF Center

| Evidence field | V2 behavior | V3 target / acceptance |
| --- | --- | --- |
| Route/sections | `etfs` tab; sections Find Your ETF, Index Watch, Portfolio Builder, Compare, Maps and Universe | `/etfs` plus `/etfs/[ticker]` |
| Components | `ETFTab`, `FindYourETF`, `IndexAddPanel`, `SortableTable` | `app/etfs/etf-center.tsx` and ETF detail route |
| Datasets | `etf.json`, `etf_descriptions.json`, `etf_holdings.json`, `etf_lookthrough.json`, `etf_reverse.json`, `index_add_candidates.json` and universe rows | Allowlisted pinned-commit adapter; source/as-of/coverage displayed |
| Directory | Look-through dataset is authoritative expanded ETF directory; merges scored-universe fields where present. Stock-model score is distinct from holdings look-through score. | All 70 authoritative scored ETFs always retained; expanded reference entries may be shown only with explicit coverage labels |
| Rating policy | Look-through cohort rating only when mapped weight is at least 50%; otherwise stock-model fallback where present. Bond, commodity and crypto are explicitly unratable by the equity model. | Preserve policy and explanation |
| Find Your ETF | User basket, holdings match count/weight, coverage and suspect-weight disclosure; sorted by matched count then basket weight | Restore without fabricating missing holdings |
| Index Watch | S&P 500 and Nasdaq-100 candidate tables: name, market cap, passive-buy estimate, days ADV and quant rating | Restore pinned rows and source date |
| Builder/maps | Dated allocation templates with arithmetic only; sector/theme ticker, alternative and use case maps | Preserve labels and disclaimers |
| Compare | Two-to-five deterministic ETFs and return visualization; duplicate prevention | Preserve selection, reset, missing values, mobile layout and accessible table |
| Current status | V2 authoritative | **partial**: scored universe, comparison, templates, holdings/look-through, reverse and maps exist; directory filters, Find Your ETF, Index Watch and dedicated ETF detail remain |

## API, runtime and trust boundaries

| Endpoint | Contract and limits | State |
| --- | --- | --- |
| `/api/v3/quote?ticker=` | GET; one validated ticker; bounded Yahoo daily/intraday requests; 120-second shared cache; explicit partial/unavailable response | present |
| `/api/v3/quotes?tickers=` | GET; validated/deduplicated list, maximum 120; bounded concurrency; partial prices retained | present |
| `/api/v3/research-reference?dataset=` | GET; compile-time allowlist, immutable V2 app SHA, seven-second timeout and two-megabyte response cap | partial until all required ETF/sector datasets are allowlisted |
| `/api/v3/health` | Existing V3 pointer, manifest, schema, lineage and artifact checks | must remain unchanged and six-of-six healthy |

The Worker serves generated assets from `../client`. `preview_urls:false`, the `ASSETS` binding,
Cloudflare Access policy and fail-closed prospective-readiness behavior are release invariants.

## Checkpoint implementation sequence

1. Commit this evidence-backed inventory and corrected parity status.
2. Restore metadata-driven screener filters, nine presets, deterministic sort/state and regression
   coverage.
3. Complete comparison state, URL restoration, model/vintage correctness and tests.
4. Complete security and ETF detail transitions, radar/rank context and degraded-state handling.
5. Certify risk/radar normalization and accessible equivalents.
6. Add sector constituent drill-down/narrative provenance and reconciliation tests.
7. Add ETF directory filters, Find Your ETF, Index Watch and ETF detail.
8. Reconcile navigation, deep links, refresh behavior and all user-visible counts.
9. Run canonical CI, audit, workflow/whitespace checks, Wrangler dry-run/config validation, health
   and browser evidence.
10. Only after all gates pass, deploy to the existing Access-protected `akribeia-v3-uat` Worker,
    preserve rollback version, and verify protected routes/health. No production or Sites deploy.
11. Push, open a PR to `main`, inspect CI and Advanced Security, and stop before merge.

## Acceptance evidence

Evidence must record exact commands and exit codes; test-file/test-case counts; authoritative
security/stock/ETF counts; direct-route refresh results; desktop/mobile and keyboard results;
API degraded-state results; generated Wrangler configuration; six trust-core checks; source SHA;
UAT and rollback versions; screenshots; limitations; and the PR URL.

## Intentional differences awaiting owner approval

None are approved. V3 route URLs, incremental rendering instead of V2's fixed-row virtualizer, and
URL-restorable general-security comparison are architecture/accessibility improvements, not
permission to omit a V2 capability or alter a calculation. Any material capability exclusion or
calculation change is a mandatory stop.
