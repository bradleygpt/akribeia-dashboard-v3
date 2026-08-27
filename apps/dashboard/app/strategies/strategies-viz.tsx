"use client";

// The approved V2 strategies visuals (quant-dashboard-pro-v2
// src/tabs/StrategiesViz.tsx), adapted to the V3 governed 5-sleeve roster
// (Katalepsis / Auxo / Statera / Pronoia / Kairos — Kairos holds the retired
// Aristeia's slot) and the V3 reference API.
//
// Worker-safety (the PortalLanding pattern): every dataset is fetched
// client-side; the initial SSR pass renders loading placeholders only. The
// recharts modules (hub line chart, treemap) are code-split behind
// React.lazy and only ever render AFTER a client fetch resolves, so the
// Worker never evaluates recharts. Canvas work (force network) runs only
// inside effects, which never execute during SSR.
//
// Failure behavior: each card degrades to an explicit "reference
// unavailable" state — never crashes, never fabricates.

import { Suspense, lazy, useEffect, useMemo, useRef, useState } from "react";
import RegimeRibbon from "./regime-ribbon";
import { BookTypePill } from "./book-type-pill";
import { resolveBookType, type BookType, type StratStatusMap } from "./strategy-books";
import { isRetiredStrategyName } from "./strategy-status";
import { loadReference, useReference } from "./reference-client";
import { DIVERGING, INK, LINE, SEM, alpha, entityColor } from "./strategy-theme";
import type { HubRow, HubSeriesDef } from "./strategies-hub-chart";
import type { TreemapGroup } from "./holdings-treemap-chart";
import styles from "./strategies-viz.module.css";

const HubChart = lazy(() => import("./strategies-hub-chart"));
const TreemapChart = lazy(() => import("./holdings-treemap-chart"));

function bookTypeOf(
  slug: string,
  statusMap: StratStatusMap | undefined,
  jsonBookType?: unknown,
): BookType {
  return resolveBookType(statusMap?.[slug], jsonBookType);
}

// ── shared card chrome (V3 research aesthetic) ───────────────────────────────

function VizSection({
  eyebrow,
  title,
  note,
  children,
}: {
  eyebrow: string;
  title: string;
  note?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="parity-section">
      <div className="research-subheading">
        <div>
          <p className="mono-label">{eyebrow}</p>
          <h2>{title}</h2>
        </div>
        {note ? <span>{note}</span> : null}
      </div>
      {children}
    </section>
  );
}

function RefNote({ state, label }: { state: "loading" | "unavailable"; label: string }) {
  return (
    <p className={state === "loading" ? styles.refLoading : styles.refUnavailable} role="status">
      {state === "loading"
        ? `Loading the pinned ${label} reference…`
        : `${label} reference unavailable. No substitute data is shown.`}
    </p>
  );
}

const chartLoading = <div className={styles.refLoading}>Preparing chart…</div>;

// ───────────────────────── Holdings TreeMap ─────────────────────────
type Hold = {
  ticker: string;
  name?: string | null;
  daily: number | null;
  rebalance: number | null;
  alltime: number | null;
};
type PerfStrat = {
  slug: string;
  label: string;
  color?: string;
  entry?: string;
  book_type?: BookType;
  holdings: Hold[];
};
type Perf = { generated_at?: string; as_of?: string; strategies: PerfStrat[] };
type Period = "daily" | "rebalance" | "alltime";

// period-aware colour: small moves still need to read, so caps are tight + the alpha floor is high
const CAP: Record<Period, number> = { daily: 3, rebalance: 7, alltime: 80 };
function gainColor(g: number | null, period: Period): string {
  if (g == null) return LINE.strong;
  let a: number;
  if (period === "alltime")
    a = Math.min(1, Math.log10(1 + Math.abs(g)) / Math.log10(1 + CAP.alltime));
  else a = Math.min(1, Math.abs(g) / CAP[period]);
  a = 0.5 + 0.45 * a; // bright floor so a ±1% move is still clearly green/red
  return g >= 0 ? alpha(SEM.pos, a) : alpha(SEM.neg, a);
}
const fmtGain = (g: number | null) =>
  g == null
    ? "—"
    : `${g >= 0 ? "+" : ""}${Math.abs(g) >= 1000 ? g.toLocaleString(undefined, { maximumFractionDigits: 0 }) : g}%`;

function HoldingsTreemap({ statusMap }: { statusMap?: StratStatusMap }) {
  const perf = useReference<Perf>("strategies-holdings-performance");
  const [period, setPeriod] = useState<Period>("rebalance");
  const data = useMemo<TreemapGroup[]>(() => {
    if (perf === null || perf === "unavailable" || !Array.isArray(perf.strategies)) return [];
    // Retired sleeves in a stale pinned snapshot never present as active books.
    return perf.strategies
      .filter((s) => !isRetiredStrategyName(s.label))
      .map((s) => {
        const bt = bookTypeOf(s.slug, statusMap, s.book_type);
        return {
          name: bt === "paper" ? `${s.label} · PAPER` : `${s.label} · LIVE`,
          stratColor: entityColor(s.slug),
          children: (s.holdings ?? []).map((h) => ({
            name: h.ticker,
            size: 1,
            fill: gainColor(h[period], period),
            label: fmtGain(h[period]),
            stratColor: entityColor(s.slug),
          })),
        };
      });
  }, [perf, period, statusMap]);

  return (
    <VizSection
      eyebrow="HOLDINGS PERFORMANCE MAP / PINNED V2 RECORDS"
      title="Holdings performance map"
      note={
        perf !== null && perf !== "unavailable" && perf.as_of ? `As of ${perf.as_of}` : undefined
      }
    >
      <p className={styles.vizSub}>
        Current book of each strategy, coloured by gain (green up / red down) — LIVE =
        broker-confirmed positions, PAPER = research book (never held at a broker).
      </p>
      {perf === null ? (
        <RefNote state="loading" label="holdings performance" />
      ) : perf === "unavailable" ? (
        <RefNote state="unavailable" label="Holdings performance" />
      ) : (
        <>
          <div className={styles.toggleRow}>
            {(["daily", "rebalance", "alltime"] as Period[]).map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setPeriod(p)}
                className={period === p ? `${styles.toggle} ${styles.toggleActive}` : styles.toggle}
              >
                {p === "daily" ? "Daily" : p === "rebalance" ? "Since rebalance" : "All-time"}
              </button>
            ))}
            <span className={styles.toggleNote}>
              {period === "daily"
                ? "1-day move"
                : period === "rebalance"
                  ? "since the current rebalance entry"
                  : "full-backtest price history (log-scaled colour)"}
            </span>
          </div>
          <div className={styles.darkPanel}>
            <Suspense fallback={chartLoading}>
              <TreemapChart data={data} />
            </Suspense>
          </div>
        </>
      )}
    </VizSection>
  );
}

// ─────────────────────── Correlation network (live force sim on canvas) ───────────────────────
type CorrNode = {
  t: string;
  x: number;
  y: number;
  s: string[];
  c: string;
  w: number;
  cur: boolean;
  shared: boolean;
  bspx: number | null;
  bndx: number | null;
};
type CorrEdge = { a: string; b: string; v: number };
type IndexRef = { id: string; label: string; color: string; median_beta: number | null };
type Corr = {
  window: string;
  note?: string;
  nodes: CorrNode[];
  edges: CorrEdge[];
  avg_abs_corr: number;
  n_nodes: number;
  n_edges: number;
  indices?: IndexRef[];
  strategy_avg_abs_corr: number;
  strategy_labels: Record<string, string>;
  strategy_colors?: Record<string, string>;
};

// mutable per-node sim state
type Sim = {
  t: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  c: string;
  cur: boolean;
  bspx: number;
  bndx: number;
};
type IdxBody = {
  id: string;
  label: string;
  color: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
};

function ForceNetwork({ d }: { d: Corr }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const hoverRef = useRef<string | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current,
      wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const H = 560;
    let W = wrap.clientWidth || 720;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    // faint starfield (normalized coords) — mirrors V2's deep-space backdrop
    const STARS = Array.from({ length: 120 }, () => ({
      x: Math.random(),
      y: Math.random(),
      r: Math.random() * 1.1 + 0.2,
      a: Math.random() * 0.45 + 0.12,
    }));
    const geo = () => {
      const cx = W / 2,
        cy = H / 2;
      return { cx, cy, R: Math.min(W, H) / 2 - 14 };
    };

    const idx = new Map<string, number>();
    d.nodes.forEach((n, i) => idx.set(n.t, i));
    // baked node colors carry the OLD per-strategy hues — remap them onto the entity tokens
    const entityOf = new Map(
      Object.entries(d.strategy_colors ?? {}).map(([slug, c]) => [
        c.toLowerCase(),
        entityColor(slug),
      ]),
    );
    const nodeColor = (c: string) => entityOf.get(c.toLowerCase()) ?? c;
    const R0 = Math.min(W, H) / 2 - 14;
    const start = (n: CorrNode) => ({ x: W / 2 + n.x * R0 * 0.92, y: H / 2 + n.y * R0 * 0.92 });
    const sim: Sim[] = d.nodes.map((n) => ({
      t: n.t,
      ...start(n),
      vx: 0,
      vy: 0,
      r: 2.6 + Math.min(5.5, Math.sqrt(n.w)),
      c: nodeColor(n.c),
      cur: n.cur,
      bspx: n.bspx ?? 1,
      bndx: n.bndx ?? 1,
    }));
    const edges = d.edges
      .map((e) => ({ i: idx.get(e.a), j: idx.get(e.b), v: e.v }))
      .filter((e): e is { i: number; j: number; v: number } => e.i != null && e.j != null);
    // S&P 500 + NASDAQ gravity wells — two heavy bodies the stocks gravitate toward by BETA
    // (high-beta names pulled close = systematic/"noise"; low-beta names drift to the rim = idiosyncratic).
    const idxBodies: IdxBody[] = (d.indices ?? []).map((ix, k) => ({
      id: ix.id,
      label: ix.label,
      color: ix.color,
      x: W / 2 + (k === 0 ? -0.42 : 0.42) * R0,
      y: H / 2 + (k === 0 ? -0.18 : 0.18) * R0,
      vx: 0,
      vy: 0,
    }));

    const resize = () => {
      W = wrap.clientWidth || 720;
      canvas.width = W * dpr;
      canvas.height = H * dpr;
      canvas.style.width = W + "px";
      canvas.style.height = H + "px";
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(wrap);

    let raf = 0,
      frame = 0;
    const CELL = 58;
    const step = () => {
      frame++;
      // spatial-grid repulsion (O(n))
      const grid = new Map<number, number[]>();
      const key = (cx: number, cy: number) => cx * 100000 + cy;
      for (let k = 0; k < sim.length; k++) {
        const cx = Math.floor(sim[k].x / CELL),
          cy = Math.floor(sim[k].y / CELL),
          kk = key(cx, cy);
        const cell = grid.get(kk);
        if (cell) cell.push(k);
        else grid.set(kk, [k]);
      }
      for (let k = 0; k < sim.length; k++) {
        const a = sim[k];
        let fx = 0,
          fy = 0;
        const cx = Math.floor(a.x / CELL),
          cy = Math.floor(a.y / CELL);
        for (let gx = cx - 1; gx <= cx + 1; gx++)
          for (let gy = cy - 1; gy <= cy + 1; gy++) {
            const cell = grid.get(key(gx, gy));
            if (!cell) continue;
            for (const m of cell) {
              if (m === k) continue;
              const b = sim[m];
              let dx = a.x - b.x;
              const dy = a.y - b.y;
              let d2 = dx * dx + dy * dy;
              if (d2 < 1) {
                d2 = 1;
                dx = (k - m) * 0.5;
              }
              if (d2 > CELL * CELL * 4) continue;
              const f = 520 / d2;
              fx += dx * f;
              fy += dy * f;
            }
          }
        // beta gravity: pull toward each index well ∝ this name's beta to that index
        for (const ix of idxBodies) {
          const b = ix.id === "SPX" ? a.bspx : a.bndx;
          fx += (ix.x - a.x) * 0.0013 * b;
          fy += (ix.y - a.y) * 0.0013 * b;
        }
        // weak centering + organic random jitter; the correlation springs couple the
        // random walks of correlated names, so the motion reads as correlated drift.
        fx += (W / 2 - a.x) * 0.0003 + (Math.random() - 0.5) * 0.8;
        fy += (H / 2 - a.y) * 0.0003 + (Math.random() - 0.5) * 0.8;
        a.vx = (a.vx + fx) * 0.88;
        a.vy = (a.vy + fy) * 0.88;
        const cap = Math.max(0.85, 1.4 - frame * 0.001);
        const sp = Math.hypot(a.vx, a.vy);
        if (sp > cap) {
          a.vx *= cap / sp;
          a.vy *= cap / sp;
        }
      }
      // springs along correlation edges (higher |corr| -> shorter rest length)
      for (const e of edges) {
        const a = sim[e.i],
          b = sim[e.j];
        let dx = b.x - a.x,
          dy = b.y - a.y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        const rest = 36 + (1 - Math.abs(e.v)) * 72;
        const f = (dist - rest) * 0.008;
        dx /= dist;
        dy /= dist;
        a.vx += dx * f;
        a.vy += dy * f;
        b.vx -= dx * f;
        b.vy -= dy * f;
      }
      const { cx, cy, R } = geo();
      const SPEED = 0.55; // drift speed
      for (const a of sim) {
        a.x += a.vx * SPEED;
        a.y += a.vy * SPEED;
        const ddx = a.x - cx,
          ddy = a.y - cy,
          dd = Math.hypot(ddx, ddy) || 1;
        if (dd > R) {
          a.x = cx + (ddx / dd) * R;
          a.y = cy + (ddy / dd) * R;
          a.vx *= 0.4;
          a.vy *= 0.4;
        }
      }
      // gravity wells orbit the centre (kept opposite each other) so they read as gravitating bodies
      const ROT = 0.0005,
        rc = Math.cos(ROT),
        rs = Math.sin(ROT);
      for (const a of sim) {
        const dx = a.x - cx,
          dy = a.y - cy;
        a.x = cx + dx * rc - dy * rs;
        a.y = cy + dx * rs + dy * rc;
      }
      for (const A of idxBodies) {
        const dx = A.x - cx,
          dy = A.y - cy;
        A.x = cx + dx * rc - dy * rs;
        A.y = cy + dx * rs + dy * rc;
      }
      // ── render (deep-space palette, kept from V2) ──
      const bg = ctx.createRadialGradient(cx, cy, 0, cx, cy, R * 1.35);
      bg.addColorStop(0, "#0B1A30");
      bg.addColorStop(0.55, "#070E1C");
      bg.addColorStop(1, "#03060C");
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, W, H);
      for (const s of STARS) {
        ctx.fillStyle = `rgba(200,222,255,${s.a})`;
        ctx.beginPath();
        ctx.arc(s.x * W, s.y * H, s.r, 0, 6.2832);
        ctx.fill();
      }
      ctx.strokeStyle = "rgba(91,168,255,0.14)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(cx, cy, R, 0, 6.2832);
      ctx.stroke();
      // index gravity wells — large translucent glowing spheres (drawn under the stock nodes)
      for (const A of idxBodies) {
        const gw = ctx.createRadialGradient(A.x, A.y, 0, A.x, A.y, 40);
        gw.addColorStop(0, A.color + "4D");
        gw.addColorStop(0.5, A.color + "22");
        gw.addColorStop(1, A.color + "00");
        ctx.fillStyle = gw;
        ctx.beginPath();
        ctx.arc(A.x, A.y, 40, 0, 6.2832);
        ctx.fill();
        ctx.globalAlpha = 0.85;
        ctx.lineWidth = 1.6;
        ctx.strokeStyle = A.color;
        ctx.beginPath();
        ctx.arc(A.x, A.y, 15, 0, 6.2832);
        ctx.stroke();
        ctx.globalAlpha = 1;
        ctx.fillStyle = A.color;
        ctx.font = "700 12px ui-sans-serif, system-ui";
        ctx.textAlign = "center";
        ctx.fillText(A.label, A.x, A.y - 22);
      }
      // edges — bright only where they touch a current holding; history-only links stay faint.
      const hov = hoverRef.current;
      for (const e of edges) {
        const a = sim[e.i],
          b = sim[e.j],
          live = a.cur || b.cur;
        const al = live ? 0.2 + 0.5 * Math.abs(e.v) : 0.03 + 0.1 * Math.abs(e.v);
        ctx.lineWidth = live ? 1 : 0.5;
        ctx.strokeStyle = e.v >= 0 ? alpha(DIVERGING.warm, al) : alpha(DIVERGING.cool, al);
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }
      // nodes — current holdings glow + white ring; backtest-only names are hollow dim outlines.
      for (const a of sim) {
        if (a.cur) {
          ctx.globalAlpha = 0.22;
          ctx.fillStyle = a.c;
          ctx.beginPath();
          ctx.arc(a.x, a.y, a.r * 2.8, 0, 6.2832);
          ctx.fill();
          ctx.globalAlpha = 1;
          ctx.fillStyle = a.c;
          ctx.beginPath();
          ctx.arc(a.x, a.y, a.r, 0, 6.2832);
          ctx.fill();
          ctx.lineWidth = 1.4;
          ctx.strokeStyle = INK.ink;
          ctx.stroke();
        } else {
          ctx.globalAlpha = a.t === hov ? 0.95 : 0.42;
          ctx.lineWidth = 1.1;
          ctx.strokeStyle = a.c;
          ctx.beginPath();
          ctx.arc(a.x, a.y, Math.max(1.8, a.r * 0.78), 0, 6.2832);
          ctx.stroke();
        }
        ctx.globalAlpha = 1;
      }
      // labels: current holdings always + hovered
      ctx.font = "600 9px ui-sans-serif, system-ui";
      ctx.textAlign = "center";
      for (const a of sim) {
        if (a.cur || a.t === hov) {
          ctx.fillStyle = a.t === hov ? "#fff" : INK.ink2;
          ctx.fillText(a.t, a.x, a.y - a.r - 3);
        }
      }
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);

    const onMove = (ev: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      const mx = ev.clientX - rect.left,
        my = ev.clientY - rect.top;
      let best: string | null = null,
        bd = 144;
      for (const a of sim) {
        const dx = a.x - mx,
          dy = a.y - my,
          dd = dx * dx + dy * dy;
        if (dd < bd) {
          bd = dd;
          best = a.t;
        }
      }
      hoverRef.current = best;
    };
    canvas.addEventListener("mousemove", onMove);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      canvas.removeEventListener("mousemove", onMove);
    };
  }, [d]);

  return (
    <div ref={wrapRef} className={styles.networkWrap}>
      <canvas ref={canvasRef} />
    </div>
  );
}

function CorrelationNetwork({ statusMap }: { statusMap?: StratStatusMap }) {
  const d = useReference<Corr>("strategies-correlation");
  // book-type fallback per slug from the pinned holdings-performance records
  // (the pinned system_status carries no entries for the active sleeves).
  const perf = useReference<Perf>("strategies-holdings-performance");
  const jsonBookTypes = useMemo(() => {
    const map: Record<string, BookType | undefined> = {};
    if (perf !== null && perf !== "unavailable" && Array.isArray(perf.strategies)) {
      for (const s of perf.strategies) map[s.slug] = s.book_type;
    }
    return map;
  }, [perf]);

  return (
    <VizSection
      eyebrow="HOLDINGS CORRELATION NETWORK / ALL BACKTEST HOLDINGS"
      title="Holdings correlation network"
      note={
        d !== null && d !== "unavailable"
          ? `${d.n_nodes} names · avg |corr| ${d.avg_abs_corr} (${d.window})`
          : undefined
      }
    >
      {d === null ? (
        <RefNote state="loading" label="holdings correlation" />
      ) : d === "unavailable" ? (
        <RefNote state="unavailable" label="Holdings correlation" />
      ) : (
        <>
          <p className={styles.vizSub}>
            All {d.n_nodes} names ever held across the governed sleeves. Distance encodes
            correlation ({d.window}); the slow orbit is decorative.
          </p>
          <div className={styles.networkGrid}>
            <ForceNetwork d={d} />
            <div className={styles.networkSide}>
              <div className={styles.howToRead}>
                <div className={styles.howToReadTitle}>How to read this</div>
                <ul>
                  <li>
                    <strong>Solid + ringed dots = current holdings</strong> (of live OR paper books
                    — see the legend tags); hollow dim outlines are names held only in the backtest.
                    Colour = the strategy that held it most.
                  </li>
                  <li>
                    <strong>The two big spheres are S&amp;P 500 &amp; NASDAQ</strong> — each name is
                    pulled toward them by its <em>beta</em>. High-beta (market-driven) names hug the
                    spheres; low-beta (idiosyncratic) names drift to the rim — systematic vs.
                    stock-specific at a glance.
                  </li>
                  <li>
                    <strong>Closeness = correlation.</strong> Two dots sit near each other when
                    their returns move together, far apart when they don&apos;t.
                  </li>
                  <li>
                    <strong>Bright links</strong> are correlations involving a current holding;
                    faint links are history-only. Watch whether the current-book dots cluster
                    (overlap) or spread (decoupled).
                  </li>
                  <li>
                    <strong>The drift is decoration</strong> — only relative position carries
                    meaning, not the motion.
                  </li>
                </ul>
              </div>
              <div>
                <div className={styles.sideLabel}>Strategy (dominant)</div>
                <div className={styles.legendCol}>
                  {Object.keys(d.strategy_labels).map((s) => {
                    const label = d.strategy_labels[s];
                    const retired = isRetiredStrategyName(label);
                    const bt = bookTypeOf(s, statusMap, jsonBookTypes[s]);
                    return (
                      <span key={s} className={styles.legendRow}>
                        <span className={styles.legendDot} style={{ background: entityColor(s) }} />
                        {label}
                        {retired ? (
                          <span className={styles.retiredTag}>RETIRED</span>
                        ) : (
                          <span className={bt === "live" ? styles.liveTag : styles.paperTag}>
                            {bt === "live" ? "● LIVE" : "◌ PAPER"}
                          </span>
                        )}
                      </span>
                    );
                  })}
                </div>
                <div className={styles.sideFine}>
                  White-ringed = current holding (live or paper book per the tag above). Node size =
                  times held. Hover for ticker. Edges: top correlations, |corr| ≥ 0.45.
                </div>
              </div>
              <div className={styles.sideFine}>
                Strategy-level avg |corr| <strong>{d.strategy_avg_abs_corr}</strong> ({d.window}).
                All long-only equity (a ~0.3–0.5 beta floor is unavoidable); the distinct bets sit
                lowest, the quant-factor sleeves co-move more. The pairwise matrix lives in the hub
                above, scoped to the brushed window.
              </div>
            </div>
          </div>
        </>
      )}
    </VizSection>
  );
}

// ─────────────────── Strategies hub (growth-of-100 comparison) ───────────────────
// Multi-series equity curves INDEXED TO 100 at the common start on ONE axis
// (log — 15y of compounding; never dual-axis). Fixed hue per strategy (color
// follows the entity); LIVE books solid, PAPER books dashed + tagged in the
// legend. SPY = neutral gray reference. Kairos rides the governed fifth slot
// (replaced the retired Aristeia 2026-08-11); retired sleeves are never
// fetched.
const CMP_SERIES = [
  { slug: "katalepsis", label: "Katalepsis", dataset: "c78q", kind: "c78q" as const },
  { slug: "auxo", label: "Auxo", dataset: "auxo-strategy", kind: "strategy" as const },
  { slug: "statera", label: "Statera", dataset: "statera-strategy", kind: "strategy" as const },
  { slug: "pronoia", label: "Pronoia", dataset: "pronoia-strategy", kind: "strategy" as const },
  { slug: "kairos", label: "Kairos", dataset: "kairos-strategy", kind: "strategy" as const },
];

// One shared fetch of the five strategy JSONs feeds the whole hub: the hero's
// equity curves (monthly), the windowed correlation heatmap (returns derived
// from those same curves) and the books panel. Mirrors V2 useHubData
// (StrategiesViz.tsx:367-405) with the reference API as the transport.
interface HubBook {
  slug: string;
  label: string;
  jsonBookType?: unknown;
  tickers: string[];
  asOf?: string;
  capital?: number | null;
  next?: string | null;
}
interface HubData {
  series: Record<string, Map<string, number>>;
  spy: Map<string, number> | null;
  books: HubBook[];
}

interface C78qPayload {
  backtest?: { summary?: Array<{ date: string; cum_strat: number; cum_spy: number }> };
  target?: { book_type?: unknown; rows?: Array<{ ticker: string }>; as_of?: string };
  state?: { capital?: number | null; next_rebalance?: string | null };
}
interface StrategyPayload {
  equity_curve?: Array<{ date: string; equity: number | null }>;
  current_holdings?: { book_type?: unknown; tickers?: unknown; as_of?: string };
  next_rebalance?: string | null;
}

function useHubData(): HubData | null | "unavailable" {
  const [hub, setHub] = useState<HubData | null | "unavailable">(null);
  useEffect(() => {
    let mounted = true;
    Promise.all(CMP_SERIES.map((s) => loadReference<unknown>(s.dataset))).then((jsons) => {
      if (!mounted) return;
      const series: Record<string, Map<string, number>> = {};
      const books: HubBook[] = [];
      let spy: Map<string, number> | null = null;
      jsons.forEach((j, i) => {
        const def = CMP_SERIES[i];
        if (!j) return;
        const m = new Map<string, number>();
        if (def.kind === "c78q") {
          const c = j as C78qPayload;
          for (const r of c.backtest?.summary ?? []) {
            m.set(String(r.date).slice(0, 7), 100 * (1 + r.cum_strat / 100));
          }
          spy = new Map(
            (c.backtest?.summary ?? []).map((r) => [
              String(r.date).slice(0, 7),
              100 * (1 + r.cum_spy / 100),
            ]),
          );
          books.push({
            slug: def.slug,
            label: def.label,
            jsonBookType: c.target?.book_type,
            tickers: (c.target?.rows ?? []).map((r) => r.ticker),
            asOf: c.target?.as_of,
            capital: c.state?.capital ?? null,
            next: c.state?.next_rebalance ?? null,
          });
        } else {
          const s = j as StrategyPayload;
          for (const r of s.equity_curve ?? []) {
            if (r.equity != null) m.set(String(r.date).slice(0, 7), r.equity);
          }
          const ch = s.current_holdings ?? {};
          books.push({
            slug: def.slug,
            label: def.label,
            jsonBookType: ch.book_type,
            tickers: Array.isArray(ch.tickers) ? (ch.tickers as string[]) : [],
            asOf: ch.as_of,
            capital: null,
            next: s.next_rebalance ?? null,
          });
        }
        if (m.size > 1) series[def.slug] = m;
      });
      setHub(Object.keys(series).length ? { series, spy, books } : "unavailable");
    });
    return () => {
      mounted = false;
    };
  }, []);
  return hub;
}

function pearson(xs: number[], ys: number[]): number {
  const n = xs.length;
  const mx = xs.reduce((a, b) => a + b, 0) / n,
    my = ys.reduce((a, b) => a + b, 0) / n;
  let sxy = 0,
    sxx = 0,
    syy = 0;
  for (let i = 0; i < n; i++) {
    const a = xs[i] - mx,
      b = ys[i] - my;
    sxy += a * b;
    sxx += a * a;
    syy += b * b;
  }
  const d = Math.sqrt(sxx * syy);
  return d > 0 ? sxy / d : NaN;
}

// Diverging fill for correlation polarity on the LIGHT card surface: warm
// amber = positive co-movement, cool blue = negative; |corr|<0.05 reads as a
// neutral light gray (never a hue at the midpoint).
function corrFillLight(c: number): string {
  const a = Math.max(0, Math.min(1, Math.abs(c)));
  if (a < 0.05) return DIVERGING.midLight;
  return c >= 0 ? alpha(DIVERGING.warm, 0.12 + 0.6 * a) : alpha(DIVERGING.cool, 0.12 + 0.6 * a);
}

// ── Windowed correlation heatmap — recomputed from the hero's monthly equity
//    curves over the brushed window. Diverging fill per corrFillLight.
function WindowedCorrMatrix({
  series,
  months,
  win,
}: {
  series: Record<string, Map<string, number>>;
  months: string[];
  win: [number, number];
}) {
  const defs = CMP_SERIES.filter((s) => series[s.slug]);
  const { corr, nCommon } = useMemo(() => {
    const rets: Record<string, Map<string, number>> = {};
    for (const { slug } of defs) {
      const m = series[slug];
      const r = new Map<string, number>();
      for (let i = win[0] + 1; i <= win[1]; i++) {
        const a = m.get(months[i - 1]),
          b = m.get(months[i]);
        if (a != null && b != null && a > 0) r.set(months[i], b / a - 1);
      }
      rets[slug] = r;
    }
    const corr: Record<string, Record<string, number>> = {};
    let nCommon = 0;
    for (const { slug: a } of defs) {
      corr[a] = {};
      for (const { slug: b } of defs) {
        if (a === b) {
          corr[a][b] = 1;
          continue;
        }
        const common = [...rets[a].keys()].filter((k) => rets[b].has(k));
        nCommon = Math.max(nCommon, common.length);
        corr[a][b] =
          common.length >= 6
            ? +pearson(
                common.map((k) => rets[a].get(k) as number),
                common.map((k) => rets[b].get(k) as number),
              ).toFixed(2)
            : NaN;
      }
    }
    return { corr, nCommon };
  }, [series, months, win]);

  if (nCommon < 6) {
    return (
      <p className={styles.sideFine}>
        Brushed window too short for correlation (needs ≥ 6 overlapping months).
      </p>
    );
  }
  return (
    <table className={styles.corrTable}>
      <thead>
        <tr>
          <th />
          {defs.map((s) => (
            <th key={s.slug} style={{ color: entityColor(s.slug) }}>
              {s.label.slice(0, 4)}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {defs.map((a) => (
          <tr key={a.slug}>
            <td className={styles.corrRowLabel} style={{ color: entityColor(a.slug) }}>
              {a.label.slice(0, 4)}
            </td>
            {defs.map((b) => {
              const v = corr[a.slug][b.slug];
              const tip =
                a.slug === b.slug
                  ? undefined
                  : `${a.label} × ${b.label}: ${
                      isNaN(v) ? "insufficient overlap" : (v >= 0 ? "+" : "") + v.toFixed(2)
                    } — monthly returns over the brushed window. Amber = co-move, blue = offset, gray ≈ decoupled.`;
              return (
                <td
                  key={b.slug}
                  title={tip}
                  className={a.slug === b.slug ? styles.corrDiag : styles.corrCell}
                  style={a.slug === b.slug ? undefined : { background: corrFillLight(v) }}
                >
                  {a.slug === b.slug ? "—" : isNaN(v) ? "·" : v.toFixed(2)}
                </td>
              );
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// ── Current books panel — live broker books first, paper grouped +
//    de-emphasized, research scouts collapsed by default.
function BookRow({
  book,
  bookType,
  deEmph,
}: {
  book: HubBook;
  bookType: BookType;
  deEmph?: boolean;
}) {
  return (
    <div className={deEmph ? `${styles.bookRow} ${styles.bookRowDeEmph}` : styles.bookRow}>
      <div className={styles.bookRowHead}>
        <span className={styles.legendDot} style={{ background: entityColor(book.slug) }} />
        <span className={styles.bookLabel}>{book.label}</span>
        <BookTypePill bookType={bookType} asOf={book.asOf} />
        <span className={styles.bookMeta}>
          {book.tickers.length} names
          {book.capital ? ` · $${book.capital.toLocaleString()}` : ""}
          {book.next ? ` · next ${book.next}` : ""}
        </span>
      </div>
      {book.tickers.length > 0 && (
        <div className={styles.chipRow}>
          {book.tickers.slice(0, 10).map((t) => (
            <span key={t} className={styles.tickerChip}>
              {t}
            </span>
          ))}
          {book.tickers.length > 10 && (
            <span className={styles.sideFine}>+{book.tickers.length - 10}</span>
          )}
        </div>
      )}
    </div>
  );
}

function CurrentBooks({ books, statusMap }: { books: HubBook[]; statusMap?: StratStatusMap }) {
  const resolved = books.map((b) => ({ b, bt: bookTypeOf(b.slug, statusMap, b.jsonBookType) }));
  const live = resolved.filter((x) => x.bt === "live");
  const paper = resolved.filter((x) => x.bt === "paper");
  const scouts = Object.entries(statusMap ?? {})
    .filter(([, v]) => (v.status ?? "").includes("research-scout"))
    .map(([k, v]) => ({ name: k.charAt(0).toUpperCase() + k.slice(1), asOf: v.as_of }));
  return (
    <div>
      <h3 className={styles.panelTitle}>Current books</h3>
      <p className={styles.vizSub}>
        What each strategy holds right now. LIVE = broker-confirmed money; PAPER = signal-derived
        research book.
      </p>
      <div className={styles.bookStack}>
        {live.map(({ b, bt }) => (
          <BookRow key={b.slug} book={b} bookType={bt} />
        ))}
        {paper.length > 0 && (
          <>
            <div className={styles.paperGroupLabel}>◌ Paper — research books</div>
            {paper.map(({ b, bt }) => (
              <BookRow key={b.slug} book={b} bookType={bt} deEmph />
            ))}
          </>
        )}
        {scouts.length > 0 && (
          <details className={styles.scouts}>
            <summary>
              Research scouts ({scouts.length}) — paper, holdings-redundant, excluded from the book
            </summary>
            <div>{scouts.map((s) => s.name).join(" · ")}</div>
          </details>
        )}
      </div>
    </div>
  );
}

// ── The hub — ONE hero (growth-of-100 comparison) with ONE brush whose window
//    scopes everything below it: the hero re-indexes to 100 at the window
//    start, the RegimeRibbon aligns to the window, the heatmap recomputes over
//    it.
const CHART_MARGIN = { top: 8, right: 16, bottom: 0, left: 4 };
const Y_AXIS_W = 56;
const HUB_HEIGHT = 392;

function StrategiesHub({ statusMap }: { statusMap?: StratStatusMap }) {
  const hub = useHubData();
  const [winSel, setWinSel] = useState<[number, number] | null>(null);

  const months = useMemo(() => {
    if (!hub || hub === "unavailable") return [];
    const maps = Object.values(hub.series);
    // common t0 = the latest first-month across the loaded series
    const t0 = maps
      .map((m) => [...m.keys()].sort()[0])
      .sort()
      .slice(-1)[0];
    return [...new Set(maps.flatMap((m) => [...m.keys()]))].filter((d) => d >= t0).sort();
  }, [hub]);

  const win: [number, number] = useMemo(() => {
    const max = Math.max(0, months.length - 1);
    if (!winSel) return [0, max];
    return [Math.max(0, Math.min(winSel[0], max)), Math.max(0, Math.min(winSel[1], max))];
  }, [winSel, months]);

  // re-index to 100 at the brushed window's start (per series: its first
  // present month at/after the window start)
  const rows = useMemo<HubRow[]>(() => {
    if (!hub || hub === "unavailable" || !months.length) return [];
    const inWin = months.slice(win[0], win[1] + 1);
    const base: Record<string, number> = {};
    for (const [slug, m] of Object.entries(hub.series)) {
      const first = inWin.find((d) => m.has(d));
      if (first) base[slug] = m.get(first) as number;
    }
    const spyBase = hub.spy
      ? (inWin.map((d) => hub.spy?.get(d)).find((v) => v != null) ?? null)
      : null;
    return months.map((d) => {
      const row: HubRow = { date: d };
      for (const [slug, m] of Object.entries(hub.series)) {
        row[slug] =
          m.has(d) && base[slug] ? +((100 * (m.get(d) as number)) / base[slug]).toFixed(2) : null;
      }
      row.SPY =
        hub.spy?.has(d) && spyBase
          ? +((100 * (hub.spy.get(d) as number)) / spyBase).toFixed(2)
          : null;
      return row;
    });
  }, [hub, months, win]);

  const winLabel = months.length
    ? `${months[win[0]]} → ${months[win[1]]} · ${win[1] - win[0] + 1} mo`
    : "";

  if (hub === null) {
    return (
      <VizSection eyebrow="STRATEGIES HUB / GROWTH OF 100" title="Strategies hub">
        <RefNote state="loading" label="strategy equity-curve" />
      </VizSection>
    );
  }
  if (hub === "unavailable") {
    return (
      <VizSection eyebrow="STRATEGIES HUB / GROWTH OF 100" title="Strategies hub">
        <RefNote state="unavailable" label="Strategy equity-curve" />
      </VizSection>
    );
  }

  const seriesDefs: HubSeriesDef[] = CMP_SERIES.filter((s) => hub.series[s.slug]).map((s) => {
    const book = hub.books.find((b) => b.slug === s.slug);
    const bt = bookTypeOf(s.slug, statusMap, book?.jsonBookType);
    return {
      slug: s.slug,
      name: `${s.label}${bt === "paper" ? " · paper" : " · live"}`,
      color: entityColor(s.slug),
      dashed: bt === "paper",
    };
  });

  return (
    <>
      <VizSection eyebrow="STRATEGIES HUB / GROWTH OF 100" title="Strategies hub" note={winLabel}>
        <p className={styles.vizSub}>
          Every curve re-indexes to 100 at the brushed window&apos;s start ({winLabel}) on ONE log
          axis. Solid = LIVE broker book today; dashed = PAPER research book. SPY = gray reference.
          Drag the brush to scope the ribbon + heatmap below.
        </p>
        <Suspense fallback={chartLoading}>
          <HubChart
            rows={rows}
            series={seriesDefs}
            hasSpy={hub.spy !== null}
            win={win}
            margin={CHART_MARGIN}
            yAxisWidth={Y_AXIS_W}
            height={HUB_HEIGHT}
            onWindowChange={(next) => setWinSel(next)}
          />
        </Suspense>
        {months.length > 1 && (
          <div className={styles.ribbonSlot}>
            <RegimeRibbon
              domain={[months[win[0]], months[win[1]]]}
              leftInset={CHART_MARGIN.left + Y_AXIS_W}
              rightInset={CHART_MARGIN.right}
              legend
            />
          </div>
        )}
        <p className={styles.vizFootnote}>
          Backtest research records (survivor-biased upper bounds), not forward guarantees — see
          each strategy&apos;s caveats. Indexed to a common base on a single axis; per the chart
          rules, no second y-scale is ever used.
        </p>
      </VizSection>

      <section className="parity-section">
        <div className={styles.hubGrid}>
          <div>
            <h3 className={styles.panelTitle}>Strategy correlation — brushed window</h3>
            <p className={styles.vizSub}>
              Pairwise correlation of monthly returns over {winLabel} (recomputed from the pinned
              equity curves as the brush moves).
            </p>
            <WindowedCorrMatrix series={hub.series} months={months} win={win} />
            <p className={styles.vizFootnote}>
              Amber = co-move, blue = offset, gray ≈ decoupled (diverging scale, neutral midpoint).
              Monthly granularity; the full-backtest daily-returns figure lives on the network panel
              below.
            </p>
          </div>
          <CurrentBooks books={hub.books} statusMap={statusMap} />
        </div>
      </section>
    </>
  );
}

export default function StrategiesViz({ statusMap }: { statusMap?: StratStatusMap }) {
  return (
    <>
      <StrategiesHub statusMap={statusMap} />
      <HoldingsTreemap statusMap={statusMap} />
      <CorrelationNetwork statusMap={statusMap} />
    </>
  );
}
