"use client";

import { useEffect, useMemo, useState } from "react";
import type { ResearchRow } from "../research-data";
import { compareNullable, type SortDirection } from "../product-parity";
import { runMonteCarlo, type Scenario } from "./monte-carlo";
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
  const simulation = useMemo(
    () =>
      runMonteCarlo(analysis.positions, analysis.totalValue, {
        simulations,
        horizonDays,
        scenario,
        seed: 42,
      }),
    [analysis, horizonDays, scenario, simulations],
  );

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
        {simulation ? (
          <>
            <dl className="parity-summary-grid portfolio-summary">
              <div>
                <dt>Expected return</dt>
                <dd>{percent(simulation.expectedReturnPercent)}</dd>
              </div>
              <div>
                <dt>Volatility</dt>
                <dd>{percent(simulation.volatilityPercent)}</dd>
              </div>
              <div>
                <dt>P(gain)</dt>
                <dd>{percent(simulation.probabilityGain)}</dd>
              </div>
              <div>
                <dt>P(loss &gt;20%)</dt>
                <dd>{percent(simulation.probabilityLoss20)}</dd>
              </div>
            </dl>
            <div className="research-table-scroll parity-table-scroll">
              <table className="parity-table portfolio-percentiles">
                <caption>
                  Terminal portfolio-value percentiles; deterministic acceptance seed 42
                </caption>
                <thead>
                  <tr>
                    <th scope="col">5th</th>
                    <th scope="col">25th</th>
                    <th scope="col">50th</th>
                    <th scope="col">75th</th>
                    <th scope="col">95th</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    {(["p5", "p25", "p50", "p75", "p95"] as const).map((key) => (
                      <td key={key}>{money(simulation.percentiles[key], 0)}</td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>
            <details className="portfolio-assumptions">
              <summary>Model assumptions and per-holding inputs</summary>
              <p>
                60% long-term premium / 40% trailing approved momentum; per-holding return capped at
                −30% to +40%; volatility floors by asset/market-cap class; average cross-correlation
                0.45; Bull +8%, Base 0%, Bear −12%, Blended 25/50/25. No covariance matrix or
                forecast is invented.
              </p>
              <ul>
                {simulation.assumptions.map((item) => (
                  <li key={item.ticker}>
                    {item.ticker}: return {percent(item.expectedReturnPercent)}, volatility{" "}
                    {percent(item.volatilityPercent)}, weight {percent(item.weightPercent)}
                  </li>
                ))}
              </ul>
            </details>
          </>
        ) : (
          <p className="parity-unavailable">
            At least one matched holding with an approved finite as-of price is required. No
            simulated output is shown otherwise.
          </p>
        )}
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
