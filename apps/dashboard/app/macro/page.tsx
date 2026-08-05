import { ResearchHeader } from "../research-header";
import { MacroWorkbench } from "./macro-workbench";

export const metadata = {
  title: "Macro Calendar & Probability — Akribeia",
  description:
    "Authoritative free official event schedules and market-implied FOMC probabilities remain unavailable when no permitted free official source is configured; approved forecast consensus remains visible.",
};

export default function MacroPage() {
  return (
    <>
      <ResearchHeader active="macro" />
      <main id="main-content" tabIndex={-1} className="research-page parity-page">
        <section className="research-route-hero parity-route-hero">
          <p className="mono-label">MACRO / CONTRACT-SAFE UNAVAILABLE STATES</p>
          <h1>
            Source first.
            <span> No unsupported fallback.</span>
          </h1>
          <p>
            Authoritative event instances and market-implied FOMC probabilities are unavailable
            because no permitted free official source is configured. No pinned schedule, recurrence,
            time, timezone or heuristic probability is shown. Approved institutional forecast
            consensus remains separate.
          </p>
        </section>
        <MacroWorkbench />
        <footer className="research-route-footer">
          <span>Macro event/probability contract pending · no inferred fallback</span>
          <span>Research only · not investment advice</span>
        </footer>
      </main>
    </>
  );
}
