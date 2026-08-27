"use client";

// RegimeRibbon — a thin (~8px) strip of market-regime state, attachable under
// any time-series chart. Colored by the regime tokens (risk-on / neutral /
// drawdown, defined once in strategy-theme.ts); segments come from the ML
// classifier's dominant_regime run-length series (5 states, collapsed via
// mapMlRegime).
//
// Alignment: the ribbon must span exactly the parent chart's plot area. Pass
// pixel insets (Recharts: leftInset = margin.left + YAxis width, rightInset =
// margin.right) or CSS lengths.
//
// Ported from quant-dashboard-pro-v2 src/components/RegimeRibbon.tsx; data
// comes through the V3 reference API ("regime-timeseries") instead of the
// baked public/data file. On failure the ribbon renders an explicit one-line
// unavailable note (never fabricated segments).

import { REGIME, alpha, mapMlRegime, type RegimeState } from "./strategy-theme";
import { useReference } from "./reference-client";
import styles from "./strategies-viz.module.css";

export interface RegimeSegment {
  start: string;
  end: string;
  regime: string;
}

interface RegimeFile {
  generated_at?: string;
  as_of?: string;
  segments?: RegimeSegment[];
}

export default function RegimeRibbon({
  domain,
  leftInset = 0,
  rightInset = 0,
  height = 8,
  legend = false,
}: {
  /** parent chart's x extent as ISO dates: [first, last] */
  domain: [string, string];
  /** px number or CSS length from the container's left edge to the plot area */
  leftInset?: number | string;
  rightInset?: number | string;
  height?: number;
  /** render the one-line legend under the strip */
  legend?: boolean;
}) {
  const data = useReference<RegimeFile>("regime-timeseries");
  if (data === null) return null; // still loading (or SSR) — nothing to draw yet
  if (data === "unavailable" || !data.segments?.length) {
    return <p className={styles.ribbonUnavailable}>Regime reference unavailable.</p>;
  }

  const t0 = Date.parse(domain[0]);
  const t1 = Date.parse(domain[1]);
  if (!Number.isFinite(t0) || !Number.isFinite(t1) || t1 <= t0) return null;
  const span = t1 - t0;
  const frac = (t: number) => Math.max(0, Math.min(1, (t - t0) / span));

  const segs = data.segments
    .map((s) => ({ ...s, a: Date.parse(s.start), b: Date.parse(s.end) + 86_400_000 })) // end is inclusive (daily grid)
    .filter((s) => s.b > t0 && s.a < t1)
    .map((s) => {
      const state: RegimeState = mapMlRegime(s.regime);
      return { ...s, x0: frac(s.a), x1: frac(s.b), state };
    });

  const inset = (v: number | string) => (typeof v === "number" ? `${v}px` : v);

  return (
    <div>
      <div style={{ marginLeft: inset(leftInset), marginRight: inset(rightInset) }}>
        <div className={styles.ribbonTrack} style={{ height }}>
          {segs.map((s, i) => (
            <div
              key={i}
              title={`${REGIME[s.state].label} · ${s.regime.replace("_", " ")} — ${s.start} → ${s.end}`}
              className={styles.ribbonSeg}
              style={{
                left: `${(s.x0 * 100).toFixed(3)}%`,
                width: `${Math.max(0.15, (s.x1 - s.x0) * 100).toFixed(3)}%`,
                background: alpha(REGIME[s.state].color, s.state === "neutral" ? 0.55 : 0.8),
              }}
            />
          ))}
        </div>
        {legend && (
          <div className={styles.ribbonLegend}>
            {(Object.keys(REGIME) as RegimeState[]).map((k) => (
              <span key={k} className={styles.ribbonLegendItem}>
                <span
                  className={styles.ribbonSwatch}
                  style={{ background: alpha(REGIME[k].color, 0.8) }}
                />
                {REGIME[k].label}
              </span>
            ))}
            <span>· ML regime classifier{data.as_of ? ` · as of ${data.as_of}` : ""}</span>
          </div>
        )}
      </div>
    </div>
  );
}
