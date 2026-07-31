"use client";

import { useEffect, useState } from "react";

interface DetailMetric {
  metric?: string;
  value?: string;
  grade?: string;
  percentile?: string;
  sector_avg?: string;
  higher_is_better?: boolean;
}

interface DetailPayload {
  pillar_detail?: Record<
    string,
    { metrics?: DetailMetric[]; pillar_grade?: string; pillar_score?: number }
  >;
  fv?: {
    num_methods_used?: number;
    north_star_metric?: string;
    methods?: Record<string, { fair_value?: number; premium_discount_pct?: number }>;
  };
  qbp?: {
    components?: Record<string, { price?: number; weight?: number; description?: string }>;
    technicals?: Record<string, string>;
  };
}

interface Envelope {
  ok: boolean;
  payload?: DetailPayload;
  source?: { bulkDataCommit: string; asOf: string };
  error?: { code?: string; message?: string };
}

export function SecurityDeepReference({ ticker }: { ticker: string }) {
  const [state, setState] = useState<
    | { status: "loading" }
    | { status: "missing" }
    | { status: "error"; message: string }
    | { status: "ready"; payload: DetailPayload; source: NonNullable<Envelope["source"]> }
  >({ status: "loading" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setState({ status: "loading" });
    fetch(`/api/v3/security-reference?ticker=${encodeURIComponent(ticker)}&kind=detail`, {
      signal: controller.signal,
      headers: { accept: "application/json" },
    })
      .then(async (response) => {
        const body = (await response.json()) as Envelope;
        if (response.status === 404) {
          setState({ status: "missing" });
          return;
        }
        if (!response.ok || !body.ok || !body.payload || !body.source) {
          throw new Error(body.error?.message ?? "Pinned security shard unavailable.");
        }
        setState({ status: "ready", payload: body.payload, source: body.source });
      })
      .catch((reason: unknown) => {
        if (controller.signal.aborted) return;
        setState({
          status: "error",
          message: reason instanceof Error ? reason.message : "Pinned security shard unavailable.",
        });
      });
    return () => controller.abort();
  }, [attempt, ticker]);

  if (state.status === "loading") {
    return (
      <section className="security-deep-reference" role="status">
        <strong>Loading preserved V2 methodology detail…</strong>
      </section>
    );
  }
  if (state.status === "missing") {
    return (
      <section className="security-deep-reference" role="status">
        <strong>No preserved deep-detail shard exists for this security.</strong>
        <span>
          The scored universe record remains available; no methodology detail was invented.
        </span>
      </section>
    );
  }
  if (state.status === "error") {
    return (
      <section className="security-deep-reference" role="status">
        <strong>Preserved methodology detail unavailable.</strong>
        <span>{state.message}</span>
        <button type="button" onClick={() => setAttempt((current) => current + 1)}>
          Retry pinned shard
        </button>
      </section>
    );
  }

  const pillarDetails = Object.entries(state.payload.pillar_detail ?? {});
  const methods = Object.entries(state.payload.fv?.methods ?? {});
  const buyPointComponents = Object.entries(state.payload.qbp?.components ?? {});

  return (
    <section className="security-deep-reference" aria-labelledby="methodology-detail-heading">
      <div className="security-section-heading">
        <div>
          <p className="mono-label">PRESERVED V2 METHOD DETAIL</p>
          <h2 id="methodology-detail-heading">
            Percentiles, fair-value methods and buy-point inputs
          </h2>
        </div>
        <p>
          Pinned bulk-data commit {state.source.bulkDataCommit.slice(0, 12)} · as of{" "}
          {state.source.asOf}
        </p>
      </div>
      <div className="security-method-pillars">
        {pillarDetails.map(([pillar, detail]) => (
          <details key={pillar}>
            <summary>
              <strong>{pillar}</strong>
              <span>
                {detail.pillar_score?.toFixed(2) ?? "—"} / 12 · {detail.pillar_grade ?? "—"}
              </span>
            </summary>
            <div className="research-table-scroll">
              <table>
                <thead>
                  <tr>
                    <th scope="col">Metric</th>
                    <th scope="col">Value</th>
                    <th scope="col">Grade</th>
                    <th scope="col">Percentile</th>
                    <th scope="col">Sector average</th>
                    <th scope="col">Direction</th>
                  </tr>
                </thead>
                <tbody>
                  {(detail.metrics ?? []).map((metric, index) => (
                    <tr key={`${metric.metric}-${index}`}>
                      <th scope="row">{metric.metric ?? "Unavailable"}</th>
                      <td>{metric.value ?? "Unavailable"}</td>
                      <td>{metric.grade ?? "—"}</td>
                      <td>{metric.percentile ?? "Unavailable"}</td>
                      <td>{metric.sector_avg ?? "Unavailable"}</td>
                      <td>
                        {metric.higher_is_better === false ? "Lower is better" : "Higher is better"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        ))}
      </div>
      <div className="security-method-columns">
        <article>
          <h3>Fair-value methods ({state.payload.fv?.num_methods_used ?? methods.length})</h3>
          <p>North-star metric: {state.payload.fv?.north_star_metric ?? "Unavailable"}</p>
          <dl>
            {methods.map(([name, method]) => (
              <div key={name}>
                <dt>{name}</dt>
                <dd>
                  {method.fair_value === undefined
                    ? "Unavailable"
                    : `$${method.fair_value.toFixed(2)}`}
                  {method.premium_discount_pct === undefined
                    ? ""
                    : ` · ${method.premium_discount_pct.toFixed(1)}% premium / discount`}
                </dd>
              </div>
            ))}
          </dl>
        </article>
        <article>
          <h3>Quant buy-point components</h3>
          <dl>
            {buyPointComponents.map(([name, component]) => (
              <div key={name}>
                <dt>{name}</dt>
                <dd>
                  {component.price === undefined ? "Unavailable" : `$${component.price.toFixed(2)}`}{" "}
                  ·{" "}
                  {component.weight === undefined
                    ? "weight unavailable"
                    : `${(component.weight * 100).toFixed(0)}% weight`}
                </dd>
                <small>{component.description}</small>
              </div>
            ))}
          </dl>
        </article>
      </div>
    </section>
  );
}
