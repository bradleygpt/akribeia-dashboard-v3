"use client";

import { useEffect, useMemo, useState } from "react";
import { formatMoney } from "../../research-format";
import { formatEtfPercent, formatUsdMagnitude } from "../etf-directory";

interface Holding {
  t: string;
  w: number;
}

interface Envelope {
  ok: boolean;
  payload?: unknown;
  error?: { message?: string };
}

interface EtfMetrics {
  shortName?: string;
  industry?: string;
  expenseRatio?: number | null;
  totalAssets?: number | null;
  navPrice?: number | null;
  currentPrice?: number | null;
  ytdReturn?: number | null;
  threeYearReturn?: number | null;
  fiveYearReturn?: number | null;
  beta3Year?: number | null;
  yield?: number | null;
  momentum_1m?: number | null;
  momentum_3m?: number | null;
  momentum_6m?: number | null;
  momentum_12m?: number | null;
}

type HoldingSort = {
  key: "security" | "weight";
  direction: "ascending" | "descending";
};

export function EtfDetailReference({ ticker }: { ticker: string }) {
  const [state, setState] = useState<
    | { status: "loading" }
    | { status: "error"; message: string }
    | {
        status: "ready";
        description: string | null;
        generatedAt: string | null;
        asOf: string | null;
        holdings: Holding[];
        coverage: number | null;
        lookthroughScore: number | null;
        ratingEligible: boolean;
        assetClass: string | null;
        metrics: EtfMetrics | null;
      }
  >({ status: "loading" });
  const [attempt, setAttempt] = useState(0);
  const [holdingSort, setHoldingSort] = useState<HoldingSort>({
    key: "weight",
    direction: "descending",
  });

  useEffect(() => {
    const controller = new AbortController();
    setState({ status: "loading" });
    Promise.all(
      ["etf", "etf-descriptions", "etf-holdings", "etf-lookthrough"].map((dataset) =>
        fetch(`/api/v3/research-reference?dataset=${dataset}`, {
          signal: controller.signal,
          headers: { accept: "application/json" },
        }).then(async (response) => {
          const body = (await response.json()) as Envelope;
          if (!response.ok || !body.ok || !body.payload) {
            throw new Error(body.error?.message ?? `${dataset} is unavailable`);
          }
          return body.payload as Record<string, unknown>;
        }),
      ),
    )
      .then(([etf, descriptions, holdings, lookthrough]) => {
        const holdingMap = holdings.etfs as
          | Record<
              string,
              {
                as_of?: string;
                coverage?: number;
                holdings?: Holding[];
              }
            >
          | undefined;
        const lookthroughMap = lookthrough.etfs as
          | Record<
              string,
              {
                coverage?: number;
                lt_score?: number | null;
                rating_ok?: boolean;
                asset_class?: string;
              }
            >
          | undefined;
        const holding = holdingMap?.[ticker];
        const look = lookthroughMap?.[ticker];
        const descriptionMap = descriptions.descriptions as Record<string, string> | undefined;
        setState({
          status: "ready",
          description: descriptionMap?.[ticker] ?? null,
          generatedAt:
            (lookthrough.generated_at as string | undefined) ??
            (holdings.generated_at as string | undefined) ??
            null,
          asOf: holding?.as_of ?? null,
          holdings: holding?.holdings ?? [],
          coverage: look?.coverage ?? holding?.coverage ?? null,
          lookthroughScore: look?.lt_score ?? null,
          ratingEligible: look?.rating_ok === true,
          assetClass: look?.asset_class ?? null,
          metrics: (etf.etfs as Record<string, EtfMetrics> | undefined)?.[ticker] ?? null,
        });
      })
      .catch((reason: unknown) => {
        if (controller.signal.aborted) return;
        setState({
          status: "error",
          message: reason instanceof Error ? reason.message : "ETF reference unavailable",
        });
      });
    return () => controller.abort();
  }, [attempt, ticker]);

  const sortedHoldings = useMemo(() => {
    if (state.status !== "ready") return [];
    return state.holdings.toSorted((left, right) => {
      const comparison =
        holdingSort.key === "security" ? left.t.localeCompare(right.t) : left.w - right.w;
      return (
        (holdingSort.direction === "ascending" ? comparison : -comparison) ||
        left.t.localeCompare(right.t)
      );
    });
  }, [holdingSort, state]);

  if (state.status === "loading") {
    return (
      <section className="etf-detail-reference" role="status">
        <strong>Loading pinned ETF holdings and classification…</strong>
      </section>
    );
  }
  if (state.status === "error") {
    return (
      <section className="etf-detail-reference" role="status">
        <strong>ETF holdings reference unavailable.</strong>
        <span>{state.message} No holdings or exposure was substituted.</span>
        <button type="button" onClick={() => setAttempt((current) => current + 1)}>
          Retry pinned source
        </button>
      </section>
    );
  }

  return (
    <section className="etf-detail-reference" aria-labelledby="etf-holdings-heading">
      <div className="security-section-heading">
        <div>
          <p className="mono-label">ETF-SPECIFIC REFERENCE</p>
          <h2 id="etf-holdings-heading">Classification and captured holdings</h2>
        </div>
        <p>
          Generated {state.generatedAt?.slice(0, 10) ?? "unavailable"} · holdings as of{" "}
          {state.asOf ?? "unavailable"}
        </p>
      </div>
      <p>{state.description ?? "No preserved description is available for this fund."}</p>
      <h3>Approved ETF source metrics</h3>
      <p className="etf-disclaimer">
        AUM is source-denominated US dollars. Momentum, yield, and multi-year return fields are
        ratios; YTD is supplied as percentage points. Missing values remain unavailable.
      </p>
      <dl className="etf-detail-summary" aria-label="Approved ETF source metrics">
        <div>
          <dt>Reference price</dt>
          <dd>{formatMoney(state.metrics?.currentPrice ?? null)}</dd>
        </div>
        <div>
          <dt>NAV</dt>
          <dd>{formatMoney(state.metrics?.navPrice ?? null)}</dd>
        </div>
        <div>
          <dt>AUM</dt>
          <dd>{formatUsdMagnitude(state.metrics?.totalAssets ?? null)}</dd>
        </div>
        <div>
          <dt>Expense ratio</dt>
          <dd>{formatEtfPercent(state.metrics?.expenseRatio ?? null, "ratio", 2)}</dd>
        </div>
        <div>
          <dt>Yield</dt>
          <dd>{formatEtfPercent(state.metrics?.yield ?? null, "ratio")}</dd>
        </div>
        <div>
          <dt>1M return</dt>
          <dd>{formatEtfPercent(state.metrics?.momentum_1m ?? null, "ratio")}</dd>
        </div>
        <div>
          <dt>3M return</dt>
          <dd>{formatEtfPercent(state.metrics?.momentum_3m ?? null, "ratio")}</dd>
        </div>
        <div>
          <dt>12M return</dt>
          <dd>{formatEtfPercent(state.metrics?.momentum_12m ?? null, "ratio")}</dd>
        </div>
        <div>
          <dt>YTD return</dt>
          <dd>{formatEtfPercent(state.metrics?.ytdReturn ?? null, "percentage-points")}</dd>
        </div>
        <div>
          <dt>3Y annualized</dt>
          <dd>{formatEtfPercent(state.metrics?.threeYearReturn ?? null, "ratio")}</dd>
        </div>
      </dl>
      <dl className="etf-detail-summary">
        <div>
          <dt>Asset class</dt>
          <dd>{state.assetClass ?? "Unavailable"}</dd>
        </div>
        <div>
          <dt>Look-through score</dt>
          <dd>{state.lookthroughScore?.toFixed(2) ?? "Unavailable"}</dd>
        </div>
        <div>
          <dt>Mapped coverage</dt>
          <dd>
            {state.coverage === null ? "Unavailable" : `${(state.coverage * 100).toFixed(0)}%`}
          </dd>
        </div>
        <div>
          <dt>Rating policy</dt>
          <dd>
            {state.ratingEligible ? "Eligible (≥50% mapped)" : "Suppressed / stock-model fallback"}
          </dd>
        </div>
      </dl>
      {state.holdings.length === 0 ? (
        <div className="research-empty" role="status">
          <strong>No captured holdings are available.</strong>
          <span>This is an explicit source-coverage gap, not a zero-holdings claim.</span>
        </div>
      ) : (
        <div className="research-table-scroll">
          <table>
            <caption>Captured top holdings</caption>
            <thead>
              <tr>
                {(
                  [
                    ["security", "Security"],
                    ["weight", "Captured weight"],
                  ] as const
                ).map(([key, label]) => {
                  const active = holdingSort.key === key;
                  const direction = active ? holdingSort.direction : "none";
                  return (
                    <th scope="col" aria-sort={direction} key={key}>
                      <button
                        type="button"
                        className={
                          active ? "research-sort-header is-active" : "research-sort-header"
                        }
                        onClick={() =>
                          setHoldingSort({
                            key,
                            direction:
                              active && holdingSort.direction === "ascending"
                                ? "descending"
                                : "ascending",
                          })
                        }
                      >
                        {label}
                        <span aria-hidden="true">{direction === "descending" ? "↓" : "↑"}</span>
                      </button>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {sortedHoldings.map(({ t, w }) => (
                <tr key={t}>
                  <td>
                    <a href={`/research/${encodeURIComponent(t)}`}>{t}</a>
                  </td>
                  <td>{(w * 100).toFixed(2)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
