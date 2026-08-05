import { ResearchHeader } from "../research-header";
import { loadResearchUniverse } from "../research-data";
import { PortfolioWorkbench } from "./portfolio-workbench";

export const metadata = {
  title: "Portfolio & Monte Carlo — Akribeia",
  description:
    "Device-local portfolio inputs and the recovered deterministic V2 Monte Carlo method, with explicit assumptions and no forecast claim.",
};

export default function PortfolioPage() {
  const universe = loadResearchUniverse();
  return (
    <>
      <ResearchHeader active="portfolio" />
      <main id="main-content" tabIndex={-1} className="research-page parity-page">
        <section className="research-route-hero parity-route-hero">
          <p className="mono-label">PORTFOLIO / RECOVERED V2 CONTRACT</p>
          <h1>
            Your inputs.<span> Source-backed analytics.</span>
          </h1>
          <p>
            Holdings remain on this device. Approved as-of security data supplies prices and
            factors; ETFs never receive synthetic stock grades. Monte Carlo output is a
            deterministic simulation under visible assumptions—not a forecast, recommendation, or
            guarantee.
          </p>
        </section>
        <PortfolioWorkbench rows={universe.rows} asOf={universe.source.asOf} />
        <footer className="research-route-footer">
          <span>Device-local inputs · approved V2 displayed artifact</span>
          <span>No upload · no source/model mutation · not investment advice</span>
        </footer>
      </main>
    </>
  );
}
