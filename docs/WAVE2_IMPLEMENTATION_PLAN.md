# Wave 2 Core Research Product-Parity Plan

## Objective

Wave 2 restores the six core research workflows named in the product-parity handoff:

1. full screener;
2. search, sorting, filtering and comparison;
3. security-detail pages;
4. risk and radar visualizations;
5. sector analytics;
6. ETF Center.

The implementation keeps the V2 application and bake repositories unchanged. It consumes the
preserved 1,361-security no-floor fixture for deterministic research state and uses bounded V3
server adapters for live quotes and small, pinned V2 reference datasets.

## Evidence basis

- Branch base: merge commit `0fc7d1668`, PR #30.
- Preserved V2 application commit: `b477349a8691fdc5000641a6ae2893dbbfae2de6`.
- Preserved V2 source commit: `1858840c581f406492dec2e809830d05764ad3d9`.
- Preserved no-floor fixture: 1,361 unique rows, comprising 1,291 stocks and 70 ETFs.
- Wave 1 Market Health and trust/evidence controls remain authoritative and must continue to pass.

## Implemented product surfaces

### `/research`

- Complete no-floor universe with zero product exclusions.
- Search by ticker, company and industry.
- Asset, sector, rating, fair-value, score, market-cap and watchlist filters.
- Equal, momentum-heavy, value-heavy and Research VQ model selectors.
- Six explicit quick screens whose predicates are regression tested.
- Sorting by score, market capitalization, valuation, buy-point distance and ticker.
- Device-local persistent watchlist.
- Side-by-side comparison for up to four securities.
- Deep links to a dedicated security record.

### `/research/:ticker`

- Preserved price, fair value, buy point, equal-weight score, rating, grades and raw factors.
- Five-pillar visualization using preserved scores rather than a client recomputation.
- Live keyless quote and daily-history adapter with explicit unavailable state.
- Canvas price chart and V2-compatible price-only risk metrics.
- Factor ledger and nearest same-sector score peers.
- Clear separation between the dated research snapshot and live market data.

### `/risk`

- Pinned, source-attributed V2 Risk Radar through the V3 reference adapter.
- Severity distribution, severity/category filters, direction, horizon, watch conditions and named
  sources.
- Explicit unavailable behavior with no generated fallback narrative.

### `/sectors`

- All 1,291 stocks reconcile into sector membership.
- Average and median composite, sample dispersion, buy-tier share, market capitalization and
  aggregate P/E.
- Pillar profiles, rating distributions and links to highest/lowest security records.

### `/etfs`

- All 70 ETFs in the preserved scored universe.
- Two-to-five-fund comparison.
- Preserved V2 portfolio templates with transparent arithmetic and dated-label disclaimer.
- Holdings and look-through scores with mapped-weight coverage.
- Preserved rating-suppression policy below 50% mapped weight.
- Reverse stock-to-ETF lookup and sector/theme implementation maps.

## API parity

| V3 endpoint                           | V2 equivalent  | Behavior                                                                                                                      |
| ------------------------------------- | -------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `/api/v3/quote`                       | `/api/quote`   | bounded keyless Yahoo daily/intraday fetch; daily history; price, range and VWAP; 120-second shared cache                     |
| `/api/v3/quotes`                      | `/api/quotes`  | validated and de-duplicated ticker list; maximum 120; bounded concurrency; partial prices preserved                           |
| `/api/v3/research-reference?dataset=` | V2 static data | allowlisted, pinned-commit proxy for Risk Radar and ETF reference datasets; seven-second timeout; two-megabyte response limit |

Invalid ticker and dataset inputs are rejected before an upstream request. Source errors return an
explicit unavailable response. The adapters never fabricate a quote, history, risk, holding,
allocation or narrative.

## Validation gates

- The source universe remains exactly 1,361 unique tickers.
- Sector membership reconciles to 1,291 stocks.
- The scored ETF surface reconciles to 70 ETFs.
- Every quick screen returns only records satisfying its named predicate.
- Fewer than 30 valid closes cannot produce a risk result.
- Invalid tickers and non-allowlisted reference datasets fail before upstream access.
- All five Wave 2 routes server-render from the packaged worker.
- Existing Wave 1 rendered, accessibility, integrity and real-Chrome tests continue to pass.
- Canonical typecheck, lint, build, Vitest, packaged-worker and dependency gates must pass before
  deployment.

## Explicitly open after this core-research unit

The broader parity matrix assigned some adjacent product areas to Wave 2 or Wave 2/3. They are not
silently claimed by this six-workflow unit and remain open:

- V2 user-entered portfolio, Monte Carlo and holdings workflow;
- dedicated quantitative-portfolio workflow beyond the existing published V3 model portfolio;
- the full macro forecast-consensus and rotation surface beyond Market Health and Risk Radar;
- strategies/signatures, product help and glossary;
- bulk per-ticker quarterly/detail-timeseries reconciliation;
- formal screenshot, responsive and assistive-technology certification;
- full route/API/calculation certification and cutover approval.

These remain visible gaps for later parity work. V3 is still a research preview and is not
authorized to replace V2.
