"use client";

import { useMemo, useState } from "react";
import { filterUniverseRows, type UniverseFilter, type UniverseSort } from "./universe-filtering";
import type { UniverseDisplayRow } from "./v2-universe";

const PAGE_SIZE = 50;

function marketCap(value: number | null): string {
  if (value === null) return "Not reported";
  if (value >= 1000) return `$${(value / 1000).toFixed(2)}T`;
  return `$${value.toFixed(value >= 100 ? 0 : 1)}B`;
}

export function FullUniverseExplorer({
  rows,
  sectors,
}: {
  rows: UniverseDisplayRow[];
  sectors: string[];
}) {
  const [filter, setFilter] = useState<UniverseFilter>({
    query: "",
    sector: "all",
    sort: "score-desc",
  });
  const [visible, setVisible] = useState(PAGE_SIZE);
  const filteredRows = useMemo(() => filterUniverseRows(rows, filter), [filter, rows]);
  const visibleRows = filteredRows.slice(0, visible);

  function updateFilter(patch: Partial<UniverseFilter>) {
    setFilter((current) => ({ ...current, ...patch }));
    setVisible(PAGE_SIZE);
  }

  return (
    <div className="universe-explorer">
      <form
        className="universe-controls"
        aria-label="Full universe controls"
        onSubmit={(event) => event.preventDefault()}
      >
        <label>
          <span>Search all securities</span>
          <input
            type="search"
            value={filter.query}
            onChange={(event) => updateFilter({ query: event.target.value })}
            placeholder="Ticker, company or industry"
          />
        </label>
        <label>
          <span>Sector</span>
          <select
            value={filter.sector}
            onChange={(event) => updateFilter({ sector: event.target.value })}
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
          <span>Sort</span>
          <select
            value={filter.sort}
            onChange={(event) => updateFilter({ sort: event.target.value as UniverseSort })}
          >
            <option value="score-desc">Composite score</option>
            <option value="market-cap-desc">Market cap</option>
            <option value="ticker-asc">Ticker A–Z</option>
            <option value="name-asc">Company A–Z</option>
          </select>
        </label>
      </form>

      <div className="universe-result-summary" aria-live="polite">
        <strong>{filteredRows.length.toLocaleString("en-US")}</strong>
        <span>
          {filteredRows.length === rows.length
            ? "securities in the authoritative no-floor universe"
            : `of ${rows.length.toLocaleString("en-US")} securities match`}
        </span>
      </div>

      {visibleRows.length === 0 ? (
        <div className="universe-empty" role="status">
          <strong>No securities match these controls.</strong>
          <span>Clear the search or choose another sector. The source universe is unchanged.</span>
        </div>
      ) : (
        <>
          <div className="universe-table-wrap">
            <table className="universe-table">
              <caption className="sr-only">Searchable authoritative V2 security universe</caption>
              <thead>
                <tr>
                  <th scope="col">Security</th>
                  <th scope="col">Sector / industry</th>
                  <th scope="col">Market cap</th>
                  <th scope="col">Equal-weight score</th>
                  <th scope="col">Rating</th>
                </tr>
              </thead>
              <tbody>
                {visibleRows.map((row) => (
                  <tr key={row.ticker}>
                    <td>
                      <strong>{row.ticker}</strong>
                      <span>{row.name}</span>
                    </td>
                    <td>
                      <strong>{row.sector}</strong>
                      <span>{row.industry}</span>
                    </td>
                    <td>{marketCap(row.marketCapB)}</td>
                    <td>{row.composite === null ? "Unavailable" : row.composite.toFixed(2)}</td>
                    <td>
                      <span className="universe-rating">{row.rating}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {visibleRows.length < filteredRows.length ? (
            <button
              className="universe-more"
              type="button"
              onClick={() => setVisible((current) => current + PAGE_SIZE)}
            >
              Show 50 more
            </button>
          ) : null}
        </>
      )}
    </div>
  );
}
