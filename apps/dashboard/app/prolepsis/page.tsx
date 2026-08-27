import { ResearchHeader } from "../research-header";
import { ProlepsisWorkbench } from "./prolepsis-workbench";

export const metadata = {
  title: "Prolepsis — Akribeia",
  description:
    "Full-universe 12-month classifier posteriors with the 12-month ML percentile ranking (never an expected return or price target) and live-price provenance.",
};

export default function ProlepsisPage() {
  return (
    <>
      <ResearchHeader active="prolepsis" />
      <main id="main-content" tabIndex={-1}>
        <ProlepsisWorkbench />
      </main>
    </>
  );
}
