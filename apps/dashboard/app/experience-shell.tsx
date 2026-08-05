"use client";

import { useEffect, useRef, useState } from "react";

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
  if (pathname === "/") return "Returning to the Akribeia portal";
  return "Resolving Akribeia research";
}

export function ExperienceShell() {
  const [routeBusy, setRouteBusy] = useState(false);
  const [routeLabel, setRouteLabel] = useState("Resolving Akribeia research");
  const navigationTimer = useRef<number | null>(null);
  const recoveryTimer = useRef<number | null>(null);

  useEffect(() => {
    document.body.classList.add("akribeia-experience-ready");

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
      document.documentElement.classList.add("akribeia-overlay-active");

      navigationTimer.current = window.setTimeout(() => {
        try {
          window.location.assign(destination.href);
        } catch {
          setRouteBusy(false);
          document.documentElement.classList.remove("akribeia-overlay-active");
        }
      }, 140);

      recoveryTimer.current = window.setTimeout(() => {
        setRouteBusy(false);
        document.documentElement.classList.remove("akribeia-overlay-active");
      }, 8000);
    }

    document.addEventListener("click", handleClick, true);

    return () => {
      document.removeEventListener("click", handleClick, true);
      document.body.classList.remove("akribeia-experience-ready");
      document.documentElement.classList.remove("akribeia-overlay-active");
      clearTimers();
    };
  }, []);

  if (!routeBusy) {
    return null;
  }

  return (
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
  );
}
