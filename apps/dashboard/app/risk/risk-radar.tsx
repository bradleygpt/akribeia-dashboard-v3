"use client";

import { useEffect, useMemo, useState } from "react";

interface RiskItem {
  title: string;
  category: string;
  severity: "High" | "Medium" | "Low";
  direction?: "downside" | "upside" | "two-sided";
  horizon?: string;
  summary?: string;
  watch_for?: string;
  sources: string[];
}

interface RiskRadarReference {
  ok?: boolean;
  status?: "fresh" | "stale" | "failed";
  last_updated_utc?: string;
  last_updated_human?: string;
  as_of_window?: string | null;
  risks?: RiskItem[];
  consensus_note?: string;
  themes?: string[];
}

interface Envelope {
  ok: boolean;
  payload?: RiskRadarReference;
  source?: { v2AppCommit: string; url: string };
  error?: { message?: string };
}

const DIRECTIONS = {
  downside: "▼",
  upside: "▲",
  "two-sided": "◆",
} as const;

export function RiskRadar() {
  const [state, setState] = useState<
    | { status: "loading" }
    | { status: "error"; message: string }
    | { status: "ready"; data: RiskRadarReference; source: Envelope["source"] }
  >({ status: "loading" });
  const [severity, setSeverity] = useState("All");
  const [category, setCategory] = useState("All");

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/v3/research-reference?dataset=risk-radar", {
      signal: controller.signal,
      headers: { accept: "application/json" },
    })
      .then(async (response) => {
        const body = (await response.json()) as Envelope;
        if (!response.ok || !body.ok || body.payload === undefined) {
          throw new Error(body.error?.message ?? "The pinned Risk Radar is unavailable.");
        }
        setState({ status: "ready", data: body.payload, source: body.source });
      })
      .catch((reason: unknown) => {
        if (controller.signal.aborted) return;
        setState({
          status: "error",
          message:
            reason instanceof Error ? reason.message : "The pinned Risk Radar is unavailable.",
        });
      });
    return () => controller.abort();
  }, []);

  const risks = state.status === "ready" ? (state.data.risks ?? []) : [];
  const categories = useMemo(
    () => [...new Set(risks.map(({ category: value }) => value))].sort(),
    [risks],
  );
  const visible = risks.filter(
    (risk) =>
      (severity === "All" || risk.severity === severity) &&
      (category === "All" || risk.category === category),
  );
  const counts = {
    High: risks.filter(({ severity: value }) => value === "High").length,
    Medium: risks.filter(({ severity: value }) => value === "Medium").length,
    Low: risks.filter(({ severity: value }) => value === "Low").length,
  };
  const total = Math.max(1, risks.length);

  if (state.status === "loading") {
    return (
      <div className="risk-radar-state" role="status" aria-live="polite">
        <strong>Loading the pinned V2 Risk Radar…</strong>
        <span>Unsourced or unavailable risks are never substituted.</span>
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <div className="risk-radar-state risk-radar-error" role="status">
        <strong>Risk Radar unavailable.</strong>
        <span>{state.message} No fallback narrative has been generated.</span>
      </div>
    );
  }

  return (
    <>
      <section className="risk-radar-overview" aria-labelledby="radar-overview-heading">
        <div className="research-subheading">
          <div>
            <p className="mono-label">CURRENT SOURCE-ATTRIBUTED OUTLOOK RISKS</p>
            <h2 id="radar-overview-heading">Risk distribution</h2>
          </div>
          <span>
            {state.data.as_of_window ?? "As-of window unavailable"} ·{" "}
            {state.data.last_updated_human ?? "refresh time unavailable"}
          </span>
        </div>
        <div className="risk-distribution">
          {(["High", "Medium", "Low"] as const).map((value) => (
            <button
              type="button"
              key={value}
              data-severity={value.toLowerCase()}
              aria-pressed={severity === value}
              onClick={() => setSeverity((current) => (current === value ? "All" : value))}
            >
              <span>{value}</span>
              <strong>{counts[value]}</strong>
              <div aria-hidden="true">
                <span style={{ width: `${(counts[value] / total) * 100}%` }} />
              </div>
            </button>
          ))}
        </div>
        {state.data.consensus_note ? <blockquote>{state.data.consensus_note}</blockquote> : null}
      </section>

      <section className="risk-radar-ledger" aria-labelledby="risk-ledger-heading">
        <div className="research-subheading">
          <div>
            <p className="mono-label">WHAT TO WATCH / WHY / WHO FLAGGED IT</p>
            <h2 id="risk-ledger-heading">{visible.length} risks in view</h2>
          </div>
          <div className="risk-filter-controls">
            <label>
              <span>Severity</span>
              <select value={severity} onChange={(event) => setSeverity(event.target.value)}>
                <option>All</option>
                <option>High</option>
                <option>Medium</option>
                <option>Low</option>
              </select>
            </label>
            <label>
              <span>Category</span>
              <select value={category} onChange={(event) => setCategory(event.target.value)}>
                <option>All</option>
                {categories.map((value) => (
                  <option key={value}>{value}</option>
                ))}
              </select>
            </label>
          </div>
        </div>
        {visible.length === 0 ? (
          <div className="risk-radar-state" role="status">
            <strong>No risks match these filters.</strong>
            <span>Change severity or category; the source ledger is unchanged.</span>
          </div>
        ) : (
          <div className="risk-card-grid">
            {visible.map((risk) => (
              <article
                key={`${risk.title}-${risk.category}`}
                data-severity={risk.severity.toLowerCase()}
              >
                <header>
                  <div>
                    <span>{risk.category}</span>
                    {risk.horizon ? <span>{risk.horizon}</span> : null}
                  </div>
                  <strong>{risk.severity}</strong>
                </header>
                <h3>
                  {risk.direction ? (
                    <span aria-label={`${risk.direction} risk`}>{DIRECTIONS[risk.direction]}</span>
                  ) : null}
                  {risk.title}
                </h3>
                {risk.summary ? <p>{risk.summary}</p> : null}
                {risk.watch_for ? (
                  <div className="risk-watch">
                    <span>Watch for</span>
                    <strong>{risk.watch_for}</strong>
                  </div>
                ) : null}
                <footer>
                  <span>Attributed source{risk.sources.length === 1 ? "" : "s"}</span>
                  <strong>{risk.sources.join(" · ")}</strong>
                </footer>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="risk-themes" aria-labelledby="risk-themes-heading">
        <div>
          <p className="mono-label">CROSS-SOURCE THEMES</p>
          <h2 id="risk-themes-heading">The repeated threads</h2>
        </div>
        <div>
          {(state.data.themes ?? []).map((theme, index) => (
            <span key={theme}>
              {String(index + 1).padStart(2, "0")} / {theme}
            </span>
          ))}
        </div>
      </section>

      <p className="risk-source-note">
        Narrative summary, not a market-data feed. Each item must carry at least one named source in
        the pinned V2 radar; unsourced items are dropped by the upstream workflow. Source commit{" "}
        {state.source?.v2AppCommit.slice(0, 12) ?? "unavailable"}.
      </p>
    </>
  );
}
