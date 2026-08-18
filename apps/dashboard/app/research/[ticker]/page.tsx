import type { Metadata } from "next";
import { ResearchHeader } from "../../research-header";
import { getResearchSecurity, loadResearchUniverse, type ResearchRow } from "../../research-data";
import { formatMarketCap, formatMoney, formatPercent, formatRatio } from "../../research-format";
import { SecurityLivePanel } from "./security-live-panel";
import { SecurityRadar } from "./security-radar";
import { SecurityDeepReference } from "./security-deep-reference";
import { SecurityInstitutional } from "./security-institutional";
import EtfDetailPage from "../../etfs/[ticker]/page";

interface PageProps {
  params: Promise<{ ticker: string }>;
}

const PILLARS = ["Valuation", "Growth", "Profitability", "Momentum", "EPS Revisions"];

function factorValue(row: ResearchRow, key: string, kind: "ratio" | "percent" | "number") {
  const value = row.raw[key] ?? null;
  if (kind === "ratio") return formatRatio(value);
  if (kind === "percent") return formatPercent(value === null ? null : value * 100, 1, true);
  return value === null ? "Unavailable" : value.toFixed(1);
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { ticker } = await params;
  const security = getResearchSecurity(decodeURIComponent(ticker));
  if (security === null) return { title: "Security unavailable — Akribeia" };
  if (security.isEtf) {
    return {
      title: `${security.ticker} ETF Research — Akribeia`,
      description: `${security.name} ETF reference, live price, risk, classification and captured holdings.`,
    };
  }
  return {
    title: `${security.ticker} Research — Akribeia`,
    description: `${security.name} quantitative score, valuation, buy point, pillars, factors, live price and V2-compatible risk metrics.`,
  };
}

export default async function SecurityDetailPage({ params }: PageProps) {
  const { ticker } = await params;
  const security = getResearchSecurity(decodeURIComponent(ticker));

  if (security === null) {
    return (
      <>
        <ResearchHeader active="research" />
        <main id="main-content" tabIndex={-1} className="research-page">
          <section className="research-not-found">
            <p className="mono-label">SECURITY RECORD / UNAVAILABLE</p>
            <h1>No preserved record for “{decodeURIComponent(ticker).toUpperCase()}”.</h1>
            <p>The requested ticker is not present in the governed 1,360-security universe.</p>
            <a href="/research">Return to the research workbench</a>
          </section>
        </main>
      </>
    );
  }

  if (security.isEtf) {
    return <EtfDetailPage params={Promise.resolve({ ticker })} />;
  }

  const peers = loadResearchUniverse()
    .rows.filter(
      (row) =>
        row.ticker !== security.ticker &&
        row.sector === security.sector &&
        row.composite !== null &&
        security.composite !== null,
    )
    .toSorted(
      (left, right) =>
        Math.abs((left.composite ?? 0) - (security.composite ?? 0)) -
        Math.abs((right.composite ?? 0) - (security.composite ?? 0)),
    )
    .slice(0, 5);
  const universe = loadResearchUniverse();
  const ranked = universe.rows
    .filter(({ composite }) => composite !== null)
    .toSorted(
      (left, right) =>
        (right.composite ?? Number.NEGATIVE_INFINITY) -
          (left.composite ?? Number.NEGATIVE_INFINITY) || left.ticker.localeCompare(right.ticker),
    );
  const rankIndex = ranked.findIndex(({ ticker: value }) => value === security.ticker);
  const rank = rankIndex < 0 ? null : rankIndex + 1;
  const percentile =
    rank === null || ranked.length < 2
      ? null
      : ((ranked.length - rank) / (ranked.length - 1)) * 100;
  const alphabetical = universe.rows.toSorted((left, right) =>
    left.ticker.localeCompare(right.ticker),
  );
  const tickerIndex = alphabetical.findIndex(({ ticker: value }) => value === security.ticker);
  const previous = tickerIndex > 0 ? alphabetical[tickerIndex - 1] : null;
  const next = tickerIndex >= 0 ? (alphabetical[tickerIndex + 1] ?? null) : null;

  return (
    <>
      <ResearchHeader active="research" />
      <main id="main-content" tabIndex={-1} className="research-page security-page">
        <nav className="research-breadcrumb" aria-label="Breadcrumb">
          <a href="/research">Research workbench</a>
          <span aria-hidden="true">/</span>
          <span>{security.ticker}</span>
        </nav>

        <section className="security-hero">
          <div>
            <p className="mono-label">
              {security.isEtf ? "EXCHANGE-TRADED FUND" : security.sector} / {security.industry}
            </p>
            <h1>
              {security.ticker}
              <span>{security.name}</span>
            </h1>
            <div className="security-badges">
              <strong>{security.rating}</strong>
              <span>Equal-weight composite {security.composite?.toFixed(2) ?? "unavailable"}</span>
              <span>
                {rank === null
                  ? "Rank unavailable"
                  : `Rank ${rank.toLocaleString("en-US")} of ${ranked.length.toLocaleString(
                      "en-US",
                    )} · ${percentile?.toFixed(1)}th percentile`}
              </span>
              <span>{formatMarketCap(security.marketCapB)}</span>
            </div>
            <a
              className="security-compare-link"
              href={`/research?compare=${encodeURIComponent(security.ticker)}`}
            >
              Start a comparison with {security.ticker}
            </a>
          </div>
          <dl className="security-valuation-ledger">
            <div>
              <dt>Preserved price</dt>
              <dd>{formatMoney(security.price)}</dd>
              <span>V2 research snapshot</span>
            </div>
            <div>
              <dt>Fair value</dt>
              <dd>{formatMoney(security.fairValue)}</dd>
              <span>
                {security.fairValueVerdict ?? "Unavailable"} ·{" "}
                {formatPercent(security.fairValuePremium, 1, true)}
              </span>
            </div>
            <div>
              <dt>Quant buy point</dt>
              <dd>{formatMoney(security.buyPoint)}</dd>
              <span>
                {security.buyPointSignal ?? "Unavailable"} ·{" "}
                {formatPercent(security.buyPointDistance, 1, true)}
              </span>
            </div>
          </dl>
        </section>

        <nav className="security-transition" aria-label="Move between securities">
          {previous ? (
            <a href={`/research/${encodeURIComponent(previous.ticker)}`}>
              ← {previous.ticker} <span>{previous.name}</span>
            </a>
          ) : (
            <span />
          )}
          <a href="/research">Return to screener</a>
          {next ? (
            <a href={`/research/${encodeURIComponent(next.ticker)}`}>
              {next.ticker} <span>{next.name}</span> →
            </a>
          ) : (
            <span />
          )}
        </nav>

        <section className="security-pillar-section" aria-labelledby="pillar-heading">
          <div className="security-section-heading">
            <div>
              <p className="mono-label">FIVE-PILLAR PROFILE</p>
              <h2 id="pillar-heading">Where the score comes from</h2>
            </div>
            <p>Preserved scores and grades; no client-side recomputation.</p>
          </div>
          <div className="security-pillar-grid">
            {PILLARS.map((pillar) => {
              const value = security.pillars[pillar] ?? null;
              return (
                <article key={pillar}>
                  <div>
                    <span>{pillar}</span>
                    <strong>{security.grades[pillar] ?? "—"}</strong>
                  </div>
                  <div
                    className="security-pillar-track"
                    role="img"
                    aria-label={`${pillar} score ${value?.toFixed(2) ?? "unavailable"} of 12`}
                  >
                    <span
                      style={{ width: `${Math.max(0, Math.min(100, ((value ?? 0) / 12) * 100))}%` }}
                    />
                  </div>
                  <small>{value?.toFixed(2) ?? "Unavailable"} / 12</small>
                </article>
              );
            })}
          </div>
        </section>

        <SecurityRadar pillars={security.pillars} grades={security.grades} />

        <SecurityLivePanel
          ticker={security.ticker}
          snapshotPrice={security.price}
          snapshotAsOf={universe.source.publishedAt.slice(0, 10)}
        />
        <SecurityDeepReference ticker={security.ticker} />

        <SecurityInstitutional ticker={security.ticker} />

        <section className="security-factors" aria-labelledby="factor-heading">
          <div className="security-section-heading">
            <div>
              <p className="mono-label">UNDERLYING RESEARCH INPUTS</p>
              <h2 id="factor-heading">Factor ledger</h2>
            </div>
            <p>Snapshot inputs used by the preserved V2 scoring surface.</p>
          </div>
          <div className="security-factor-groups">
            <article>
              <h3>Valuation</h3>
              <dl>
                {[
                  ["Forward P/E", factorValue(security, "forwardPE", "ratio")],
                  ["Trailing P/E", factorValue(security, "trailingPE", "ratio")],
                  ["PEG ratio", factorValue(security, "pegRatio", "ratio")],
                  ["Price / sales", factorValue(security, "priceToSalesTrailing12Months", "ratio")],
                  ["EV / EBITDA", factorValue(security, "enterpriseToEbitda", "ratio")],
                ].map(([label, value]) => (
                  <div key={label}>
                    <dt>{label}</dt>
                    <dd>{value}</dd>
                  </div>
                ))}
              </dl>
            </article>
            <article>
              <h3>Growth & profitability</h3>
              <dl>
                {[
                  ["Revenue growth", factorValue(security, "revenueGrowth", "percent")],
                  ["Earnings growth", factorValue(security, "earningsGrowth", "percent")],
                  ["Gross margin", factorValue(security, "grossMargins", "percent")],
                  ["Operating margin", factorValue(security, "operatingMargins", "percent")],
                  ["Return on equity", factorValue(security, "returnOnEquity", "percent")],
                ].map(([label, value]) => (
                  <div key={label}>
                    <dt>{label}</dt>
                    <dd>{value}</dd>
                  </div>
                ))}
              </dl>
            </article>
            <article>
              <h3>Momentum & revisions</h3>
              <dl>
                {[
                  ["1-month momentum", factorValue(security, "momentum_1m", "percent")],
                  ["3-month momentum", factorValue(security, "momentum_3m", "percent")],
                  ["12-month momentum", factorValue(security, "momentum_12m", "percent")],
                  ["Vs. 200-day SMA", factorValue(security, "momentum_vs_sma200", "percent")],
                  [
                    "Analyst target upside",
                    factorValue(security, "analyst_mean_target_upside", "percent"),
                  ],
                ].map(([label, value]) => (
                  <div key={label}>
                    <dt>{label}</dt>
                    <dd>{value}</dd>
                  </div>
                ))}
              </dl>
            </article>
          </div>
        </section>

        <section className="security-peers" aria-labelledby="peer-heading">
          <div className="security-section-heading">
            <div>
              <p className="mono-label">SECTOR CONTEXT / SCORE PROXIMITY</p>
              <h2 id="peer-heading">Nearest research peers</h2>
            </div>
            <a href="/sectors">Open sector analytics</a>
          </div>
          <div className="security-peer-grid">
            {peers.map((peer) => (
              <a href={`/research/${encodeURIComponent(peer.ticker)}`} key={peer.ticker}>
                <span>{peer.ticker}</span>
                <strong>{peer.composite?.toFixed(2)}</strong>
                <small>{peer.rating}</small>
              </a>
            ))}
          </div>
        </section>

        <footer className="research-route-footer">
          <span>
            Preserved research record as of {universe.source.publishedAt.slice(0, 10)} · live market
            data clearly separated
          </span>
          <span>Research only · not investment advice</span>
        </footer>
      </main>
    </>
  );
}
