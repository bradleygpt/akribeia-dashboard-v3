import { buildSectorResearch, loadResearchUniverse } from "../research-data";
import { ResearchHeader } from "../research-header";
import { formatMarketCap, formatRatio } from "../research-format";
import { SectorExplorer } from "./sector-explorer";

export const metadata = {
  title: "Sector Analytics — Akribeia",
  description:
    "Compare sector valuation, score quality, dispersion, market capitalization and pillar profiles across the complete Akribeia research universe.",
};

const RATING_COLUMNS = ["Strong Buy+", "Strong Buy", "Buy", "Hold", "Sell", "Strong Sell"];

export default function SectorAnalyticsPage() {
  const sectors = buildSectorResearch();
  const universe = loadResearchUniverse();
  const largestMarketCap = Math.max(...sectors.map(({ totalMarketCapB }) => totalMarketCapB));

  return (
    <>
      <ResearchHeader active="sectors" />
      <main id="main-content" tabIndex={-1} className="research-page sector-page">
        <section className="research-route-hero sector-route-hero">
          <p className="mono-label">SECTOR ANALYTICS / COMPLETE STOCK UNIVERSE</p>
          <h1>
            Read the market
            <span> across, not just down.</span>
          </h1>
          <p>
            Sector aggregates expose where score quality concentrates, where valuation is stretched,
            and where a single company can distort the headline. Every result is computed from the
            same preserved stock population used by the screener.
          </p>
        </section>

        <SectorExplorer
          rows={universe.rows.filter(({ isEtf }) => !isEtf)}
          sectors={sectors.map(({ sector }) => sector)}
        />

        <section className="sector-landscape" aria-labelledby="sector-landscape-heading">
          <div className="research-subheading">
            <div>
              <p className="mono-label">RANKED BY EQUAL-WEIGHT COMPOSITE</p>
              <h2 id="sector-landscape-heading">Sector research landscape</h2>
            </div>
            <span>Bar length represents the average composite on the preserved V2 scale.</span>
          </div>
          <div className="sector-rank-list">
            {sectors.map((sector, index) => (
              <article key={sector.sector}>
                <span className="sector-rank-number">{String(index + 1).padStart(2, "0")}</span>
                <div className="sector-rank-name">
                  <strong>{sector.sector}</strong>
                  <small>{sector.count} stocks</small>
                </div>
                <div
                  className="sector-score-bar"
                  role="img"
                  aria-label={`${sector.sector} average score ${
                    sector.averageScore?.toFixed(2) ?? "unavailable"
                  }`}
                >
                  <span style={{ width: `${((sector.averageScore ?? 0) / 12) * 100}%` }} />
                </div>
                <strong className="sector-score-value">
                  {sector.averageScore?.toFixed(2) ?? "—"}
                </strong>
                <span>{sector.buyTierPercent.toFixed(0)}% buy tier</span>
              </article>
            ))}
          </div>
        </section>

        <section className="sector-cap-map" aria-labelledby="sector-cap-heading">
          <div className="research-subheading">
            <div>
              <p className="mono-label">CAPITAL WEIGHT / EARNINGS PROXY</p>
              <h2 id="sector-cap-heading">Scale and aggregate valuation</h2>
            </div>
            <span>
              Aggregate P/E = total market cap ÷ estimated trailing earnings. Missing or nonpositive
              P/E inputs do not contribute earnings.
            </span>
          </div>
          <div className="sector-cap-grid">
            {sectors
              .toSorted((left, right) => right.totalMarketCapB - left.totalMarketCapB)
              .map((sector) => (
                <article key={sector.sector}>
                  <div>
                    <strong>{sector.sector}</strong>
                    <span>{formatMarketCap(sector.totalMarketCapB)}</span>
                  </div>
                  <div className="sector-cap-track" aria-hidden="true">
                    <span
                      style={{
                        width: `${Math.max(2, (sector.totalMarketCapB / largestMarketCap) * 100)}%`,
                      }}
                    />
                  </div>
                  <dl>
                    <div>
                      <dt>Aggregate P/E</dt>
                      <dd>{formatRatio(sector.aggregatePe)}</dd>
                    </div>
                    <div>
                      <dt>Median score</dt>
                      <dd>{sector.medianScore?.toFixed(2) ?? "—"}</dd>
                    </div>
                    <div>
                      <dt>Dispersion</dt>
                      <dd>{sector.scoreDispersion?.toFixed(2) ?? "—"}</dd>
                    </div>
                  </dl>
                </article>
              ))}
          </div>
        </section>

        <section className="sector-ledger" aria-labelledby="sector-ledger-heading">
          <div className="research-subheading">
            <div>
              <p className="mono-label">RATING + PILLAR RECONCILIATION</p>
              <h2 id="sector-ledger-heading">Full sector ledger</h2>
            </div>
            <span>Open a row to inspect pillar averages and the best / weakest scored names.</span>
          </div>
          <div className="sector-ledger-list">
            {sectors.map((sector, index) => (
              <details key={sector.sector}>
                <summary>
                  <span>{String(index + 1).padStart(2, "0")}</span>
                  <strong>{sector.sector}</strong>
                  <span>{sector.count} stocks</span>
                  <span>Avg {sector.averageScore?.toFixed(2) ?? "—"}</span>
                  <span>{sector.buyTierPercent.toFixed(0)}% buy tier</span>
                </summary>
                <div className="sector-ledger-detail">
                  <div className="sector-rating-distribution">
                    <h3>Rating distribution</h3>
                    <div>
                      {RATING_COLUMNS.map((rating) => (
                        <span key={rating}>
                          <small>{rating}</small>
                          <strong>{sector.ratingCounts[rating] ?? 0}</strong>
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="sector-pillar-profile">
                    <h3>Average pillar profile</h3>
                    {Object.entries(sector.pillarScores).map(([pillar, value]) => (
                      <div key={pillar}>
                        <span>{pillar}</span>
                        <div aria-hidden="true">
                          <span style={{ width: `${((value ?? 0) / 12) * 100}%` }} />
                        </div>
                        <strong>{value?.toFixed(2) ?? "—"}</strong>
                      </div>
                    ))}
                  </div>
                  <div className="sector-extremes">
                    <h3>Score range</h3>
                    <a href={`/research/${encodeURIComponent(sector.best?.ticker ?? "")}`}>
                      <span>Highest</span>
                      <strong>{sector.best?.ticker ?? "—"}</strong>
                      <small>{sector.best?.composite?.toFixed(2) ?? "—"}</small>
                    </a>
                    <a href={`/research/${encodeURIComponent(sector.weakest?.ticker ?? "")}`}>
                      <span>Lowest</span>
                      <strong>{sector.weakest?.ticker ?? "—"}</strong>
                      <small>{sector.weakest?.composite?.toFixed(2) ?? "—"}</small>
                    </a>
                  </div>
                </div>
              </details>
            ))}
          </div>
        </section>

        <footer className="research-route-footer">
          <span>Derived from all 1,291 stocks · ETFs excluded from sector aggregates</span>
          <span>Research only · not investment advice</span>
        </footer>
      </main>
    </>
  );
}
