"use client";

import { useEffect, useMemo, useState } from "react";
import type { ResearchRow } from "../research-data";
import { formatMarketCap, formatMoney, formatPercent } from "../research-format";
import { hasCompleteStockModelEvidence } from "./stock-model-evidence";
import {
  buildEtfDirectory,
  formatEtfPercent,
  formatUsdMagnitude,
  type EtfDirectoryRow,
} from "./etf-directory";

type Section =
  "universe" | "find" | "index" | "compare" | "builder" | "lookthrough" | "reverse" | "maps";

interface Allocation {
  category: string;
  etf: string;
  alt: string;
  weight: number;
  purpose: string;
}

interface Template {
  description: string;
  risk_score: number;
  expected_annual_return: string;
  max_drawdown_estimate: string;
  allocations: Allocation[];
}

interface EtfDatum {
  shortName?: string;
  expenseRatio?: number | null;
  totalAssets?: number | null;
  ytdReturn?: number | null;
  threeYearReturn?: number | null;
  currentPrice?: number | null;
  momentum_1m?: number | null;
  momentum_3m?: number | null;
  momentum_6m?: number | null;
  momentum_12m?: number | null;
}

interface MapRow {
  sector?: string;
  theme?: string;
  ticker: string;
  alternative: string | null;
  use_case: string;
}

interface EtfReference {
  templates: Record<string, Template>;
  sector_map: MapRow[];
  theme_map: MapRow[];
  etfs: Record<string, EtfDatum>;
  generated_at?: string;
}

interface LookthroughDatum {
  name?: string;
  price?: number | null;
  aum?: number | null;
  asset_class?: string;
  coverage: number;
  n_matched?: number;
  lt_score: number | null;
  rating_ok?: boolean;
  top?: Array<{ t: string; w: number; s: number }>;
  note?: string;
}

interface LookthroughReference {
  generated_at?: string;
  source?: string;
  min_coverage?: number;
  rating_min_coverage?: number;
  n_etfs: number;
  n_scored: number;
  median_coverage?: number;
  etfs: Record<string, LookthroughDatum>;
}

interface HoldingsReference {
  generated_at?: string;
  policy?: string;
  etfs: Record<
    string,
    {
      name?: string;
      source?: string;
      as_of?: string;
      coverage?: number;
      holdings?: Array<{ t: string; w: number }>;
    }
  >;
}

interface ReverseReference {
  generated_at?: string;
  stocks: Record<string, { n: number; etfs: Array<{ etf: string; w: number }> }>;
}

interface DescriptionReference {
  generated_at?: string;
  descriptions: Record<string, string>;
}

interface IndexCandidate {
  ticker: string;
  name: string;
  sector: string;
  mktcap_b: number;
  passive_buy_usd_b: number;
  adv_days: number;
  quant_rating: string;
}

interface IndexReference {
  generated_at?: string;
  method?: string;
  sp500_candidates: IndexCandidate[];
  ndx_candidates: IndexCandidate[];
}

type IndexSortKey = "security" | "marketCap" | "passiveBuy" | "advDays" | "rating";

interface IndexSort {
  key: IndexSortKey;
  direction: "ascending" | "descending";
}

interface ReferenceEnvelope<T> {
  ok: boolean;
  payload?: T;
  error?: { message?: string };
}

const ETF_DATASETS = [
  "etf-lookthrough",
  "etf",
  "etf-holdings",
  "etf-reverse",
  "etf-descriptions",
  "index-add-candidates",
] as const;

type EtfDataset = (typeof ETF_DATASETS)[number];

type DirectorySortKey =
  | "ticker"
  | "score"
  | "rating"
  | "price"
  | "fairValue"
  | "momentum1m"
  | "momentum3m"
  | "momentum12m"
  | "size";

interface DirectorySort {
  key: DirectorySortKey;
  direction: "ascending" | "descending";
}

function ratingClass(rating: string): string {
  return rating.includes("Buy")
    ? "research-rating research-rating-positive"
    : rating.includes("Sell")
      ? "research-rating research-rating-negative"
      : "research-rating";
}

function directoryValue(row: EtfDirectoryRow, key: DirectorySortKey): number | string | null {
  const local = row.local;
  const reference = row.reference;
  if (key === "ticker") return row.ticker;
  if (key === "score") {
    return local !== null && hasCompleteStockModelEvidence(local) ? local.composite : null;
  }
  if (key === "rating") {
    return local !== null && hasCompleteStockModelEvidence(local) ? local.rating : null;
  }
  if (key === "price") {
    return local?.price ?? row.lookthrough?.price ?? reference?.currentPrice ?? null;
  }
  if (key === "fairValue") return local?.fairValue ?? null;
  if (key === "momentum1m") return local?.raw.momentum_1m ?? reference?.momentum_1m ?? null;
  if (key === "momentum3m") return local?.raw.momentum_3m ?? reference?.momentum_3m ?? null;
  if (key === "momentum12m") return local?.raw.momentum_12m ?? reference?.momentum_12m ?? null;
  return local?.marketCapB !== null && local?.marketCapB !== undefined
    ? local.marketCapB * 1_000_000_000
    : (reference?.totalAssets ?? row.lookthrough?.aum ?? null);
}

function compareDirectoryRows(
  left: EtfDirectoryRow,
  right: EtfDirectoryRow,
  sort: DirectorySort,
): number {
  const leftValue = directoryValue(left, sort.key);
  const rightValue = directoryValue(right, sort.key);
  if (leftValue === null && rightValue === null) return left.ticker.localeCompare(right.ticker);
  if (leftValue === null) return 1;
  if (rightValue === null) return -1;
  const comparison =
    typeof leftValue === "number" && typeof rightValue === "number"
      ? leftValue - rightValue
      : String(leftValue).localeCompare(String(rightValue), "en-US", { sensitivity: "base" });
  return (
    (sort.direction === "ascending" ? comparison : -comparison) ||
    left.ticker.localeCompare(right.ticker)
  );
}

function EtfSortHeader({
  column,
  label,
  sort,
  onSort,
}: {
  column: DirectorySortKey;
  label: string;
  sort: DirectorySort;
  onSort: (sort: DirectorySort) => void;
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

function IndexSortHeader({
  column,
  label,
  sort,
  onSort,
}: {
  column: IndexSortKey;
  label: string;
  sort: IndexSort;
  onSort: (sort: IndexSort) => void;
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

function compareIndexCandidates(
  left: IndexCandidate,
  right: IndexCandidate,
  sort: IndexSort,
): number {
  const value = (candidate: IndexCandidate): number | string => {
    if (sort.key === "security") return candidate.ticker;
    if (sort.key === "marketCap") return candidate.mktcap_b;
    if (sort.key === "passiveBuy") return candidate.passive_buy_usd_b;
    if (sort.key === "advDays") return candidate.adv_days;
    return candidate.quant_rating;
  };
  const leftValue = value(left);
  const rightValue = value(right);
  const comparison =
    typeof leftValue === "number" && typeof rightValue === "number"
      ? leftValue - rightValue
      : String(leftValue).localeCompare(String(rightValue), "en-US", { sensitivity: "base" });
  return (
    (sort.direction === "ascending" ? comparison : -comparison) ||
    left.ticker.localeCompare(right.ticker)
  );
}

function EtfLink({ ticker, available }: { ticker: string; available: ReadonlySet<string> }) {
  return available.has(ticker) ? (
    <a href={`/etfs/${encodeURIComponent(ticker)}`}>{ticker}</a>
  ) : (
    <strong title="Expanded ETF reference coverage; no preserved security-detail record">
      {ticker}
    </strong>
  );
}

function ReferenceState({
  loading,
  error,
  onRetry,
  children,
}: {
  loading: boolean;
  error: string | null;
  onRetry?: () => void;
  children: React.ReactNode;
}) {
  if (loading) {
    return (
      <div className="etf-reference-state" role="status">
        <strong>Loading the pinned V2 ETF reference…</strong>
        <span>Scored-universe records remain available while the source responds.</span>
      </div>
    );
  }
  if (error !== null) {
    return (
      <div className="etf-reference-state etf-reference-error" role="status">
        <strong>ETF reference data is unavailable.</strong>
        <span>{error} No missing reference value has been invented.</span>
        {onRetry ? (
          <button type="button" onClick={onRetry}>
            Retry pinned source
          </button>
        ) : null}
      </div>
    );
  }
  return children;
}

export function EtfCenter({ rows }: { rows: ResearchRow[] }) {
  const [section, setSection] = useState<Section>("universe");
  const [reference, setReference] = useState<EtfReference | null>(null);
  const [lookthrough, setLookthrough] = useState<LookthroughReference | null>(null);
  const [holdings, setHoldings] = useState<HoldingsReference | null>(null);
  const [reverse, setReverse] = useState<ReverseReference | null>(null);
  const [descriptions, setDescriptions] = useState<DescriptionReference | null>(null);
  const [indexReference, setIndexReference] = useState<IndexReference | null>(null);
  const [datasetErrors, setDatasetErrors] = useState<Partial<Record<EtfDataset, string>>>({});
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<string[]>(rows.slice(0, 3).map(({ ticker }) => ticker));
  const [template, setTemplate] = useState("");
  const [capital, setCapital] = useState(100_000);
  const [reverseTicker, setReverseTicker] = useState("NVDA");
  const [directoryQuery, setDirectoryQuery] = useState("");
  const [assetClass, setAssetClass] = useState("all");
  const [directorySort, setDirectorySort] = useState<DirectorySort>({
    key: "ticker",
    direction: "ascending",
  });
  const [indexSort, setIndexSort] = useState<IndexSort>({
    key: "marketCap",
    direction: "descending",
  });
  const [basket, setBasket] = useState("AAPL, MSFT, NVDA");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setDatasetErrors({});
    const load = async () => {
      const failures: Partial<Record<EtfDataset, string>> = {};
      // Load sequentially, with the directory-expanding look-through shard first.
      // Each pinned shard is independent: a failure must not discard already loaded
      // directory rows or prevent other approved reference surfaces from rendering.
      for (const dataset of ETF_DATASETS) {
        try {
          const response = await fetch(`/api/v3/research-reference?dataset=${dataset}`, {
            signal: controller.signal,
            headers: { accept: "application/json" },
          });
          const body = (await response.json()) as ReferenceEnvelope<unknown>;
          if (!response.ok || !body.ok || body.payload === undefined) {
            throw new Error(body.error?.message ?? `${dataset} is unavailable.`);
          }
          if (controller.signal.aborted) return;
          if (dataset === "etf-lookthrough") setLookthrough(body.payload as LookthroughReference);
          if (dataset === "etf-holdings") setHoldings(body.payload as HoldingsReference);
          if (dataset === "etf-reverse") setReverse(body.payload as ReverseReference);
          if (dataset === "etf-descriptions") {
            setDescriptions(body.payload as DescriptionReference);
          }
          if (dataset === "index-add-candidates") {
            setIndexReference(body.payload as IndexReference);
          }
          if (dataset === "etf") {
            const parsedReference = body.payload as EtfReference;
            setReference(parsedReference);
            setTemplate((current) => current || Object.keys(parsedReference.templates)[0] || "");
          }
        } catch (reason: unknown) {
          if (controller.signal.aborted) return;
          failures[dataset] =
            reason instanceof Error ? reason.message : `${dataset} is unavailable.`;
        }
      }
      if (controller.signal.aborted) return;
      setDatasetErrors(failures);
      setLoading(false);
    };
    void load();
    return () => controller.abort();
  }, [attempt]);

  const referenceError = (...datasets: EtfDataset[]): string | null => {
    const messages = datasets.flatMap((dataset) =>
      datasetErrors[dataset] ? [`${dataset}: ${datasetErrors[dataset]}`] : [],
    );
    return messages.length > 0 ? messages.join(" ") : null;
  };

  const available = useMemo(() => new Set(rows.map(({ ticker }) => ticker)), [rows]);
  const byTicker = useMemo(() => new Map(rows.map((row) => [row.ticker, row])), [rows]);
  const directoryUniverse = useMemo(
    () => buildEtfDirectory(rows, reference?.etfs, lookthrough?.etfs, descriptions?.descriptions),
    [descriptions, lookthrough, reference, rows],
  );
  const directoryRows = useMemo(() => {
    const needle = directoryQuery.trim().toLowerCase();
    return directoryUniverse
      .filter((row) => {
        const referenceClass = row.lookthrough?.asset_class ?? "unclassified";
        return (
          (assetClass === "all" || referenceClass === assetClass) &&
          (!needle ||
            row.ticker.toLowerCase().includes(needle) ||
            row.name.toLowerCase().includes(needle) ||
            row.description.toLowerCase().includes(needle))
        );
      })
      .toSorted((left, right) => compareDirectoryRows(left, right, directorySort));
  }, [assetClass, directoryQuery, directorySort, directoryUniverse]);
  const assetClasses = useMemo(
    () =>
      [
        ...new Set([
          "unclassified",
          ...Object.values(lookthrough?.etfs ?? {}).map(
            ({ asset_class }) => asset_class ?? "unclassified",
          ),
        ]),
      ].sort(),
    [lookthrough],
  );
  const activeTemplate = reference?.templates[template];
  const reverseMatch = reverse?.stocks[reverseTicker.trim().toUpperCase()];
  const basketTickers = [
    ...new Set(
      basket
        .split(/[\s,;]+/)
        .map((ticker) => ticker.trim().toUpperCase())
        .filter(Boolean),
    ),
  ];
  const basketMatches = useMemo(
    () =>
      holdings
        ? Object.entries(holdings.etfs)
            .map(([ticker, datum]) => {
              const matched = (datum.holdings ?? []).filter(({ t }) => basketTickers.includes(t));
              return {
                ticker,
                name: datum.name ?? ticker,
                matched,
                matchedWeight: matched.reduce((sum, { w }) => sum + w, 0),
                coverage: datum.coverage ?? 0,
                asOf: datum.as_of,
              };
            })
            .filter(({ matched }) => matched.length > 0)
            .toSorted(
              (left, right) =>
                right.matched.length - left.matched.length ||
                right.matchedWeight - left.matchedWeight ||
                left.ticker.localeCompare(right.ticker),
            )
        : [],
    [basketTickers, holdings],
  );

  function toggleSelected(ticker: string) {
    setSelected((current) =>
      current.includes(ticker)
        ? current.filter((item) => item !== ticker)
        : current.length < 5
          ? [...current, ticker]
          : current,
    );
  }

  return (
    <>
      <nav className="etf-tabs" aria-label="ETF Center tools">
        {(
          [
            ["universe", "Scored universe"],
            ["find", "Find your ETF"],
            ["index", "Index Watch"],
            ["compare", "Comparison"],
            ["builder", "Portfolio builder"],
            ["lookthrough", "Holdings + look-through"],
            ["reverse", "Reverse lookup"],
            ["maps", "Sector + theme maps"],
          ] as Array<[Section, string]>
        ).map(([value, label]) => (
          <button
            type="button"
            key={value}
            aria-pressed={section === value}
            onClick={() => setSection(value)}
          >
            {label}
          </button>
        ))}
      </nav>

      {section === "universe" ? (
        <section className="etf-tool" aria-labelledby="etf-universe-heading">
          <div className="research-subheading">
            <div>
              <p className="mono-label">{directoryUniverse.length} FUNDS / PINNED ETF REFERENCE</p>
              <h2 id="etf-universe-heading">ETF reference universe</h2>
            </div>
            <span>
              Stock-model outputs appear only when every required factor family has evidence.
              Holdings and look-through coverage remain separate.
            </span>
          </div>
          {!loading && referenceError("etf-lookthrough", "etf", "etf-descriptions") ? (
            <div className="etf-reference-state etf-reference-error" role="status">
              <strong>Some pinned ETF reference fields are unavailable.</strong>
              <span>
                {referenceError("etf-lookthrough", "etf", "etf-descriptions")} Available approved
                rows remain displayed; no missing value has been invented.
              </span>
              <button type="button" onClick={() => setAttempt((current) => current + 1)}>
                Retry pinned source
              </button>
            </div>
          ) : null}
          <div className="research-table-scroll">
            <div className="etf-directory-controls">
              <label>
                <span>Search funds</span>
                <input
                  type="search"
                  value={directoryQuery}
                  onChange={(event) => setDirectoryQuery(event.target.value)}
                  placeholder="Ticker, fund name or description"
                />
              </label>
              <label>
                <span>Asset class</span>
                <select value={assetClass} onChange={(event) => setAssetClass(event.target.value)}>
                  <option value="all">All classes</option>
                  {assetClasses.map((value) => (
                    <option key={value}>{value}</option>
                  ))}
                </select>
              </label>
              <strong>
                {directoryRows.length} of {directoryUniverse.length} funds
              </strong>
            </div>
            <table className="research-table etf-universe-table">
              <thead>
                <tr>
                  {(
                    [
                      ["ticker", "ETF"],
                      ["score", "Score"],
                      ["rating", "Rating"],
                      ["price", "Price"],
                      ["fairValue", "Fair value"],
                      ["momentum1m", "1M"],
                      ["momentum3m", "3M"],
                      ["momentum12m", "12M"],
                      ["size", "Market cap / AUM"],
                    ] as Array<[DirectorySortKey, string]>
                  ).map(([column, label]) => (
                    <EtfSortHeader
                      column={column}
                      key={column}
                      label={label}
                      sort={directorySort}
                      onSort={setDirectorySort}
                    />
                  ))}
                </tr>
              </thead>
              <tbody>
                {directoryRows.map((directoryRow) => {
                  const row = directoryRow.local;
                  const momentum = directoryRow.reference;
                  const price =
                    row?.price ??
                    directoryRow.lookthrough?.price ??
                    directoryRow.reference?.currentPrice ??
                    null;
                  const assetsUsd =
                    directoryRow.reference?.totalAssets ?? directoryRow.lookthrough?.aum ?? null;

                  return (
                    <tr key={directoryRow.ticker}>
                      <td className="research-security-cell">
                        <EtfLink ticker={directoryRow.ticker} available={available} />
                        <span>{directoryRow.name}</span>
                        <small>
                          {directoryRow.description ||
                            (row === null ? "Pinned reference-only record" : "")}
                        </small>
                      </td>
                      <td className="research-number">
                        {row !== null && hasCompleteStockModelEvidence(row)
                          ? (row.composite?.toFixed(2) ?? "—")
                          : "—"}
                      </td>
                      <td>
                        <span
                          className={ratingClass(
                            row !== null && hasCompleteStockModelEvidence(row)
                              ? row.rating
                              : "Unavailable",
                          )}
                        >
                          {row !== null && hasCompleteStockModelEvidence(row)
                            ? row.rating
                            : "Unavailable"}
                        </span>
                      </td>
                      <td className="research-number">{formatMoney(price)}</td>
                      <td className="research-number">{formatMoney(row?.fairValue ?? null)}</td>
                      <td className="research-number">
                        {formatPercent(
                          (row?.raw.momentum_1m ?? momentum?.momentum_1m) === null ||
                            (row?.raw.momentum_1m ?? momentum?.momentum_1m) === undefined
                            ? null
                            : (row?.raw.momentum_1m ?? momentum?.momentum_1m ?? 0) * 100,
                          1,
                          true,
                        )}
                      </td>
                      <td className="research-number">
                        {formatPercent(
                          (row?.raw.momentum_3m ?? momentum?.momentum_3m) === null ||
                            (row?.raw.momentum_3m ?? momentum?.momentum_3m) === undefined
                            ? null
                            : (row?.raw.momentum_3m ?? momentum?.momentum_3m ?? 0) * 100,
                          1,
                          true,
                        )}
                      </td>
                      <td className="research-number">
                        {formatPercent(
                          (row?.raw.momentum_12m ?? momentum?.momentum_12m) === null ||
                            (row?.raw.momentum_12m ?? momentum?.momentum_12m) === undefined
                            ? null
                            : (row?.raw.momentum_12m ?? momentum?.momentum_12m ?? 0) * 100,
                          1,
                          true,
                        )}
                      </td>
                      <td className="research-number">
                        {row?.marketCapB !== null && row?.marketCapB !== undefined
                          ? formatMarketCap(row.marketCapB)
                          : formatUsdMagnitude(assetsUsd)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {section === "find" ? (
        <section className="etf-tool" aria-labelledby="etf-find-heading">
          <div className="research-subheading">
            <div>
              <p className="mono-label">BASKET → REFERENCE FUNDS</p>
              <h2 id="etf-find-heading">Find your ETF</h2>
            </div>
            <span>Ranked by matched holdings, then captured basket weight.</span>
          </div>
          <ReferenceState
            loading={loading}
            error={referenceError("etf-holdings")}
            onRetry={() => setAttempt((current) => current + 1)}
          >
            <label className="etf-reverse-search">
              <span>Stock basket (comma, semicolon or space separated)</span>
              <input
                type="search"
                value={basket}
                onChange={(event) => setBasket(event.target.value.toUpperCase())}
                placeholder="AAPL, MSFT, NVDA"
              />
            </label>
            {basketTickers.length === 0 || basketMatches.length === 0 ? (
              <div className="etf-reference-state" role="status">
                <strong>No captured top-holdings match.</strong>
                <span>Partial source coverage is not evidence that no ETF owns the basket.</span>
              </div>
            ) : (
              <div className="etf-find-results">
                {basketMatches.slice(0, 25).map((match) => (
                  <article key={match.ticker}>
                    <header>
                      <a href={`/etfs/${encodeURIComponent(match.ticker)}`}>{match.ticker}</a>
                      <strong>
                        {match.matched.length}/{basketTickers.length} matched
                      </strong>
                    </header>
                    <p>{match.name}</p>
                    <span>
                      {(match.matchedWeight * 100).toFixed(1)}% captured basket weight · source
                      coverage {(match.coverage * 100).toFixed(0)}%
                    </span>
                    <small>
                      {match.matched.map(({ t, w }) => `${t} ${(w * 100).toFixed(1)}%`).join(" · ")}{" "}
                      · as of {match.asOf ?? "unavailable"}
                    </small>
                  </article>
                ))}
              </div>
            )}
          </ReferenceState>
        </section>
      ) : null}

      {section === "index" ? (
        <section className="etf-tool" aria-labelledby="etf-index-heading">
          <div className="research-subheading">
            <div>
              <p className="mono-label">RULES-GATED PASSIVE FLOW WATCH</p>
              <h2 id="etf-index-heading">Index-add candidates</h2>
            </div>
            <span>Committee discretion is not modeled; these are candidates, not predictions.</span>
          </div>
          <ReferenceState
            loading={loading}
            error={referenceError("index-add-candidates")}
            onRetry={() => setAttempt((current) => current + 1)}
          >
            {indexReference ? (
              <>
                <p className="etf-disclaimer">
                  Generated {indexReference.generated_at ?? "unavailable"} ·{" "}
                  {indexReference.method ?? "rules-gated eligibility"}
                </p>
                <div className="etf-index-columns">
                  {[
                    ["S&P 500 candidates", indexReference.sp500_candidates],
                    ["Nasdaq-100 candidates", indexReference.ndx_candidates],
                  ].map(([title, candidates]) => (
                    <article key={title as string}>
                      <h3>{title as string}</h3>
                      <div className="research-table-scroll">
                        <table>
                          <thead>
                            <tr>
                              {(
                                [
                                  ["security", "Security"],
                                  ["marketCap", "Mkt cap"],
                                  ["passiveBuy", "Passive buy"],
                                  ["advDays", "ADV days"],
                                  ["rating", "Rating"],
                                ] as Array<[IndexSortKey, string]>
                              ).map(([column, label]) => (
                                <IndexSortHeader
                                  column={column}
                                  key={column}
                                  label={label}
                                  sort={indexSort}
                                  onSort={setIndexSort}
                                />
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {(candidates as IndexCandidate[])
                              .toSorted((left, right) =>
                                compareIndexCandidates(left, right, indexSort),
                              )
                              .map((candidate) => (
                                <tr key={candidate.ticker}>
                                  <td>
                                    <a href={`/research/${encodeURIComponent(candidate.ticker)}`}>
                                      {candidate.ticker}
                                    </a>
                                    <span>{candidate.name}</span>
                                  </td>
                                  <td>${candidate.mktcap_b.toFixed(1)}B</td>
                                  <td>${candidate.passive_buy_usd_b.toFixed(2)}B</td>
                                  <td>{candidate.adv_days.toFixed(1)}</td>
                                  <td>{candidate.quant_rating}</td>
                                </tr>
                              ))}
                          </tbody>
                        </table>
                      </div>
                    </article>
                  ))}
                </div>
              </>
            ) : null}
          </ReferenceState>
        </section>
      ) : null}

      {section === "compare" ? (
        <section className="etf-tool" aria-labelledby="etf-compare-heading">
          <div className="research-subheading">
            <div>
              <p className="mono-label">SELECT 2–5 FUNDS</p>
              <h2 id="etf-compare-heading">ETF comparison</h2>
            </div>
            <span>Compare scored signals with pinned ETF reference metrics.</span>
          </div>
          <div className="etf-picker">
            {rows.map((row) => (
              <button
                type="button"
                key={row.ticker}
                aria-pressed={selected.includes(row.ticker)}
                disabled={!selected.includes(row.ticker) && selected.length >= 5}
                onClick={() => toggleSelected(row.ticker)}
              >
                {row.ticker}
              </button>
            ))}
          </div>
          <div className="research-comparison-scroll">
            <button type="button" onClick={() => setSelected([])}>
              Clear comparison
            </button>
            <table className="etf-comparison-table">
              <thead>
                <tr>
                  <th scope="col">Measure</th>
                  {selected.map((ticker) => (
                    <th scope="col" key={ticker}>
                      <a href={`/etfs/${encodeURIComponent(ticker)}`}>{ticker}</a>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[
                  ["Name", (ticker: string) => byTicker.get(ticker)?.name ?? "Unavailable"],
                  [
                    "Stock-model score",
                    (ticker: string) => {
                      const row = byTicker.get(ticker);
                      return row && hasCompleteStockModelEvidence(row)
                        ? (row.composite?.toFixed(2) ?? "Unavailable")
                        : "Unavailable";
                    },
                  ],
                  [
                    "Rating",
                    (ticker: string) => {
                      const row = byTicker.get(ticker);
                      return row && hasCompleteStockModelEvidence(row) ? row.rating : "Unavailable";
                    },
                  ],
                  [
                    "Expense ratio",
                    (ticker: string) => {
                      const value = reference?.etfs[ticker]?.expenseRatio;
                      return value === null || value === undefined
                        ? "Unavailable"
                        : `${(value * 100).toFixed(2)}%`;
                    },
                  ],
                  [
                    "AUM",
                    (ticker: string) => {
                      const value = reference?.etfs[ticker]?.totalAssets;
                      return value === null || value === undefined
                        ? "Unavailable"
                        : formatMarketCap(value / 1e9);
                    },
                  ],
                  [
                    "1-month return",
                    (ticker: string) => {
                      const value =
                        reference?.etfs[ticker]?.momentum_1m ??
                        byTicker.get(ticker)?.raw.momentum_1m;
                      return formatPercent(
                        value === null || value === undefined ? null : value * 100,
                        1,
                        true,
                      );
                    },
                  ],
                  [
                    "12-month return",
                    (ticker: string) => {
                      const value =
                        reference?.etfs[ticker]?.momentum_12m ??
                        byTicker.get(ticker)?.raw.momentum_12m;
                      return formatPercent(
                        value === null || value === undefined ? null : value * 100,
                        1,
                        true,
                      );
                    },
                  ],
                  [
                    "YTD return",
                    (ticker: string) => {
                      const value = reference?.etfs[ticker]?.ytdReturn;
                      return formatEtfPercent(
                        value === null || value === undefined ? null : value,
                        "percentage-points",
                      );
                    },
                  ],
                ].map(([label, render]) => (
                  <tr key={label as string}>
                    <th scope="row">{label as string}</th>
                    {selected.map((ticker) => (
                      <td key={ticker}>{(render as (ticker: string) => string)(ticker)}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {section === "builder" ? (
        <section className="etf-tool" aria-labelledby="etf-builder-heading">
          <div className="research-subheading">
            <div>
              <p className="mono-label">PRESERVED V2 MODEL TEMPLATES</p>
              <h2 id="etf-builder-heading">Portfolio builder</h2>
            </div>
            <span>Allocation arithmetic only; expected ranges are dated V2 reference labels.</span>
          </div>
          <ReferenceState
            loading={loading}
            error={referenceError("etf")}
            onRetry={() => setAttempt((current) => current + 1)}
          >
            {reference !== null && activeTemplate !== undefined ? (
              <>
                <div className="etf-builder-controls">
                  <label>
                    <span>Template</span>
                    <select value={template} onChange={(event) => setTemplate(event.target.value)}>
                      {Object.keys(reference.templates).map((name) => (
                        <option value={name} key={name}>
                          {name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    <span>Illustrative capital</span>
                    <input
                      type="number"
                      min="0"
                      step="1000"
                      value={capital}
                      onChange={(event) => setCapital(Math.max(0, Number(event.target.value) || 0))}
                    />
                  </label>
                </div>
                <div className="etf-template-summary">
                  <div>
                    <span>Risk label</span>
                    <strong>{activeTemplate.risk_score} / 10</strong>
                  </div>
                  <div>
                    <span>V2 expected-return label</span>
                    <strong>{activeTemplate.expected_annual_return}</strong>
                  </div>
                  <div>
                    <span>V2 drawdown label</span>
                    <strong>{activeTemplate.max_drawdown_estimate}</strong>
                  </div>
                </div>
                <p className="etf-template-description">{activeTemplate.description}</p>
                <div className="research-table-scroll">
                  <table className="etf-allocation-table">
                    <thead>
                      <tr>
                        <th scope="col">Category</th>
                        <th scope="col">ETF</th>
                        <th scope="col">Alternative</th>
                        <th scope="col">Weight</th>
                        <th scope="col">Illustrative amount</th>
                        <th scope="col">Purpose</th>
                      </tr>
                    </thead>
                    <tbody>
                      {activeTemplate.allocations.map((allocation) => (
                        <tr key={`${allocation.category}-${allocation.etf}`}>
                          <td>{allocation.category}</td>
                          <td>
                            <EtfLink ticker={allocation.etf} available={available} />
                          </td>
                          <td>
                            <EtfLink ticker={allocation.alt} available={available} />
                          </td>
                          <td>{allocation.weight}%</td>
                          <td>{formatMoney(capital * (allocation.weight / 100), 0)}</td>
                          <td>{allocation.purpose}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="etf-disclaimer">
                  Expected return and drawdown ranges are preserved V2 informational labels, not
                  forecasts produced or validated by the V3 evidence system.
                </p>
              </>
            ) : null}
          </ReferenceState>
        </section>
      ) : null}

      {section === "lookthrough" ? (
        <section className="etf-tool" aria-labelledby="etf-lookthrough-heading">
          <div className="research-subheading">
            <div>
              <p className="mono-label">HOLDINGS / WEIGHT-MAPPED SCORE</p>
              <h2 id="etf-lookthrough-heading">Holdings and look-through</h2>
            </div>
            <span>Ratings are suppressed below the preserved 50% mapped-weight policy.</span>
          </div>
          <ReferenceState
            loading={loading}
            error={referenceError("etf-lookthrough", "etf-holdings")}
            onRetry={() => setAttempt((current) => current + 1)}
          >
            {lookthrough !== null && holdings !== null ? (
              <>
                <div className="etf-reference-summary">
                  <div>
                    <span>Reference funds</span>
                    <strong>{lookthrough.n_etfs}</strong>
                  </div>
                  <div>
                    <span>Look-through scored</span>
                    <strong>{lookthrough.n_scored}</strong>
                  </div>
                  <div>
                    <span>Rating coverage floor</span>
                    <strong>{((lookthrough.rating_min_coverage ?? 0.5) * 100).toFixed(0)}%</strong>
                  </div>
                  <div>
                    <span>Generated</span>
                    <strong>{lookthrough.generated_at?.slice(0, 10) ?? "Unavailable"}</strong>
                  </div>
                </div>
                <div className="etf-lookthrough-grid">
                  {Object.entries(lookthrough.etfs)
                    .filter(([, datum]) => datum.lt_score !== null)
                    .toSorted(
                      ([, left], [, right]) =>
                        (right.lt_score ?? Number.NEGATIVE_INFINITY) -
                        (left.lt_score ?? Number.NEGATIVE_INFINITY),
                    )
                    .slice(0, 30)
                    .map(([ticker, datum]) => {
                      const holding = holdings.etfs[ticker];
                      return (
                        <article key={ticker}>
                          <header>
                            <div>
                              <EtfLink ticker={ticker} available={available} />
                              <span>{datum.name ?? holding?.name ?? "Name unavailable"}</span>
                            </div>
                            <strong>{datum.lt_score?.toFixed(2)}</strong>
                          </header>
                          <div className="etf-coverage">
                            <span style={{ width: `${Math.min(100, datum.coverage * 100)}%` }} />
                          </div>
                          <p>
                            {(datum.coverage * 100).toFixed(0)}% mapped · {datum.n_matched ?? 0}{" "}
                            holdings · {datum.rating_ok ? "rating eligible" : "rating suppressed"}
                          </p>
                          <ul>
                            {(datum.top ?? []).slice(0, 5).map((item) => (
                              <li key={item.t}>
                                <a href={`/research/${encodeURIComponent(item.t)}`}>{item.t}</a>
                                <span>{(item.w * 100).toFixed(1)}%</span>
                                <strong>{item.s.toFixed(2)}</strong>
                              </li>
                            ))}
                          </ul>
                        </article>
                      );
                    })}
                </div>
                <p className="etf-disclaimer">
                  Free top-holdings coverage is partial by construction. Coverage is displayed next
                  to every score; non-equity funds and thinly mapped funds are never assigned a
                  synthetic equity-model rating.
                </p>
              </>
            ) : null}
          </ReferenceState>
        </section>
      ) : null}

      {section === "reverse" ? (
        <section className="etf-tool" aria-labelledby="etf-reverse-heading">
          <div className="research-subheading">
            <div>
              <p className="mono-label">STOCK → REFERENCE FUNDS</p>
              <h2 id="etf-reverse-heading">Reverse holdings lookup</h2>
            </div>
            <span>Find the pinned reference ETFs whose reported top holdings contain a stock.</span>
          </div>
          <ReferenceState
            loading={loading}
            error={referenceError("etf-reverse")}
            onRetry={() => setAttempt((current) => current + 1)}
          >
            {reverse !== null ? (
              <>
                <label className="etf-reverse-search">
                  <span>Stock ticker</span>
                  <input
                    type="search"
                    value={reverseTicker}
                    onChange={(event) => setReverseTicker(event.target.value.toUpperCase())}
                    placeholder="NVDA"
                  />
                </label>
                {reverseMatch === undefined ? (
                  <div className="etf-reference-state" role="status">
                    <strong>No top-holdings match.</strong>
                    <span>
                      Absence means the stock is not in this partial reference map; it does not
                      prove that no ETF owns it.
                    </span>
                  </div>
                ) : (
                  <div className="etf-reverse-results">
                    <p>
                      {reverseMatch.n} reference {reverseMatch.n === 1 ? "fund" : "funds"} report{" "}
                      <strong>{reverseTicker}</strong> among captured top holdings.
                    </p>
                    {reverseMatch.etfs.map((match) => (
                      <article key={match.etf}>
                        <EtfLink ticker={match.etf} available={available} />
                        <span>Captured weight</span>
                        <strong>{(match.w * 100).toFixed(2)}%</strong>
                      </article>
                    ))}
                  </div>
                )}
              </>
            ) : null}
          </ReferenceState>
        </section>
      ) : null}

      {section === "maps" ? (
        <section className="etf-tool" aria-labelledby="etf-maps-heading">
          <div className="research-subheading">
            <div>
              <p className="mono-label">IMPLEMENTATION MAPS</p>
              <h2 id="etf-maps-heading">Sector and theme references</h2>
            </div>
            <span>
              Preserved V2 mapping labels; use cases are informational, not recommendations.
            </span>
          </div>
          <ReferenceState
            loading={loading}
            error={referenceError("etf")}
            onRetry={() => setAttempt((current) => current + 1)}
          >
            {reference !== null ? (
              <div className="etf-map-columns">
                {[
                  ["Sector ETFs", reference.sector_map, "sector"],
                  ["Thematic ETFs", reference.theme_map, "theme"],
                ].map(([title, map, key]) => (
                  <article key={title as string}>
                    <h3>{title as string}</h3>
                    {(map as MapRow[]).map((item) => (
                      <div key={`${item[key as "sector" | "theme"]}-${item.ticker}`}>
                        <span>{item[key as "sector" | "theme"]}</span>
                        <strong>
                          <EtfLink ticker={item.ticker} available={available} />
                          {item.alternative ? ` / ${item.alternative}` : ""}
                        </strong>
                        <p>{item.use_case}</p>
                      </div>
                    ))}
                  </article>
                ))}
              </div>
            ) : null}
          </ReferenceState>
        </section>
      ) : null}
    </>
  );
}
