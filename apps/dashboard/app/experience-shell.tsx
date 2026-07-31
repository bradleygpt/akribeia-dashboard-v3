"use client";

import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import LoadingOverlay from "./loading-overlay";

const INTRO_KEY = "akribeia:v3:intro:wave2";

type IntroState = "checking" | "playing" | "ready";

function describeDestination(url: URL): string {
  if (url.pathname.startsWith("/research/")) return "Opening security intelligence";
  if (url.pathname === "/research") return "Loading the research universe";
  if (url.pathname.startsWith("/etfs/")) return "Opening ETF intelligence";
  if (url.pathname === "/etfs") return "Loading the ETF Center";
  if (url.pathname === "/sectors") return "Loading sector analytics";
  if (url.pathname === "/risk") return "Loading the Risk Radar";
  if (url.pathname === "/") return "Returning to Market Health";
  return "Resolving Akribeia research";
}

export function ExperienceShell() {
  const pathname = usePathname();
  const router = useRouter();
  const [introState, setIntroState] = useState<IntroState>("checking");
  const [routeBusy, setRouteBusy] = useState(false);
  const [routeLabel, setRouteLabel] = useState("Resolving Akribeia research");
  const targetPath = useRef<string | null>(null);
  const completionTimer = useRef<number | null>(null);
  const fallbackTimer = useRef<number | null>(null);

  const clearTimers = useCallback(() => {
    if (completionTimer.current !== null) {
      window.clearTimeout(completionTimer.current);
      completionTimer.current = null;
    }

    if (fallbackTimer.current !== null) {
      window.clearTimeout(fallbackTimer.current);
      fallbackTimer.current = null;
    }
  }, []);

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
    if (!routeBusy || targetPath.current === null || pathname !== targetPath.current) return;

    if (completionTimer.current !== null) {
      window.clearTimeout(completionTimer.current);
    }

    completionTimer.current = window.setTimeout(() => {
      setRouteBusy(false);
      targetPath.current = null;
    }, 260);
  }, [pathname, routeBusy]);

  useEffect(() => {
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

      if (!(event.target instanceof Element)) return;

      const anchor = event.target.closest("a[href]");
      if (!(anchor instanceof HTMLAnchorElement)) return;
      if (anchor.target && anchor.target !== "_self") return;
      if (anchor.hasAttribute("download") || anchor.dataset.noTransition === "true") return;

      const destination = new URL(anchor.href, window.location.href);
      if (destination.origin !== window.location.origin) return;

      const current = new URL(window.location.href);
      const sameDocument =
        destination.pathname === current.pathname && destination.search === current.search;

      if (sameDocument) return;

      event.preventDefault();
      clearTimers();
      targetPath.current = destination.pathname;
      setRouteLabel(describeDestination(destination));
      setRouteBusy(true);

      const startingLocation = window.location.href;
      const relativeDestination = `${destination.pathname}${destination.search}${destination.hash}`;

      window.setTimeout(() => {
        try {
          router.push(relativeDestination);
        } catch {
          window.location.assign(destination.href);
        }
      }, 120);

      fallbackTimer.current = window.setTimeout(() => {
        if (window.location.href === startingLocation) {
          window.location.assign(destination.href);
        }
      }, 8000);
    }

    function handleHistoryNavigation() {
      clearTimers();
      targetPath.current = window.location.pathname;
      setRouteLabel("Restoring the previous research view");
      setRouteBusy(true);

      fallbackTimer.current = window.setTimeout(() => {
        setRouteBusy(false);
        targetPath.current = null;
      }, 8000);
    }

    document.addEventListener("click", handleClick, true);
    window.addEventListener("popstate", handleHistoryNavigation);

    return () => {
      document.removeEventListener("click", handleClick, true);
      window.removeEventListener("popstate", handleHistoryNavigation);
      clearTimers();
    };
  }, [clearTimers, router]);

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
            <span className="akribeia-route-transition__mark">A</span>
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
