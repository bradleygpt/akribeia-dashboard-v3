import { ResearchHeader } from "../research-header";
import { loadResearchUniverse } from "../research-data";
import { ResearchWorkbench } from "./research-workbench";

export const metadata = {
  title: "Core Research Workbench — Akribeia",
  description:
    "Screen, filter, sort, compare and inspect every security in the governed Akribeia research universe.",
};

export default function ResearchPage() {
  const universe = loadResearchUniverse();

  return (
    <>
      <ResearchHeader active="research" />
      <main id="main-content" tabIndex={-1} className="research-page">
        <section className="research-route-hero">
          <p className="mono-label">CORE RESEARCH / COMPLETE UNIVERSE</p>
          <h1>
            One universe.
            <span> Many ways to interrogate it.</span>
          </h1>
          <p>
            Move from a question to a defensible cohort, compare the names that survive, then open
            the security record behind each signal. Every screen runs over the complete preserved V2
            no-floor population.
          </p>
          <dl>
            <div>
              <dt>Securities</dt>
              <dd>{universe.total.toLocaleString("en-US")}</dd>
            </div>
            <div>
              <dt>Stocks</dt>
              <dd>{universe.stocks.toLocaleString("en-US")}</dd>
            </div>
            <div>
              <dt>ETFs</dt>
              <dd>{universe.etfs.toLocaleString("en-US")}</dd>
            </div>
            <div>
              <dt>Product exclusions</dt>
              <dd>0</dd>
            </div>
          </dl>
        </section>
        <ResearchWorkbench rows={universe.rows} sectors={universe.sectors} />
        <footer className="research-route-footer">
          <span>
            V2 bake {universe.source.sourceCommit.slice(0, 12)} · data{" "}
            {universe.source.bulkDataCommit.slice(0, 12)}
          </span>
          <span>Research only · not investment advice</span>
        </footer>
      </main>
    </>
  );
}
