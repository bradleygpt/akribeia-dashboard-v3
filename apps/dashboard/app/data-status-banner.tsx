"use client";

import { useEffect, useState } from "react";
import {
  INITIAL_DASHBOARD_AVAILABILITY,
  loadDashboardAvailability,
  type DashboardAvailability,
} from "./data-availability";

function statusRole(status: DashboardAvailability): "alert" | "status" {
  return status.kind === "error" || status.kind === "unavailable" ? "alert" : "status";
}

export function DataStatusBanner() {
  const [status, setStatus] = useState<DashboardAvailability>(INITIAL_DASHBOARD_AVAILABILITY);

  async function verify(signal?: AbortSignal) {
    setStatus(INITIAL_DASHBOARD_AVAILABILITY);
    const nextStatus = await loadDashboardAvailability({ signal });

    if (!signal?.aborted) {
      setStatus(nextStatus);
    }
  }

  useEffect(() => {
    const controller = new AbortController();
    void verify(controller.signal);

    return () => controller.abort();
  }, []);

  return (
    <section
      className="data-status"
      data-state={status.kind}
      aria-atomic="true"
      aria-live={statusRole(status) === "status" ? "polite" : "assertive"}
      role={statusRole(status)}
    >
      <div className="data-status-indicator" aria-hidden="true">
        <span />
      </div>
      <div className="data-status-copy">
        <p className="mono-label">{status.label}</p>
        <h2>{status.title}</h2>
        <p>
          {status.message} <span>{status.action}</span>
        </p>
      </div>
      <div className="data-status-meta">
        {status.buildId ? <code>{status.buildId}</code> : null}
        <button type="button" onClick={() => void verify()} disabled={status.kind === "loading"}>
          {status.kind === "loading" ? "Checking…" : "Recheck status"}
        </button>
      </div>
    </section>
  );
}
