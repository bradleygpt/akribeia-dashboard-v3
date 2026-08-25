"use client";

// The Akribeia V3 root landing: the approved three-sun gravitational system,
// ported from the Vercel landing (quant-dashboard-pro-v2 src/tabs/LandingDemoTab.tsx).
// The loading sequence (loading-overlay.tsx) plays ON TOP of this and
// cross-fades into it; ENTER DASHBOARD / planet clicks navigate to the real
// product routes.
//
// Adaptations for V3:
//   - navigation is real route navigation (location.assign), not tab switching
//   - system status comes from ONE /api/v3/health fetch (fail-closed)
//   - reduced-motion users get a static navigation fallback — the WebGL scene
//     never mounts for them
//   - the three.js scene is lazy-loaded AND gated on the client-side status
//     fetch, so no three.js code is ever evaluated during Worker rendering

import { Suspense, lazy, useEffect, useMemo, useRef, useState } from "react";
import Hud from "./Hud";
import {
  ERA,
  buildPlanets,
  buildSuns,
  computeChaos,
  liveMarketState,
  loadSystemStatus,
  type MarketStateKey,
  type PlanetDef,
  type SunDef,
  type SystemStatus,
} from "./system-state";

// The whole three.js scene + post chain is code-split so it only loads on the
// client after the status gate — never in the Worker, never for reduced motion.
const Scene = lazy(() => import("./Scene"));

interface HoverState {
  def: PlanetDef;
  x: number;
  y: number;
}
interface SunHoverState {
  def: SunDef;
  x: number;
  y: number;
}

const SURFACE_LINKS: { href: string; label: string }[] = [
  { href: "/dashboard", label: "Market Health" },
  { href: "/research", label: "Research" },
  { href: "/sectors", label: "Sectors" },
  { href: "/etfs", label: "ETF Center" },
  { href: "/risk", label: "Risk Radar" },
  { href: "/macro", label: "Macro" },
  { href: "/strategies", label: "Strategies" },
  { href: "/portfolio", label: "Portfolio" },
  { href: "/prolepsis", label: "Prolepsis" },
  { href: "/institutional", label: "Institutional 13F" },
  { href: "/alpha-decay", label: "Alpha Decay Lab" },
  { href: "/help", label: "Help" },
];

// Static fallback for reduced-motion users and no-JS crawlers: the same dark
// identity with plain navigation — nobody is held behind an animation.
function StaticPortal() {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-8 px-6 text-center">
      <div>
        <h1 className="font-mono text-[26px] font-semibold tracking-[0.42em] text-[#DCE3EE]">
          AKRIBEIA
        </h1>
        <p className="mt-2 font-mono text-[11px] uppercase tracking-[0.3em] text-[#7C879B]">
          quantitative market research
        </p>
      </div>
      <nav aria-label="Product surfaces">
        <ul className="grid grid-cols-2 gap-x-10 gap-y-2 sm:grid-cols-3">
          {SURFACE_LINKS.map((l) => (
            <li key={l.href}>
              <a
                className="font-mono text-[12px] uppercase tracking-[0.18em] text-[#9CA7BB] transition hover:text-[#DCE3EE]"
                href={l.href}
              >
                {l.label}
              </a>
            </li>
          ))}
        </ul>
      </nav>
      <a
        className="font-mono text-[11px] uppercase tracking-[0.22em] text-[#5BA8FF] transition hover:text-[#DCE3EE]"
        href="/dashboard"
      >
        enter dashboard →
      </a>
    </div>
  );
}

export default function PortalLanding() {
  // null = undecided (also the SSR state); reduced-motion renders the static portal.
  const [reducedMotion, setReducedMotion] = useState<boolean | null>(null);
  // Live V3 status. Null until loaded; the scene is gated on it so every
  // sun/HUD value is built from real data on first paint.
  const [status, setStatus] = useState<SystemStatus | null>(null);
  // Day/night default tracks the live US market session; the toggle overrides it.
  const [marketKey, setMarketKey] = useState<MarketStateKey>(() => liveMarketState());
  const [chaos, setChaos] = useState<number>(0.45);
  const userChaos = useRef(false);
  const [hover, setHover] = useState<HoverState | null>(null);
  const [sunHover, setSunHover] = useState<SunHoverState | null>(null);
  const [flying, setFlying] = useState(false);
  const flyTimer = useRef<number | null>(null);

  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    setReducedMotion(reduced);
    if (reduced) return;

    let alive = true;
    loadSystemStatus().then((s) => {
      if (!alive) return;
      setStatus(s);
      if (!userChaos.current) setChaos(computeChaos(s));
    });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(
    () => () => {
      if (flyTimer.current) window.clearTimeout(flyTimer.current);
    },
    [],
  );

  const suns = useMemo(() => (status ? buildSuns(status) : []), [status]);
  const planets = useMemo(() => (status ? buildPlanets() : []), [status]);

  const onHover = (def: PlanetDef | null, x: number, y: number) =>
    setHover(def ? { def, x, y } : null);
  const onSunHover = (def: SunDef | null, x: number, y: number) =>
    setSunHover(def ? { def, x, y } : null);

  // click = camera fly-toward + fade, then REAL navigation to that surface.
  const navigate = (path: string) => {
    setHover(null);
    setFlying(true);
    if (flyTimer.current) window.clearTimeout(flyTimer.current);
    flyTimer.current = window.setTimeout(() => window.location.assign(path), 620);
  };
  const onSelect = (def: PlanetDef) => navigate(def.tabId);

  const onChaos = (v: number) => {
    userChaos.current = true;
    setChaos(v);
  };
  const resetChaos = () => {
    if (status) setChaos(computeChaos(status));
    userChaos.current = false;
  };

  const initializing = (
    <div className="flex h-full w-full items-center justify-center">
      <span className="font-mono text-[11px] uppercase tracking-[0.3em] text-[#7C879B]">
        initializing system…
      </span>
    </div>
  );

  return (
    // fixed full-bleed so the experience reads cinematic, not boxed in a pane.
    // Explicit dvh sizing so the landing never depends on the containing block
    // (an ancestor filter/transform would otherwise collapse an inset-only box).
    <div className="tri-portal fixed inset-0 z-50 h-dvh w-screen overflow-hidden bg-[#04060b]">
      <noscript>
        <StaticPortal />
      </noscript>

      {reducedMotion ? (
        <StaticPortal />
      ) : (
        <>
          <div
            className="h-full w-full transition-all duration-[620ms] ease-in"
            style={{
              transform: flying ? "scale(1.22)" : "scale(1)",
              opacity: flying ? 0 : 1,
              filter: flying ? "blur(3px)" : "none",
            }}
          >
            {/* Gate the scene on the live status so the suns/HUD are built from
                real data on first paint (no mock→live flash, no material rebuild). */}
            {status ? (
              <Suspense fallback={initializing}>
                <Scene
                  chaos={chaos}
                  marketStateKey={marketKey}
                  hoveredId={hover?.def.tabId ?? null}
                  suns={suns}
                  planets={planets}
                  onHover={onHover}
                  onSelect={onSelect}
                  onSunHover={onSunHover}
                />
              </Suspense>
            ) : (
              initializing
            )}
          </div>

          {status && (
            <Hud
              chaos={chaos}
              setChaos={onChaos}
              resetChaos={resetChaos}
              marketKey={marketKey}
              setMarketKey={setMarketKey}
              era={ERA(chaos)}
              status={status}
              suns={suns}
              hover={hover}
              sunHover={sunHover}
              onExit={() => navigate("/dashboard")}
            />
          )}
        </>
      )}
    </div>
  );
}
