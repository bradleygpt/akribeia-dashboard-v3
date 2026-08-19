import { loadResearchUniverse } from "../research-data";
import { ResearchHeader } from "../research-header";
import { EtfCenter } from "./etf-center";
import { defaultFinderBasket } from "./etf-finder-default-basket";

export const metadata = {
  title: "ETF Center — Akribeia",
  description:
    "ETF scoring, comparison, portfolio templates, holdings look-through, reverse lookup, sector maps and thematic research.",
};

export default function EtfCenterPage() {
  const universe = loadResearchUniverse();
  const etfs = universe.rows.filter(({ isEtf }) => isEtf);
  const finderBasket = defaultFinderBasket(universe.rows);

  return (
    <>
      <ResearchHeader active="etfs" />
      <main id="main-content" tabIndex={-1} className="research-page etf-page">
        <section className="research-route-hero etf-route-hero">
          <p className="mono-label">ETF CENTER / DISCOVERY + STRUCTURE</p>
          <h1>
            See the fund.
            <span> Then see through it.</span>
          </h1>
          <p>
            Compare scored ETFs with a broad official symbol-directory reference universe, then
            trace verified holdings into stock and ETF discovery. Reference-only rows never receive
            synthetic scores, and every holdings limitation stays visible.
          </p>
          <dl>
            <div>
              <dt>Scored ETFs</dt>
              <dd>{etfs.length}</dd>
            </div>
            <div>
              <dt>Source universe</dt>
              <dd>{universe.total.toLocaleString("en-US")}</dd>
            </div>
            <div>
              <dt>Hidden inclusion rules</dt>
              <dd>0</dd>
            </div>
            <div>
              <dt>Look-through policy</dt>
              <dd>Coverage shown</dd>
            </div>
          </dl>
        </section>
        <EtfCenter rows={etfs} defaultBasket={finderBasket} />
        <footer className="research-route-footer">
          <span>V2 ETF reference data · V3 fail-closed adapter</span>
          <span>Research only · not investment advice</span>
        </footer>
      </main>
    </>
  );
}
