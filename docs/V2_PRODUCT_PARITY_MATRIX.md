# V2 Product Parity Matrix

## Audit scope and evidence basis

This matrix records the repository-backed product baseline for Akribeia V3 Wave 1. It does not
claim that V3 is a V2 replacement.

The audit used these immutable or fetched sources:

- V3 repository source at `a8a1fb58ffddcb10d953d6cdf4ea70be2b13bbeb`.
- V2 React application remote `v2/main` at
  `b477349a8691fdc5000641a6ae2893dbbfae2de6`.
- V2 source/bake remote `v2-source/main` at
  `1858840c581f406492dec2e809830d05764ad3d9`.
- Preserved V2 bulk-data fixtures from `bradleygpt/akribeia-data` commit
  `a1304c59706a93f6b2aae775743f511c61539845`.
- Current V2 manifest at `v2/main:public/data/freshness_manifest.json`, which pins bulk-data
  commit `9f2d2322fc52847e435dbb6a83137712788f5b52`.

The current and preserved no-floor payloads both contain 1,361 rows and the same 1,361 unique
tickers. The current payload's SHA-256,
`70da978eea8601d4a171f29e2ab34394ebf58fdbb4b182423317b8d07e67784b`, matches its V2 manifest.
There are no duplicate or missing tickers and no additions or removals between those two vintages.

Status values are `present`, `partial`, `missing`, and `intentionally changed`.

## Route and customer-surface parity

V2 is a client-side tab application: `src/App.tsx` resolves the selected entry in
`src/tabs/registry.tsx`. V3 currently has one server-rendered `/` route plus protected
`/api/v3/*` handlers.

| V2 route/tab | V2 implementation and behavior                                                                                                              | V3 equivalent or target                                                        | Status before Wave 1                                                                          | Wave                  |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------- | --------------------- |
| `home`       | `LandingDemoTab`; cinematic tri-star front door, live system status, planet navigation, reduced-motion-aware loading sequence               | `/` product introduction and primary product navigation                        | partial: V3 has an evidence-first hero but not the V2 value proposition or product front door | 1                     |
| `overview`   | `HomeTab`; universe summary, score/rating/fair-value overview, regime ribbon, anomalies, index candidates, pipeline view                    | `/` overview sections backed by the full universe                              | partial: evidence dashboard exists; V2 market/product overview does not                       | 1 and 2               |
| `regime`     | `MarketRegimeTab`; live indices, VIX, yields, DXY, Buffett indicator, PGI, breadth, macro health, earnings forecast, FOMC and macro signals | `#market-health` plus `/api/v3/market-health`                                  | missing                                                                                       | 1                     |
| `macro`      | `MacroOutlookTab`; macro forecasts and rotations                                                                                            | Later dedicated macro workflow; Wave 1 restores the Market Health macro subset | missing                                                                                       | 1 subset; 2 remainder |
| `portfolio`  | `PortfolioTab`; user holdings, watchlist, risk and Monte Carlo workflows                                                                    | Dedicated portfolio workflow                                                   | partial: V3 has a constrained published model portfolio, not the V2 user workflow             | 2                     |
| `quantport`  | `QuantPortfolioTab`; ranked quantitative portfolio and supporting datasets                                                                  | Dedicated research workflow                                                    | partial: V3 publishes constrained positions but lacks the V2 workflow                         | 2                     |
| `detail`     | `StockDetailTab`; selected ticker, price series, FV/QBP, pillars, quarterly data and thesis                                                 | Security-detail route/workflow                                                 | missing                                                                                       | 2                     |
| `doppel`     | `DoppelgangerTab`; analog matching                                                                                                          | Dedicated workflow using preserved parity oracle                               | missing from UI; calculation fixture and regression tests are present                         | 3                     |
| `screener`   | `ScreenerTab`; search, presets, filters, sorting, fair-value and score controls                                                             | Full screener                                                                  | partial in Wave 1: full-universe search/filter/sort; advanced screens remain later            | 1 and 2               |
| `mlpred`     | `MLPredTab`; Project Prolepsis predictions                                                                                                  | Dedicated prediction workflow                                                  | missing                                                                                       | 3                     |
| `strategies` | `StrategiesTab`; strategies, visualizations and signatures                                                                                  | Dedicated strategies workflow                                                  | missing                                                                                       | 2/3                   |
| `sectors`    | `SectorTab`; sector summaries and comparisons                                                                                               | Dedicated sector analytics                                                     | missing                                                                                       | 2                     |
| `crypto`     | `CryptoTab` and four subviews                                                                                                               | Dedicated crypto-cycle workflow                                                | missing                                                                                       | 3                     |
| `aibubble`   | `AiBubbleWatchTab`; bubble snapshots and commentary                                                                                         | Dedicated alternative-data workflow                                            | missing                                                                                       | 3                     |
| `etfs`       | `ETFTab`; ETF templates, holdings, look-through and reverse lookup                                                                          | ETF Center                                                                     | missing                                                                                       | 2                     |
| `voices`     | `PunditViewsTab`; tracked pundits and baked commentary                                                                                      | Pundits                                                                        | missing                                                                                       | 3                     |
| `thesis`     | `ThesisEngineTab`; thesis index and ticker theses                                                                                           | Thesis workflow                                                                | missing                                                                                       | 3                     |
| `help`       | `HelpTab`; product help and glossary                                                                                                        | Product documentation/help                                                     | partial: V3 has evidence/method explanations only                                             | 2                     |

`C78QTab`, `PaperTrackTab`, `StrategyTab`, `StrategiesViz`, and `StrategySignatures` exist in the V2
source but are composed into registered product areas rather than separately registered top-level
tabs.

## Wave 1 capability matrix

| Capability                  | V2 source of truth                                                                    | Data/calculation path                                                                                                                                                                                                                                                                          | V3 before Wave 1                                                                   | Restoration target and evidence                                                                                                                                                                                                                                                                              |
| --------------------------- | ------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Product introduction        | `src/components/LoadingOverlay.tsx`, `src/tabs/LandingDemoTab.tsx`, `src/landing/*`   | Baked `system_status.json` plus clock-derived market session                                                                                                                                                                                                                                   | partial                                                                            | Lead `/` with Akribeia's quantitative-research proposition and direct links to Market Health, Universe, Research Preview and Evidence. Preserve reduced-motion behavior; document omission of the 18.2-second WebGL sequence as an intentional responsive/performance adaptation, not a capability omission. |
| Primary navigation          | `src/App.tsx`, `src/components/Sidebar.tsx`, `src/tabs/registry.tsx`                  | Tab IDs held in the V2 store                                                                                                                                                                                                                                                                   | evidence-only anchor list                                                          | Customer-facing links first; evidence controls grouped as supporting research-integrity links. Mobile navigation must wrap or collapse without horizontal loss.                                                                                                                                              |
| Full security universe      | `data/reference/v2-baseline/fixtures/universe_floor0.json`; current pinned V2 payload | `fundamentals_cache.json` keys -> `get_broad_universe(0)` -> `fetch_universe_data(..., 0)` -> `score_universe` -> `bake_floor(0)`                                                                                                                                                              | preserved but not user-facing; active V3 dashboard uses the 643-row `$10B` fixture | Expose all 1,361 unique rows with ticker, name, sector, industry, market cap, equal-weight composite/rating and provenance. Search, sector filter and sorting must operate over the complete set. Tests must fail on any row-count or ticker-set narrowing.                                                  |
| Inclusion rule              | `v2-source/main:data_fetcher.py:84-139`                                               | All keys of the bundled/runtime fundamentals cache. A floor of zero returns every record, including missing/zero market cap. Positive floors exclude records whose market cap cannot prove the threshold.                                                                                      | `$10B` slice is the visible source                                                 | Use the zero-floor payload without applying another product-level exclusion.                                                                                                                                                                                                                                 |
| Upstream candidate universe | `v2-source/main:build_cache.py`                                                       | De-duplicated union of `SP500`, `NASDAQ100_EXTRA`, `SP400_EXTRA`, `SP600_EXTRA`, `SUPPLEMENTAL`, `PORTFOLIO_STOCKS` and the explicit ETF list. Successful fresh records and last-known rescued records are retained. A symbol is absent only when no fresh record and no rescue record exists. | not represented in UI                                                              | Document and preserve baked output exactly; do not recreate the universe from a different current constituent list.                                                                                                                                                                                          |
| Identifier reconciliation   | V2 payload `ticker`; V3 security master `currentTicker` and source rows               | Exact ticker comparison; security master is provisional and narrower than the full V2 universe                                                                                                                                                                                                 | only the active slice is crosswalked                                               | Keep all V2 rows visible. Report which full-universe tickers lack V3 SEC/security-master coverage; missing crosswalk evidence must not silently remove a row.                                                                                                                                                |
| Market Health overall state | `MarketRegimeTab`, `computeFearGreed`                                                 | V2 Fear & Greed composite: VIX, 50/200-SMA breadth, 1M breadth, S&P distance to ATH, Buffett score, and optional HY OAS credit score                                                                                                                                                           | missing                                                                            | Present the unmodified V2 composite as overall Market Health with its exact classification thresholds.                                                                                                                                                                                                       |
| Market regime               | `MarketRegimeTab`, `api/market.ts`                                                    | Keyless Yahoo index/VIX/DXY series and keyless FRED series, fetched server-side with timeouts                                                                                                                                                                                                  | missing                                                                            | Server adapter at `/api/v3/market-health`; show current regime/classification and partial/unavailable state without fabricated fallback values.                                                                                                                                                              |
| Macro health                | `MarketRegimeTab:macroHealth`, `v2-source/main:macro.py`, baked `market_static.json`  | Exact V2 ISM, unemployment, GDP, CPI, yield-curve and optional HY OAS component weights and thresholds                                                                                                                                                                                         | missing                                                                            | Port without changing weights or thresholds; unit tests pin representative cases.                                                                                                                                                                                                                            |
| Earnings health             | `MarketRegimeTab`, baked `market_static.json`, `v2-source/main:macro.py`              | Existing V2 `sp500_earnings_growth`, scenarios and sector forecasts; ISM staleness rule                                                                                                                                                                                                        | missing                                                                            | Present the existing modeled growth and scenarios with source/as-of labels and stale handling. Do not invent a new earnings score.                                                                                                                                                                           |
| Breadth                     | `src/lib/regime.ts:computeBreadth`                                                    | Positive `momentum_vs_sma50`, `momentum_vs_sma200`, `momentum_1m`, `momentum_3m`; weights 0.30/0.30/0.20/0.20; missing series defaults to 50                                                                                                                                                   | missing                                                                            | Compute over all 1,361 no-floor rows and retain exact V2 fallback behavior.                                                                                                                                                                                                                                  |
| Risk state                  | `api/market.ts:vixScore`, `MarketRegimeTab:creditCalm`                                | VIX level thresholds plus HY OAS calm score `clip(100 - (oas - 2.5) * 14)`                                                                                                                                                                                                                     | missing                                                                            | Show VIX and credit state separately with partial-data labeling.                                                                                                                                                                                                                                             |
| Freshness/provenance        | `freshness_manifest.json`, `market_static.json`, `/api/market` `generated_at`         | Per-source as-of dates; V2 data cache and edge `Cache-Control` headers                                                                                                                                                                                                                         | evidence exists only for V3 trust artifacts                                        | Carry V2 app/data/source SHAs, payload checksum, generated/as-of timestamps, and live-adapter timestamp into the UI/API.                                                                                                                                                                                     |

## Wave 2 core-research implementation status

The Wave 2 core-research unit restores the six workflows named in the handoff without claiming
that all adjacent Wave 2/3 rows are complete. Detailed scope, evidence and remaining gaps are in
`docs/WAVE2_CORE_RESEARCH_PLAN.md`.

| Capability                                       | V3 implementation                                                                                                                 | Status after Wave 2 core unit |
| ------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------- | ----------------------------- |
| Full screener                                    | `/research`; complete 1,361-row no-floor universe, four preserved scoring models, six named quick screens and basic controls      | partial: V2 metadata ranges, nine presets and multi-select filters remain |
| Search, sorting, filtering, comparison           | ticker/company/industry search; basic filters; six sorts; four-name comparison; device-local watchlist                            | partial: URL restore, model-correct compare and V2 filter semantics remain |
| Security detail                                  | `/research/:ticker`; snapshot valuation, buy point, pillars, factors, live quote/history, V2-compatible price risk and peers      | partial: ticker transition, radar geometry/rank and deep state remain |
| Risk / radar                                     | `/risk`; pinned source-attributed Risk Radar; security-detail price/risk visualization                                            | partial: deterministic radar geometry and sparse-axis evidence remain |
| Sector analytics                                 | `/sectors`; all 1,291 stocks reconcile into aggregates, valuation, quality, dispersion, ratings and pillars                       | partial: constituent drill-down, filters and narratives remain |
| ETF Center                                       | `/etfs`; 70 scored ETFs, comparison, templates, holdings/look-through, rating suppression, reverse lookup and maps                | partial: Find Your ETF, Index Watch, directory filters and ETF detail remain |
| Quote API                                        | `/api/v3/quote` and `/api/v3/quotes`; bounded keyless Yahoo adapters                                                              | present                       |
| Pinned reference API                             | allowlisted Risk Radar and ETF datasets from the preserved V2 application commit                                                  | present                       |
| User portfolio / Monte Carlo                     | V3 published portfolio is not the V2 user workflow                                                                                | open                          |
| Quant portfolio, full macro, strategies and help | adjacent route-matrix work is not part of the six-workflow unit                                                                   | open                          |

## V2 API parity

| V2 endpoint                 | Purpose and source                                        | Cache behavior                                                                        | V3 status/target                                                                      |
| --------------------------- | --------------------------------------------------------- | ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `/api/market`               | Keyless Yahoo Finance and FRED; Market Regime live gauges | `s-maxage=600, stale-while-revalidate=3600`                                           | restore in Wave 1 as `/api/v3/market-health`, preserving partial results and timeouts |
| `/api/ppi`                  | Live PPI inputs from Yahoo                                | `s-maxage=900, stale-while-revalidate=3600`                                           | later; Wave 1 does not fabricate PPI                                                  |
| `/api/quote`                | Single-symbol daily/intraday quote                        | `s-maxage=120, stale-while-revalidate=900`                                            | present after Wave 2 as `/api/v3/quote`                                               |
| `/api/quotes`               | Batched symbol quotes                                     | `s-maxage=120, stale-while-revalidate=600`                                            | present after Wave 2 as `/api/v3/quotes`                                              |
| `/api/calendar`             | Finnhub earnings/IPO calendar; optional `FINNHUB_API_KEY` | 60 seconds when unconfigured; otherwise `s-maxage=3600, stale-while-revalidate=86400` | later; no key required for Wave 1                                                     |
| `/api/crypto`               | Keyless Yahoo, CoinGecko and mempool.space                | `s-maxage=300, stale-while-revalidate=1800`                                           | Wave 3                                                                                |
| `/api/polymarket`           | Keyless Polymarket events                                 | `s-maxage=300, stale-while-revalidate=1800`                                           | Wave 3                                                                                |
| `/api/spy-monthly`          | Yahoo SPY monthly history                                 | `s-maxage=86400, stale-while-revalidate=604800`                                       | later                                                                                 |
| `/api/ai`                   | Optional Gemini narrative                                 | `s-maxage=3600, stale-while-revalidate=86400`                                         | not required; V3 deterministic explanation route remains authoritative                |
| `/api/v3/health`            | V3 pointer, manifest, artifact, schema and lineage health | no weakening permitted                                                                | present                                                                               |
| `/api/v3/evidence/security` | Protected security evidence query                         | fixed-window rate limiting and request validation                                     | present                                                                               |
| `/api/v3/ai/explain`        | Deterministic evidence explanation; no external model     | fixed-window rate limiting and request validation                                     | present                                                                               |

## Dataset inventory

### Authoritative Wave 1 datasets

| Dataset                     | Evidence                                                    | Shape/size                                                                     | Status                                                       |
| --------------------------- | ----------------------------------------------------------- | ------------------------------------------------------------------------------ | ------------------------------------------------------------ |
| Full no-floor universe      | `data/reference/v2-baseline/fixtures/universe_floor0.json`  | 1,361 rows: 1,291 stocks and 70 ETFs; 1,361 unique tickers                     | present as immutable reference; missing from customer UI     |
| `$1B` universe              | `data/reference/v2-baseline/fixtures/universe_floor1.json`  | 1,295 preserved rows                                                           | present reference; optional user filter later                |
| `$10B` universe             | `data/reference/v2-baseline/fixtures/universe_floor10.json` | 643 preserved rows                                                             | present and currently active in the narrow V3 evidence slice |
| V2 metadata                 | `data/reference/v2-baseline/fixtures/meta.json`             | presets, weights, thresholds, floor metadata, score labels and screener config | present reference                                            |
| Market Health static inputs | `v2/main:public/data/market_static.json`                    | macro inputs, earnings forecast, FOMC, macro signals and source dates          | missing from V3; restore from pinned V2 app commit           |
| PGI baked fallback          | `v2/main:public/data/pgi_money_market.json`                 | money-market AUM with source/as-of                                             | missing; optional partial fallback                           |
| Live Market Health          | `v2/main:api/market.ts`                                     | indices, DXY, SPY, VIX, yields, Buffett, PGI and SEP medians                   | missing; restore as a V3-compatible server adapter           |

### Remaining V2 data groups

The V2 tree also includes AI deals/theme, anomaly callouts, bubble-watch snapshots/commentary,
C78Q, detail and price shards, Doppelgänger, ETF holdings/look-through/reverse maps, earnings
reviews, FCF quality, index membership/add candidates, macro forecasts/rotation, MLPred, paper
tracking, PPI history, pundits, quant backtests, regime time series, risk radar, sector narratives,
strategies, theses, ticker-anchor mappings and system/watchdog status. Wave 2 restores the ETF
reference maps and Risk Radar through an allowlisted pinned-commit adapter, and exposes the
preserved universe-level detail fields plus a live quote/history adapter. Bulk quarterly and
per-ticker timeseries reconciliation and the other named groups remain open in Waves 2–4.
`v2/main:public/data/freshness_manifest.json` remains the pointer and provenance source for bulk
payloads; it must not be replaced by inferred filenames.

## Calculations and transformations

| Calculation                                              | Authoritative implementation                                                                        | V3 pre-Wave 1                                                                                                                            |
| -------------------------------------------------------- | --------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Pillar/composite scoring and ratings                     | `v2-source/main:scoring.py`, V2 `src/lib/scoring.ts`, preserved per-preset cells and scoring oracle | present for the active V3 evidence slice; full-universe display must use preserved V2 values rather than recomputing with new thresholds |
| Market breadth                                           | `v2/main:src/lib/regime.ts`                                                                         | missing                                                                                                                                  |
| Fear & Greed / overall Market Health                     | `v2/main:src/lib/regime.ts`                                                                         | missing                                                                                                                                  |
| Macro health                                             | `v2/main:src/tabs/MarketRegimeTab.tsx` and `v2-source/main:macro.py`                                | missing                                                                                                                                  |
| VIX state, Buffett state, PGI and live market transforms | `v2/main:api/market.ts`                                                                             | missing                                                                                                                                  |
| Risk metrics                                             | `v2/main:src/lib/risk.ts`, `v2-source/main:risk_metrics.py`, preserved risk oracle                  | present after Wave 2 on security detail; price-only limitations remain explicit                                                          |
| Portfolio and Doppelgänger parity                        | preserved oracles and V3 regression tests                                                           | calculation evidence present; V2 workflows missing                                                                                       |

## Interactions, states, accessibility and responsiveness

| Behavior                               | V2 evidence                                                                                                               | V3 status/target                                                                                                                                      |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tab and planet navigation              | `App.tsx`, `registry.tsx`, `LandingDemoTab.tsx`                                                                           | replace evidence-only primary nav with product-first anchors in Wave 1; later routes remain visibly labeled as future waves                           |
| Mobile drawer and scrollable tab strip | `App.tsx`, `Sidebar.tsx`; `md:hidden`, `overflow-x-auto`, responsive grids                                                | V3 has responsive CSS, but Wave 1 must test product nav at desktop and mobile widths                                                                  |
| Reduced motion                         | `App.tsx` skips the loading animation for `prefers-reduced-motion`                                                        | V3 global CSS already has reduced-motion rules; landing additions must retain them                                                                    |
| Universe controls                      | floor/preset controls in `Sidebar`; screener search/filter/sort; localStorage watchlist and custom weights in `store.tsx` | Wave 2 adds preserved-model selection, named screens, advanced filters, comparison and a device-local watchlist; arbitrary custom weights remain open |
| Loading                                | Suspense/spinners, loading overlay, `useLiveData` loading state                                                           | Wave 1 adds explicit universe and Market Health loading semantics                                                                                     |
| Empty                                  | `Unavailable`, zero-row screener behavior, absent detail payloads                                                         | Wave 1 adds no-results and no-data cards                                                                                                              |
| Error/unavailable                      | application boot error; `useLiveData` maps timeout, non-OK and `{ok:false}` to unavailable                                | Wave 1 adapter and UI must preserve partial results and never fabricate fallback metrics                                                              |
| Stale                                  | ISM prior-month rule, PGI 210-day rule, V2 freshness manifest and V3 availability classifier                              | Wave 1 shows source-specific stale labels plus V3 trust status                                                                                        |
| Keyboard/labels                        | semantic buttons/nav, menu labels, skip link in V3                                                                        | retain the skip link; add labels for search, filters, sort controls and health regions                                                                |

## Scheduled jobs, environment names and caching

### V2 jobs

- `.github/workflows/refresh.yml`: twice daily at 15:30 and 04:30 UTC plus manual dispatch;
  clones `quant-dashboard-pro`, runs `bake/bake.py`, overlays V2 data, preserves the blob pointer,
  commits and pushes.
- `.github/workflows/data-deadman.yml`: daily 13:00 UTC freshness alarm when
  `public/data/meta.json` has not changed for three days.

### V3 jobs

- `.github/workflows/ci.yml`: install, canonical CI and high-severity dependency audit.
- `.github/workflows/prospective-observation.yml`: daily prospective observation collection and
  evidence publication controls.

### Environment-variable names

- V2 runtime/build references: `GEMINI_API_KEY`, `FINNHUB_API_KEY`, optional `FRED_API_KEY`,
  `VITE_MARKETS_URL`, `VITE_MARKETS_TOKEN`, and Vite `BASE_URL`.
- V3 references: `SEC_USER_AGENT`, `AKRIBEIA_COLLECTION_RECEIPT_PATH`, `CHROME_BIN`,
  `WRANGLER_WRITE_LOGS`, `WRANGLER_LOG_PATH`, `MINIFLARE_REGISTRY_PATH`, GitHub workflow
  variables, and Cloudflare authentication managed outside the repository.
- No `.env` or `.dev.vars` file exists in the selected V3 worktree. Ignored local artifacts are
  limited to dependency, build and Wrangler working directories. No value was printed or copied.

### Cache behavior

- V2 bulk data: `freshness_manifest.json` selects immutable, content-pinned jsDelivr objects;
  module-level promise caches avoid refetching within a browser session; failed blob reads fall
  back to same-origin Git paths.
- V2 data files: Vercel serves data with five-minute browser cache, one-day shared cache and
  seven-day stale-while-revalidate.
- V2 live APIs: endpoint-specific `s-maxage` and `stale-while-revalidate` values are listed above.
- V3 evidence: immutable build directories plus one active pointer; health re-verifies bytes,
  schemas and lineage. Wave 1 product data must not weaken this publication model.

## Reconciliation and known exclusions

- Authoritative full-universe row count: **1,361**.
- Stocks: **1,291**.
- ETFs: **70**.
- Unique tickers: **1,361**.
- Duplicate tickers: **0**.
- Missing ticker: **0**.
- Missing company/fund name: **0**.
- Current and preserved V2 ticker-set delta: **0 additions, 0 removals**.
- Wave 1 product-level exclusions: **none**.
- The `$1B` and `$10B` payloads are optional filters, not replacements for the no-floor coverage
  universe.
- Symbols absent upstream are those for which the cache builder had neither a fresh record nor a
  last-known rescue record. Wave 1 does not invent or silently add such symbols.
- SEC/security-master coverage is evidence metadata, not an inclusion gate for the V2 universe.

## Owner decisions and unresolved items

No owner decision blocks Wave 1 implementation:

- The authoritative V2 application, source/bake repository and pinned bulk payload are available.
- The no-floor count and ticker set reconcile.
- Market Health calculations and keyless upstream adapters are available in source.
- Wave 1 does not need a paid service or a new secret.

Decisions intentionally deferred:

- Whether to recreate the exact 18.2-second WebGL loading sequence. Wave 1 restores the value
  proposition, atmospheric identity, reduced-motion behavior and navigation without adding the
  V2 Three.js dependency; this difference must remain documented and reviewable.
- Whether later waves use separate URL routes or retain one-page/tab navigation.
- Any intentional exclusion from the no-floor universe requires owner approval and is not part of
  this plan.
