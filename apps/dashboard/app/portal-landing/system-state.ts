// Live data for the tri-star portal landing, adapted for Akribeia V3.
//
// PROVENANCE: ported from the approved Vercel landing
// (quant-dashboard-pro-v2 src/landing/mockData.ts). The scene geometry, band
// layout, lighting states and market clock are byte-faithful; only the DATA
// SOURCES changed — every status line now traces to V3's own governed state:
//   - engine health comes from ONE fetch of /api/v3/health (fail-closed: any
//     fetch/parse failure renders the system degraded, never healthy)
//   - THESIS reflects V3's deterministic evidence mode: it reads OFFLINE and
//     dim until an external model is actually configured — never lit while down
//   - planets are V3's governed product surfaces with role descriptions, not
//     fabricated live metrics (DATA_INTEGRITY_STANDARD)

export type MarketStateKey = "rth" | "pre" | "after" | "closed";

export type EvidenceTier = "fresh" | "amber" | "stale" | "unknown";

export interface SystemStatus {
  evidence: {
    healthy: boolean;
    buildId: string | null;
    /** source-observation date derived from the build id (YYYY-MM-DD) or null. */
    asOf: string | null;
    tier: EvidenceTier;
  };
  /** true only when the health endpoint reports an external model configured. */
  externalModelConfigured: boolean;
  schemaVersion: string | null;
  market: { state: MarketStateKey };
}

// Fail-closed fallback — used when the health fetch fails. The system renders
// as degraded/unknown, never as healthy.
export const SYSTEM_STATUS: SystemStatus = {
  evidence: { healthy: false, buildId: null, asOf: null, tier: "unknown" },
  externalModelConfigured: false,
  schemaVersion: null,
  market: { state: "closed" },
};

// ----- live wiring ------------------------------------------------------------

export const mmdd = (iso: string | null | undefined): string =>
  iso && iso.length >= 10 ? iso.slice(5, 10) : "—";

// The live US-market session from the wall clock (America/New_York), so the
// day/night cycle tracks the real clock. Market holidays are not modeled here
// (weekends are).
export function liveMarketState(): MarketStateKey {
  try {
    const fmt = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York",
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
    const parts = Object.fromEntries(fmt.formatToParts(new Date()).map((p) => [p.type, p.value]));
    const wd = String(parts.weekday);
    if (wd === "Sat" || wd === "Sun") return "closed";
    let hh = parseInt(parts.hour, 10);
    if (hh === 24) hh = 0; // some engines emit "24" for midnight
    const mins = hh * 60 + parseInt(parts.minute, 10);
    if (mins >= 240 && mins < 570) return "pre"; // 04:00–09:30
    if (mins >= 570 && mins < 960) return "rth"; // 09:30–16:00
    if (mins >= 960 && mins < 1200) return "after"; // 16:00–20:00
    return "closed";
  } catch {
    return SYSTEM_STATUS.market.state;
  }
}

// Display freshness tiers for the evidence source observation. These are HUD
// display thresholds only — the authoritative gate is the evidence API itself,
// which fails closed independently of this rendering.
const FRESH_DAYS = 7;
const AMBER_DAYS = 14;

function tierForAsOf(asOf: string | null): EvidenceTier {
  if (!asOf) return "unknown";
  const t = Date.parse(`${asOf}T00:00:00Z`);
  if (Number.isNaN(t)) return "unknown";
  const days = (Date.now() - t) / 86_400_000;
  if (days <= FRESH_DAYS) return "fresh";
  if (days <= AMBER_DAYS) return "amber";
  return "stale";
}

// The build id embeds the source-observation date: preview-YYYYMMDD-… .
function asOfFromBuildId(buildId: string | null): string | null {
  const m = buildId?.match(/(\d{4})(\d{2})(\d{2})/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}

// Fetch the V3 evidence health, mapping it onto SystemStatus and falling back
// to the fail-closed constant on any error. ALWAYS resolves — callers can gate
// render on it without a hang risk.
export async function loadSystemStatus(): Promise<SystemStatus> {
  try {
    const res = await fetch("/api/v3/health", { cache: "no-cache" });
    if (!res.ok) return { ...SYSTEM_STATUS, market: { state: liveMarketState() } };
    const j = (await res.json()) as {
      status?: string;
      buildId?: string;
      schemaVersion?: string;
      externalModelConfigured?: boolean;
    };
    const buildId = j?.buildId ?? null;
    const asOf = asOfFromBuildId(buildId);
    return {
      evidence: {
        healthy: j?.status === "healthy",
        buildId,
        asOf,
        tier: tierForAsOf(asOf),
      },
      externalModelConfigured: j?.externalModelConfigured === true,
      schemaVersion: j?.schemaVersion ?? null,
      market: { state: liveMarketState() },
    };
  } catch {
    return { ...SYSTEM_STATUS, market: { state: liveMarketState() } };
  }
}

// ----- The three suns = the three core engines --------------------------------
// QUANT (scoring/evidence core), PROLEPSIS (prediction research), THESIS (LLM
// thesis engine — offline in V3's deterministic evidence mode, honestly dim).

export interface SunDef {
  id: "quant" | "mlpred" | "thesis";
  name: string;
  role: string;
  /** one-line engine status shown on hover (suns are ambient, not clickable). */
  status: string;
  /** Black-body-ish color temperature for the corona/core tint. */
  color: string;
  /** Relative gravitational mass for the tri-star sim. */
  mass: number;
  /** 0..1 luminosity — THESIS is offline in deterministic mode, so it reads dimmer. */
  lum: number;
  /** 0 calm .. 1 seething. Degradation, NOT nascency. */
  agitation: number;
}

// Suns derive health (lum/agitation) and status lines from the live evidence
// state. Geometry (mass/color) is fixed art from the approved landing.
export function buildSuns(s: SystemStatus = SYSTEM_STATUS): SunDef[] {
  const ok = s.evidence.healthy;
  const asOf = mmdd(s.evidence.asOf);
  const thesisUp = s.externalModelConfigured;
  return [
    {
      id: "quant",
      name: "QUANT",
      role: "Scoring · evidence core",
      status: ok ? `online · evidence verified · ${asOf}` : "unavailable · fail-closed",
      color: "#FFE3A8",
      mass: 1.04,
      lum: ok ? 1.0 : 0.5,
      agitation: ok ? 0.0 : 0.6,
    },
    {
      id: "mlpred",
      name: "PROLEPSIS",
      role: "Prediction research",
      status: ok ? "pinned research preview" : "unavailable · fail-closed",
      color: "#CFE0FF",
      mass: 1.0,
      lum: ok ? 1.0 : 0.5,
      agitation: ok ? 0.0 : 0.6,
    },
    {
      id: "thesis",
      name: "THESIS",
      role: "LLM thesis engine",
      status: thesisUp ? "online · thesis engine live" : "offline · deterministic mode",
      color: "#FF9E5A",
      mass: 0.92,
      lum: thesisUp ? 1.0 : 0.35,
      agitation: thesisUp ? 0.05 : 0.12,
    },
  ];
}

export const SUNS: SunDef[] = buildSuns(SYSTEM_STATUS);

// ----- chaos parameter --------------------------------------------------------
// Overall system stress rendered as orbital chaos: calm baseline when evidence
// is healthy and fresh; degraded or stale evidence agitates the system.

export function computeChaos(s: SystemStatus = SYSTEM_STATUS): number {
  const base = 0.45;
  const tierPenalty = s.evidence.tier === "amber" ? 0.08 : s.evidence.tier === "fresh" ? 0 : 0.15;
  const healthPenalty = s.evidence.healthy ? 0 : 0.15;
  return Math.min(1, Math.max(0, base + tierPenalty + healthPenalty));
}

export const ERA = (chaos: number) => (chaos < 0.5 ? "STABLE ERA" : "CHAOTIC ERA");

// ----- The planets = V3's governed product surfaces ---------------------------
// band: 0 inner (research programs), 1 middle (instruments), 2 outer (context),
// 3 far satellites. Orbital parameters are the approved landing's fixed art;
// status lines are role descriptions, never fabricated live metrics.

export interface PlanetDef {
  /** the surface's route path — planet click navigates here. */
  tabId: string;
  name: string;
  /** restrained signature accent — only shown on hover. */
  accent: string;
  status: string;
  band: 0 | 1 | 2 | 3;
  phase: number;
  size: number;
  ecc: number;
  incl: number;
  speed: number;
  /** render as a thin ring instead of a sphere. */
  ring?: boolean;
  /** brightest inner planet — a self-lit accent body (Strategies). */
  flagship?: boolean;
}

export function buildPlanets(): PlanetDef[] {
  return [
    // inner band — research programs. Strategies is the flagship.
    {
      tabId: "/strategies",
      name: "Strategies · Governed Roster",
      accent: "#00C805",
      status: "truth-labeled sleeves · live/paper separate",
      band: 0,
      phase: 0.2,
      size: 0.5,
      ecc: 0.1,
      incl: 0.05,
      speed: 1.0,
      flagship: true,
    },
    {
      tabId: "/prolepsis",
      name: "Prolepsis (ML Predictions)",
      accent: "#5BA8FF",
      status: "pinned research preview",
      band: 0,
      phase: 1.9,
      size: 0.42,
      ecc: 0.14,
      incl: -0.08,
      speed: 0.92,
    },
    {
      tabId: "/portfolio",
      name: "Portfolio",
      accent: "#FF9800",
      status: "device-local analytics",
      band: 0,
      phase: 5.1,
      size: 0.44,
      ecc: 0.12,
      incl: -0.04,
      speed: 0.8,
    },
    // middle band — instruments
    {
      tabId: "/research",
      name: "Research",
      accent: "#5BA8FF",
      status: "scored universe · visible provenance",
      band: 1,
      phase: 0.7,
      size: 0.4,
      ecc: 0.09,
      incl: 0.12,
      speed: 0.66,
    },
    {
      tabId: "/sectors",
      name: "Sectors",
      accent: "#9CA7BB",
      status: "sector analytics",
      band: 1,
      phase: 2.3,
      size: 0.52,
      ecc: 0.07,
      incl: -0.1,
      speed: 0.61,
    },
    {
      tabId: "/etfs",
      name: "ETF Center",
      accent: "#7FB0FF",
      status: "holdings + look-through",
      band: 1,
      phase: 3.9,
      size: 0.43,
      ecc: 0.13,
      incl: 0.06,
      speed: 0.57,
    },
    // outer band — context
    {
      tabId: "/risk",
      name: "Risk Radar",
      accent: "#FF9800",
      status: "consensus and disagreement",
      band: 2,
      phase: 1.1,
      size: 0.38,
      ecc: 0.16,
      incl: 0.14,
      speed: 0.4,
    },
    {
      tabId: "/macro",
      name: "Macro",
      accent: "#FFA133",
      status: "zero-cost indicators · fail-closed",
      band: 2,
      phase: 2.9,
      size: 0.41,
      ecc: 0.12,
      incl: 0.09,
      speed: 0.36,
    },
    {
      tabId: "/institutional",
      name: "Institutional 13F",
      accent: "#7FB0FF",
      status: "receipted filings · provenance",
      band: 2,
      phase: 4.7,
      size: 0.44,
      ecc: 0.1,
      incl: -0.07,
      speed: 0.33,
    },
    // far satellites — folded context
    {
      tabId: "/alpha-decay",
      name: "Alpha Decay Lab",
      accent: "#FF5722",
      status: "prospective vintages · fail-closed",
      band: 3,
      phase: 0.4,
      size: 0.55,
      ecc: 0.05,
      incl: -0.18,
      speed: 0.22,
      ring: true,
    },
    {
      tabId: "/help",
      name: "Help",
      accent: "#7C879B",
      status: "product documentation",
      band: 3,
      phase: 2.5,
      size: 0.27,
      ecc: 0.22,
      incl: 0.18,
      speed: 0.2,
    },
  ];
}

export const PLANETS: PlanetDef[] = buildPlanets(SYSTEM_STATUS);

/** Base orbital semi-major axis (world units) for each band. */
export const BAND_RADIUS: Record<number, number> = { 0: 5.4, 1: 8.2, 2: 11.4, 3: 14.6 };

// ----- market-clock lighting: a true day/night cycle -------------------------
// Verbatim from the approved landing.

export interface LightingTarget {
  key: MarketStateKey;
  label: string;
  blurb: string;
  sunIntensity: number;
  rim: number;
  starOpacity: number;
  bloom: number;
  ember: number; // 0 = full color temp, 1 = reduced to red embers
  ambient: number;
  exposure: number;
  frozen: boolean;
  /** background depth-haze color (also the fog color). */
  bg: string;
  /** gradient sky dome — zenith and horizon colors. */
  skyTop: string;
  skyBottom: string;
}

export const LIGHTING: Record<MarketStateKey, LightingTarget> = {
  rth: {
    key: "rth",
    label: "Market Open",
    blurb: "daylight trading floor · lit sky",
    sunIntensity: 1.0,
    rim: 0.85,
    starOpacity: 0.0,
    bloom: 0.85,
    ember: 0.0,
    ambient: 0.55,
    exposure: 1.06,
    frozen: false,
    bg: "#8EC0E6",
    skyTop: "#2E6FB7",
    skyBottom: "#CFE7F6",
  },
  pre: {
    key: "pre",
    label: "Pre-Market",
    blurb: "dawn gradient · cool→warm",
    sunIntensity: 0.82,
    rim: 0.9,
    starOpacity: 0.34,
    bloom: 1.0,
    ember: 0.08,
    ambient: 0.3,
    exposure: 0.98,
    frozen: false,
    bg: "#3A4068",
    skyTop: "#152044",
    skyBottom: "#E0975A",
  },
  after: {
    key: "after",
    label: "After Hours",
    blurb: "dusk · stars emerging",
    sunIntensity: 0.5,
    rim: 0.74,
    starOpacity: 0.74,
    bloom: 0.9,
    ember: 0.3,
    ambient: 0.16,
    exposure: 0.9,
    frozen: false,
    bg: "#171a36",
    skyTop: "#0B1030",
    skyBottom: "#7A3F58",
  },
  closed: {
    key: "closed",
    label: "Closed / Holiday",
    blurb: "deep void · embers · orbits frozen",
    sunIntensity: 0.22,
    rim: 0.42,
    starOpacity: 1.0,
    bloom: 0.74,
    ember: 0.7,
    ambient: 0.06,
    exposure: 0.82,
    frozen: true,
    bg: "#04060b",
    skyTop: "#04060b",
    skyBottom: "#05080f",
  },
};

export const MARKET_ORDER: MarketStateKey[] = ["rth", "pre", "after", "closed"];

/** Daylight states want dark HUD ink + light scrims; night states keep light ink. */
export const isDaylight = (k: MarketStateKey): boolean => k === "rth";
