import { ResearchHeader } from "../research-header";
import { RiskRadar } from "./risk-radar";

export const metadata = {
  title: "Risk Radar — Akribeia",
  description:
    "A source-attributed view of the macro and market risks collectively flagged across major institutional outlooks.",
};

export default function RiskRadarPage() {
  return (
    <>
      <ResearchHeader active="risk" />
      <main id="main-content" tabIndex={-1} className="research-page risk-page">
        <section className="research-route-hero risk-route-hero">
          <p className="mono-label">RISK RADAR / SOURCE-ATTRIBUTED NARRATIVE</p>
          <h1>
            Know the consensus.
            <span> Watch the disagreement.</span>
          </h1>
          <p>
            The Risk Radar organizes the risks raised across institutional outlooks by severity,
            direction, horizon, and observable trigger. It preserves the V2 grounded narrative while
            keeping source and freshness limits visible.
          </p>
        </section>
        <RiskRadar />
        <footer className="research-route-footer">
          <span>Pinned V2 reference · fetched through a bounded V3 adapter</span>
          <span>Research only · not investment advice</span>
        </footer>
      </main>
    </>
  );
}
