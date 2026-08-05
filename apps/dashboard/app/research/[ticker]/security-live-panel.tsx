"use client";

import {
  computeObservedPeriodMetrics,
  isShortPricePeriod,
  labelPricePeriod,
  queryPriceRange,
  selectPricePeriod,
  summarizePricePeriod,
} from "./price-period";

import { useEffect, useMemo, useRef, useState } from "react";
import { computeRiskMetrics } from "../../research-risk";
import { formatMoney, formatPercent } from "../../research-format";

interface QuoteHistory {
  dates: string[];
  close: number[];
  high: number[];
  low: number[];
  volume: number[];
}

interface QuoteResponse {
  ok: boolean;
  ticker: string;
  generatedAt: string;
  price: number | null;
  priceSource: "live" | "as_of" | "unavailable";
  priceAsOf: string | null;
  previousClose: number | null;
  change: number | null;
  changePercent: number | null;
  dayHigh: number | null;
  dayLow: number | null;
  rangePosition: number | null;
  vwap: number | null;
  volume: number | null;
  history: QuoteHistory | null;
}

const PERIODS = [
  ["1d", "1D"],
  ["wtd", "WTD"],
  ["1w", "1W"],
  ["mtd", "MTD"],
  ["1mo", "1M"],
  ["6mo", "6M"],
  ["1y", "1Y"],
  ["2y", "2Y"],
  ["5y", "5Y"],
  ["10y", "10Y"],
  ["max", "MAX"],
] as const;

function PriceCanvas({
  dates,
  closes,
  ticker,
}: {
  dates: string[];
  closes: number[];
  ticker: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas === null || closes.length < 2) return;
    const draw = () => {
      const bounds = canvas.getBoundingClientRect();
      const scale = Math.max(1, window.devicePixelRatio || 1);
      canvas.width = Math.max(1, Math.floor(bounds.width * scale));
      canvas.height = Math.max(1, Math.floor(bounds.height * scale));
      const context = canvas.getContext("2d");
      if (context === null) return;
      context.scale(scale, scale);
      const width = bounds.width;
      const height = bounds.height;
      const padding = { top: 20, right: 18, bottom: 30, left: 58 };
      const chartWidth = width - padding.left - padding.right;
      const chartHeight = height - padding.top - padding.bottom;
      const minimum = Math.min(...closes);
      const maximum = Math.max(...closes);
      const spread = Math.max(maximum - minimum, maximum * 0.02);
      const y = (value: number) =>
        padding.top + chartHeight - ((value - minimum) / spread) * chartHeight;
      const x = (index: number) =>
        padding.left + (index / Math.max(1, closes.length - 1)) * chartWidth;

      context.clearRect(0, 0, width, height);
      context.strokeStyle = "rgba(204, 210, 199, 0.78)";
      context.lineWidth = 1;
      context.font = "10px SFMono-Regular, Consolas, monospace";
      context.fillStyle = "#68746c";
      context.textAlign = "right";
      for (let index = 0; index <= 4; index += 1) {
        const value = minimum + (spread * index) / 4;
        const gridY = y(value);
        context.beginPath();
        context.moveTo(padding.left, gridY);
        context.lineTo(width - padding.right, gridY);
        context.stroke();
        context.fillText(`$${value.toFixed(value >= 100 ? 0 : 2)}`, padding.left - 8, gridY + 3);
      }

      const gradient = context.createLinearGradient(0, padding.top, 0, height - padding.bottom);
      gradient.addColorStop(0, "rgba(183, 237, 90, 0.35)");
      gradient.addColorStop(1, "rgba(183, 237, 90, 0.02)");
      context.beginPath();
      closes.forEach((value, index) => {
        if (index === 0) context.moveTo(x(index), y(value));
        else context.lineTo(x(index), y(value));
      });
      context.lineTo(x(closes.length - 1), height - padding.bottom);
      context.lineTo(x(0), height - padding.bottom);
      context.closePath();
      context.fillStyle = gradient;
      context.fill();

      context.beginPath();
      closes.forEach((value, index) => {
        if (index === 0) context.moveTo(x(index), y(value));
        else context.lineTo(x(index), y(value));
      });
      context.strokeStyle = "#466c18";
      context.lineWidth = 2;
      context.stroke();

      context.fillStyle = "#68746c";
      context.textAlign = "left";
      context.fillText(dates[0] ?? "", padding.left, height - 8);
      context.textAlign = "right";
      context.fillText(dates.at(-1) ?? "", width - padding.right, height - 8);
    };

    draw();
    const observer = new ResizeObserver(draw);
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [closes, dates]);

  return (
    <canvas
      ref={canvasRef}
      className="security-price-canvas"
      role="img"
      aria-label={`${ticker} daily closing-price history from ${dates[0] ?? "the start"} to ${
        dates.at(-1) ?? "the latest observation"
      }`}
    />
  );
}

function metric(value: number | null, suffix = "", digits = 2): string {
  return value === null ? "Unavailable" : `${value.toFixed(digits)}${suffix}`;
}

export function SecurityLivePanel({
  ticker,
  snapshotPrice,
  snapshotAsOf,
}: {
  ticker: string;
  snapshotPrice: number | null;
  snapshotAsOf: string;
}) {
  const [period, setPeriod] = useState("1y");
  const [state, setState] = useState<
    | { status: "loading" }
    | { status: "error"; message: string }
    | { status: "ready"; quote: QuoteResponse }
  >({ status: "loading" });

  useEffect(() => {
    const controller = new AbortController();
    setState({ status: "loading" });
    fetch(
      `/api/v3/quote?ticker=${encodeURIComponent(ticker)}&range=${encodeURIComponent(queryPriceRange(period))}`,
      { signal: controller.signal, headers: { accept: "application/json" } },
    )
      .then(async (response) => {
        const body = (await response.json()) as QuoteResponse & {
          error?: { message?: string };
        };
        if (!response.ok || !body.ok) {
          throw new Error(body.error?.message ?? "Live quote is unavailable.");
        }
        setState({ status: "ready", quote: body });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setState({
          status: "error",
          message: error instanceof Error ? error.message : "Live quote is unavailable.",
        });
      });
    return () => controller.abort();
  }, [period, ticker]);

  const selectedHistory = useMemo(
    () =>
      state.status === "ready" && state.quote.history !== null
        ? selectPricePeriod(period, state.quote.history.dates, state.quote.history.close)
        : null,
    [period, state],
  );

  const shortPeriod = isShortPricePeriod(period);

  const observedMetrics = useMemo(
    () => (selectedHistory === null ? null : computeObservedPeriodMetrics(selectedHistory.close)),
    [selectedHistory],
  );

  const risk = useMemo(
    () =>
      !shortPeriod && selectedHistory !== null ? computeRiskMetrics(selectedHistory.close) : null,
    [selectedHistory, shortPeriod],
  );
  const apiPrice =
    state.status === "ready" &&
    typeof state.quote.price === "number" &&
    Number.isFinite(state.quote.price)
      ? state.quote.price
      : null;
  const displayPrice = apiPrice ?? snapshotPrice;
  const displayPriceSource =
    apiPrice !== null && state.status === "ready"
      ? state.quote.priceSource
      : snapshotPrice !== null
        ? "as_of"
        : "unavailable";
  const displayPriceAsOf =
    apiPrice !== null && state.status === "ready" ? state.quote.priceAsOf : snapshotAsOf;
  return (
    <section className="security-live" aria-labelledby="live-market-heading">
      <div className="security-section-heading">
        <div>
          <p className="mono-label">KEYLESS LIVE ADAPTER / YAHOO FINANCE</p>
          <h2 id="live-market-heading">Price history and risk</h2>
        </div>
        <div className="security-periods" aria-label="Price history period">
          {PERIODS.map(([value, label]) => (
            <button
              key={value}
              type="button"
              aria-pressed={period === value}
              onClick={() => setPeriod(value)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {state.status === "loading" ? (
        <div className="security-live-state" aria-live="polite" role="status">
          <strong>Loading the live quote and daily history…</strong>
          <span>
            Price source: {snapshotPrice === null ? "unavailable" : "as_of"} ·{" "}
            {formatMoney(snapshotPrice)} · {snapshotAsOf}
          </span>
        </div>
      ) : state.status === "error" ? (
        <div className="security-live-state security-live-error" role="status">
          <strong>Live market data is unavailable.</strong>
          <span>
            {state.message} Price source: {displayPriceSource} · {formatMoney(displayPrice)} ·{" "}
            {displayPriceAsOf}. No synthetic history or risk metric has been substituted.
          </span>
        </div>
      ) : (
        <>
          <div className="security-live-strip">
            <div>
              <span>Price · {displayPriceSource}</span>
              <strong>{formatMoney(displayPrice)}</strong>
              <small className="security-period-range">
                {displayPriceAsOf ?? "Observation time unavailable"}
              </small>
            </div>
            <div>
              <span>{labelPricePeriod(period)} return</span>
              {(() => {
                const summary =
                  selectedHistory === null
                    ? null
                    : summarizePricePeriod(selectedHistory.dates, selectedHistory.close);

                return (
                  <>
                    <strong
                      className={
                        summary !== null && summary.percent >= 0 ? "research-positive" : ""
                      }
                    >
                      {formatPercent(summary?.percent ?? null, 2, true)}
                    </strong>
                    <small className="security-period-range">
                      {summary === null
                        ? "Exact range unavailable"
                        : `${summary.startDate} → ${summary.endDate}`}
                    </small>
                  </>
                );
              })()}
            </div>
            <div>
              <span>Day range</span>
              <strong>
                {formatMoney(state.quote.dayLow)} – {formatMoney(state.quote.dayHigh)}
              </strong>
            </div>
            <div>
              <span>Intraday VWAP</span>
              <strong>{formatMoney(state.quote.vwap)}</strong>
            </div>
          </div>
          <p className="security-risk-note" role="status" aria-live="polite">
            Quote response generated {state.quote.generatedAt}. Price provenance is{" "}
            <strong>{displayPriceSource}</strong>; an unavailable live value never replaces the{" "}
            preserved as-of snapshot.
          </p>
          {selectedHistory === null ? (
            <div className="security-live-state" role="status">
              <strong>Selected-period history is unavailable.</strong>
              <span>The live price can still be used; risk metrics remain withheld.</span>
            </div>
          ) : (
            <PriceCanvas
              ticker={ticker}
              dates={selectedHistory.dates}
              closes={selectedHistory.close}
            />
          )}
          <div className="security-risk-grid" aria-label="Selected-period price diagnostics">
            {(shortPeriod
              ? [
                  [
                    "Sessions",
                    observedMetrics === null ? "Unavailable" : String(observedMetrics.sessions),
                  ],
                  ["Price change", formatMoney(observedMetrics?.priceChange ?? null)],
                  [
                    "Average session",
                    formatPercent(observedMetrics?.averageSessionReturnPercent ?? null, 2, true),
                  ],
                  [
                    "Best session",
                    formatPercent(observedMetrics?.bestSessionPercent ?? null, 2, true),
                  ],
                  [
                    "Worst session",
                    formatPercent(observedMetrics?.worstSessionPercent ?? null, 2, true),
                  ],
                  ["Max drawdown", metric(observedMetrics?.maxDrawdownPercent ?? null, "%", 1)],
                  [
                    "Current drawdown",
                    metric(observedMetrics?.currentDrawdownPercent ?? null, "%", 1),
                  ],
                ]
              : [
                  ["Annualized return", metric(risk?.cagrPercent ?? null, "%", 1)],
                  ["Volatility", metric(risk?.volatilityPercent ?? null, "%", 1)],
                  ["Sharpe", metric(risk?.sharpe ?? null)],
                  ["Sortino", metric(risk?.sortino ?? null)],
                  ["Max drawdown", metric(risk?.maxDrawdownPercent ?? null, "%", 1)],
                  ["Current drawdown", metric(risk?.currentDrawdownPercent ?? null, "%", 1)],
                  ["Calmar", metric(risk?.calmar ?? null)],
                ]
            ).map(([label, value]) => (
              <div key={label}>
                <span>{label}</span>
                <strong>{value}</strong>
              </div>
            ))}
          </div>

          <p className="security-risk-note">
            {shortPeriod
              ? "Short-range diagnostics use only the observed closes inside the selected period. Annualized Sharpe, Sortino, and Calmar are withheld because those ratios are not meaningful for such short samples."
              : "Price-only metrics faithfully port the V2 risk calculation: 252 trading days, 4% risk-free rate, sample volatility, and observed peak-to-trough drawdown. Beta and alpha remain unavailable without a reconciled benchmark series."}
          </p>
        </>
      )}
    </section>
  );
}
