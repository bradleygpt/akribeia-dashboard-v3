// strategy-theme.ts — the V2 color vocabulary subset used by the ported
// strategies visuals (quant-dashboard-pro-v2 src/theme.ts).
//
// WHY A TS MODULE (and not only CSS variables): Recharts and <canvas> consume
// colors as JS string props (SVG presentation attributes don't resolve var()),
// and several call sites compose alpha dynamically.
//
// Adaptations for V3:
//   - the "aristeia" entity slot is remapped to "kairos" (Kairos replaced the
//     retired Aristeia on 2026-08-11); the hue stays the distinct V2 blue.
//   - benchmark gray is darkened one step so the SPY reference reads on the
//     V3 light "paper" surface as well as inside the dark canvases.
//   - DIVERGING gains a light-surface midpoint (midLight) for the heatmap;
//     the dark midpoint is kept for the dark-canvas network.

/** Dark canvas surfaces — used INSIDE the dark visual cards (network,
 *  signatures, treemap), which deliberately keep V2's deep-space look. */
export const DARK = {
  page: "#0B0E14",
  inset: "#0C0F16",
  head: "#0F1420",
  panel: "#121723",
  raised: "#1A2130",
} as const;

/** Ink hierarchy for the dark canvases (V2 values, verbatim). */
export const INK = {
  ink: "#E6E9EF",
  ink2: "#C3CAD7",
  ink3: "#9CA7BB",
  mute: "#7C879B",
  dim: "#5A6477",
} as const;

/** Hairlines for the dark canvases. */
export const LINE = {
  faint: "#161D29",
  line: "#1E2632",
  strong: "#2A3242",
} as const;

/** Semantic status colors (V2 subset) — gains/losses on the dark treemap. */
export const SEM = {
  pos: "#00C805",
  neg: "#F0565A",
  link: "#5BA8FF",
} as const;

/** Light-surface chart chrome — the V3 research palette as JS strings for
 *  Recharts (globals.css: --ink / --muted / --line / --paper). */
export const CHART_LIGHT = {
  ink: "#101914",
  muted: "#68746c",
  line: "#ccd2c7",
  grid: "#dfe3d8",
  paper: "#f1f2e9",
  card: "#f9faef",
} as const;

/**
 * Entity series — one fixed hue per strategy, forever. Color follows the
 * entity, never rank or filter order. Katalepsis wears brass (live-money).
 * kairos inherits the retired Aristeia's slot with the same distinct blue.
 * benchmark (SPY) is deliberately neutral: always dashed + direct-labeled,
 * never counted as a categorical slot.
 */
export const ENTITY = {
  katalepsis: "#BA7517",
  kairos: "#3D8FEF",
  auxo: "#A855F7",
  statera: "#E0862E",
  pronoia: "#C84D8F",
  benchmark: "#6d7787",
} as const;
export type EntitySlug = keyof typeof ENTITY;

/** Fixed hue per entity, with a safe fallback for unknown slugs. */
export function entityColor(slug: string): string {
  return (ENTITY as Record<string, string>)[slug.toLowerCase()] ?? ENTITY.benchmark;
}

/** Live/paper series treatment: paper books render as a TRANSFORM of the
 *  entity hue (dash + reduced opacity), never a different hue. */
export const PAPER_SERIES = { dash: "6 3", opacity: 0.75 } as const;
export const BENCH_SERIES = { dash: "2 3", width: 1.4 } as const;

/** Market regime states — defined once, used by every RegimeRibbon. */
export const REGIME = {
  risk_on: { color: "#1FA35C", label: "Risk-on" },
  neutral: { color: "#566073", label: "Neutral" }, // recessive by design
  drawdown: { color: "#C74B42", label: "Drawdown" },
} as const;
export type RegimeState = keyof typeof REGIME;

/** Collapse the ML classifier's 5 regimes onto the 3 display states. */
export function mapMlRegime(dominant: string): RegimeState {
  switch (dominant) {
    case "early_bull":
    case "late_bull":
      return "risk_on";
    case "correction":
    case "panic":
      return "drawdown";
    default:
      return "neutral"; // range_bound + anything unknown
  }
}

/** Diverging pair for correlation/polarity: warm + / cool − / neutral gray 0.
 *  mid = dark-canvas midpoint (network); midLight = light-card midpoint
 *  (brushed heatmap on the V3 paper surface). */
export const DIVERGING = {
  warm: "#D9A441",
  cool: "#4A97F5",
  mid: "#1B222E",
  midLight: "#dfe3d8",
} as const;

/** rgba() of a #rrggbb hex at the given alpha (0–1). */
export function alpha(hex: string, a: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${a})`;
}
