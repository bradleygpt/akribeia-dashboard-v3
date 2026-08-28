"use client";

import { Suspense, lazy, useEffect, useMemo, useState } from "react";
import type { ResearchRow } from "../research-data";
import { compareNullable, type SortDirection } from "../product-parity";
import { runMonteCarlo, type McHoldingInput, type Scenario } from "./monte-carlo";
import {
  PORTFOLIO_SOURCE_COMMIT,
  PORTFOLIO_STORAGE_KEY,
  analyzePortfolio,
  holdingsToCsv,
  normalizeHolding,
  parseHoldingsCsv,
  parseStoredHoldings,
  type Holding,
  type PortfolioPosition,
} from "./portfolio-contract";

type SortKey = "ticker" | "sector" | "shares" | "price" | "value" | "weight" | "gain" | "rating";

type AdvisorState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "unavailable"; reason: string }
  | { kind: "ready"; text: string; citations: string[]; model: string | null };

type CloseSeriesState =
  | { status: "idle" }
  | { status: "loading"; tickers: string[] }
  | { status: "ready"; closes: Map<string, number[]>; missing: string[]; capped: string[] };

// The V2 Monte Carlo derives per-holding momentum from 1y daily closes. At most
// this many held tickers are fetched; anything beyond the cap uses the honest
// vol-floor fallback and is disclosed as such.
const CLOSE_FETCH_CAP = 25;

// Lazy recharts cone (strategies-hub-chart pattern): the module only loads
// after a client-side simulation exists, so Worker SSR never evaluates recharts.
const MonteCarloFanChart = lazy(() => import("./monte-carlo-fan-chart"));

const money = (value: number | null, digits = 2) =>
  value === null
    ? "Unavailable"
    : value.toLocaleString("en-US", {
        style: "currency",
        currency: "USD",
        maximumFractionDigits: digits,
      });
const percent = (value: number | null, digits = 1) =>
  value === null ? "Unavailable" : `${value > 0 ? "+" : ""}${value.toFixed(digits)}%`;

export function PortfolioWorkbench({ rows, asOf }: { rows: ResearchRow[]; asOf: string }) {
  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [storageReady, setStorageReady] = useState(false);
  const [storageMessage, setStorageMessage] = useState<string | null>(null);
  const [ticker, setTicker] = useState("");
  const [shares, setShares] = useState("");
  const [costBasis, setCostBasis] = useState("");
  const [sort, setSort] = useState<{ key: SortKey; direction: SortDirection }>({
    key: "value",
    direction: "descending",
  });
  const [advisor, setAdvisor] = useState<AdvisorState>({ kind: "idle" });
  const [simulations, setSimulations] = useState(5000);
  const [horizonDays, setHorizonDays] = useState(252);
  const [scenario, setScenario] = useState<Scenario>("Blended");

  useEffect(() => {
    const parsed = parseStoredHoldings(window.localStorage.getItem(PORTFOLIO_STORAGE_KEY));
    setHoldings(parsed.holdings);
    setStorageMessage(parsed.error);
    setStorageReady(true);
  }, []);

  const save = (next: Holding[]) => {
    setHoldings(next);
    window.localStorage.setItem(PORTFOLIO_STORAGE_KEY, JSON.stringify(next));
    setStorageMessage(null);
  };
  const analysis = useMemo(() => analyzePortfolio(holdings, rows), [holdings, rows]);
  const sorted = useMemo(() => {
    const value = (position: PortfolioPosition): string | number | null => {
      if (sort.key === "value") return position.marketValue;
      if (sort.key === "gain") return position.gainPercent;
      if (sort.key === "weight") return position.weight;
      return position[sort.key];
    };
    return analysis.positions.toSorted(
      (left, right) =>
        compareNullable(value(left), value(right), sort.direction) ||
        left.ticker.localeCompare(right.ticker),
    );
  }, [analysis.positions, sort]);
  const [closeSeries, setCloseSeries] = useState<CloseSeriesState>({ status: "idle" });

  // Held tickers by descending market value; the fetch list is capped so a very
  // large book cannot fan out into an unbounded number of quote requests.
  const heldTickers = useMemo(
    () =>
      analysis.positions
        .filter((position) => position.weight !== null && position.weight > 0)
        .toSorted((left, right) => (right.marketValue ?? 0) - (left.marketValue ?? 0))
        .map((position) => position.ticker),
    [analysis.positions],
  );

  useEffect(() => {
    if (heldTickers.length === 0) {
      setCloseSeries({ status: "idle" });
      return;
    }
    const fetchList = heldTickers.slice(0, CLOSE_FETCH_CAP);
    const capped = heldTickers.slice(CLOSE_FETCH_CAP);
    const controller = new AbortController();
    setCloseSeries({ status: "loading", tickers: fetchList });
    Promise.all(
      fetchList.map(async (symbol) => {
        // Same quote adapter the security detail page uses; any failure or
        // absent history fails closed to the vol-floor fallback for that ticker.
        try {
          const response = await fetch(
            `/api/v3/quote?ticker=${encodeURIComponent(symbol)}&range=1y`,
            { signal: controller.signal, headers: { accept: "application/json" } },
          );
          const body = (await response.json()) as {
            ok?: boolean;
            history?: { close?: unknown } | null;
          };
          const close = body.history?.close;
          if (!response.ok || body.ok !== true || !Array.isArray(close)) {
            return [symbol, null] as const;
          }
          const closes = close.filter(
            (value): value is number => typeof value === "number" && Number.isFinite(value),
          );
          return [symbol, closes.length >= 2 ? closes : null] as const;
        } catch {
          return [symbol, null] as const;
        }
      }),
    ).then((entries) => {
      if (controller.signal.aborted) return;
      const closes = new Map<string, number[]>();
      const missing: string[] = [];
      for (const [symbol, series] of entries) {
        if (series === null) missing.push(symbol);
        else closes.set(symbol, series);
      }
      setCloseSeries({ status: "ready", closes, missing, capped });
    });
    return () => controller.abort();
  }, [heldTickers]);

  const simulation = useMemo(() => {
    if (closeSeries.status !== "ready") return null;
    const inputs: McHoldingInput[] = analysis.positions.map((position) => ({
      ticker: position.ticker,
      weight: position.weight,
      marketCapB: position.marketCapB,
      isEtf: position.isEtf,
      closes: closeSeries.closes.get(position.ticker) ?? null,
    }));
    return runMonteCarlo(inputs, analysis.totalValue, {
      sims: simulations,
      horizonDays,
      scenario,
    });
  }, [analysis, closeSeries, horizonDays, scenario, simulations]);

  const add = () => {
    const holding = normalizeHolding({
      ticker,
      shares: Number(shares),
      cost_basis: Number(costBasis),
    });
    if (holding === null) {
      setStorageMessage("Enter a valid ticker and a positive share quantity.");
      return;
    }
    save([...holdings.filter((item) => item.ticker !== holding.ticker), holding]);
    setTicker("");
    setShares("");
    setCostBasis("");
  };
  const importCsv = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      const parsed = parseHoldingsCsv(String(reader.result ?? ""));
      if (!parsed.length)
        setStorageMessage("CSV requires Symbol/Ticker and Quantity/Shares columns.");
      else save(parsed);
    };
    reader.readAsText(file);
  };
  const requestAdvisor = async () => {
    if (advisor.kind === "loading") return;
    setAdvisor({ kind: "loading" });
    try {
      // Only the kind marker is sent; holdings never leave this browser.
      const response = await fetch("/api/v3/ai/assist", {
        method: "POST",
        cache: "no-store",
        headers: {
          "content-type": "application/json",
          "x-akribeia-client": "dashboard-v3",
        },
        body: JSON.stringify({ kind: "portfolio" }),
      });
      let body: Record<string, unknown> = {};
      try {
        body = (await response.json()) as Record<string, unknown>;
      } catch {
        body = {};
      }
      const unavailableReason =
        typeof body.unavailableReason === "string" ? body.unavailableReason : null;
      const errorMessage =
        body.error !== null && typeof body.error === "object"
          ? (body.error as { message?: unknown }).message
          : undefined;
      const responseText = typeof body.text === "string" && body.text.trim() ? body.text : null;
      if (
        !response.ok ||
        body.ok === false ||
        unavailableReason !== null ||
        responseText === null
      ) {
        setAdvisor({
          kind: "unavailable",
          reason:
            unavailableReason ??
            (typeof errorMessage === "string"
              ? errorMessage
              : "The external-model portfolio read is unavailable. No substitute narrative is shown."),
        });
        return;
      }
      setAdvisor({
        kind: "ready",
        text: responseText,
        citations: Array.isArray(body.citations)
          ? body.citations.filter((item): item is string => typeof item === "string")
          : [],
        model: typeof body.model === "string" && body.model.trim() ? body.model : null,
      });
    } catch {
      setAdvisor({
        kind: "unavailable",
        reason: "The portfolio assist request failed. No substitute narrative is shown.",
      });
    }
  };

  const exportCsv = () => {
    const url = URL.createObjectURL(
      new Blob([holdingsToCsv(holdings)], { type: "text/csv;charset=utf-8" }),
    );
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "akribeia-portfolio.csv";
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return (
    <>
      <section
        className="parity-status"
        role="status"
        aria-live="polite"
        data-state={storageMessage ? "partial" : "ready"}
      >
        <strong>
          {storageReady ? (storageMessage ? "attention" : "device-local") : "loading"}
        </strong>
        <span>
          {storageMessage ??
            `Saved inputs remain only in this browser under ${PORTFOLIO_STORAGE_KEY}; they are never uploaded.`}
        </span>
      </section>
      <section className="parity-section" aria-labelledby="portfolio-input-heading">
        <div className="research-subheading">
          <div>
            <p className="mono-label">USER INPUT / DEVICE LOCAL</p>
            <h2 id="portfolio-input-heading">Holdings</h2>
          </div>
          <span>V2 contract · {PORTFOLIO_SOURCE_COMMIT.slice(0, 12)}</span>
        </div>
        <div className="parity-controls portfolio-controls">
          <label>
            Ticker
            <input
              value={ticker}
              onChange={(event) => setTicker(event.target.value)}
              autoComplete="off"
            />
          </label>
          <label>
            Shares
            <input
              inputMode="decimal"
              value={shares}
              onChange={(event) => setShares(event.target.value)}
            />
          </label>
          <label>
            Cost basis / share
            <input
              inputMode="decimal"
              value={costBasis}
              onChange={(event) => setCostBasis(event.target.value)}
              placeholder="Optional"
            />
          </label>
          <button type="button" onClick={add}>
            Add or update
          </button>
          <label className="portfolio-file">
            Import CSV
            <input
              type="file"
              accept=".csv,text/csv"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) importCsv(file);
                event.target.value = "";
              }}
            />
          </label>
          <button type="button" onClick={exportCsv} disabled={!holdings.length}>
            Export inputs
          </button>
          <button type="button" onClick={() => save([])} disabled={!holdings.length}>
            Delete portfolio
          </button>
        </div>
        <p className="parity-source-note">
          The recovered V2 schema is an unversioned array of ticker, shares, and optional
          cost_basis. Invalid or corrupt rows fail closed and are never rewritten until you
          explicitly save. Prices below are approved <strong>as_of</strong> values from {asOf}; they
          are not labeled live.
        </p>
        {analysis.unavailableTickers.length ? (
          <p className="parity-unavailable">
            Not in the approved universe: {analysis.unavailableTickers.join(", ")}. No value was
            substituted.
          </p>
        ) : null}
        {analysis.positions.length ? (
          <div className="research-table-scroll parity-table-scroll">
            <table className="parity-table portfolio-table">
              <caption>Saved user holdings joined to the approved V2 no-floor universe</caption>
              <thead>
                <tr>
                  {(
                    [
                      "ticker",
                      "sector",
                      "shares",
                      "price",
                      "value",
                      "weight",
                      "gain",
                      "rating",
                    ] as SortKey[]
                  ).map((key) => {
                    const active = sort.key === key;
                    const direction = active ? sort.direction : "none";
                    return (
                      <th key={key} scope="col" aria-sort={direction}>
                        <button
                          type="button"
                          className={
                            active ? "research-sort-header is-active" : "research-sort-header"
                          }
                          onClick={() =>
                            setSort({
                              key,
                              direction:
                                active && sort.direction === "ascending"
                                  ? "descending"
                                  : "ascending",
                            })
                          }
                        >
                          {
                            (
                              {
                                ticker: "Security",
                                sector: "Sector",
                                shares: "Shares",
                                price: "Price",
                                value: "Value",
                                weight: "Weight",
                                gain: "Gain",
                                rating: "Stock model",
                              } as const
                            )[key]
                          }
                          <span aria-hidden="true">{direction === "descending" ? "↓" : "↑"}</span>
                        </button>
                      </th>
                    );
                  })}
                  <th scope="col">Action</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((position) => (
                  <tr key={position.ticker}>
                    <th scope="row">
                      <a
                        href={
                          position.isEtf
                            ? `/etfs/${position.ticker}`
                            : `/research/${position.ticker}`
                        }
                      >
                        {position.ticker}
                      </a>
                      <small>{position.name}</small>
                    </th>
                    <td>{position.sector}</td>
                    <td>{position.shares}</td>
                    <td>
                      {money(position.price)}
                      <small>
                        {position.priceSource} · {asOf}
                      </small>
                    </td>
                    <td>{money(position.marketValue, 0)}</td>
                    <td>{percent(position.weight === null ? null : position.weight * 100)}</td>
                    <td>{percent(position.gainPercent)}</td>
                    <td>
                      {position.rating}
                      <small>
                        {position.composite === null
                          ? "Score not applicable"
                          : "Score " + position.composite.toFixed(2)}
                      </small>
                    </td>
                    <td>
                      <button
                        type="button"
                        onClick={() =>
                          save(holdings.filter((item) => item.ticker !== position.ticker))
                        }
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="parity-unavailable">
            Add a holding or import a Fidelity-style CSV to begin. No sample portfolio is
            synthesized.
          </p>
        )}
      </section>
      <section
        className="parity-section parity-section-alt"
        aria-labelledby="portfolio-analysis-heading"
      >
        <div className="research-subheading">
          <div>
            <p className="mono-label">SOURCE-BACKED ANALYSIS</p>
            <h2 id="portfolio-analysis-heading">Portfolio diagnostics</h2>
          </div>
          <span>{analysis.positions.length} matched holdings</span>
        </div>
        <dl className="parity-summary-grid portfolio-summary">
          <div>
            <dt>As-of value</dt>
            <dd>{money(analysis.totalValue, 0)}</dd>
          </div>
          <div>
            <dt>Weighted stock score</dt>
            <dd>
              {analysis.weightedComposite === null
                ? "Not applicable"
                : analysis.weightedComposite.toFixed(2) + " / 12"}
            </dd>
          </div>
          <div>
            <dt>Concentration</dt>
            <dd>{analysis.concentrationLabel}</dd>
            <small>HHI {analysis.concentrationHhi.toFixed(3)}</small>
          </div>
          <div>
            <dt>ETF treatment</dt>
            <dd>Not applicable</dd>
            <small>No 5-pillar grade</small>
          </div>
        </dl>
      </section>
      <section className="parity-section" aria-labelledby="monte-carlo-heading">
        <div className="research-subheading">
          <div>
            <p className="mono-label">DETERMINISTIC V2 METHOD / SEED 42</p>
            <h2 id="monte-carlo-heading">Monte Carlo</h2>
          </div>
          <span>Simulation, not a forecast or guarantee</span>
        </div>
        <div className="parity-controls">
          <label>
            Simulations
            <select
              value={simulations}
              onChange={(event) => setSimulations(Number(event.target.value))}
            >
              {[1000, 5000, 10000].map((value) => (
                <option key={value} value={value}>
                  {value.toLocaleString()}
                </option>
              ))}
            </select>
          </label>
          <label>
            Horizon
            <select
              value={horizonDays}
              onChange={(event) => setHorizonDays(Number(event.target.value))}
            >
              <option value={63}>3 months / 63 days</option>
              <option value={126}>6 months / 126 days</option>
              <option value={252}>1 year / 252 days</option>
            </select>
          </label>
          <label>
            Scenario
            <select
              value={scenario}
              onChange={(event) => setScenario(event.target.value as Scenario)}
            >
              {(["Blended", "Bull", "Base", "Bear"] as Scenario[]).map((value) => (
                <option key={value}>{value}</option>
              ))}
            </select>
          </label>
        </div>
        <p className="parity-source-note">
          Bull +8% drift · Base neutral · Bear −12% · Blended 25/50/25. Research simulation under
          visible assumptions — not a forecast, recommendation, or guarantee. Draws are
          deterministic (mulberry32 seed 42), so identical inputs always reproduce this output.
        </p>
        {closeSeries.status === "loading" ? (
          <p className="parity-source-note" role="status" aria-live="polite">
            Fetching 1-year daily closes for {closeSeries.tickers.length} held ticker
            {closeSeries.tickers.length === 1 ? "" : "s"}… Per-holding momentum inputs come from
            these series; nothing is simulated until the fetch settles.
          </p>
        ) : null}
        {closeSeries.status === "ready" && closeSeries.missing.length > 0 ? (
          <p className="parity-unavailable" role="status">
            Close series unavailable for {closeSeries.missing.join(", ")}. Those holdings use the V2
            volatility-floor fallback (long-term premium return, floor volatility by market-cap
            class); no price history was substituted.
          </p>
        ) : null}
        {closeSeries.status === "ready" && closeSeries.capped.length > 0 ? (
          <p className="parity-unavailable" role="status">
            Series fetch is capped at {CLOSE_FETCH_CAP} tickers; {closeSeries.capped.join(", ")}{" "}
            also use the volatility-floor fallback.
          </p>
        ) : null}
        {simulation ? (
          <>
            <dl className="parity-summary-grid portfolio-summary">
              <div>
                <dt>Expected return</dt>
                <dd>{percent(simulation.expReturnPct)}</dd>
                <small>annualized</small>
              </div>
              <div>
                <dt>Volatility</dt>
                <dd>{percent(simulation.volPct)}</dd>
                <small>annualized</small>
              </div>
              <div>
                <dt>P(gain)</dt>
                <dd>{percent(simulation.pPositive)}</dd>
              </div>
              <div>
                <dt>P(loss &gt;20%)</dt>
                <dd>{percent(simulation.pLoss20)}</dd>
              </div>
              <div>
                <dt>Scenario</dt>
                <dd>{simulation.scenario}</dd>
              </div>
            </dl>
            <div className="portfolio-mc-chart">
              <Suspense
                fallback={
                  <p className="parity-source-note" role="status">
                    Loading the percentile-cone chart…
                  </p>
                }
              >
                <MonteCarloFanChart
                  fan={simulation.fan}
                  horizonDays={simulation.horizonDays}
                  totalValue={simulation.totalValue}
                />
              </Suspense>
              <p className="parity-source-note">
                Shaded = 5th–95th and 25th–75th percentile cone; line = median simulated portfolio
                value over time.
              </p>
            </div>
            <div className="portfolio-mc-tables">
              <div className="research-table-scroll parity-table-scroll">
                <table className="parity-table portfolio-mc-table">
                  <caption>
                    Outcome probabilities across {simulation.sims.toLocaleString()} simulated paths
                  </caption>
                  <thead>
                    <tr>
                      <th scope="col">Outcome</th>
                      <th scope="col">Probability</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(
                      [
                        ["Gain 50%+", simulation.pGain50],
                        ["Gain 20%+", simulation.pGain20],
                        ["Any gain", simulation.pPositive],
                        [
                          "Loss < 10%",
                          Math.max(0, 100 - simulation.pPositive - simulation.pLoss10),
                        ],
                        ["Loss 10–20%", Math.max(0, simulation.pLoss10 - simulation.pLoss20)],
                        ["Loss > 20%", simulation.pLoss20],
                      ] as const
                    ).map(([label, value]) => (
                      <tr key={label}>
                        <td>{label}</td>
                        <td>{value.toFixed(1)}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="research-table-scroll parity-table-scroll">
                <table className="parity-table portfolio-mc-table">
                  <caption>Terminal portfolio-value percentiles; deterministic seed 42</caption>
                  <thead>
                    <tr>
                      <th scope="col">Percentile</th>
                      <th scope="col">Value</th>
                      <th scope="col">Return</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(
                      [
                        ["5th (worst)", simulation.percentiles.p5],
                        ["25th", simulation.percentiles.p25],
                        ["50th (median)", simulation.percentiles.p50],
                        ["75th", simulation.percentiles.p75],
                        ["95th (best)", simulation.percentiles.p95],
                      ] as const
                    ).map(([label, value]) => (
                      <tr key={label}>
                        <td>{label}</td>
                        <td>{money(value, 0)}</td>
                        <td className={value >= simulation.totalValue ? "research-positive" : ""}>
                          {percent((value / simulation.totalValue - 1) * 100)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            <details className="portfolio-assumptions">
              <summary>Model assumptions and per-holding inputs</summary>
              <p>
                60% long-term premium / 40% trailing momentum from each holding&rsquo;s fetched 1y
                close series (1m/3m/6m/12m); per-holding return capped at −30% to +40%; volatility
                floors by asset/market-cap class; average cross-correlation 0.45; Bull +8%, Base 0%,
                Bear −12%, Blended 25/50/25. No covariance matrix or forecast is invented.
              </p>
              <div className="research-table-scroll parity-table-scroll">
                <table className="parity-table portfolio-mc-table">
                  <caption>Per-holding simulation inputs</caption>
                  <thead>
                    <tr>
                      <th scope="col">Ticker</th>
                      <th scope="col">Exp. return</th>
                      <th scope="col">Est. volatility</th>
                      <th scope="col">Weight</th>
                      <th scope="col">Input series</th>
                    </tr>
                  </thead>
                  <tbody>
                    {simulation.holdingDetails.map((item) => (
                      <tr key={item.ticker}>
                        <td>{item.ticker}</td>
                        <td>{percent(item.expReturnPct)}</td>
                        <td>{percent(item.volPct)}</td>
                        <td>{percent(item.weightPct)}</td>
                        <td>{item.seriesUsed ? "1y daily closes" : "vol-floor fallback"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="parity-source-note">
                Mean reversion {(simulation.modelParams.meanReversionWeight * 100).toFixed(0)}%
                long-term / {((1 - simulation.modelParams.meanReversionWeight) * 100).toFixed(0)}%
                trailing · return cap {(simulation.modelParams.maxAnnualReturnCap * 100).toFixed(0)}
                % · long-term equity premium{" "}
                {(simulation.modelParams.longTermPremium * 100).toFixed(0)}% · average
                cross-correlation {simulation.modelParams.avgCorrelation.toFixed(2)} · scenario
                adjustment {simulation.modelParams.scenarioAdjustmentPct >= 0 ? "+" : ""}
                {simulation.modelParams.scenarioAdjustmentPct.toFixed(1)}%.
              </p>
            </details>
          </>
        ) : closeSeries.status !== "loading" ? (
          <p className="parity-unavailable">
            At least one matched holding with an approved finite as-of price is required. No
            simulated output is shown otherwise.
          </p>
        ) : null}
      </section>
      <section
        className="parity-section parity-section-alt"
        aria-labelledby="portfolio-advisor-heading"
      >
        <div className="research-subheading">
          <div>
            <p className="mono-label">EXTERNAL MODEL / ON REQUEST ONLY</p>
            <h2 id="portfolio-advisor-heading">AI portfolio advisor</h2>
          </div>
          <span>Runs only when you press the button · fails closed</span>
        </div>
        <p className="parity-source-note">
          The protected assist route asks an external model for a rebalance read grounded in the
          published build&rsquo;s evidence. Your saved holdings never leave this browser — only the
          request kind is sent. This dated narrative is not a recommendation.
        </p>
        <div className="parity-controls">
          <button
            type="button"
            onClick={() => void requestAdvisor()}
            disabled={advisor.kind === "loading"}
          >
            {advisor.kind === "loading"
              ? "Requesting external model…"
              : "AI rebalance read (external model)"}
          </button>
        </div>
        <div aria-live="polite">
          {advisor.kind === "unavailable" ? (
            <p className="parity-unavailable" role="alert">
              <strong>AI rebalance read unavailable.</strong> {advisor.reason}
            </p>
          ) : null}
          {advisor.kind === "ready" ? (
            <>
              <p>{advisor.text}</p>
              <p className="parity-source-note">
                {advisor.citations.length > 0
                  ? `Evidence: ${advisor.citations.join(" · ")} · `
                  : ""}
                Model {advisor.model ?? "unavailable"} · external model used on request · not a
                recommendation.
              </p>
            </>
          ) : null}
        </div>
      </section>
    </>
  );
}
