"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  MacroSignal,
  MarketHealthApiResponse,
  MarketIndexSnapshot,
} from "./market-health-api-types";
import {
  computeFearGreed,
  computeMacroHealth,
  creditCalm,
  ismIsStale,
  type MarketBreadth,
} from "./market-health";

type RequestState =
  | { kind: "loading"; response: null; message: string }
  | { kind: "ready"; response: MarketHealthApiResponse; message: string }
  | { kind: "error"; response: null; message: string };

function numeric(record: Record<string, unknown> | undefined, key: string): number | null {
  const value = record?.[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function text(record: Record<string, unknown> | undefined, key: string): string | null {
  const value = record?.[key];
  return typeof value === "string" && value.length > 0 ? value : null;
}

function percentage(value: number | null | undefined, digits = 1, signed = false): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "Unavailable";
  const sign = signed && value > 0 ? "+" : "";
  return `${sign}${value.toFixed(digits)}%`;
}

function number(value: number | null | undefined, digits = 1): string {
  return value === null || value === undefined || !Number.isFinite(value)
    ? "Unavailable"
    : value.toFixed(digits);
}

function sourceDate(value: string): string {
  const parsed = new Date(value);
  return Number.isNaN(parsed.valueOf())
    ? value
    : new Intl.DateTimeFormat("en-US", {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: "UTC",
      }).format(parsed);
}

function signal(signals: readonly MacroSignal[], id: string): number | null {
  return signals.find((candidate) => candidate.id === id)?.value ?? null;
}

function indexByName(
  indices: readonly MarketIndexSnapshot[],
  name: string,
): MarketIndexSnapshot | null {
  return indices.find((candidate) => candidate.name === name && candidate.ok) ?? null;
}

export function MarketHealthPanel({
  breadth,
  universeAsOf,
}: {
  breadth: MarketBreadth;
  universeAsOf: string;
}) {
  const [request, setRequest] = useState<RequestState>({
    kind: "loading",
    response: null,
    message: "Loading real V2 Market Health sources…",
  });

  const load = useCallback(async (signal?: AbortSignal) => {
    setRequest({
      kind: "loading",
      response: null,
      message: "Loading real V2 Market Health sources…",
    });

    try {
      const response = await fetch("/api/v3/market-health", {
        headers: { accept: "application/json" },
        signal,
      });
      const body = (await response.json()) as MarketHealthApiResponse;
      if (!["healthy", "partial", "unavailable"].includes(body.status)) {
        throw new Error("Market Health returned an invalid availability state.");
      }
      setRequest({
        kind: "ready",
        response: body,
        message:
          body.status === "healthy"
            ? "All required Market Health sources are available."
            : body.status === "partial"
              ? `Partial data: ${body.unavailable.join(", ")} unavailable.`
              : "Live and baked Market Health sources are unavailable.",
      });
    } catch (error) {
      if (signal?.aborted) return;
      setRequest({
        kind: "error",
        response: null,
        message:
          error instanceof Error
            ? `Market Health could not be verified: ${error.message}`
            : "Market Health could not be verified.",
      });
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  const view = useMemo(() => {
    const response = request.response;
    const staticData = response?.staticData ?? null;
    const macroData = staticData?.macro_data;
    const signals = staticData?.macro_signals?.signals ?? [];
    const realCurve = signal(signals, "T10Y2Y");
    const hyOas = signal(signals, "BAMLH0A0HYM2");
    const liveCurve = response?.live.yields.ok ? (response.live.yields.spread ?? null) : null;
    const macro = macroData ? computeMacroHealth(macroData, realCurve ?? liveCurve, hyOas) : null;
    const sp = response ? indexByName(response.live.indices, "S&P 500") : null;
    const overall =
      response?.live.vix.ok && sp !== null
        ? computeFearGreed(
            response.live.vix.score ?? null,
            breadth,
            sp.distanceFromAthPct ?? null,
            response.live.buffett.ok ? (response.live.buffett.score ?? null) : null,
            creditCalm(hyOas),
          )
        : null;
    const ismPeriod = text(macroData, "ism_asof");
    const stale = staticData !== null && ismIsStale(ismPeriod ?? undefined);
    const earnings = staticData?.earnings_forecast ?? null;
    const risk = response?.live.vix.ok
      ? (response.live.vix.level ?? "VIX available")
      : hyOas !== null
        ? hyOas > 5
          ? "Credit stress"
          : hyOas > 4
            ? "Credit elevated"
            : "Credit calm"
        : null;

    return {
      response,
      staticData,
      macroData,
      signals,
      realCurve,
      hyOas,
      macro,
      overall,
      stale,
      earnings,
      risk,
      sp,
    };
  }, [breadth, request.response]);

  const state =
    request.kind === "loading"
      ? "loading"
      : request.kind === "error"
        ? "error"
        : request.response.status === "unavailable"
          ? "unavailable"
          : view.stale
            ? "stale"
            : request.response.status;

  return (
    <section
      className="market-health"
      id="market-health"
      aria-labelledby="market-health-heading"
      data-market-health-state={state}
    >
      <div className="market-health-heading">
        <div>
          <p className="mono-label">LIVE MARKET CONTEXT</p>
          <h2 id="market-health-heading">Market Health</h2>
          <p>
            The V2 regime, macro, earnings, breadth and risk calculations—restored without new
            thresholds or invented fallback values.
          </p>
        </div>
        <div className="market-health-status" role="status" aria-live="polite">
          <span aria-hidden="true" />
          <div>
            <strong>{state}</strong>
            <p>{request.message}</p>
          </div>
          {request.kind !== "loading" ? (
            <button type="button" onClick={() => void load()}>
              Retry sources
            </button>
          ) : null}
        </div>
      </div>

      <div className="health-score-grid" aria-label="Market Health summary">
        <article>
          <p>Overall Market Health</p>
          <strong>{view.overall ? view.overall.score.toFixed(0) : "—"}</strong>
          <span>{view.overall?.classification ?? "Awaiting verified live gauges"}</span>
        </article>
        <article>
          <p>Market regime</p>
          <strong className="health-word">{view.overall?.classification ?? "Unavailable"}</strong>
          <span>Exact V2 Fear &amp; Greed regime bands</span>
        </article>
        <article>
          <p>Macro health</p>
          <strong>{view.macro?.score ?? "—"}</strong>
          <span>{view.macro?.label ?? "Baked macro inputs unavailable"}</span>
        </article>
        <article>
          <p>Earnings health</p>
          <strong>
            {view.earnings?.sp500_earnings_growth === undefined
              ? "—"
              : percentage(view.earnings.sp500_earnings_growth, 1, true)}
          </strong>
          <span>V2 modeled S&amp;P 500 YoY growth</span>
        </article>
        <article>
          <p>Market breadth</p>
          <strong>{breadth.breadthScore.toFixed(0)}</strong>
          <span>Computed across all 1,361 securities</span>
        </article>
        <article>
          <p>Risk state</p>
          <strong className="health-word">{view.risk ?? "Unavailable"}</strong>
          <span>
            {view.response?.live.vix.ok
              ? `VIX ${number(view.response.live.vix.current, 1)}`
              : view.hyOas === null
                ? "VIX and HY OAS unavailable"
                : `HY OAS ${number(view.hyOas, 2)}%`}
          </span>
        </article>
      </div>

      <div className="health-detail-grid">
        <article className="health-card">
          <div className="health-card-heading">
            <div>
              <p className="mono-label">FULL-UNIVERSE SIGNAL</p>
              <h3>Market breadth</h3>
            </div>
            <strong>{breadth.breadthScore.toFixed(0)}</strong>
          </div>
          <dl className="health-metrics">
            <div>
              <dt>Above 50-day SMA</dt>
              <dd>{percentage(breadth.pctAbove50Sma, 0)}</dd>
            </div>
            <div>
              <dt>Above 200-day SMA</dt>
              <dd>{percentage(breadth.pctAbove200Sma, 0)}</dd>
            </div>
            <div>
              <dt>Positive 1 month</dt>
              <dd>{percentage(breadth.pctPositive1m, 0)}</dd>
            </div>
            <div>
              <dt>Positive 3 months</dt>
              <dd>{percentage(breadth.pctPositive3m, 0)}</dd>
            </div>
            <div>
              <dt>Buy tier</dt>
              <dd>{percentage(breadth.buyPct, 1)}</dd>
            </div>
            <div>
              <dt>Sell tier</dt>
              <dd>{percentage(breadth.sellPct, 1)}</dd>
            </div>
          </dl>
          <p className="health-source">Universe as of {universeAsOf} · no market-cap floor.</p>
        </article>

        <article className="health-card">
          <div className="health-card-heading">
            <div>
              <p className="mono-label">EXACT V2 WEIGHTS</p>
              <h3>Macro health</h3>
            </div>
            <strong>{view.macro?.score ?? "—"}</strong>
          </div>
          {view.macro ? (
            <div className="health-bars">
              {Object.entries(view.macro.components).map(([label, value]) => (
                <div key={label}>
                  <span>{label}</span>
                  <div aria-hidden="true">
                    <i style={{ width: `${value}%` }} />
                  </div>
                  <strong>{value}</strong>
                </div>
              ))}
            </div>
          ) : (
            <p className="health-unavailable">Macro inputs are not available. No score computed.</p>
          )}
          {view.stale ? (
            <p className="health-warning">
              ISM is stale under the V2 prior-month rule. The value remains visible with this
              warning.
            </p>
          ) : null}
        </article>

        <article className="health-card health-card-wide">
          <div className="health-card-heading">
            <div>
              <p className="mono-label">REAL V2 MODEL INPUTS</p>
              <h3>Earnings health</h3>
            </div>
            <strong>
              {view.earnings?.sp500_earnings_growth === undefined
                ? "—"
                : percentage(view.earnings.sp500_earnings_growth, 1, true)}
            </strong>
          </div>
          {view.macroData ? (
            <dl className="macro-context">
              {[
                ["CPI YoY", numeric(view.macroData, "cpi_current"), "%"],
                ["Unemployment", numeric(view.macroData, "unemployment_current"), "%"],
                ["ISM manufacturing", numeric(view.macroData, "ism_manufacturing"), ""],
                ["ISM services", numeric(view.macroData, "ism_services"), ""],
                ["GDP QoQ", numeric(view.macroData, "gdp_latest_qoq_annualized"), "%"],
                ["Fed funds upper", numeric(view.macroData, "fed_funds_upper"), "%"],
              ].map(([label, value, suffix]) => (
                <div key={String(label)}>
                  <dt>{label}</dt>
                  <dd>
                    {typeof value === "number" ? `${value.toFixed(1)}${suffix}` : "Unavailable"}
                  </dd>
                </div>
              ))}
            </dl>
          ) : null}
          {view.earnings?.scenarios ? (
            <div className="health-table-wrap">
              <table className="health-table">
                <caption>V2 earnings scenarios</caption>
                <thead>
                  <tr>
                    <th scope="col">Scenario</th>
                    <th scope="col">Growth</th>
                    <th scope="col">CPI</th>
                    <th scope="col">Unemployment</th>
                    <th scope="col">ISM</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(view.earnings.scenarios).map(([name, scenario]) => (
                    <tr key={name}>
                      <th scope="row">{name}</th>
                      <td>{percentage(scenario.earnings_growth, 1, true)}</td>
                      <td>{percentage(scenario.cpi, 1)}</td>
                      <td>{percentage(scenario.unemployment, 1)}</td>
                      <td>{number(scenario.ism, 1)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="health-unavailable">
              Earnings scenarios are unavailable. No substitute estimate is displayed.
            </p>
          )}
        </article>
      </div>

      <LiveGauges response={view.response} hyOas={view.hyOas} realCurve={view.realCurve} />
      <SupportingMarketHealth response={view.response} signals={view.signals} />

      <div className="market-health-provenance">
        <span>Breadth: pinned V2 full universe · {universeAsOf}</span>
        <span>
          Static macro: {view.response?.source.staticAsOf ?? "unavailable"} · V2 app{" "}
          {view.response?.source.v2AppCommit.slice(0, 9) ?? "awaiting source"}
        </span>
        <span>
          Live: {view.response ? sourceDate(view.response.generatedAt) : "loading"} · Yahoo Finance
          + FRED
        </span>
      </div>
    </section>
  );
}

function LiveGauges({
  response,
  hyOas,
  realCurve,
}: {
  response: MarketHealthApiResponse | null;
  hyOas: number | null;
  realCurve: number | null;
}) {
  const live = response?.live;
  const sp = live ? indexByName(live.indices, "S&P 500") : null;
  const gauges = [
    {
      label: "VIX",
      value: live?.vix.ok ? number(live.vix.current, 1) : "Unavailable",
      note: live?.vix.level ?? "Live volatility unavailable",
    },
    {
      label: "S&P vs ATH",
      value: sp ? percentage(sp.distanceFromAthPct, 1, true) : "Unavailable",
      note: "One-year observation window",
    },
    {
      label: "10Y Treasury",
      value: live?.yields.ok ? percentage(live.yields.y10, 2) : "Unavailable",
      note:
        realCurve !== null
          ? `10Y–2Y ${percentage(realCurve, 2, true)}`
          : live?.yields.ok
            ? `V2 fallback spread ${percentage(live.yields.spread, 2, true)}`
            : "Curve unavailable",
    },
    {
      label: "Dollar (DXY)",
      value: live?.dxy.ok ? number(live.dxy.current, 2) : "Unavailable",
      note: live?.dxy.ok ? `YTD ${percentage(live.dxy.ytdPct, 1, true)}` : "Live DXY unavailable",
    },
    {
      label: "HY credit OAS",
      value: hyOas === null ? "Unavailable" : percentage(hyOas, 2),
      note:
        hyOas === null
          ? "Baked FRED signal unavailable"
          : hyOas > 5
            ? "Stress"
            : hyOas > 4
              ? "Elevated"
              : "Calm",
    },
    {
      label: "Buffett indicator",
      value: live?.buffett.ok ? percentage(live.buffett.ratio, 0) : "Unavailable",
      note: live?.buffett.level ?? "Live market cap unavailable",
    },
    {
      label: "PGI",
      value: live?.pgi.ok ? percentage(live.pgi.value, 1) : "Unavailable",
      note: live?.pgi.ok
        ? `${live.pgi.level} · ${live.pgi.fredKeyless ? "FRED live" : "fallback estimate flagged"}`
        : "Potential Growth Indicator unavailable",
    },
  ];

  return (
    <div className="live-gauges">
      <div className="section-heading">
        <p className="mono-label">SERVER-SIDE / KEYLESS</p>
        <h3>Live gauges</h3>
      </div>
      <div className="live-gauge-grid">
        {gauges.map((gauge) => (
          <article key={gauge.label}>
            <p>{gauge.label}</p>
            <strong>{gauge.value}</strong>
            <span>{gauge.note}</span>
          </article>
        ))}
      </div>

      {live?.indices.some(({ ok }) => ok) ? (
        <div className="health-table-wrap">
          <table className="health-table index-table">
            <caption>Major indices</caption>
            <thead>
              <tr>
                <th scope="col">Index</th>
                <th scope="col">Price</th>
                <th scope="col">1 day</th>
                <th scope="col">5 days</th>
                <th scope="col">1 month</th>
                <th scope="col">3 months</th>
                <th scope="col">YTD</th>
                <th scope="col">vs ATH</th>
              </tr>
            </thead>
            <tbody>
              {live.indices
                .filter(({ ok }) => ok)
                .map((index) => (
                  <tr key={index.name}>
                    <th scope="row">{index.name}</th>
                    <td>{number(index.price, 0)}</td>
                    <td>{percentage(index.change1dPct, 1, true)}</td>
                    <td>{percentage(index.change5dPct, 1, true)}</td>
                    <td>{percentage(index.change1mPct, 1, true)}</td>
                    <td>{percentage(index.change3mPct, 1, true)}</td>
                    <td>{percentage(index.ytdPct, 1, true)}</td>
                    <td>{percentage(index.distanceFromAthPct, 1, true)}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="health-unavailable">
          Major indices are unavailable. Baked macro and full-universe breadth remain independent.
        </p>
      )}
    </div>
  );
}

function SupportingMarketHealth({
  response,
  signals,
}: {
  response: MarketHealthApiResponse | null;
  signals: readonly MacroSignal[];
}) {
  const staticData = response?.staticData;
  const sectorForecasts = staticData?.earnings_forecast?.sector_forecasts;
  const forward = staticData?.forward_earnings?.path ?? [];
  const fed = staticData?.fed_outlook;
  const calendar = staticData?.economic_calendar ?? [];

  if (
    signals.length === 0 &&
    !sectorForecasts &&
    forward.length === 0 &&
    !fed &&
    calendar.length === 0
  ) {
    return null;
  }

  return (
    <div className="supporting-health-grid">
      {signals.length > 0 ? (
        <article className="health-card health-card-wide">
          <div className="health-card-heading">
            <div>
              <p className="mono-label">FRED / BAKED</p>
              <h3>Macro signals</h3>
            </div>
          </div>
          <div className="macro-signal-grid">
            {signals.map((item) => (
              <div key={item.id}>
                <span>{item.label}</span>
                <strong>
                  {item.value}
                  {item.unit === "k" ? "k" : "%"}
                </strong>
                <small>{item.date}</small>
              </div>
            ))}
          </div>
        </article>
      ) : null}

      {sectorForecasts ? (
        <article className="health-card">
          <div className="health-card-heading">
            <div>
              <p className="mono-label">V2 EARNINGS MODEL</p>
              <h3>Sector forecast</h3>
            </div>
          </div>
          <div className="sector-forecast">
            {Object.entries(sectorForecasts)
              .sort(([, left], [, right]) => right - left)
              .map(([sector, growth]) => (
                <div key={sector}>
                  <span>{sector}</span>
                  <i aria-hidden="true">
                    <b style={{ width: `${Math.min(100, Math.abs(growth) * 4)}%` }} />
                  </i>
                  <strong>{percentage(growth, 1, true)}</strong>
                </div>
              ))}
          </div>
        </article>
      ) : null}

      {forward.length > 0 ? (
        <article className="health-card">
          <div className="health-card-heading">
            <div>
              <p className="mono-label">FED SEP PATH</p>
              <h3>Forward earnings</h3>
            </div>
          </div>
          <div className="forward-earnings">
            {forward.map((item) => (
              <div key={item.year}>
                <span>{item.year}</span>
                <strong>{percentage(item.sp500_earnings_growth, 1, true)}</strong>
                <small>
                  PCE {item.pce_inflation}% · U {item.unemployment}%
                </small>
              </div>
            ))}
          </div>
          <p className="health-source">{staticData?.forward_earnings?.note}</p>
        </article>
      ) : null}

      {fed ? (
        <article className="health-card">
          <div className="health-card-heading">
            <div>
              <p className="mono-label">POLICY CONTEXT</p>
              <h3>Fed outlook</h3>
            </div>
          </div>
          <dl className="health-metrics">
            {[
              ["Bias", text(fed, "bias")],
              ["Cut", percentage(numeric(fed, "cut_probability"), 0)],
              ["Hold", percentage(numeric(fed, "hold_probability"), 0)],
              ["Hike", percentage(numeric(fed, "hike_probability"), 0)],
            ].map(([label, value]) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd>{value ?? "Unavailable"}</dd>
              </div>
            ))}
          </dl>
        </article>
      ) : null}

      {calendar.length > 0 ? (
        <article className="health-card">
          <div className="health-card-heading">
            <div>
              <p className="mono-label">V2 RELEASE MAP</p>
              <h3>Economic calendar</h3>
            </div>
          </div>
          <ul className="economic-calendar">
            {calendar.slice(0, 10).map((item, index) => (
              <li key={`${text(item, "event") ?? text(item, "name") ?? "event"}-${index}`}>
                <strong>{text(item, "event") ?? text(item, "name") ?? "Scheduled release"}</strong>
                <span>{text(item, "date") ?? "Schedule unavailable"}</span>
              </li>
            ))}
          </ul>
        </article>
      ) : null}
    </div>
  );
}
