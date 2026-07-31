"use client";

import { useEffect, useMemo, useState } from "react";
import { RESEARCH_PRESETS, type ResearchPreset, type ResearchRow } from "../research-data";
import {
  filterResearchRows,
  scoreForModel,
  type ResearchFilters,
  type ResearchSort,
} from "../research-filtering";
import { formatMarketCap, formatMoney, formatPercent } from "../research-format";

const PAGE_SIZE = 50;
const WATCHLIST_KEY = "akribeia:v3:research-watchlist";
const RATINGS = ["Strong Buy+", "Strong Buy", "Buy", "Hold", "Sell", "Strong Sell"];
const MODELS = [
  ["equal", "Equal weight"],
  ["m_heavy", "Momentum heavy"],
  ["v_heavy", "Value heavy"],
  ["research_vq", "Research VQ"],
] as const;

const initialFilters: ResearchFilters = {
  query: "",
  assetType: "all",
  sector: "all",
  rating: "all",
  fairValue: "all",
  minimumScore: 0,
  minimumMarketCapB: 0,
  preset: "all",
  model: "equal",
  watchlistOnly: false,
  sort: "score-desc",
};

function ratingClass(rating: string): string {
  if (rating.includes("Buy")) return "research-rating research-rating-positive";
  if (rating.includes("Sell")) return "research-rating research-rating-negative";
  return "research-rating";
}

function ResearchComparison({
  rows,
  onRemove,
}: {
  rows: ResearchRow[];
  onRemove: (ticker: string) => void;
}) {
  if (rows.length === 0) return null;
  const metrics: Array<[string, (row: ResearchRow) => string]> = [
    ["Composite", (row) => row.composite?.toFixed(2) ?? "Unavailable"],
    ["Rating", (row) => row.rating],
    ["Price", (row) => formatMoney(row.price)],
    ["Fair value", (row) => formatMoney(row.fairValue)],
    ["Prem. / discount", (row) => formatPercent(row.fairValuePremium, 1, true)],
    ["Buy-point distance", (row) => formatPercent(row.buyPointDistance, 1, true)],
    ["Market cap", (row) => formatMarketCap(row.marketCapB)],
    ["Valuation", (row) => row.grades.Valuation ?? "—"],
    ["Growth", (row) => row.grades.Growth ?? "—"],
    ["Profitability", (row) => row.grades.Profitability ?? "—"],
    ["Momentum", (row) => row.grades.Momentum ?? "—"],
    ["EPS revisions", (row) => row.grades["EPS Revisions"] ?? "—"],
  ];

  return (
    <section className="research-comparison" aria-labelledby="comparison-heading">
      <div className="research-subheading">
        <div>
          <p className="mono-label">SIDE-BY-SIDE / {rows.length} OF 4</p>
          <h2 id="comparison-heading">Security comparison</h2>
        </div>
        <span>Preserved snapshot metrics; missing values remain unavailable.</span>
      </div>
      <div className="research-comparison-scroll">
        <table>
          <thead>
            <tr>
              <th scope="col">Measure</th>
              {rows.map((row) => (
                <th scope="col" key={row.ticker}>
                  <a href={`/research/${encodeURIComponent(row.ticker)}`}>{row.ticker}</a>
                  <button type="button" onClick={() => onRemove(row.ticker)}>
                    Remove
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {metrics.map(([label, render]) => (
              <tr key={label}>
                <th scope="row">{label}</th>
                {rows.map((row) => (
                  <td key={row.ticker}>{render(row)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export function ResearchWorkbench({ rows, sectors }: { rows: ResearchRow[]; sectors: string[] }) {
  const [filters, setFilters] = useState(initialFilters);
  const [visible, setVisible] = useState(PAGE_SIZE);
  const [watchlist, setWatchlist] = useState<Set<string>>(new Set());
  const [comparison, setComparison] = useState<string[]>([]);

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(WATCHLIST_KEY) ?? "[]");
      if (Array.isArray(saved)) {
        setWatchlist(new Set(saved.filter((value): value is string => typeof value === "string")));
      }
    } catch {
      setWatchlist(new Set());
    }
  }, []);

  const filtered = useMemo(
    () => filterResearchRows(rows, filters, watchlist),
    [filters, rows, watchlist],
  );
  const comparisonRows = useMemo(
    () =>
      comparison
        .map((ticker) => rows.find((row) => row.ticker === ticker))
        .filter((row): row is ResearchRow => row !== undefined),
    [comparison, rows],
  );

  function updateFilters(patch: Partial<ResearchFilters>) {
    setFilters((current) => ({ ...current, ...patch }));
    setVisible(PAGE_SIZE);
  }

  function resetFilters() {
    setFilters(initialFilters);
    setVisible(PAGE_SIZE);
  }

  function toggleWatchlist(ticker: string) {
    setWatchlist((current) => {
      const next = new Set(current);
      if (next.has(ticker)) next.delete(ticker);
      else next.add(ticker);
      try {
        localStorage.setItem(WATCHLIST_KEY, JSON.stringify([...next].sort()));
      } catch {
        // The research workflow remains usable when browser storage is unavailable.
      }
      return next;
    });
  }

  function toggleComparison(ticker: string) {
    setComparison((current) =>
      current.includes(ticker)
        ? current.filter((item) => item !== ticker)
        : current.length < 4
          ? [...current, ticker]
          : current,
    );
  }

  return (
    <>
      <section className="research-control-deck" aria-labelledby="screener-controls-heading">
        <div className="research-control-heading">
          <div>
            <p className="mono-label">SCREEN / FILTER / SORT / COMPARE</p>
            <h2 id="screener-controls-heading">Build a research cohort</h2>
          </div>
          <button type="button" onClick={resetFilters}>
            Reset all controls
          </button>
        </div>

        <div className="research-preset-list" aria-label="Quick research screens">
          {(
            Object.entries(RESEARCH_PRESETS) as Array<
              [ResearchPreset, (typeof RESEARCH_PRESETS)[ResearchPreset]]
            >
          ).map(([key, preset]) => (
            <button
              type="button"
              key={key}
              aria-pressed={filters.preset === key}
              onClick={() => updateFilters({ preset: key })}
            >
              <strong>{preset.label}</strong>
              <span>{preset.description}</span>
            </button>
          ))}
        </div>

        <form
          className="research-filter-grid"
          aria-label="Advanced screener filters"
          onSubmit={(event) => event.preventDefault()}
        >
          <label className="research-filter-wide">
            <span>Search ticker, company or industry</span>
            <input
              type="search"
              value={filters.query}
              onChange={(event) => updateFilters({ query: event.target.value })}
              placeholder="Try NVDA, semiconductors or banks"
            />
          </label>
          <label>
            <span>Scoring model</span>
            <select
              value={filters.model}
              onChange={(event) => updateFilters({ model: event.target.value })}
            >
              {MODELS.map(([value, label]) => (
                <option value={value} key={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Asset type</span>
            <select
              value={filters.assetType}
              onChange={(event) =>
                updateFilters({
                  assetType: event.target.value as ResearchFilters["assetType"],
                  sector: "all",
                })
              }
            >
              <option value="all">Stocks + ETFs</option>
              <option value="stock">Stocks only</option>
              <option value="etf">ETFs only</option>
            </select>
          </label>
          <label>
            <span>Sector</span>
            <select
              value={filters.sector}
              onChange={(event) => updateFilters({ sector: event.target.value })}
            >
              <option value="all">All sectors</option>
              {sectors.map((sector) => (
                <option value={sector} key={sector}>
                  {sector}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Rating</span>
            <select
              value={filters.rating}
              onChange={(event) => updateFilters({ rating: event.target.value })}
            >
              <option value="all">All ratings</option>
              {RATINGS.map((rating) => (
                <option value={rating} key={rating}>
                  {rating}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Fair value</span>
            <select
              value={filters.fairValue}
              onChange={(event) => updateFilters({ fairValue: event.target.value })}
            >
              <option value="all">All valuation states</option>
              <option value="discount">At a discount</option>
              <option value="Deeply Undervalued">Deeply undervalued</option>
              <option value="Undervalued">Undervalued</option>
              <option value="Fairly Valued">Fairly valued</option>
              <option value="Overvalued">Overvalued</option>
              <option value="Significantly Overvalued">Significantly overvalued</option>
            </select>
          </label>
          <label>
            <span>Minimum score: {filters.minimumScore.toFixed(1)}</span>
            <input
              type="range"
              min="0"
              max="12"
              step="0.5"
              value={filters.minimumScore}
              onChange={(event) =>
                updateFilters({ minimumScore: Number.parseFloat(event.target.value) })
              }
            />
          </label>
          <label>
            <span>Minimum market cap</span>
            <select
              value={filters.minimumMarketCapB}
              onChange={(event) =>
                updateFilters({ minimumMarketCapB: Number.parseFloat(event.target.value) })
              }
            >
              <option value="0">No floor</option>
              <option value="1">$1B+</option>
              <option value="10">$10B+</option>
              <option value="100">$100B+</option>
            </select>
          </label>
          <label>
            <span>Sort</span>
            <select
              value={filters.sort}
              onChange={(event) => updateFilters({ sort: event.target.value as ResearchSort })}
            >
              <option value="score-desc">Score: high to low</option>
              <option value="score-asc">Score: low to high</option>
              <option value="market-cap-desc">Market cap</option>
              <option value="valuation-asc">Deepest fair-value discount</option>
              <option value="buy-point-asc">Closest to buy point</option>
              <option value="ticker-asc">Ticker A–Z</option>
            </select>
          </label>
          <label className="research-check">
            <input
              type="checkbox"
              checked={filters.watchlistOnly}
              onChange={(event) => updateFilters({ watchlistOnly: event.target.checked })}
            />
            <span>Watchlist only ({watchlist.size})</span>
          </label>
        </form>
      </section>

      <ResearchComparison
        rows={comparisonRows}
        onRemove={(ticker) => setComparison((current) => current.filter((item) => item !== ticker))}
      />

      <section className="research-results" aria-labelledby="research-results-heading">
        <div className="research-results-summary" aria-live="polite">
          <div>
            <p className="mono-label">MATCHING COHORT</p>
            <h2 id="research-results-heading">
              {filtered.length.toLocaleString("en-US")} securities
            </h2>
          </div>
          <p>
            {filters.preset === "all"
              ? "No quick-screen rule applied."
              : RESEARCH_PRESETS[filters.preset].description}{" "}
            Select up to four names for comparison.
          </p>
        </div>
        {filtered.length === 0 ? (
          <div className="research-empty" role="status">
            <strong>No securities match this screen.</strong>
            <span>Change a filter or reset the controls. The source universe remains intact.</span>
          </div>
        ) : (
          <>
            <div className="research-table-scroll">
              <table className="research-table">
                <caption className="sr-only">
                  Advanced quantitative security screener over the preserved V2 universe
                </caption>
                <thead>
                  <tr>
                    <th scope="col">Track</th>
                    <th scope="col">Security</th>
                    <th scope="col">Sector / industry</th>
                    <th scope="col">Score</th>
                    <th scope="col">Rating</th>
                    <th scope="col">Price</th>
                    <th scope="col">Fair value</th>
                    <th scope="col">Prem. / disc.</th>
                    <th scope="col">Buy point</th>
                    <th scope="col">BP distance</th>
                    <th scope="col">Val</th>
                    <th scope="col">Growth</th>
                    <th scope="col">Prof.</th>
                    <th scope="col">Mom.</th>
                    <th scope="col">EPS</th>
                    <th scope="col">Market cap</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.slice(0, visible).map((row) => {
                    const modeled = scoreForModel(row, filters.model);
                    const selected = comparison.includes(row.ticker);
                    return (
                      <tr key={row.ticker}>
                        <td className="research-track-cell">
                          <button
                            type="button"
                            className={watchlist.has(row.ticker) ? "is-watched" : undefined}
                            aria-label={`${watchlist.has(row.ticker) ? "Remove" : "Add"} ${row.ticker} ${
                              watchlist.has(row.ticker) ? "from" : "to"
                            } watchlist`}
                            onClick={() => toggleWatchlist(row.ticker)}
                          >
                            {watchlist.has(row.ticker) ? "★" : "☆"}
                          </button>
                          <input
                            type="checkbox"
                            aria-label={`Compare ${row.ticker}`}
                            checked={selected}
                            disabled={!selected && comparison.length >= 4}
                            onChange={() => toggleComparison(row.ticker)}
                          />
                        </td>
                        <td className="research-security-cell">
                          <a href={`/research/${encodeURIComponent(row.ticker)}`}>{row.ticker}</a>
                          <span>{row.name}</span>
                        </td>
                        <td>
                          <strong>{row.isEtf ? "ETF" : row.sector}</strong>
                          <span>{row.industry}</span>
                        </td>
                        <td className="research-number">{modeled.composite?.toFixed(2) ?? "—"}</td>
                        <td>
                          <span className={ratingClass(modeled.rating)}>{modeled.rating}</span>
                        </td>
                        <td className="research-number">{formatMoney(row.price)}</td>
                        <td className="research-number">{formatMoney(row.fairValue)}</td>
                        <td
                          className={
                            row.fairValuePremium !== null && row.fairValuePremium <= 0
                              ? "research-number research-positive"
                              : "research-number"
                          }
                        >
                          {formatPercent(row.fairValuePremium, 1, true)}
                        </td>
                        <td className="research-number">{formatMoney(row.buyPoint)}</td>
                        <td className="research-number">
                          {formatPercent(row.buyPointDistance, 1, true)}
                        </td>
                        {["Valuation", "Growth", "Profitability", "Momentum", "EPS Revisions"].map(
                          (pillar) => (
                            <td className="research-grade" key={pillar}>
                              {row.grades[pillar] ?? "—"}
                            </td>
                          ),
                        )}
                        <td className="research-number">{formatMarketCap(row.marketCapB)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {visible < filtered.length ? (
              <button
                className="research-load-more"
                type="button"
                onClick={() => setVisible((current) => current + PAGE_SIZE)}
              >
                Show 50 more
              </button>
            ) : null}
          </>
        )}
      </section>
    </>
  );
}
