"use client";

import { useEffect, useMemo, useState } from "react";
import { compareNullable } from "../product-parity";
import {
  ACTIVE_STRATEGIES,
  RETIRED_STRATEGIES,
  isRetiredStrategyName,
  strategyFactorLabel,
} from "./strategy-status";

type Direction = "ascending" | "descending";
type SortKey = "strategy" | "book" | "entry" | "ticker" | "daily" | "rebalance" | "alltime";

interface HoldingRow {
  id: string;
  strategy: string;
  slug: string;
  book: string | null;
  entry: string | null;
  ticker: string;
  name: string | null;
  daily: number | null;
  rebalance: number | null;
  alltime: number | null;
}

interface Definition {
  thesis?: string;
  rationale?: string;
  holdings?: string[];
}

interface Envelope {
  ok?: boolean;
  fetchedAt?: string;
  source?: { v2AppCommit?: string; url?: string };
  payload?: unknown;
  error?: { message?: string };
}

function finite(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function string(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function compare(
  left: string | number | null,
  right: string | number | null,
  direction: Direction,
): number {
  return compareNullable(left, right, direction);
}

function performance(value: number | null): string {
  if (value === null) return "Unavailable";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(1)}%`;
}

// Factor labels come from the governed strategy-status module; retired
// strategies (Aristeia, Prosodos) never receive active presentation even
// though the pinned V2 snapshot predates their retirement.

export function StrategiesWorkbench() {
  const [holdingsEnvelope, setHoldingsEnvelope] = useState<Envelope | null>(null);
  const [rationaleEnvelope, setRationaleEnvelope] = useState<Envelope | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "partial" | "error">("loading");
  const [filter, setFilter] = useState("all");
  const [book, setBook] = useState("all");
  const [sort, setSort] = useState<{ key: SortKey; direction: Direction }>({
    key: "strategy",
    direction: "ascending",
  });

  useEffect(() => {
    const controller = new AbortController();
    const load = (dataset: string) =>
      fetch(`/api/v3/research-reference?dataset=${dataset}`, {
        signal: controller.signal,
        headers: { accept: "application/json" },
      }).then(async (response) => {
        const body = (await response.json()) as Envelope;
        if (!response.ok || !body.ok)
          throw new Error(body.error?.message ?? `${dataset} unavailable.`);
        return body;
      });
    Promise.allSettled([load("strategies-holdings-performance"), load("strategy-rationale")]).then(
      (results) => {
        if (controller.signal.aborted) return;
        if (results[0].status === "fulfilled") setHoldingsEnvelope(results[0].value);
        if (results[1].status === "fulfilled") setRationaleEnvelope(results[1].value);
        const available = results.filter(({ status }) => status === "fulfilled").length;
        setStatus(available === 2 ? "ready" : available === 1 ? "partial" : "error");
      },
    );
    return () => controller.abort();
  }, []);

  const holdingsPayload =
    holdingsEnvelope?.payload && typeof holdingsEnvelope.payload === "object"
      ? (holdingsEnvelope.payload as Record<string, unknown>)
      : null;
  const allSourceStrategies = Array.isArray(holdingsPayload?.strategies)
    ? (holdingsPayload.strategies as Array<Record<string, unknown>>)
    : [];
  // Pinned V2 records predate the 2026-08-11 strategy retirement; retired
  // sleeves are excluded from all active presentation.
  const strategies = allSourceStrategies.filter(
    (strategy) => !isRetiredStrategyName(string(strategy.label) ?? ""),
  );
  const retiredInSource = allSourceStrategies
    .map((strategy) => string(strategy.label) ?? "")
    .filter((label) => isRetiredStrategyName(label));
  const rows = useMemo<HoldingRow[]>(
    () =>
      strategies.flatMap((strategy) => {
        const label = string(strategy.label) ?? "Unnamed strategy";
        const slug = string(strategy.slug) ?? label.toLowerCase();
        const strategyHoldings = Array.isArray(strategy.holdings)
          ? (strategy.holdings as Array<Record<string, unknown>>)
          : [];
        return strategyHoldings.map((holding, index) => ({
          id: `${slug}-${string(holding.ticker) ?? index}`,
          strategy: label,
          slug,
          book: string(strategy.book_type),
          entry: string(strategy.entry),
          ticker: string(holding.ticker) ?? "Unavailable",
          name: string(holding.name),
          daily: finite(holding.daily),
          rebalance: finite(holding.rebalance),
          alltime: finite(holding.alltime),
        }));
      }),
    [strategies],
  );
  const visibleRows = useMemo(() => {
    const filtered = rows.filter(
      (row) =>
        (filter === "all" || row.strategy === filter) && (book === "all" || row.book === book),
    );
    const value = (row: HoldingRow): string | number | null => row[sort.key];
    return filtered.toSorted(
      (left, right) =>
        compare(value(left), value(right), sort.direction) ||
        left.ticker.localeCompare(right.ticker) ||
        left.id.localeCompare(right.id),
    );
  }, [book, filter, rows, sort]);

  const rationalePayload =
    rationaleEnvelope?.payload && typeof rationaleEnvelope.payload === "object"
      ? (rationaleEnvelope.payload as Record<string, unknown>)
      : null;
  const definitions =
    rationalePayload?.strategies && typeof rationalePayload.strategies === "object"
      ? (rationalePayload.strategies as Record<string, Definition>)
      : {};
  const asOf = string(holdingsPayload?.as_of);
  const generatedAt = string(rationalePayload?.generated_at);

  return (
    <>
      <section className="parity-status" role="status" aria-live="polite" data-state={status}>
        <strong>{status}</strong>
        <span>
          {status === "ready"
            ? `Pinned strategy definitions and holding records loaded${asOf ? ` as of ${asOf}` : ""}.`
            : status === "partial"
              ? "One strategy source is unavailable; available records remain visible."
              : status === "error"
                ? "Pinned strategy records are unavailable. No substitute data is shown."
                : "Loading pinned strategy records…"}
        </span>
      </section>

      <section className="parity-section" aria-labelledby="roster-heading">
        <div className="research-subheading">
          <div>
            <p className="mono-label">GOVERNED ACTIVE ROSTER / 2026-08-11 STATE</p>
            <h2 id="roster-heading">Active strategy sleeves</h2>
          </div>
          <span>Kairos replaced Aristeia on 2026-08-11 · Prosodos retired</span>
        </div>
        <div className="strategy-roster" role="list">
          {ACTIVE_STRATEGIES.map((strategy) => {
            const hasPinnedRecords = strategies.some(
              (candidate) => string(candidate.label) === strategy.name,
            );
            return (
              <article role="listitem" key={strategy.name} className="strategy-roster-item">
                <h3>{strategy.name}</h3>
                <p>{strategy.factor ?? "Factor label pending pinned records"}</p>
                <small>
                  {strategy.note ? `${strategy.note} ` : ""}
                  {holdingsEnvelope === null
                    ? "Loading pinned records…"
                    : hasPinnedRecords
                      ? "Pinned V2 records below."
                      : "No pinned V2 records yet — this sleeve postdates the pinned snapshot; records appear with the next approved data refresh."}
                </small>
              </article>
            );
          })}
        </div>
        {retiredInSource.length > 0 ? (
          <p className="strategy-retired-note" role="note">
            Retired sleeves excluded from active presentation:{" "}
            {RETIRED_STRATEGIES.filter(({ name }) => retiredInSource.includes(name))
              .map(
                (strategy) =>
                  `${strategy.name} (${strategy.factor ?? "factor unrecorded"}${
                    strategy.retiredOn ? `, retired ${strategy.retiredOn}` : ", retired"
                  })`,
              )
              .join(" · ")}
            . Their pinned records remain preserved in the source snapshot but are not shown as
            active strategies.
          </p>
        ) : null}
      </section>

      <section className="parity-section" aria-labelledby="definitions-heading">
        <div className="research-subheading">
          <div>
            <p className="mono-label">APPROVED V2 DEFINITIONS / ACTIVE SLEEVES ONLY</p>
            <h2 id="definitions-heading">Strategy definitions</h2>
          </div>
          <span>
            {generatedAt ? `Rationale snapshot ${generatedAt}` : "Rationale date unavailable"}
          </span>
        </div>
        {Object.keys(definitions).length > 0 ? (
          <div className="strategy-definition-grid">
            {Object.entries(definitions)
              .filter(([name]) => !isRetiredStrategyName(name))
              .map(([name, definition]) => {
              const strategy = strategies.find((candidate) => string(candidate.label) === name);
              const bookType = string(strategy?.book_type);
              return (
                <article key={name}>
                  <header>
                    <div>
                      <p>{strategyFactorLabel(name) ?? "Source-defined strategy"}</p>
                      <h3>{name}</h3>
                    </div>
                    <span data-book={bookType ?? "unavailable"}>{bookType ?? "unavailable"}</span>
                  </header>
                  <p>{definition.thesis ?? "Definition unavailable in the approved source."}</p>
                  <details>
                    <summary>Show dated AI rationale</summary>
                    <p>{definition.rationale ?? "Rationale unavailable."}</p>
                    <small>
                      Source model: {string(rationalePayload?.model) ?? "Unavailable"}. This dated
                      narrative is not a recommendation.
                    </small>
                  </details>
                </article>
              );
            })}
          </div>
        ) : (
          <p className="parity-unavailable">
            Strategy definitions are unavailable. No inferred definition is displayed.
          </p>
        )}
      </section>

      <section className="parity-section parity-section-alt" aria-labelledby="holdings-heading">
        <div className="research-subheading">
          <div>
            <p className="mono-label">HOLDING-LEVEL RECORD / NO AGGREGATION</p>
            <h2 id="holdings-heading">Dated strategy holdings</h2>
          </div>
          <span>
            {visibleRows.length} of {rows.length} source rows
          </span>
        </div>
        <div className="parity-controls">
          <label>
            Strategy
            <select value={filter} onChange={(event) => setFilter(event.target.value)}>
              <option value="all">All strategies</option>
              {strategies.map((strategy) => {
                const label = string(strategy.label) ?? "Unavailable";
                return (
                  <option key={label} value={label}>
                    {label}
                  </option>
                );
              })}
            </select>
          </label>
          <label>
            Book type
            <select value={book} onChange={(event) => setBook(event.target.value)}>
              <option value="all">All books</option>
              <option value="live">Live</option>
              <option value="paper">Paper</option>
            </select>
          </label>
          <button
            type="button"
            onClick={() => {
              setFilter("all");
              setBook("all");
            }}
          >
            Reset holdings
          </button>
        </div>
        {rows.length > 0 ? (
          <div className="research-table-scroll parity-table-scroll">
            <table className="parity-table strategy-table">
              <caption>
                Approved holding performance records; values are displayed exactly as dated
                percentages
              </caption>
              <thead>
                <tr>
                  {(
                    [
                      "strategy",
                      "book",
                      "entry",
                      "ticker",
                      "daily",
                      "rebalance",
                      "alltime",
                    ] as SortKey[]
                  ).map((key) => {
                    const active = sort.key === key;
                    const direction = active ? sort.direction : "none";
                    return (
                      <th key={key} scope="col" aria-sort={direction}>
                        <button
                          type="button"
                          className={
                            active ? "research-sort-header is-active" : "research-sort-header"
                          }
                          onClick={() =>
                            setSort({
                              key,
                              direction:
                                active && sort.direction === "ascending"
                                  ? "descending"
                                  : "ascending",
                            })
                          }
                        >
                          {
                            {
                              strategy: "Strategy",
                              book: "Book",
                              entry: "Entry",
                              ticker: "Security",
                              daily: "Daily",
                              rebalance: "Since rebalance",
                              alltime: "All time",
                            }[key]
                          }
                          <span aria-hidden="true">{direction === "descending" ? "↓" : "↑"}</span>
                        </button>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {visibleRows.map((row) => (
                  <tr key={row.id}>
                    <th scope="row">{row.strategy}</th>
                    <td>
                      <span className="book-label" data-book={row.book ?? "unavailable"}>
                        {row.book ?? "unavailable"}
                      </span>
                    </td>
                    <td>{row.entry ?? "Unavailable"}</td>
                    <td>
                      <strong>{row.ticker}</strong>
                      {row.name ? <small>{row.name}</small> : null}
                    </td>
                    <td>{performance(row.daily)}</td>
                    <td>{performance(row.rebalance)}</td>
                    <td>{performance(row.alltime)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="parity-unavailable">
            Holding records are unavailable. No performance series is synthesized.
          </p>
        )}
        <p className="parity-source-note">
          The table performs no portfolio aggregation and makes no forward projection. Book type is
          taken from the approved source row; paper is never labeled live.
        </p>
      </section>
    </>
  );
}
