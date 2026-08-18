import { ResearchHeader } from "../research-header";
import { institutionalIntelligence } from "./institutional-data";
import { InstitutionalWorkbench } from "./institutional-workbench";

export const metadata = {
  title: "Institutional Intelligence — Akribeia",
  description:
    "Receipted SEC 13F positioning for tracked institutional managers: holdings, quarter-over-quarter changes, overlap, and concentration — with the reporting lag always visible.",
};

export default function InstitutionalPage() {
  const artifact = institutionalIntelligence;
  return (
    <>
      <ResearchHeader active="institutional" />
      <main id="main-content" tabIndex={-1} className="research-page institutional-page">
        <section className="research-route-hero">
          <p className="mono-label">INSTITUTIONAL INTELLIGENCE / 13F POSITIONING</p>
          <h1>
            What the big books reported.
            <span> Six-plus weeks after the fact.</span>
          </h1>
          <p>
            Quarterly 13F holdings for {artifact.coverage.managerCount} tracked managers,
            reconstructed from receipted SEC EDGAR filings with explicit amendment supersedence.
            Every number is a quarter-end snapshot filed up to 45 days later — this page never shows
            current positioning, and says so wherever the data appears.
          </p>
        </section>
        <div className="institutional-lag-banner" role="note">
          13F filings disclose quarter-end long US positions only, up to 45 days late. Reporting
          period and filing date are shown separately everywhere. Short positions, derivatives
          details, and non-US books are not in scope of the form.
        </div>
        <InstitutionalWorkbench />
        <footer className="research-route-footer">
          <span>
            SEC EDGAR 13F source snapshot {artifact.sourceReceipt.snapshotId} · SHA-256 receipted
          </span>
          <span>Research only · not investment advice</span>
        </footer>
      </main>
    </>
  );
}
