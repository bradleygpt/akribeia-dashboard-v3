"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import LoadingOverlay from "./loading-overlay";

const INTRO_KEY = "akribeia:v3:intro:wave2";

type IntroState = "checking" | "playing" | "ready";

function describeDestination(pathname: string): string {
  if (pathname.startsWith("/research/")) return "Opening security intelligence";
  if (pathname === "/research") return "Loading the research universe";
  if (pathname === "/prolepsis") return "Loading Prolepsis forecasts";
  if (pathname.startsWith("/etfs/")) return "Opening ETF intelligence";
  if (pathname === "/etfs") return "Loading the ETF Center";
  if (pathname === "/sectors") return "Loading sector analytics";
  if (pathname === "/risk") return "Loading the Risk Radar";
  if (pathname === "/dashboard") return "Loading Market Health";
  if (pathname === "/macro") return "Loading macro research";
  if (pathname === "/strategies") return "Loading strategy research";
  if (pathname === "/portfolio") return "Opening device-local portfolio analytics";
  if (pathname === "/help") return "Opening product help";
  if (pathname === "/") return "Returning to Market Health";
  return "Resolving Akribeia research";
}

export function ExperienceShell() {
  const [introState, setIntroState] = useState<IntroState>("checking");
  const [routeBusy, setRouteBusy] = useState(false);
  const [routeLabel, setRouteLabel] = useState("Resolving Akribeia research");
  const navigationTimer = useRef<number | null>(null);
  const recoveryTimer = useRef<number | null>(null);

  useEffect(() => {
    const parameters = new URLSearchParams(window.location.search);
    const forceIntro = parameters.get("intro") === "1";
    const forceSkip = parameters.get("intro") === "0";
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const automatedBrowser = navigator.webdriver && !forceIntro;

    let seen = false;
    try {
      seen = window.sessionStorage.getItem(INTRO_KEY) === "seen";
    } catch {
      seen = false;
    }

    if (forceSkip || reducedMotion || automatedBrowser || (seen && !forceIntro)) {
      setIntroState("ready");
      return;
    }

    setIntroState("playing");
  }, []);

  useEffect(() => {
    document.body.classList.toggle("akribeia-experience-ready", introState === "ready");
    document.documentElement.classList.toggle(
      "akribeia-overlay-active",
      introState !== "ready" || routeBusy,
    );

    return () => {
      document.body.classList.remove("akribeia-experience-ready");
      document.documentElement.classList.remove("akribeia-overlay-active");
    };
  }, [introState, routeBusy]);

  useEffect(() => {
    function clearTimers() {
      if (navigationTimer.current !== null) {
        window.clearTimeout(navigationTimer.current);
        navigationTimer.current = null;
      }

      if (recoveryTimer.current !== null) {
        window.clearTimeout(recoveryTimer.current);
        recoveryTimer.current = null;
      }
    }

    function handleClick(event: MouseEvent) {
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      ) {
        return;
      }

      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        return;
      }

      if (!(event.target instanceof Element)) {
        return;
      }

      const anchor = event.target.closest("a[href]");

      if (!(anchor instanceof HTMLAnchorElement)) {
        return;
      }

      if (anchor.target && anchor.target !== "_self") {
        return;
      }

      if (anchor.hasAttribute("download") || anchor.dataset.noTransition === "true") {
        return;
      }

      const current = new URL(window.location.href);
      const destination = new URL(anchor.href, current);

      if (destination.origin !== current.origin) {
        return;
      }

      const sameDocument =
        destination.pathname === current.pathname && destination.search === current.search;

      if (sameDocument) {
        return;
      }

      event.preventDefault();
      clearTimers();

      setRouteLabel(describeDestination(destination.pathname));
      setRouteBusy(true);

      navigationTimer.current = window.setTimeout(() => {
        try {
          window.location.assign(destination.href);
        } catch {
          setRouteBusy(false);
        }
      }, 140);

      recoveryTimer.current = window.setTimeout(() => {
        setRouteBusy(false);
      }, 8000);
    }

    document.addEventListener("click", handleClick, true);

    return () => {
      document.removeEventListener("click", handleClick, true);
      clearTimers();
    };
  }, []);

  const finishIntro = useCallback(() => {
    try {
      window.sessionStorage.setItem(INTRO_KEY, "seen");
    } catch {
      // The intro still completes when storage is unavailable.
    }

    setIntroState("ready");
  }, []);

  return (
    <>
      {introState === "checking" ? (
        <div className="akribeia-intro-veil" aria-hidden="true" />
      ) : null}

      {introState === "playing" ? <LoadingOverlay onDone={finishIntro} /> : null}

      {routeBusy ? (
        <div
          className="akribeia-route-transition"
          role="status"
          aria-live="assertive"
          aria-label={routeLabel}
          data-route-transition="active"
        >
          <div className="akribeia-route-transition__field" aria-hidden="true">
            <span />
            <span />
            <span />
          </div>

          <div className="akribeia-route-transition__content">
            <span className="akribeia-route-transition__mark" aria-hidden="true">
              A
            </span>

            <p>{routeLabel}</p>

            <div className="akribeia-route-transition__track" aria-hidden="true">
              <i />
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
