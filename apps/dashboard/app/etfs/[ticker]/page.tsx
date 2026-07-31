import type { Metadata } from "next";
import { getResearchSecurity } from "../../research-data";
import { formatMarketCap, formatMoney } from "../../research-format";
import { ResearchHeader } from "../../research-header";
import { SecurityLivePanel } from "../../research/[ticker]/security-live-panel";
import { SecurityDeepReference } from "../../research/[ticker]/security-deep-reference";
import { SecurityRadar } from "../../research/[ticker]/security-radar";
import { EtfDetailReference } from "./etf-detail-reference";

interface PageProps {
  params: Promise<{ ticker: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { ticker } = await params;
  const fund = getResearchSecurity(decodeURIComponent(ticker));
  return fund?.isEtf
    ? {
        title: `${fund.ticker} ETF Research — Akribeia`,
        description: `${fund.name} score, radar, risk, classification and captured holdings.`,
      }
    : { title: "ETF unavailable — Akribeia" };
}

export default async function EtfDetailPage({ params }: PageProps) {
  const { ticker } = await params;
  const fund = getResearchSecurity(decodeURIComponent(ticker));
  if (!fund?.isEtf) {
    return (
      <>
        <ResearchHeader active="etfs" />
        <main id="main-content" tabIndex={-1} className="research-page">
          <section className="research-not-found">
            <p className="mono-label">ETF RECORD / UNAVAILABLE</p>
            <h1>No authoritative ETF record for “{decodeURIComponent(ticker).toUpperCase()}”.</h1>
            <a href="/etfs">Return to ETF Center</a>
          </section>
        </main>
      </>
    );
  }

  return (
    <>
      <ResearchHeader active="etfs" />
      <main id="main-content" tabIndex={-1} className="research-page security-page">
        <nav className="research-breadcrumb" aria-label="Breadcrumb">
          <a href="/etfs">ETF Center</a>
          <span aria-hidden="true">/</span>
          <span>{fund.ticker}</span>
        </nav>
        <section className="security-hero">
          <div>
            <p className="mono-label">EXCHANGE-TRADED FUND / AUTHORITATIVE SCORED UNIVERSE</p>
            <h1>
              {fund.ticker}
              <span>{fund.name}</span>
            </h1>
            <div className="security-badges">
              <strong>{fund.rating}</strong>
              <span>Stock-model score {fund.composite?.toFixed(2) ?? "unavailable"}</span>
              <span>{formatMarketCap(fund.marketCapB)}</span>
            </div>
          </div>
          <dl className="security-valuation-ledger">
            <div>
              <dt>Preserved price</dt>
              <dd>{formatMoney(fund.price)}</dd>
              <span>V2 research snapshot</span>
            </div>
            <div>
              <dt>Fair value</dt>
              <dd>{formatMoney(fund.fairValue)}</dd>
              <span>{fund.fairValueVerdict ?? "Unavailable"}</span>
            </div>
            <div>
              <dt>Quant buy point</dt>
              <dd>{formatMoney(fund.buyPoint)}</dd>
              <span>{fund.buyPointSignal ?? "Unavailable"}</span>
            </div>
          </dl>
        </section>
        <SecurityRadar pillars={fund.pillars} grades={fund.grades} />
        <SecurityLivePanel ticker={fund.ticker} snapshotPrice={fund.price} />
        <SecurityDeepReference ticker={fund.ticker} />
        <EtfDetailReference ticker={fund.ticker} />
        <footer className="research-route-footer">
          <span>ETF stock-model and holdings look-through scores remain explicitly distinct</span>
          <span>Research only · not investment advice</span>
        </footer>
      </main>
    </>
  );
}
