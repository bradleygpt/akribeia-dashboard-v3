"use client";

// Total-basket KPI hero + per-sleeve summary metrics table, ported from the
// approved V2 StrategiesTab.tsx (basket hero: lines 200-214; rows: SummaryRow)
// and adapted to the governed 5-sleeve roster: Katalepsis / Auxo / Statera /
// Pronoia / Kairos (Kairos replaced the retired Aristeia on 2026-08-11 and is
// paper-labeled via the data layer, never hardcoded).
//
// The schedule is authoritative from the rebalance-schedule reference (a port
// of src/lib/schedule.ts); a sleeve missing there (Kairos in the pinned
// snapshot) falls back to its own strategy JSON's schedule block, then to the
// status map — never to a mixed display slot. Book type resolves via
// resolveBookType (status map -> strategy JSON -> paper).

import { useEffect, useState } from "react";
import { strategyFactorLabel } from "./strategy-status";
import { loadReference, useReference } from "./reference-client";
import {
  resolveBookType,
  type BookType,
  type StratStatus,
  type StratStatusMap,
} from "./strategy-books";
import { useRebalanceSchedule, type SleeveSchedule } from "./strategy-schedule";
import { BookTypePill } from "./book-type-pill";
import styles from "./strategies-viz.module.css";

type Kind = "quant" | "c78q";
interface StratDef {
  key: string;
  label: string;
  dataset: string;
  kind: Kind;
}

// The governed active five. LIVE vs PAPER is NOT declared here — it comes
// from the data layer (system_status.strategies / each strategy JSON's
// book_type). Retired sleeves (Aristeia, Prosodos) have no dataset and are
// never fetched.
const STRATS: StratDef[] = [
  { key: "katalepsis", label: "Katalepsis", dataset: "c78q", kind: "c78q" },
  { key: "auxo", label: "Auxo", dataset: "auxo-strategy", kind: "quant" },
  { key: "statera", label: "Statera", dataset: "statera-strategy", kind: "quant" },
  { key: "pronoia", label: "Pronoia", dataset: "pronoia-strategy", kind: "quant" },
  { key: "kairos", label: "Kairos", dataset: "kairos-strategy", kind: "quant" },
];

interface Row {
  def: StratDef;
  engine: string;
  cagr: number;
  sharpe: number;
  maxdd: number;
  spy: number;
  tickers: string[];
  next: string;
  bookType: BookType;
  asOf?: string;
  nextModel?: string;
  nextBookType?: BookType;
  goLive?: string | null;
  goLivePending?: boolean;
}

// The schedule is authoritative (V2: system_status folds in
// rebalance_schedule.json). Artifact fields are a fallback only — mixing them
// is what once put two scheduling models in one display slot.
function schedOf(
  sc: SleeveSchedule | undefined,
  st: StratStatus | undefined,
  fallback?: string | null,
) {
  return {
    next: sc?.next_rebalance ?? st?.next_rebalance ?? fallback ?? "—",
    nextModel: sc?.model_label ?? st?.rebalance_model_label,
    nextBookType: sc?.rebalance_book_type ?? st?.rebalance_book_type,
    goLive: sc?.go_live ?? st?.go_live,
    goLivePending: sc?.go_live_pending ?? st?.go_live_pending,
  };
}

/* eslint-disable @typescript-eslint/no-explicit-any -- pinned V2 payloads are
   schemaless JSON; the V2 SummaryRow reads them defensively field by field. */
function summaryRow(
  d: any,
  def: StratDef,
  statusEntry: StratStatus | undefined,
  sched: SleeveSchedule | undefined,
): Row {
  if (def.kind === "c78q") {
    const bt = d.metrics?.backtest ?? {};
    const tickers = (d.target?.rows ?? []).map((r: any) => r.ticker);
    return {
      def,
      engine: def.label,
      cagr: (bt.net_cagr ?? NaN) * 100,
      sharpe: bt.sharpe ?? NaN,
      maxdd: (bt.max_drawdown ?? NaN) * 100,
      spy: (bt.spy_cagr ?? NaN) * 100,
      tickers,
      ...schedOf(sched, statusEntry, d.state?.next_rebalance),
      bookType: resolveBookType(statusEntry, d.target?.book_type),
      asOf: statusEntry?.as_of ?? d.target?.as_of,
    };
  }
  const m = d.metrics?.in_sample ?? {};
  const ch = d.current_holdings;
  const tickers: string[] = Array.isArray(ch?.tickers)
    ? ch.tickers
    : Array.isArray(ch) && typeof ch[0] === "string"
      ? ch
      : d.holdings
        ? ([...d.holdings].sort((a: any, b: any) => b.date.localeCompare(a.date))[0]?.tickers ?? [])
        : [];
  return {
    def,
    engine: d.engine ?? def.label,
    cagr: m.cagr ?? NaN,
    sharpe: m.sharpe ?? NaN,
    maxdd: m.max_dd ?? NaN,
    spy: d.metrics?.spy_cagr ?? NaN,
    tickers,
    ...schedOf(sched, statusEntry, d.next_rebalance),
    bookType: resolveBookType(statusEntry, ch?.book_type),
    asOf: statusEntry?.as_of ?? ch?.as_of,
  };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

interface Basket {
  full: { cagr: number; sharpe: number; max_dd: number };
  deployable: { cagr: number; sharpe: number; max_dd: number };
  spy_cagr: number;
  n: number;
}

export function TotalBasketHero() {
  const basket = useReference<Basket>("basket-summary");
  return (
    <section className="parity-section" aria-labelledby="basket-heading">
      <div className="research-subheading">
        <div>
          <p className="mono-label">TOTAL BASKET / EQUAL-WEIGHT POOLED</p>
          <h2 id="basket-heading">Consolidated basket record</h2>
        </div>
        <span>Backtest research record, not a forward guarantee</span>
      </div>
      {basket === null ? (
        <p className={styles.refLoading} role="status">
          Loading the pinned basket summary…
        </p>
      ) : basket === "unavailable" ? (
        <p className={styles.refUnavailable} role="status">
          Basket summary reference unavailable. No substitute data is shown.
        </p>
      ) : (
        <div className={styles.basketHero}>
          <div>
            <div className={styles.basketTitle}>
              ▣ Total basket — all {basket.n} strategies, equal-weight pooled
            </div>
            <div className={styles.basketNote}>
              The consolidated book (2011–2026 backtest). Deployable = excluding &gt;10% SPY
              drawdowns (PPI takes the book to cash there).
            </div>
          </div>
          <div className={styles.basketKpis}>
            <div>
              <div className={styles.kpiLabel}>Basket CAGR</div>
              <div className={`${styles.kpiValue} ${styles.kpiPos}`}>
                {basket.full.cagr.toFixed(1)}%
              </div>
              <div className={styles.kpiSub}>vs SPY {basket.spy_cagr.toFixed(1)}%</div>
            </div>
            <div>
              <div className={styles.kpiLabel}>Sharpe</div>
              <div className={styles.kpiValue}>{basket.full.sharpe.toFixed(2)}</div>
              <div className={styles.kpiSub}>{basket.deployable.sharpe.toFixed(2)} deployable</div>
            </div>
            <div>
              <div className={styles.kpiLabel}>Max DD</div>
              <div className={`${styles.kpiValue} ${styles.kpiNeg}`}>
                {basket.full.max_dd.toFixed(1)}%
              </div>
              <div className={styles.kpiSub}>true daily</div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

export function StrategySummaryTable({ statusMap }: { statusMap: StratStatusMap }) {
  const [rows, setRows] = useState<Row[] | null | "unavailable">(null);
  const schedMap = useRebalanceSchedule();

  useEffect(() => {
    let mounted = true;
    Promise.all(
      STRATS.map(async (def) => {
        const d = await loadReference<Record<string, unknown>>(def.dataset);
        if (!d) return null;
        // rebalance-schedule reference first; the sleeve's own schedule block
        // is the fallback when the pinned schedule artifact predates it.
        const sched =
          schedMap[def.key] ?? (d as { schedule?: SleeveSchedule }).schedule ?? undefined;
        return summaryRow(d, def, statusMap[def.key], sched);
      }),
    ).then((rs) => {
      if (!mounted) return;
      const kept = rs.filter((r): r is Row => r !== null);
      setRows(kept.length ? kept : "unavailable");
    });
    return () => {
      mounted = false;
    };
  }, [statusMap, schedMap]);

  const scouts = Object.entries(statusMap)
    .filter(([, v]) => (v.status ?? "").includes("research-scout"))
    .map(([k]) => k.charAt(0).toUpperCase() + k.slice(1));

  return (
    <section className="parity-section" aria-labelledby="summary-heading">
      <div className="research-subheading">
        <div>
          <p className="mono-label">SUMMARY METRICS / PER SLEEVE</p>
          <h2 id="summary-heading">Strategy summary</h2>
        </div>
        <span>Backtest CAGRs are research records, not forward guarantees</span>
      </div>
      {rows === null ? (
        <p className={styles.refLoading} role="status">
          Loading the pinned strategy metrics…
        </p>
      ) : rows === "unavailable" ? (
        <p className={styles.refUnavailable} role="status">
          Strategy metric references unavailable. No substitute data is shown.
        </p>
      ) : (
        <>
          <div className="research-table-scroll">
            <table className={styles.summaryTable}>
              <thead>
                <tr>
                  <th scope="col" className={styles.thLeft}>
                    Strategy
                  </th>
                  <th scope="col" className={styles.thLeft}>
                    Book
                  </th>
                  <th scope="col">Backtest CAGR</th>
                  <th scope="col">vs SPY</th>
                  <th scope="col">Sharpe</th>
                  <th scope="col">Max DD</th>
                  <th scope="col" className={styles.thLeft}>
                    Current book
                  </th>
                  <th scope="col">Next rebalance</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const excess = r.cagr - r.spy;
                  const factor = strategyFactorLabel(r.def.label);
                  return (
                    <tr key={r.def.key}>
                      <td className={styles.tdLeft}>
                        <span className={styles.rowEngine}>{r.engine}</span>
                        {factor ? <span className={styles.rowFactor}>{factor}</span> : null}
                      </td>
                      <td className={styles.tdLeft}>
                        <BookTypePill bookType={r.bookType} asOf={r.asOf} />
                      </td>
                      <td className={styles.numStrong}>
                        {isNaN(r.cagr) ? "—" : `${r.cagr.toFixed(1)}%`}
                      </td>
                      <td
                        className={
                          isNaN(excess) ? undefined : excess >= 0 ? styles.numPos : styles.numNeg
                        }
                      >
                        {isNaN(excess) ? "—" : `${excess >= 0 ? "+" : ""}${excess.toFixed(1)}%`}
                      </td>
                      <td>{isNaN(r.sharpe) ? "—" : r.sharpe.toFixed(2)}</td>
                      <td className={styles.numNeg}>
                        {isNaN(r.maxdd) ? "—" : `${r.maxdd.toFixed(0)}%`}
                      </td>
                      <td className={styles.tdLeft}>
                        <div className={styles.chipRow}>
                          {r.tickers.slice(0, 8).map((t) => (
                            <span key={t} className={styles.tickerChip}>
                              {t}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className={styles.schedCell}>
                        <div className={styles.schedDate}>{r.next}</div>
                        {(r.nextModel || r.nextBookType) && (
                          <div className={styles.schedMeta}>
                            {r.nextModel}
                            {r.nextBookType && (
                              <span
                                className={r.nextBookType === "live" ? styles.numPos : undefined}
                              >
                                {" · "}
                                {r.nextBookType === "live" ? "live" : "paper"}
                              </span>
                            )}
                          </div>
                        )}
                        {r.goLivePending && r.goLive && (
                          <div className={styles.schedMeta}>go live {r.goLive}</div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className={styles.vizFootnote}>
            <span className={styles.liveTag}>● LIVE</span> = broker-confirmed positions;{" "}
            <span className={styles.paperTag}>◌ PAPER</span> = signal-derived research book, never
            held at a broker. Quant strategies rebalance every fixed hold-window; live sleeves
            rebalance the first trading day of each month.
            {scouts.length > 0 && (
              <>
                {" "}
                Research scouts (paper, holdings-redundant — excluded from the book):{" "}
                {scouts.join(" · ")}.
              </>
            )}
          </p>
        </>
      )}
    </section>
  );
}
