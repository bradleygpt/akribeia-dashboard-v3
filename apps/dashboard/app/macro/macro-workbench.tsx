"use client";

import { useEffect, useState } from "react";
import { compareNullable } from "../product-parity";

type Direction = "ascending" | "descending";
type ForecastSortKey = "name" | "asOf" | "y2026" | "y2027" | "y2028" | "source";

interface ReferenceEnvelope {
  ok?: boolean;
  source?: { v2AppCommit?: string; url?: string };
  payload?: unknown;
  error?: { message?: string };
}

interface ForecastRow {
  id: string;
  name: string;
  asOf: string | null;
  source: string | null;
  url: string | null;
  live: boolean;
  values: Record<string, Record<string, number | null | undefined> | undefined>;
}

function finite(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function string(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function compareValues(
  left: string | number | null,
  right: string | number | null,
  direction: Direction,
): number {
  return compareNullable(left, right, direction);
}

function SortButton<K extends string>({
  column,
  label,
  sort,
  onSort,
}: {
  column: K;
  label: string;
  sort: { key: K; direction: Direction };
  onSort: (next: { key: K; direction: Direction }) => void;
}) {
  const active = sort.key === column;
  const direction = active ? sort.direction : "none";
  return (
    <th scope="col" aria-sort={direction}>
      <button
        type="button"
        className={active ? "research-sort-header is-active" : "research-sort-header"}
        onClick={() =>
          onSort({
            key: column,
            direction: active && sort.direction === "ascending" ? "descending" : "ascending",
          })
        }
      >
        {label}
        <span aria-hidden="true">{direction === "descending" ? "↓" : "↑"}</span>
      </button>
    </th>
  );
}

export function MacroWorkbench() {
  const [forecast, setForecast] = useState<ReferenceEnvelope | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "partial" | "error">("loading");
  const [message, setMessage] = useState("Loading approved forecast consensus…");
  const [forecastMetric, setForecastMetric] = useState("gdp");
  const [forecastSort, setForecastSort] = useState<{ key: ForecastSortKey; direction: Direction }>({
    key: "name",
    direction: "ascending",
  });

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/v3/research-reference?dataset=macro-forecasts", {
      signal: controller.signal,
      headers: { accept: "application/json" },
    })
      .then(async (response) => {
        const body = (await response.json()) as ReferenceEnvelope;
        if (!response.ok || !body.ok)
          throw new Error(body.error?.message ?? "Forecast source unavailable.");
        return body;
      })
      .then((body) => {
        if (controller.signal.aborted) return;
        setForecast(body);
        setState("ready");
        setMessage(
          "Approved forecast consensus loaded. Event schedules and market-implied probabilities remain unavailable.",
        );
      })
      .catch(() => {
        if (controller.signal.aborted) return;
        setState("error");
        setMessage(
          "Macro event and probability contracts remain pending; forecast consensus is also unavailable.",
        );
      });
    return () => controller.abort();
  }, []);

  const consensus =
    forecast?.payload && typeof forecast.payload === "object"
      ? ((forecast.payload as Record<string, unknown>).consensus as
          Record<string, unknown> | undefined)
      : undefined;
  const forecastRows: ForecastRow[] = Array.isArray(consensus?.forecasters)
    ? (consensus.forecasters as Array<Record<string, unknown>>).map((row, index) => ({
        id: string(row.id) ?? `forecaster-${index}`,
        name: string(row.name) ?? "Unnamed forecaster",
        asOf: string(row.as_of),
        source: string(row.source),
        url: string(row.url),
        live: row.live === true,
        values:
          row.values && typeof row.values === "object" ? (row.values as ForecastRow["values"]) : {},
      }))
    : [];
  const labels = (consensus?.metric_labels as Record<string, string> | undefined) ?? {};
  const units = (consensus?.metric_units as Record<string, string> | undefined) ?? {};
  const metrics = Array.isArray(consensus?.metrics) ? (consensus.metrics as string[]) : [];
  const sortedForecasts = forecastRows.toSorted((left, right) => {
    const values: Record<ForecastSortKey, string | number | null> = {
      name: left.name,
      asOf: left.asOf,
      y2026: finite(left.values?.[forecastMetric]?.["2026"]),
      y2027: finite(left.values?.[forecastMetric]?.["2027"]),
      y2028: finite(left.values?.[forecastMetric]?.["2028"]),
      source: left.source,
    };
    const rightValues: Record<ForecastSortKey, string | number | null> = {
      name: right.name,
      asOf: right.asOf,
      y2026: finite(right.values?.[forecastMetric]?.["2026"]),
      y2027: finite(right.values?.[forecastMetric]?.["2027"]),
      y2028: finite(right.values?.[forecastMetric]?.["2028"]),
      source: right.source,
    };
    return (
      compareValues(
        values[forecastSort.key],
        rightValues[forecastSort.key],
        forecastSort.direction,
      ) || left.id.localeCompare(right.id)
    );
  });

  return (
    <>
      <section className="parity-status" role="status" aria-live="polite" data-state={state}>
        <strong>{state}</strong>
        <span>{message}</span>
      </section>

      <section className="parity-section" aria-labelledby="policy-heading">
        <div className="research-subheading">
          <div>
            <p className="mono-label">CONTRACT PENDING / UNAVAILABLE</p>
            <h2 id="policy-heading">Market-implied FOMC probabilities</h2>
          </div>
          <span>No permitted free official source configured</span>
        </div>
        <div className="policy-layout">
          <dl className="parity-summary-grid">
            <div>
              <dt>Status</dt>
              <dd>Unavailable</dd>
            </div>
            <div>
              <dt>Provenance</dt>
              <dd>Contract pending</dd>
            </div>
            <div>
              <dt>Fallback</dt>
              <dd>None</dd>
            </div>
          </dl>
        </div>
        <p className="parity-unavailable" role="status">
          Market-implied FOMC probabilities unavailable: no permitted free official source is
          configured.
        </p>
        <p className="parity-source-note">
          No heuristic, inferred value or stale pinned meeting date is used as a substitute.
        </p>
      </section>

      <section className="parity-section parity-section-alt" aria-labelledby="calendar-heading">
        <div className="research-subheading">
          <div>
            <p className="mono-label">AUTHORITATIVE EVENT CONTRACT PENDING</p>
            <h2 id="calendar-heading">Macro calendar</h2>
          </div>
          <span>0 authoritative schedule entries</span>
        </div>
        <p className="parity-unavailable" role="status">
          Exact event instances are unavailable. No date, time, timezone or recurrence is inferred.
        </p>
        <div className="research-table-scroll parity-table-scroll">
          <table className="parity-table">
            <caption>Authoritative macro event schedule availability</caption>
            <thead>
              <tr>
                <th scope="col">Event</th>
                <th scope="col">Schedule</th>
                <th scope="col">Time</th>
                <th scope="col">Timezone</th>
                <th scope="col">Provenance</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <th scope="row">Recurring macro events</th>
                <td>Unavailable</td>
                <td>Unavailable</td>
                <td>Unavailable</td>
                <td>Contract pending</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section className="parity-section" aria-labelledby="forecast-heading">
        <div className="research-subheading">
          <div>
            <p className="mono-label">INSTITUTIONAL CONSENSUS / DATED ROWS</p>
            <h2 id="forecast-heading">Macro forecast consensus</h2>
          </div>
          <label className="parity-inline-control">
            Metric
            <select
              value={forecastMetric}
              onChange={(event) => setForecastMetric(event.target.value)}
            >
              {metrics.map((metric) => (
                <option key={metric} value={metric}>
                  {labels[metric] ?? metric}
                </option>
              ))}
            </select>
          </label>
        </div>
        {sortedForecasts.length > 0 ? (
          <div className="research-table-scroll parity-table-scroll">
            <table className="parity-table">
              <caption>
                {labels[forecastMetric] ?? forecastMetric} forecasts; unit{" "}
                {units[forecastMetric] ?? "source-defined"}
              </caption>
              <thead>
                <tr>
                  {(["name", "asOf", "y2026", "y2027", "y2028", "source"] as ForecastSortKey[]).map(
                    (key) => (
                      <SortButton
                        key={key}
                        column={key}
                        label={
                          {
                            name: "Forecaster",
                            asOf: "As of",
                            y2026: "2026",
                            y2027: "2027",
                            y2028: "2028",
                            source: "Source",
                          }[key]
                        }
                        sort={forecastSort}
                        onSort={setForecastSort}
                      />
                    ),
                  )}
                </tr>
              </thead>
              <tbody>
                {sortedForecasts.map((row) => (
                  <tr key={row.id}>
                    <th scope="row">
                      {row.name}
                      <small>{row.live ? "Live at bake time" : "Dated curated snapshot"}</small>
                    </th>
                    <td>{row.asOf ?? "Unavailable"}</td>
                    {["2026", "2027", "2028"].map((year) => {
                      const value = finite(row.values?.[forecastMetric]?.[year]);
                      return (
                        <td key={year}>
                          {value === null
                            ? "Unavailable"
                            : value.toFixed(forecastMetric === "sp500_target" ? 0 : 1)}
                        </td>
                      );
                    })}
                    <td>{row.source ?? "Unavailable"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="parity-unavailable">
            Consensus source unavailable. No substitute forecast is displayed.
          </p>
        )}
      </section>
    </>
  );
}
