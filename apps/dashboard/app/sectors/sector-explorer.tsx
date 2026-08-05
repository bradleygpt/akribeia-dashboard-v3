"use client";

import { useEffect, useMemo, useState } from "react";
import type { ResearchRow } from "../research-data";
import { formatMarketCap, formatMoney } from "../research-format";

type SectorSort =
  | "security-ascending"
  | "security-descending"
  | "industry-ascending"
  | "industry-descending"
  | "score-ascending"
  | "score-descending"
  | "rating-ascending"
  | "rating-descending"
  | "price-ascending"
  | "price-descending"
  | "market-cap-ascending"
  | "market-cap-descending";

type SectorSortKey = "security" | "industry" | "score" | "rating" | "price" | "market-cap";

export function parseSectorSort(sort: SectorSort): [SectorSortKey, "ascending" | "descending"] {
  const separator = sort.lastIndexOf("-");
  return [
    sort.slice(0, separator) as SectorSortKey,
    sort.slice(separator + 1) as "ascending" | "descending",
  ];
}

interface NarrativeReference {
  generated_at?: string;
  note?: string;
  sectors?: Record<string, { narrative?: string }>;
}

interface NarrativeEnvelope {
  ok: boolean;
  payload?: NarrativeReference;
  error?: { message?: string };
}

function sectorSortValue(row: ResearchRow, key: SectorSortKey): string | number | null {
  if (key === "security") return row.ticker;
  if (key === "industry") return row.industry;
  if (key === "score") return row.composite;
  if (key === "rating") return row.rating;
  if (key === "price") return row.price;
  return row.marketCapB;
}

function SectorSortHeader({
  column,
  label,
  sort,
  onSort,
}: {
  column: SectorSortKey;
  label: string;
  sort: SectorSort;
  onSort: (sort: SectorSort) => void;
}) {
  const [activeColumn, activeDirection] = parseSectorSort(sort);
  const active = activeColumn === column;
  const direction = active ? activeDirection : "none";
  return (
    <th scope="col" aria-sort={direction}>
      <button
        type="button"
        className={active ? "research-sort-header is-active" : "research-sort-header"}
        onClick={() =>
          onSort(
            `${column}-${
              active && activeDirection === "ascending" ? "descending" : "ascending"
            }` as SectorSort,
          )
        }
      >
        {label}
        <span aria-hidden="true">{direction === "descending" ? "↓" : "↑"}</span>
      </button>
    </th>
  );
}

export function SectorExplorer({ rows, sectors }: { rows: ResearchRow[]; sectors: string[] }) {
  const [selected, setSelected] = useState(sectors[0] ?? "");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SectorSort>("score-descending");
  const [narrative, setNarrative] = useState<NarrativeReference | null>(null);
  const [sourceState, setSourceState] = useState<"loading" | "ready" | "error">("loading");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setSourceState("loading");
    fetch("/api/v3/research-reference?dataset=sector-narratives", {
      signal: controller.signal,
      headers: { accept: "application/json" },
    })
      .then(async (response) => {
        const body = (await response.json()) as NarrativeEnvelope;
        if (!response.ok || !body.ok || !body.payload) {
          throw new Error(body.error?.message ?? "Narrative source unavailable");
        }
        setNarrative(body.payload);
        setSourceState("ready");
      })
      .catch(() => {
        if (!controller.signal.aborted) setSourceState("error");
      });
    return () => controller.abort();
  }, [attempt]);

  const members = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return rows
      .filter(
        (row) =>
          !row.isEtf &&
          row.sector === selected &&
          (!needle ||
            row.ticker.toLowerCase().includes(needle) ||
            row.name.toLowerCase().includes(needle) ||
            row.industry.toLowerCase().includes(needle)),
      )
      .toSorted((left, right) => {
        const [column, direction] = parseSectorSort(sort);
        const leftValue = sectorSortValue(left, column);
        const rightValue = sectorSortValue(right, column);
        if (leftValue === null && rightValue === null)
          return left.ticker.localeCompare(right.ticker);
        if (leftValue === null) return 1;
        if (rightValue === null) return -1;
        const comparison =
          typeof leftValue === "number" && typeof rightValue === "number"
            ? leftValue - rightValue
            : String(leftValue).localeCompare(String(rightValue), "en-US", {
                sensitivity: "base",
              });
        return (
          (direction === "ascending" ? comparison : -comparison) ||
          left.ticker.localeCompare(right.ticker)
        );
      });
  }, [query, rows, selected, sort]);

  return (
    <section className="sector-explorer" aria-labelledby="sector-explorer-heading">
      <div className="research-subheading">
        <div>
          <p className="mono-label">CONSTITUENT DRILL-DOWN</p>
          <h2 id="sector-explorer-heading">Inspect the companies behind the aggregate</h2>
        </div>
        <span>All 1,291 stocks reconcile here, including explicit Unclassified records.</span>
      </div>
      <div className="sector-explorer-controls">
        <label>
          <span>Sector</span>
          <select value={selected} onChange={(event) => setSelected(event.target.value)}>
            {sectors.map((sector) => (
              <option key={sector}>{sector}</option>
            ))}
          </select>
        </label>
        <label>
          <span>Search constituent</span>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Ticker, company or industry"
          />
        </label>
        <label>
          <span>Sort</span>
          <select value={sort} onChange={(event) => setSort(event.target.value as SectorSort)}>
            <option value="score-descending">Score: high to low</option>
            <option value="market-cap-descending">Market cap: high to low</option>
            <option value="security-ascending">Ticker A–Z</option>
          </select>
        </label>
      </div>
      <aside className="sector-narrative" aria-live="polite">
        {sourceState === "loading" ? <span>Loading pinned V2 sector narrative…</span> : null}
        {sourceState === "error" ? (
          <>
            <span>Narrative unavailable; constituent calculations remain authoritative.</span>
            <button type="button" onClick={() => setAttempt((current) => current + 1)}>
              Retry narrative
            </button>
          </>
        ) : null}
        {sourceState === "ready" ? (
          <>
            <p>
              {narrative?.sectors?.[selected]?.narrative ??
                "No preserved narrative exists for this classification."}
            </p>
            <small>
              Pinned narrative as of {narrative?.generated_at ?? "unavailable"} ·{" "}
              {narrative?.note ?? "pre-computed sector statistics"}
            </small>
          </>
        ) : null}
      </aside>
      {members.length === 0 ? (
        <div className="research-empty" role="status">
          <strong>No constituents match this search.</strong>
          <span>Clear the query to restore the full sector membership.</span>
        </div>
      ) : (
        <div className="research-table-scroll">
          <table className="research-table">
            <caption>
              {members.length} {selected} constituents
            </caption>
            <thead>
              <tr>
                {(
                  [
                    ["security", "Security"],
                    ["industry", "Industry"],
                    ["score", "Score"],
                    ["rating", "Rating"],
                    ["price", "Price"],
                    ["market-cap", "Market cap"],
                  ] as Array<[SectorSortKey, string]>
                ).map(([column, label]) => (
                  <SectorSortHeader
                    column={column}
                    key={column}
                    label={label}
                    sort={sort}
                    onSort={setSort}
                  />
                ))}
              </tr>
            </thead>
            <tbody>
              {members.map((row) => (
                <tr key={row.ticker}>
                  <td className="research-security-cell">
                    <a href={`/research/${encodeURIComponent(row.ticker)}`}>{row.ticker}</a>
                    <span>{row.name}</span>
                  </td>
                  <td>{row.industry}</td>
                  <td className="research-number">{row.composite?.toFixed(2) ?? "—"}</td>
                  <td>{row.rating}</td>
                  <td className="research-number">{formatMoney(row.price)}</td>
                  <td className="research-number">{formatMarketCap(row.marketCapB)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
