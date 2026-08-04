"use client";

import { useEffect, useMemo, useState } from "react";
import styles from "./prolepsis.module.css";

const PAGE_SIZE = 100;
const LIVE_QUOTE_LIMIT = 120;

type SortKey =
  | "rank"
  | "ticker"
  | "sector"
  | "posterior"
  | "price"
  | "pred12m"
  | "target12m"
  | "returnAvailability";

type SortDirection = "asc" | "desc";
type ReturnFilter = "all" | "available" | "unavailable";

interface ProlepsisRow {
  ticker: string;
  sector?: string | null;
  c78q_post: number;
  c78q_rank: number;
  current_price: number | null;
  pred_12m: number | null;
  target_12m: number | null;
  return_engine_available: boolean;
  return_engine_unavailable_reason: string | null;
  price_source: "as_of" | "unavailable";
  price_as_of: string | null;
  c78q_top8: number;
}

interface Coverage {
  total_prolepsis_rows: number;
  eligible_classifier_rows: number;
  populated_posterior_rows: number;
  return_engine_covered_rows: number;
  return_engine_unavailable_rows: number;
  target_basket_rows: number;
  contract: {
    p_beat_definition: string;
    return_target_definition: string;
    target_basket_role: string;
  };
}

interface ProlepsisPayload {
  generated_at: string;
  effective_date: string;
  n: number;
  rows: ProlepsisRow[];
  prolepsis_coverage: Coverage;
}

interface QuotesPayload {
  ok: boolean;
  requested: number;
  available: number;
  prices: Record<string, number>;
  generatedAt: string;
}

interface SortState {
  key: SortKey;
  direction: SortDirection;
}

function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function money(value: number | null): string {
  if (value === null) return "Unavailable";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: value >= 100 ? 0 : 2,
  }).format(value);
}

function percent(value: number | null, digits = 1): string {
  if (value === null) return "Unavailable";
  return `${(value * 100).toFixed(digits)}%`;
}

function timestamp(value: string | null | undefined): string {
  if (!value) return "Unavailable";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime())
    ? value
    : parsed.toLocaleString("en-US", {
        dateStyle: "medium",
        timeStyle: "short",
      });
}

function compareNullable(left: number | null, right: number | null, direction: number): number {
  if (left === null && right === null) return 0;
  if (left === null) return 1;
  if (right === null) return -1;
  return (left - right) * direction;
}

function sortRows(
  rows: ProlepsisRow[],
  sort: SortState,
  livePrices: Record<string, number>,
): ProlepsisRow[] {
  const direction = sort.direction === "asc" ? 1 : -1;
  return [...rows].sort((left, right) => {
    let comparison = 0;
    switch (sort.key) {
      case "rank":
        comparison = left.c78q_rank - right.c78q_rank;
        break;
      case "ticker":
        comparison = left.ticker.localeCompare(right.ticker);
        break;
      case "sector":
        comparison = (left.sector ?? "").localeCompare(right.sector ?? "");
        break;
      case "posterior":
        comparison = left.c78q_post - right.c78q_post;
        break;
      case "price":
        return (
          compareNullable(
            livePrices[left.ticker] ?? left.current_price,
            livePrices[right.ticker] ?? right.current_price,
            direction,
          ) || left.ticker.localeCompare(right.ticker)
        );
      case "pred12m":
        return (
          compareNullable(left.pred_12m, right.pred_12m, direction) ||
          left.ticker.localeCompare(right.ticker)
        );
      case "target12m":
        return (
          compareNullable(left.target_12m, right.target_12m, direction) ||
          left.ticker.localeCompare(right.ticker)
        );
      case "returnAvailability":
        comparison = Number(left.return_engine_available) - Number(right.return_engine_available);
        break;
    }
    if (comparison !== 0) return comparison * direction;
    return left.ticker.localeCompare(right.ticker);
  });
}

function SortButton({
  label,
  sortKey,
  active,
  onChange,
}: {
  label: string;
  sortKey: SortKey;
  active: SortState;
  onChange: (key: SortKey) => void;
}) {
  const selected = active.key === sortKey;
  return (
    <button
      type="button"
      className={styles.sortButton}
      aria-label={`${label}: ${
        selected
          ? `sorted ${active.direction === "asc" ? "ascending" : "descending"}`
          : "not sorted"
      }`}
      aria-pressed={selected}
      onClick={() => onChange(sortKey)}
    >
      {label}
      <span aria-hidden="true">{selected ? (active.direction === "asc" ? " ↑" : " ↓") : " ↕"}</span>
    </button>
  );
}

export function ProlepsisWorkbench() {
  const [payload, setPayload] = useState<ProlepsisPayload | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [livePrices, setLivePrices] = useState<Record<string, number>>({});
  const [liveGeneratedAt, setLiveGeneratedAt] = useState<string | null>(null);
  const [liveStatus, setLiveStatus] = useState<"loading" | "available" | "unavailable">("loading");
  const [query, setQuery] = useState("");
  const [sector, setSector] = useState("all");
  const [minimumPosterior, setMinimumPosterior] = useState(0);
  const [returnFilter, setReturnFilter] = useState<ReturnFilter>("all");
  const [top8Only, setTop8Only] = useState(false);
  const [sort, setSort] = useState<SortState>({ key: "rank", direction: "asc" });
  const [visible, setVisible] = useState(PAGE_SIZE);

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const response = await fetch("/data/mlpred.json", {
          cache: "no-store",
          signal: controller.signal,
        });
        if (!response.ok) throw new Error(`Artifact request failed (${response.status}).`);
        const next = (await response.json()) as ProlepsisPayload;
        if (
          !Array.isArray(next.rows) ||
          next.rows.length !== next.prolepsis_coverage.total_prolepsis_rows
        ) {
          throw new Error("Artifact coverage metadata does not reconcile with emitted rows.");
        }
        setPayload(next);
      } catch (error) {
        if (controller.signal.aborted) return;
        setLoadError(error instanceof Error ? error.message : "Unable to load Prolepsis.");
      }
    }
    void load();
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (payload === null) return;
    const controller = new AbortController();
    const candidates = [...payload.rows]
      .sort((left, right) => left.c78q_rank - right.c78q_rank)
      .slice(0, LIVE_QUOTE_LIMIT)
      .map(({ ticker }) => ticker);

    async function loadQuotes() {
      try {
        const response = await fetch(
          `/api/v3/quotes?tickers=${encodeURIComponent(candidates.join(","))}`,
          { cache: "no-store", signal: controller.signal },
        );
        if (!response.ok) throw new Error(`Quote request failed (${response.status}).`);
        const quotes = (await response.json()) as QuotesPayload;
        const validated = Object.fromEntries(
          Object.entries(quotes.prices ?? {}).filter(([, value]) => finite(value)),
        );
        setLivePrices(validated);
        setLiveGeneratedAt(quotes.generatedAt ?? null);
        setLiveStatus(Object.keys(validated).length > 0 ? "available" : "unavailable");
      } catch {
        if (controller.signal.aborted) return;
        setLivePrices({});
        setLiveGeneratedAt(null);
        setLiveStatus("unavailable");
      }
    }

    void loadQuotes();
    return () => controller.abort();
  }, [payload]);

  const sectors = useMemo(
    () =>
      payload === null
        ? []
        : [...new Set(payload.rows.map((row) => row.sector?.trim() || "Unclassified"))].sort(
            (left, right) => left.localeCompare(right),
          ),
    [payload],
  );

  const filteredRows = useMemo(() => {
    if (payload === null) return [];
    const normalizedQuery = query.trim().toUpperCase();
    const rows = payload.rows.filter((row) => {
      if (
        normalizedQuery &&
        !row.ticker.includes(normalizedQuery) &&
        !(row.sector ?? "").toUpperCase().includes(normalizedQuery)
      ) {
        return false;
      }
      if (sector !== "all" && (row.sector?.trim() || "Unclassified") !== sector) return false;
      if (row.c78q_post < minimumPosterior) return false;
      if (returnFilter === "available" && !row.return_engine_available) return false;
      if (returnFilter === "unavailable" && row.return_engine_available) return false;
      if (top8Only && row.c78q_top8 !== 1) return false;
      return true;
    });
    return sortRows(rows, sort, livePrices);
  }, [livePrices, minimumPosterior, payload, query, returnFilter, sector, sort, top8Only]);

  function updateSort(key: SortKey) {
    setSort((current) =>
      current.key === key
        ? { key, direction: current.direction === "asc" ? "desc" : "asc" }
        : {
            key,
            direction: ["rank", "ticker", "sector"].includes(key) ? "asc" : "desc",
          },
    );
    setVisible(PAGE_SIZE);
  }

  function resetControls() {
    setQuery("");
    setSector("all");
    setMinimumPosterior(0);
    setReturnFilter("all");
    setTop8Only(false);
    setSort({ key: "rank", direction: "asc" });
    setVisible(PAGE_SIZE);
  }

  if (loadError !== null) {
    return (
      <section className={styles.state} role="alert">
        <strong>Prolepsis artifact unavailable.</strong>
        <span>{loadError}</span>
      </section>
    );
  }

  if (payload === null) {
    return (
      <section className={styles.state} role="status">
        <strong>Loading the full classifier universe…</strong>
      </section>
    );
  }

  const coverage = payload.prolepsis_coverage;
  const liveCount = Object.keys(livePrices).length;

  return (
    <div className={styles.page}>
      <section className={styles.hero}>
        <p className={styles.eyebrow}>PROLEPSIS / 12-MONTH CLASSIFIER POSTERIOR</p>
        <div>
          <h1>
            P(beat), <em>without the eight-name collapse.</em>
          </h1>
          <p>
            The classifier defines the row universe. Return forecasts are joined separately, and
            price provenance remains visible at every fallback.
          </p>
        </div>
        <dl>
          <div>
            <dt>Classifier rows</dt>
            <dd>{coverage.eligible_classifier_rows.toLocaleString("en-US")}</dd>
          </div>
          <div>
            <dt>Populated P(beat)</dt>
            <dd>{coverage.populated_posterior_rows.toLocaleString("en-US")}</dd>
          </div>
          <div>
            <dt>Return forecasts</dt>
            <dd>{coverage.return_engine_covered_rows.toLocaleString("en-US")}</dd>
          </div>
          <div>
            <dt>Return unavailable</dt>
            <dd>{coverage.return_engine_unavailable_rows.toLocaleString("en-US")}</dd>
          </div>
          <div>
            <dt>Target basket</dt>
            <dd>{coverage.target_basket_rows}</dd>
          </div>
        </dl>
      </section>

      <section className={styles.contract} aria-label="Prolepsis contract">
        <strong>P(beat)</strong>
        <span>{coverage.contract.p_beat_definition}</span>
        <strong>Forecast targets</strong>
        <span>{coverage.contract.return_target_definition}</span>
        <strong>Target basket</strong>
        <span>{coverage.contract.target_basket_role}</span>
      </section>

      <section className={styles.controls} aria-labelledby="prolepsis-controls">
        <div className={styles.controlHeading}>
          <div>
            <p className={styles.eyebrow}>FILTER / SORT / VERIFY</p>
            <h2 id="prolepsis-controls">Interrogate the complete posterior universe</h2>
          </div>
          <button type="button" onClick={resetControls}>
            Reset controls
          </button>
        </div>
        <form onSubmit={(event) => event.preventDefault()} className={styles.controlGrid}>
          <label>
            <span>Search ticker or sector</span>
            <input
              type="search"
              value={query}
              placeholder="Try NVDA or Healthcare"
              onChange={(event) => {
                setQuery(event.target.value);
                setVisible(PAGE_SIZE);
              }}
            />
          </label>
          <label>
            <span>Sector</span>
            <select
              value={sector}
              onChange={(event) => {
                setSector(event.target.value);
                setVisible(PAGE_SIZE);
              }}
            >
              <option value="all">All sectors</option>
              {sectors.map((value) => (
                <option value={value} key={value}>
                  {value}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Minimum P(beat): {(minimumPosterior * 100).toFixed(0)}%</span>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={minimumPosterior}
              onChange={(event) => {
                setMinimumPosterior(Number.parseFloat(event.target.value));
                setVisible(PAGE_SIZE);
              }}
            />
          </label>
          <label>
            <span>Return-engine status</span>
            <select
              value={returnFilter}
              onChange={(event) => {
                setReturnFilter(event.target.value as ReturnFilter);
                setVisible(PAGE_SIZE);
              }}
            >
              <option value="all">All classifier rows</option>
              <option value="available">Forecast available</option>
              <option value="unavailable">Forecast unavailable</option>
            </select>
          </label>
          <label className={styles.check}>
            <input
              type="checkbox"
              checked={top8Only}
              onChange={(event) => {
                setTop8Only(event.target.checked);
                setVisible(PAGE_SIZE);
              }}
            />
            <span>Target basket only</span>
          </label>
        </form>
      </section>

      <section className={styles.results} aria-labelledby="prolepsis-results">
        <div className={styles.resultsHeading}>
          <div>
            <p className={styles.eyebrow}>MATCHING ROWS</p>
            <h2 id="prolepsis-results">{filteredRows.length.toLocaleString("en-US")} securities</h2>
          </div>
          <div className={styles.quoteStatus} role="status" aria-live="polite" aria-atomic="true">
            <strong>
              {liveStatus === "loading"
                ? "Loading live quotes"
                : liveStatus === "available"
                  ? `${liveCount} live prices`
                  : "Live quotes unavailable"}
            </strong>
            <span>
              {liveStatus === "available"
                ? `Top-${LIVE_QUOTE_LIMIT} candidate overlay · ${timestamp(liveGeneratedAt)}`
                : "As-of prices remain visible; model rows are never removed by quote failure."}
            </span>
          </div>
        </div>

        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <caption className={styles.srOnly}>
              Sortable full-universe Prolepsis classifier and return-forecast table
            </caption>
            <thead>
              <tr>
                <th scope="col">
                  <SortButton label="Rank" sortKey="rank" active={sort} onChange={updateSort} />
                </th>
                <th scope="col">
                  <SortButton
                    label="Security"
                    sortKey="ticker"
                    active={sort}
                    onChange={updateSort}
                  />
                </th>
                <th scope="col">
                  <SortButton label="Sector" sortKey="sector" active={sort} onChange={updateSort} />
                </th>
                <th scope="col">
                  <SortButton
                    label="P(beat)"
                    sortKey="posterior"
                    active={sort}
                    onChange={updateSort}
                  />
                </th>
                <th scope="col">
                  <SortButton label="Price" sortKey="price" active={sort} onChange={updateSort} />
                </th>
                <th scope="col">Price source</th>
                <th scope="col">
                  <SortButton
                    label="12m forecast"
                    sortKey="pred12m"
                    active={sort}
                    onChange={updateSort}
                  />
                </th>
                <th scope="col">
                  <SortButton
                    label="12m target"
                    sortKey="target12m"
                    active={sort}
                    onChange={updateSort}
                  />
                </th>
                <th scope="col">
                  <SortButton
                    label="Return status"
                    sortKey="returnAvailability"
                    active={sort}
                    onChange={updateSort}
                  />
                </th>
                <th scope="col">Basket</th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.slice(0, visible).map((row) => {
                const livePrice = livePrices[row.ticker];
                const displayedPrice = livePrice ?? row.current_price;
                const priceSource = livePrice === undefined ? row.price_source : "live";
                return (
                  <tr key={row.ticker}>
                    <td className={styles.number}>{row.c78q_rank.toLocaleString("en-US")}</td>
                    <td>
                      <strong>{row.ticker}</strong>
                    </td>
                    <td>{row.sector?.trim() || "Unclassified"}</td>
                    <td className={styles.number}>{percent(row.c78q_post, 1)}</td>
                    <td className={styles.number}>{money(displayedPrice)}</td>
                    <td>
                      <span className={`${styles.sourceBadge} ${styles[`source_${priceSource}`]}`}>
                        {priceSource}
                      </span>
                      <small>
                        {priceSource === "live"
                          ? timestamp(liveGeneratedAt)
                          : priceSource === "as_of"
                            ? row.price_as_of
                            : "No price"}
                      </small>
                    </td>
                    <td className={styles.number}>{percent(row.pred_12m, 1)}</td>
                    <td className={styles.number}>{money(row.target_12m)}</td>
                    <td>
                      {row.return_engine_available ? (
                        <span className={styles.available}>Available</span>
                      ) : (
                        <span className={styles.unavailable}>
                          {row.return_engine_unavailable_reason ?? "Unavailable"}
                        </span>
                      )}
                    </td>
                    <td>{row.c78q_top8 === 1 ? <strong>Top 8</strong> : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {visible < filteredRows.length ? (
          <button
            type="button"
            className={styles.more}
            onClick={() => setVisible((current) => current + PAGE_SIZE)}
          >
            Show 100 more
          </button>
        ) : null}
      </section>

      <footer className={styles.footer}>
        <span>Effective date: {payload.effective_date}</span>
        <span>Artifact generated: {timestamp(payload.generated_at)}</span>
        <span>Live quote failure never changes classifier coverage.</span>
      </footer>
    </div>
  );
}
