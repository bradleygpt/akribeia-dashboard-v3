import { ResearchHeader } from "../research-header";
import { StrategiesWorkbench } from "./strategies-workbench";

export const metadata = {
  title: "Strategies — Akribeia",
  description:
    "Dated V2 strategy definitions, live-versus-paper book labels and source-backed holding performance without synthetic recommendations.",
};

export default function StrategiesPage() {
  return (
    <>
      <ResearchHeader active="strategies" />
      <main id="main-content" tabIndex={-1} className="research-page parity-page">
        <section className="research-route-hero parity-route-hero">
          <p className="mono-label">STRATEGIES / TRUTH-IN-LABELING</p>
          <h1>
            Distinct research sleeves.
            <span> No implied recommendation.</span>
          </h1>
          <p>
            Strategy definitions and holding-period records come from pinned V2 artifacts. Live and
            paper books remain visibly separate; historical values are dated research records, not
            forecasts or guarantees.
          </p>
        </section>
        <StrategiesWorkbench />
        <footer className="research-route-footer">
          <span>Pinned V2 strategy records · nulls remain unavailable</span>
          <span>Research only · past performance is not predictive</span>
        </footer>
      </main>
    </>
  );
}
