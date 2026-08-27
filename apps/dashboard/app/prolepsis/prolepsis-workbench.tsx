"use client";

// UI DECISIONS 2026-08-10 (Bradley): the 12-month model output is displayed ONLY as a
// percentile ranking ("12-Month ML Ranking") — see prolepsis-model.ts. No raw pred_12m
// percentages and no target_* price levels may be rendered anywhere on this page.

import { useEffect, useMemo, useState } from "react";
import {
  RANKING_EXPLAINER,
  derivePercentileRanks,
  fmtPercentile,
  streamBreakdown,
} from "./prolepsis-model";
import styles from "./prolepsis.module.css";

const PAGE_SIZE = 100;
const LIVE_QUOTE_LIMIT = 120;
const SCREENER_RENDER_CAP = 100;

type SortKey =
  "rank" | "ticker" | "sector" | "posterior" | "price" | "mlPercentile" | "returnAvailability";

type SortDirection = "asc" | "desc";
type ReturnFilter = "all" | "available" | "unavailable";
type SubTab = "overview" | "rankings" | "screener" | "detail";

interface ProlepsisRow {
  ticker: string;
  sector?: string | null;
  c78q_post: number;
  c78q_rank: number;
  current_price: number | null;
  /** return-space level — used ONLY to derive the percentile ranking, never rendered */
  pred_12m: number | null;
  n_streams_active: number | null;
  rsi14: number | null;
  rsi2: number | null;
  ret_5d: number | null;
  ret_21d: number | null;
  ret_63d: number | null;
  ret_252d: number | null;
  return_engine_available: boolean;
  return_engine_unavailable_reason: string | null;
  price_source: "as_of" | "unavailable";
  price_as_of: string | null;
  c78q_top8: number;
}

type RankedRow = ProlepsisRow & { pred_12m_rank: number | null };

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
  if (value === null) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: value >= 100 ? 0 : 2,
  }).format(value);
}

function percent(value: number | null, digits = 1): string {
  if (value === null) return "—";
  return `${(value * 100).toFixed(digits)}%`;
}

function signedPercent(value: number | null, digits = 1): string {
  if (value === null) return "—";
  return `${value >= 0 ? "+" : ""}${(value * 100).toFixed(digits)}%`;
}

function timestamp(value: string | null | undefined): string {
  if (!value) return "—";
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
  rows: RankedRow[],
  sort: SortState,
  livePrices: Record<string, number>,
): RankedRow[] {
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
      case "mlPercentile":
        return (
          compareNullable(left.pred_12m_rank, right.pred_12m_rank, direction) ||
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

function TickerLink({ ticker }: { ticker: string }) {
  return (
    <a
      className={styles.tickerLink}
      href={`/research/${encodeURIComponent(ticker)}`}
      title={`Open ${ticker} research detail`}
    >
      {ticker}
    </a>
  );
}

function PercentileCell({ rank }: { rank: number | null }) {
  if (rank === null) return <span className={styles.mute}>—</span>;
  const topDecile = rank >= 0.9;
  const bottomDecile = rank <= 0.1;
  return (
    <span title={RANKING_EXPLAINER}>
      <span
        className={`${styles.pctValue} ${
          topDecile ? styles.posText : bottomDecile ? styles.negText : ""
        }`}
      >
        {fmtPercentile(rank)}
      </span>
      <span className={styles.pctUnit}>pctile</span>
      {topDecile ? <span className={styles.pctBadge}>top decile</span> : null}
    </span>
  );
}

// P(beat) threshold coloring (V2): >= 0.6 positive, >= 0.4 warn, else muted.
function PosteriorCell({ post, digits = 1 }: { post: number | null; digits?: number }) {
  if (post === null) return <span className={styles.mute}>—</span>;
  const tone = post >= 0.6 ? styles.posText : post >= 0.4 ? styles.warnText : styles.mute;
  return <span className={`${styles.posterior} ${tone}`}>{percent(post, digits)}</span>;
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
  const [subTab, setSubTab] = useState<SubTab>("overview");

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

  // The percentile pool contains only rows the return engine actually covered —
  // rows flagged not_in_return_engine_artifact carry a null rank and never enter
  // rankings or screener percentiles.
  const rankedRows = useMemo<RankedRow[]>(
    () => (payload === null ? [] : derivePercentileRanks(payload.rows)),
    [payload],
  );

  const sectors = useMemo(
    () =>
      payload === null
        ? []
        : [...new Set(payload.rows.map((row) => row.sector?.trim() || "Unclassified"))].sort(
            (left, right) => left.localeCompare(right),
          ),
    [payload],
  );

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
  const subTabs: [SubTab, string][] = [
    ["overview", "Overview"],
    ["rankings", "Rankings"],
    ["screener", "Screener"],
    ["detail", "Stream Detail"],
  ];

  return (
    <div className={styles.page}>
      <section className={styles.hero}>
        <p className={styles.eyebrow}>PROLEPSIS / 12-MONTH ML RANKING</p>
        <div>
          <h1>
            Ranked, <em>never a price target.</em>
          </h1>
          <p>
            The 12-month score is a percentile ranking of relative attractiveness across the
            universe — not an expected return or price target. The ensemble's raw return outputs are
            mechanically conservative, so magnitudes carry no information; the cross-sectional
            ranking is the validated output. P(beat) is the separate binary classifier's probability
            of outperforming over 12 months.
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
            <dt>Return-engine coverage</dt>
            <dd>{coverage.return_engine_covered_rows.toLocaleString("en-US")}</dd>
          </div>
          <div>
            <dt>Coverage gaps</dt>
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
        <strong>12-month ranking</strong>
        <span>{RANKING_EXPLAINER}</span>
        <strong>Target basket</strong>
        <span>{coverage.contract.target_basket_role}</span>
      </section>

      <nav className={styles.subTabs} aria-label="Prolepsis views">
        {subTabs.map(([key, label]) => (
          <button
            type="button"
            key={key}
            className={styles.pill}
            aria-pressed={subTab === key}
            onClick={() => setSubTab(key)}
          >
            {label}
          </button>
        ))}
      </nav>

      {subTab === "overview" ? (
        <OverviewBlock
          coverage={coverage}
          rows={rankedRows}
          sectors={sectors}
          livePrices={livePrices}
          liveGeneratedAt={liveGeneratedAt}
          liveStatus={liveStatus}
        />
      ) : null}
      {subTab === "rankings" ? (
        <RankingsBlock
          rows={rankedRows}
          livePrices={livePrices}
          effectiveDate={payload.effective_date}
        />
      ) : null}
      {subTab === "screener" ? (
        <ScreenerBlock rows={rankedRows} sectors={sectors} livePrices={livePrices} />
      ) : null}
      {subTab === "detail" ? <DetailBlock rows={rankedRows} livePrices={livePrices} /> : null}

      <footer className={styles.footer}>
        <span>Effective date: {payload.effective_date}</span>
        <span>Artifact generated: {timestamp(payload.generated_at)}</span>
        <span>Live quote failure never changes classifier coverage.</span>
      </footer>
    </div>
  );
}

// ── Overview: the full sortable classifier universe ──────────────────────────
function OverviewBlock({
  coverage,
  rows,
  sectors,
  livePrices,
  liveGeneratedAt,
  liveStatus,
}: {
  coverage: Coverage;
  rows: RankedRow[];
  sectors: string[];
  livePrices: Record<string, number>;
  liveGeneratedAt: string | null;
  liveStatus: "loading" | "available" | "unavailable";
}) {
  const [query, setQuery] = useState("");
  const [sector, setSector] = useState("all");
  const [minimumPosterior, setMinimumPosterior] = useState(0);
  const [returnFilter, setReturnFilter] = useState<ReturnFilter>("all");
  const [top8Only, setTop8Only] = useState(false);
  const [sort, setSort] = useState<SortState>({ key: "rank", direction: "asc" });
  const [visible, setVisible] = useState(PAGE_SIZE);

  const filteredRows = useMemo(() => {
    const normalizedQuery = query.trim().toUpperCase();
    const matches = rows.filter((row) => {
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
    return sortRows(matches, sort, livePrices);
  }, [livePrices, minimumPosterior, query, returnFilter, rows, sector, sort, top8Only]);

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

  const liveCount = Object.keys(livePrices).length;

  return (
    <>
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
              <option value="available">Return engine covered</option>
              <option value="unavailable">Return engine uncovered</option>
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

        <p className={styles.noteLine}>
          {coverage.return_engine_covered_rows.toLocaleString("en-US")} of{" "}
          {coverage.total_prolepsis_rows.toLocaleString("en-US")} names carry return-engine
          coverage; the rest are listed for completeness and are excluded from percentile rankings.
        </p>

        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <caption className={styles.srOnly}>
              Sortable full-universe Prolepsis classifier and 12-month ML ranking table
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
                <th scope="col" title={RANKING_EXPLAINER}>
                  <SortButton
                    label="ML percentile (12mo)"
                    sortKey="mlPercentile"
                    active={sort}
                    onChange={updateSort}
                  />
                </th>
                <th scope="col">
                  <SortButton
                    label="Return engine"
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
                      <TickerLink ticker={row.ticker} />
                    </td>
                    <td>{row.sector?.trim() || "Unclassified"}</td>
                    <td className={styles.number}>
                      <PosteriorCell post={row.c78q_post} />
                    </td>
                    <td className={styles.number}>{money(displayedPrice)}</td>
                    <td>
                      {priceSource === "unavailable" ? (
                        <span className={styles.mute}>—</span>
                      ) : (
                        <>
                          <span
                            className={`${styles.sourceBadge} ${styles[`source_${priceSource}`]}`}
                          >
                            {priceSource}
                          </span>
                          <small>
                            {priceSource === "live" ? timestamp(liveGeneratedAt) : row.price_as_of}
                          </small>
                        </>
                      )}
                    </td>
                    <td>
                      <PercentileCell rank={row.pred_12m_rank} />
                    </td>
                    <td>
                      {row.return_engine_available ? (
                        <span className={styles.available}>Covered</span>
                      ) : (
                        <span
                          className={styles.mute}
                          title={row.return_engine_unavailable_reason ?? "not covered"}
                        >
                          —
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
    </>
  );
}

// ── Shared compact ranking table (Rankings + Screener) ───────────────────────
function PredTable({
  rows,
  livePrices,
  startRank = 1,
}: {
  rows: RankedRow[];
  livePrices: Record<string, number>;
  startRank?: number;
}) {
  if (!rows.length) return <p className={styles.mute}>No rows.</p>;
  return (
    <div className={styles.miniTableWrap}>
      <table className={styles.miniTable}>
        <thead>
          <tr>
            <th scope="col">#</th>
            <th scope="col">Ticker</th>
            <th scope="col">Sector</th>
            <th scope="col">Price</th>
            <th scope="col" title={RANKING_EXPLAINER}>
              ML percentile (12mo)
            </th>
            <th scope="col">P(beat)</th>
            <th scope="col">RSI14</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => {
            const livePrice = livePrices[row.ticker];
            const displayedPrice = livePrice ?? row.current_price;
            return (
              <tr key={row.ticker}>
                <td className={styles.number}>{startRank + index}</td>
                <td>
                  <TickerLink ticker={row.ticker} />
                </td>
                <td>{row.sector?.trim() || "Unclassified"}</td>
                <td className={styles.number}>
                  {money(displayedPrice)}
                  {displayedPrice !== null ? (
                    <span className={styles.priceTag}>
                      {livePrice !== undefined ? "live" : "asof"}
                    </span>
                  ) : null}
                </td>
                <td>
                  <PercentileCell rank={row.pred_12m_rank} />
                </td>
                <td className={styles.number}>
                  <PosteriorCell post={row.c78q_post} digits={0} />
                </td>
                <td className={styles.number}>{row.rsi14 !== null ? row.rsi14.toFixed(0) : "—"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ── Rankings: top/bottom of the 12-month percentile ranking ──────────────────
function RankingsBlock({
  rows,
  livePrices,
  effectiveDate,
}: {
  rows: RankedRow[];
  livePrices: Record<string, number>;
  effectiveDate: string;
}) {
  const [count, setCount] = useState(25);

  const ranked = useMemo(() => {
    const valid = rows.filter((row) => row.pred_12m_rank !== null);
    return [...valid].sort((left, right) => right.pred_12m_rank! - left.pred_12m_rank!);
  }, [rows]);

  const top = ranked.slice(0, count);
  const bottom = ranked.slice(-count).reverse();

  return (
    <section className={styles.results} aria-label="12-month ML rankings">
      <div className={styles.toggleRow}>
        <span className={styles.mute}>Show:</span>
        {[10, 25, 50].map((value) => (
          <button
            type="button"
            key={value}
            className={styles.pill}
            aria-pressed={count === value}
            onClick={() => setCount(value)}
          >
            {value}
          </button>
        ))}
      </div>

      <div className={styles.card}>
        <h3>Top {count} — 12-Month ML Ranking</h3>
        <p className={styles.cardSub}>
          Highest-ranked names as of {effectiveDate}. {RANKING_EXPLAINER}
        </p>
        <PredTable rows={top} livePrices={livePrices} />
      </div>

      <div className={styles.card}>
        <h3>Bottom {count} — 12-Month ML Ranking</h3>
        <p className={styles.cardSub}>Lowest-ranked names in the universe.</p>
        <PredTable rows={bottom} livePrices={livePrices} />
      </div>
    </section>
  );
}

// ── Screener: filter by sector + minimum percentile ──────────────────────────
function ScreenerBlock({
  rows,
  sectors,
  livePrices,
}: {
  rows: RankedRow[];
  sectors: string[];
  livePrices: Record<string, number>;
}) {
  const [sector, setSector] = useState("All");
  const [minPct, setMinPct] = useState(50);

  const filtered = useMemo(() => {
    return rows
      .filter((row) => row.pred_12m_rank !== null)
      .filter((row) => sector === "All" || (row.sector?.trim() || "Unclassified") === sector)
      .filter((row) => row.pred_12m_rank! * 100 >= minPct)
      .sort((left, right) => right.pred_12m_rank! - left.pred_12m_rank!);
  }, [minPct, rows, sector]);

  return (
    <section className={styles.results} aria-label="Ranking screener">
      <div className={styles.card}>
        <h3>Ranking Screener</h3>
        <p className={styles.cardSub}>
          Filter the return-engine-covered universe by sector and minimum 12-month ML percentile.{" "}
          {RANKING_EXPLAINER}
        </p>
        <div className={styles.screenerBar}>
          <label className={styles.lightControl}>
            <span>Sector</span>
            <select value={sector} onChange={(event) => setSector(event.target.value)}>
              <option value="All">All</option>
              {sectors.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </label>
          <label className={styles.lightControl}>
            <span>Min percentile: {minPct}</span>
            <input
              type="range"
              min="0"
              max="99"
              step="1"
              value={minPct}
              onChange={(event) => setMinPct(Number.parseInt(event.target.value, 10))}
            />
          </label>
          <div className={styles.matchMetric}>
            <span>Matches</span>
            <strong>{filtered.length.toLocaleString("en-US")}</strong>
          </div>
        </div>
      </div>

      <div className={styles.card}>
        <h3>{filtered.length.toLocaleString("en-US")} matches</h3>
        <p className={styles.cardSub}>
          {sector} · 12-month ML percentile ≥ {minPct}
        </p>
        <PredTable rows={filtered.slice(0, SCREENER_RENDER_CAP)} livePrices={livePrices} />
        {filtered.length > SCREENER_RENDER_CAP ? (
          <p className={styles.mute}>
            Showing top {SCREENER_RENDER_CAP} of {filtered.length.toLocaleString("en-US")}.
          </p>
        ) : null}
      </div>
    </section>
  );
}

// ── Stream Detail: per-ticker stream breakdown ───────────────────────────────
function DetailBlock({
  rows,
  livePrices,
}: {
  rows: RankedRow[];
  livePrices: Record<string, number>;
}) {
  const [ticker, setTicker] = useState(
    () => rows.find((row) => row.pred_12m_rank !== null)?.ticker ?? rows[0]?.ticker ?? "",
  );
  const row = useMemo(() => rows.find((candidate) => candidate.ticker === ticker), [rows, ticker]);

  const streamRows = useMemo(
    () => (row === undefined ? [] : streamBreakdown(row as unknown as Record<string, unknown>)),
    [row],
  );

  const displayedPrice = row === undefined ? null : (livePrices[row.ticker] ?? row.current_price);

  return (
    <section className={styles.results} aria-label="Per-stream breakdown">
      <div className={styles.card}>
        <h3>Per-Stream Breakdown</h3>
        <p className={styles.cardSub}>
          Each active stream's z-scored signal and its calibrated 12-month output. Stream outputs
          are model-internal diagnostics (return-space units, mechanically compressed) — only the
          cross-sectional ranking they produce is meaningful.
        </p>

        <label className={`${styles.lightControl} ${styles.tickerPicker}`}>
          <span>Ticker</span>
          <input
            list="prolepsis-tickers"
            value={ticker}
            onChange={(event) => setTicker(event.target.value.toUpperCase())}
            placeholder="e.g. AAPL"
          />
          <datalist id="prolepsis-tickers">
            {rows.map((candidate) => (
              <option key={candidate.ticker} value={candidate.ticker} />
            ))}
          </datalist>
        </label>

        {row === undefined ? (
          <p className={styles.mute}>Ticker not in universe.</p>
        ) : (
          <>
            <dl className={styles.tiles}>
              <div className={styles.tile}>
                <dt>Price</dt>
                <dd>{money(displayedPrice)}</dd>
              </div>
              <div className={styles.tile}>
                <dt>ML percentile (12mo)</dt>
                <dd>
                  <PercentileCell rank={row.pred_12m_rank} />
                  <small>relative ranking, not expected return</small>
                </dd>
              </div>
              <div className={styles.tile}>
                <dt>P(beat, 12m)</dt>
                <dd>
                  <PosteriorCell post={row.c78q_post} />
                  <small>rank {row.c78q_rank.toLocaleString("en-US")}</small>
                </dd>
              </div>
              <div className={styles.tile}>
                <dt>Streams active</dt>
                <dd>{row.n_streams_active !== null ? Math.round(row.n_streams_active) : "—"}</dd>
              </div>
              <div className={styles.tile}>
                <dt>RSI14</dt>
                <dd>{row.rsi14 !== null ? row.rsi14.toFixed(0) : "—"}</dd>
              </div>
              <div className={styles.tile}>
                <dt>RSI2</dt>
                <dd>{row.rsi2 !== null ? row.rsi2.toFixed(0) : "—"}</dd>
              </div>
            </dl>

            {streamRows.length === 0 ? (
              <p className={styles.mute}>
                No stream diagnostics for this name — it is outside the return-engine artifact.
              </p>
            ) : (
              <div className={styles.miniTableWrap}>
                <table className={styles.miniTable}>
                  <thead>
                    <tr>
                      <th scope="col">Stream</th>
                      <th scope="col">Signal (z)</th>
                      <th scope="col">Stream 12M (model units)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {streamRows.map((stream) => (
                      <tr key={stream.stream}>
                        <td className={styles.streamId}>{stream.stream}</td>
                        <td
                          className={`${styles.number} ${
                            stream.signal >= 0 ? styles.posText : styles.negText
                          }`}
                        >
                          {stream.signal.toFixed(3)}
                        </td>
                        <td
                          className={`${styles.number} ${
                            stream.p12m >= 0 ? styles.posText : styles.negText
                          }`}
                        >
                          {signedPercent(stream.p12m)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <dl className={`${styles.tiles} ${styles.tilesFour}`}>
              <div className={styles.tile}>
                <dt>5d return</dt>
                <dd>{signedPercent(row.ret_5d)}</dd>
              </div>
              <div className={styles.tile}>
                <dt>21d return</dt>
                <dd>{signedPercent(row.ret_21d)}</dd>
              </div>
              <div className={styles.tile}>
                <dt>63d return</dt>
                <dd>{signedPercent(row.ret_63d)}</dd>
              </div>
              <div className={styles.tile}>
                <dt>252d return</dt>
                <dd>{signedPercent(row.ret_252d)}</dd>
              </div>
            </dl>
          </>
        )}
      </div>
    </section>
  );
}
