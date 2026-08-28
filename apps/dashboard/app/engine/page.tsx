import { ResearchHeader } from "../research-header";
import { EngineWorkbench } from "./engine-workbench";

export const metadata = {
  title: "Thesis Engine — Akribeia",
  description:
    "Ask the markets thesis engine a grounded question. Honest availability states, staged job progress, validation-gated answers, and no auto-submission.",
};

export default function EnginePage() {
  return (
    <>
      <ResearchHeader active="engine" />
      <main id="main-content" tabIndex={-1} className="research-page parity-page">
        <section className="research-route-hero parity-route-hero">
          <p className="mono-label">THESIS ENGINE / GPU-STAGED PIPELINE</p>
          <h1>
            Ask a markets question.<span> The engine refuses what it cannot ground.</span>
          </h1>
          <p>
            The engine grounds a thesis in its corpus (S&amp;P 100 filings, Fed/FOMC materials,
            practitioner letters). One GPU job at a time; staged jobs typically take 7–21 minutes
            and persist server-side by job id. Offline, yielding, and rate-limited states render
            exactly as what they are — never as answers.
          </p>
        </section>
        <EngineWorkbench />
        <footer className="research-route-footer">
          <span>
            Engine output is validated before render · withheld output is named as withheld
          </span>
          <span>Research only · not investment advice</span>
        </footer>
      </main>
    </>
  );
}
