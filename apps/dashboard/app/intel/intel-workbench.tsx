"use client";

import { useEffect, useState } from "react";

interface ReferenceEnvelope {
  ok?: boolean;
  payload?: unknown;
  error?: { message?: string };
}

type PinnedState<T> =
  { status: "loading" } | { status: "error"; message: string } | { status: "ready"; payload: T };

function usePinnedDataset<T>(dataset: string): { state: PinnedState<T>; retry: () => void } {
  const [state, setState] = useState<PinnedState<T>>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setState({ status: "loading" });
    fetch(`/api/v3/research-reference?dataset=${dataset}`, {
      signal: controller.signal,
      headers: { accept: "application/json" },
    })
      .then(async (response) => {
        const body = (await response.json()) as ReferenceEnvelope;
        if (!response.ok || !body.ok || body.payload === undefined || body.payload === null) {
          throw new Error(body.error?.message ?? "The pinned reference source is unavailable.");
        }
        if (controller.signal.aborted) return;
        setState({ status: "ready", payload: body.payload as T });
      })
      .catch((reason: unknown) => {
        if (controller.signal.aborted) return;
        setState({
          status: "error",
          message:
            reason instanceof Error
              ? reason.message
              : "The pinned reference source is unavailable.",
        });
      });
    return () => controller.abort();
  }, [dataset, attempt]);

  return { state, retry: () => setAttempt((current) => current + 1) };
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function PinnedFallback({
  state,
  what,
  retry,
}: {
  state: PinnedState<unknown>;
  what: string;
  retry: () => void;
}) {
  if (state.status === "loading") {
    return (
      <p className="parity-source-note" role="status">
        Loading the pinned V2 {what}…
      </p>
    );
  }
  if (state.status === "error") {
    return (
      <>
        <p className="parity-unavailable" role="status">
          The pinned {what} is unavailable. {state.message} No substitute is shown.
        </p>
        <button type="button" className="research-load-more" onClick={retry}>
          Retry pinned source
        </button>
      </>
    );
  }
  return null;
}

interface UniverseSummaryReference {
  generated_at?: string;
  model?: string;
  summary?: string;
}

function UniverseSummaryCard() {
  const { state, retry } = usePinnedDataset<UniverseSummaryReference>("universe-summary");
  return (
    <section className="parity-section" aria-labelledby="intel-universe-heading">
      <div className="research-subheading">
        <div>
          <p className="mono-label">PINNED AI NARRATIVE / UNIVERSE-WIDE</p>
          <h2 id="intel-universe-heading">AI market summary</h2>
        </div>
        <span>The universe in a paragraph, synthesized over universe-wide quant statistics</span>
      </div>
      <PinnedFallback state={state} what="universe summary" retry={retry} />
      {state.status === "ready" ? (
        text(state.payload.summary) !== null ? (
          <>
            <p>{state.payload.summary}</p>
            <p className="parity-source-note">
              Pinned · as of {text(state.payload.generated_at) ?? "unavailable"} · model{" "}
              {text(state.payload.model) ?? "unavailable"}. This dated AI paragraph is not a
              recommendation.
            </p>
          </>
        ) : (
          <p className="parity-unavailable" role="status">
            The pinned source responded without a summary. Nothing is synthesized in its place.
          </p>
        )
      ) : null}
    </section>
  );
}

interface PunditCommentator {
  name?: string;
  firm?: string;
  stance?: string;
  key_quote?: string;
  quote_source?: string;
  quote_date?: string;
  key_views?: unknown;
  price_target_or_view?: string;
  price_target?: string;
  btc_view?: string;
  eth_view?: string;
}

interface PunditSection {
  commentators?: PunditCommentator[];
  synthesis?: string;
  themes?: unknown;
}

interface PunditsReference {
  last_updated_human?: string;
  generated_at?: string;
  equity?: PunditSection;
  crypto?: PunditSection;
}

function PunditSectionBlock({ label, section }: { label: string; section?: PunditSection }) {
  const commentators = Array.isArray(section?.commentators) ? section.commentators : [];
  const themes = Array.isArray(section?.themes)
    ? section.themes.filter((theme): theme is string => typeof theme === "string")
    : [];
  if (commentators.length === 0 && text(section?.synthesis) === null) {
    return (
      <p className="parity-unavailable" role="status">
        No pinned {label.toLowerCase()} commentary exists in the preserved snapshot.
      </p>
    );
  }
  return (
    <div className="intel-pundit-section">
      <h3>{label}</h3>
      {text(section?.synthesis) !== null ? (
        <p className="intel-pundit-synthesis">{section?.synthesis}</p>
      ) : null}
      {themes.length > 0 ? (
        <ul className="intel-theme-list" aria-label={`${label} themes`}>
          {themes.map((theme) => (
            <li key={theme}>{theme}</li>
          ))}
        </ul>
      ) : null}
      <div className="intel-commentator-grid">
        {commentators.map((commentator, index) => {
          const views = Array.isArray(commentator.key_views)
            ? commentator.key_views.filter((view): view is string => typeof view === "string")
            : [];
          const target = text(commentator.price_target_or_view) ?? text(commentator.price_target);
          return (
            <article key={`${commentator.name ?? "commentator"}-${index}`}>
              <header>
                <div>
                  <h4>{text(commentator.name) ?? "Unnamed commentator"}</h4>
                  <small>
                    {[text(commentator.firm), text(commentator.quote_date)]
                      .filter((value) => value !== null)
                      .join(" · ") || "Attribution unavailable"}
                  </small>
                </div>
                {text(commentator.stance) !== null ? <span>{commentator.stance}</span> : null}
              </header>
              {text(commentator.key_quote) !== null ? (
                <blockquote>
                  “{commentator.key_quote}”
                  {text(commentator.quote_source) !== null ? (
                    <cite> — {commentator.quote_source}</cite>
                  ) : null}
                </blockquote>
              ) : null}
              {target !== null ? (
                <p>
                  <strong>Target / view:</strong> {target}
                </p>
              ) : null}
              {text(commentator.btc_view) !== null ? (
                <p>
                  <strong>BTC:</strong> {commentator.btc_view}
                </p>
              ) : null}
              {text(commentator.eth_view) !== null ? (
                <p>
                  <strong>ETH:</strong> {commentator.eth_view}
                </p>
              ) : null}
              {views.length > 0 ? (
                <ul>
                  {views.map((view) => (
                    <li key={view}>{view}</li>
                  ))}
                </ul>
              ) : null}
            </article>
          );
        })}
      </div>
    </div>
  );
}

function PunditViewsCard() {
  const { state, retry } = usePinnedDataset<PunditsReference>("pundits");
  const asOf =
    state.status === "ready"
      ? (text(state.payload.last_updated_human) ??
        text(state.payload.generated_at) ??
        "date unavailable")
      : null;
  return (
    <section className="parity-section parity-section-alt" aria-labelledby="intel-pundits-heading">
      <div className="research-subheading">
        <div>
          <p className="mono-label">PINNED AI SYNTHESIS / DATED COMMENTARY</p>
          <h2 id="intel-pundits-heading">Pundit views</h2>
        </div>
        <span>Commentator stances AI-summarized at bake time from cited public sources</span>
      </div>
      <PinnedFallback state={state} what="pundit commentary snapshot" retry={retry} />
      {state.status === "ready" ? (
        <>
          <p className="intel-pinned-banner" role="note">
            <strong>Pinned snapshot · {asOf} · not live commentary.</strong> This preserved V2
            record froze the commentary at generation time; stances and targets have not been
            refreshed since.
          </p>
          <PunditSectionBlock label="Equity commentators" section={state.payload.equity} />
          {state.payload.crypto !== undefined ? (
            <PunditSectionBlock label="Crypto voices" section={state.payload.crypto} />
          ) : null}
          <p className="parity-source-note">
            AI-summarized third-party commentary, reproduced from the pinned V2 snapshot with its
            original attributions. Not a recommendation.
          </p>
        </>
      ) : null}
    </section>
  );
}

interface ThemeCorrelation {
  ticker?: string;
  name?: string;
  sector?: string;
  corr?: number;
  composite?: number | null;
}

interface ThemeReference {
  generated_at?: string;
  theme?: string;
  window_days?: number;
  proxy_basket?: unknown;
  correlations?: unknown;
  narrative?: string;
}

function ThematicExplorerCard() {
  const { state, retry } = usePinnedDataset<ThemeReference>("ai-theme");
  const [showAll, setShowAll] = useState(false);
  const correlations =
    state.status === "ready" && Array.isArray(state.payload.correlations)
      ? (state.payload.correlations as ThemeCorrelation[]).filter(
          (row) => typeof row.ticker === "string" && typeof row.corr === "number",
        )
      : [];
  const proxyBasket =
    state.status === "ready" && Array.isArray(state.payload.proxy_basket)
      ? state.payload.proxy_basket.filter((ticker): ticker is string => typeof ticker === "string")
      : [];
  const shown = correlations.slice(0, showAll ? 35 : 12);
  return (
    <section className="parity-section" aria-labelledby="intel-theme-heading">
      <div className="research-subheading">
        <div>
          <p className="mono-label">PINNED THEME / CORRELATION-GROUNDED</p>
          <h2 id="intel-theme-heading">
            Thematic explorer
            {state.status === "ready" && text(state.payload.theme) !== null
              ? ` — ${state.payload.theme}`
              : ""}
          </h2>
        </div>
        <span>
          Stocks ranked by return correlation to an AI-compute proxy basket; the layer narrative is
          AI-written over those ranked names only
        </span>
      </div>
      <PinnedFallback state={state} what="thematic explorer record" retry={retry} />
      {state.status === "ready" ? (
        <>
          {proxyBasket.length > 0 ? (
            <p className="parity-source-note">
              {state.payload.window_days ?? "Unavailable"}-day log-return correlation to the proxy
              basket {proxyBasket.join(" / ")}.
            </p>
          ) : null}
          {text(state.payload.narrative) !== null ? (
            <p>{state.payload.narrative}</p>
          ) : (
            <p className="parity-unavailable" role="status">
              The pinned layer-map narrative is unavailable. The correlation ranking below remains
              deterministic.
            </p>
          )}
          {shown.length > 0 ? (
            <div className="research-table-scroll parity-table-scroll">
              <table className="parity-table">
                <caption>Pinned correlation ranking to the AI-compute proxy basket</caption>
                <thead>
                  <tr>
                    <th scope="col">Ticker</th>
                    <th scope="col">Name</th>
                    <th scope="col">Sector</th>
                    <th scope="col">Corr to proxy</th>
                    <th scope="col">Quant score</th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map((row) => (
                    <tr key={row.ticker}>
                      <th scope="row">
                        <a href={`/research/${encodeURIComponent(row.ticker ?? "")}`}>
                          {row.ticker}
                        </a>
                      </th>
                      <td>{text(row.name) ?? "Unavailable"}</td>
                      <td>{text(row.sector) ?? "Unavailable"}</td>
                      <td>{row.corr?.toFixed(2)}</td>
                      <td>{typeof row.composite === "number" ? row.composite.toFixed(1) : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="parity-unavailable" role="status">
              The pinned record carries no correlation rows. No ranking is invented.
            </p>
          )}
          {correlations.length > 12 ? (
            <button
              type="button"
              className="research-load-more"
              onClick={() => setShowAll((current) => !current)}
            >
              {showAll ? "Show fewer" : `Show all ${Math.min(35, correlations.length)}`}
            </button>
          ) : null}
          <p className="parity-source-note">
            Pinned · as of {text(state.payload.generated_at) ?? "unavailable"} · AI narrative fed
            only the ranked names (the source does not record its model). Not a recommendation.
          </p>
        </>
      ) : null}
    </section>
  );
}

interface Anomaly {
  ticker?: string;
  name?: string;
  sector?: string;
  composite?: number;
  strong?: string;
  weak?: string;
  rating?: string;
  warning?: string;
}

interface AnomaliesReference {
  generated_at?: string;
  model?: string;
  anomalies?: unknown;
}

function AnomalyWatchCard() {
  const { state, retry } = usePinnedDataset<AnomaliesReference>("anomalies");
  const anomalies =
    state.status === "ready" && Array.isArray(state.payload.anomalies)
      ? (state.payload.anomalies as Anomaly[]).filter(
          (row) => typeof row.ticker === "string" && text(row.warning) !== null,
        )
      : [];
  return (
    <section
      className="parity-section parity-section-alt"
      aria-labelledby="intel-anomalies-heading"
    >
      <div className="research-subheading">
        <div>
          <p className="mono-label">DETERMINISTIC DIVERGENCE / AI-WORDED NOTE</p>
          <h2 id="intel-anomalies-heading">Anomaly watch</h2>
        </div>
        <span>
          Names whose quant pillars most diverge — the sustainability and value-trap tensions
        </span>
      </div>
      <p className="parity-source-note">
        The divergence selection is deterministic pillar-grade math — &ldquo;AI&rdquo; here brands
        only the wording of each risk note, which was fed the pillar grades and nothing else.
      </p>
      <PinnedFallback state={state} what="anomaly watch record" retry={retry} />
      {state.status === "ready" ? (
        anomalies.length > 0 ? (
          <>
            <ul className="intel-anomaly-list">
              {anomalies.slice(0, 12).map((anomaly) => (
                <li key={anomaly.ticker}>
                  <div>
                    <a href={`/research/${encodeURIComponent(anomaly.ticker ?? "")}`}>
                      {anomaly.ticker}
                    </a>
                    <span>{text(anomaly.name) ?? "Name unavailable"}</span>
                    <small>
                      ↑ {text(anomaly.strong) ?? "unavailable"} · ↓{" "}
                      {text(anomaly.weak) ?? "unavailable"}
                      {typeof anomaly.composite === "number"
                        ? ` · score ${anomaly.composite.toFixed(1)}`
                        : ""}
                      {text(anomaly.rating) !== null ? ` · ${anomaly.rating}` : ""}
                    </small>
                  </div>
                  <p>{anomaly.warning}</p>
                </li>
              ))}
            </ul>
            <p className="parity-source-note">
              Pinned · as of {text(state.payload.generated_at) ?? "unavailable"} · model{" "}
              {text(state.payload.model) ?? "unavailable"}. Not a recommendation.
            </p>
          </>
        ) : (
          <p className="parity-unavailable" role="status">
            The pinned record carries no anomaly callouts. No divergence is invented.
          </p>
        )
      ) : null}
    </section>
  );
}

export function IntelWorkbench() {
  return (
    <>
      <UniverseSummaryCard />
      <PunditViewsCard />
      <ThematicExplorerCard />
      <AnomalyWatchCard />
    </>
  );
}
