import { ResearchHeader } from "../research-header";
import { IntelWorkbench } from "./intel-workbench";

export const metadata = {
  title: "AI Intel — Akribeia",
  description:
    "Pinned AI-generated reads over the preserved V2 research system: universe summary, pundit views, thematic explorer and anomaly watch. Every card is dated, provenance-labeled and fails closed when its pinned source is unavailable.",
};

export default function IntelPage() {
  return (
    <>
      <ResearchHeader active="intel" />
      <main id="main-content" tabIndex={-1} className="research-page parity-page">
        <section className="research-route-hero parity-route-hero">
          <p className="mono-label">AI INTEL / PINNED NARRATIVES · EXPLICIT PROVENANCE</p>
          <h1>
            Dated AI reads.
            <span> Never disguised as live.</span>
          </h1>
          <p>
            Every card on this page is a pinned, dated AI-generated read preserved from the V2
            system — a universe summary, AI-summarized pundit stances, a correlation-grounded
            thematic map and pillar-divergence anomaly notes. Each carries its as-of date and source
            model, none is refreshed live, and none is a recommendation. When a pinned source is
            unavailable, the card says so instead of substituting.
          </p>
        </section>
        <IntelWorkbench />
        <footer className="research-route-footer">
          <span>Pinned V2 AI narratives · dated provenance · fail-closed</span>
          <span>Research only · not investment advice</span>
        </footer>
      </main>
    </>
  );
}
