import { ResearchHeader } from "../research-header";
import activeAlphaDecay from "../generated/active-alpha-decay.json";
import type { AlphaDecayReport } from "@akribeia/contracts";

const report = activeAlphaDecay as AlphaDecayReport;

export const metadata = {
  title: "Alpha Decay Lab — Akribeia",
  description:
    "Prospective-only signal decay measurement: immutable daily vintages, Spearman rank IC by horizon, persistence, and half-life — rendered only when genuinely earned history exists.",
};

function icCell(value: number | null, digits = 3): string {
  return value === null ? "—" : value.toFixed(digits);
}

export default function AlphaDecayPage() {
  const progressPct = Math.min(
    100,
    (report.ledger.vintageCount / report.policy.minVintagesForDecayCurve) * 100,
  );

  return (
    <>
      <ResearchHeader active="alpha-decay" />
      <main id="main-content" tabIndex={-1} className="research-page alpha-decay-page">
        <section className="research-route-hero">
          <p className="mono-label">ALPHA DECAY LAB / PROSPECTIVE-ONLY</p>
          <h1>
            Does the signal survive contact with time?
            <span> Measured forward, never reconstructed.</span>
          </h1>
          <p>
            Each day the lab banks an immutable vintage of the live composite ranking —
            checksum-verified against the active build. Decay statistics compute only from vintages
            that actually existed on their observation dates. No backfill, no hindsight universe, no
            pretending today’s model was running last year.
          </p>
        </section>

        <section className="alpha-decay-ledger" aria-label="Vintage ledger">
          <div className="alpha-decay-ledger-row">
            <div>
              <p className="mono-label">IMMUTABLE VINTAGES BANKED</p>
              <strong className="alpha-decay-count">
                {report.ledger.vintageCount}
                <span> / {report.policy.minVintagesForDecayCurve} required for decay curves</span>
              </strong>
            </div>
            <div>
              <p className="mono-label">LEDGER SPAN</p>
              <strong>
                {report.ledger.firstObservationDate === null
                  ? "Empty"
                  : `${report.ledger.firstObservationDate} → ${report.ledger.latestObservationDate}`}
              </strong>
            </div>
            <div>
              <p className="mono-label">OVERALL STATE</p>
              <strong className={`alpha-decay-state alpha-decay-state-${report.overallState}`}>
                {report.overallState.replace(/-/g, " ")}
              </strong>
            </div>
          </div>
          <div
            className="alpha-decay-progress"
            role="progressbar"
            aria-valuenow={report.ledger.vintageCount}
            aria-valuemin={0}
            aria-valuemax={report.policy.minVintagesForDecayCurve}
            aria-label="Vintage collection progress toward the decay-curve minimum"
          >
            <span style={{ width: `${progressPct}%` }} />
          </div>
          {report.overallState === "insufficient-history" ? (
            <p className="alpha-decay-honesty">
              Nothing below renders a statistic yet — deliberately. The collection clock started
              with the first vintage; every trading day banked makes the eventual curves more
              defensible than any reconstruction could be. Short-horizon statistics need roughly two
              to three months of daily vintages; the full six-horizon picture needs about eight.
            </p>
          ) : null}
        </section>

        <section aria-label="Decay by horizon">
          <h2 className="institutional-section-title">Rank IC by forward horizon</h2>
          <div className="research-table-scroll">
            <table className="research-table institutional-table">
              <thead>
                <tr>
                  <th scope="col">Horizon</th>
                  <th scope="col">State</th>
                  <th scope="col">Vintages used</th>
                  <th scope="col">Mean rank IC</th>
                  <th scope="col">Top-quintile hit rate</th>
                  <th scope="col">Q1 − Q5 spread</th>
                  <th scope="col">Excluded (no forward window)</th>
                </tr>
              </thead>
              <tbody>
                {report.horizons.map((horizon) => (
                  <tr key={horizon.horizonTradingDays}>
                    <td>{horizon.horizonTradingDays}d</td>
                    <td>
                      {horizon.state === "computed" ? (
                        <span className="state-chip state-chip-new">computed</span>
                      ) : (
                        <span className="state-chip state-chip-warn">
                          insufficient history ({horizon.vintagesUsed}/{horizon.vintagesRequired})
                        </span>
                      )}
                    </td>
                    <td className="numeric">{horizon.vintagesUsed}</td>
                    <td className="numeric">{icCell(horizon.meanRankIc)}</td>
                    <td className="numeric">
                      {horizon.hitRate === null ? "—" : `${(horizon.hitRate * 100).toFixed(1)}%`}
                    </td>
                    <td className="numeric">
                      {horizon.topMinusBottomQuintileSpread === null
                        ? "—"
                        : `${(horizon.topMinusBottomQuintileSpread * 100).toFixed(2)}%`}
                    </td>
                    <td className="numeric">{horizon.excludedForMissingForwardWindow}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="alpha-decay-cards" aria-label="Persistence and half-life">
          <div className="alpha-decay-card">
            <p className="mono-label">RANK PERSISTENCE (VINTAGE-TO-VINTAGE)</p>
            {report.rankPersistence.state === "computed" ? (
              <strong>{icCell(report.rankPersistence.meanRankAutocorrelation)}</strong>
            ) : (
              <strong className="alpha-decay-muted">
                insufficient history — {report.rankPersistence.vintagePairsUsed}/
                {report.rankPersistence.vintagePairsRequired} adjacent pairs
              </strong>
            )}
          </div>
          <div className="alpha-decay-card">
            <p className="mono-label">SIGNAL HALF-LIFE</p>
            {report.halfLife.state === "computed" ? (
              <strong>{report.halfLife.halfLifeTradingDays?.toFixed(0)} trading days</strong>
            ) : report.halfLife.state === "not-well-defined" ? (
              <strong className="alpha-decay-muted">not well-defined for the observed curve</strong>
            ) : (
              <strong className="alpha-decay-muted">insufficient history</strong>
            )}
          </div>
        </section>

        <section aria-label="Sector cohorts">
          <h2 className="institutional-section-title">Sector cohorts (21-day IC)</h2>
          {report.cohorts.length === 0 ? (
            <p className="institutional-empty-inline">
              Cohort statistics appear once the 21-day horizon reaches its vintage minimum; each
              sector additionally needs at least {report.policy.minCrossSectionPerCohort} names per
              cross-section or it reports insufficient coverage instead of a number.
            </p>
          ) : (
            <div className="research-table-scroll">
              <table className="research-table institutional-table">
                <thead>
                  <tr>
                    <th scope="col">Sector</th>
                    <th scope="col">State</th>
                    <th scope="col">Observations</th>
                    <th scope="col">Mean rank IC (21d)</th>
                  </tr>
                </thead>
                <tbody>
                  {report.cohorts.map((cohort) => (
                    <tr key={cohort.cohort}>
                      <td>{cohort.cohort}</td>
                      <td>
                        {cohort.state === "computed" ? (
                          <span className="state-chip state-chip-new">computed</span>
                        ) : (
                          <span className="state-chip state-chip-warn">
                            {cohort.state.replace(/-/g, " ")}
                          </span>
                        )}
                      </td>
                      <td className="numeric">{cohort.crossSection}</td>
                      <td className="numeric">{icCell(cohort.meanRankIc21d)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="alpha-decay-methodology" aria-label="Methodology">
          <h2 className="institutional-section-title">Methodology, stated up front</h2>
          <ul>
            <li>
              Vintages are captured from the checksum-verified active build and written write-once;
              corrections are additive, never rewrites.
            </li>
            <li>
              Statistics are Spearman rank ICs between vintage ranks and forward returns computed
              from the vintages’ own receipted prices; a name missing its forward window is excluded
              and counted, never zero-filled.
            </li>
            <li>
              Pre-registered minimums: {report.policy.minVintagesForDecayCurve} vintages per decay
              horizon, {report.policy.minVintagesForPersistence} adjacent pairs for persistence,{" "}
              {report.policy.minCrossSectionPerCohort} names per cohort cross-section. Below a
              minimum the surface says so instead of estimating.
            </li>
            <li>
              Nothing here is a performance track record, and no historical reconstruction is shown:
              if the contemporaneous history does not exist, the lab fails closed.
            </li>
          </ul>
        </section>

        <footer className="research-route-footer">
          <span>Signal {report.signalId} · prospective vintages only</span>
          <span>Research only · not investment advice</span>
        </footer>
      </main>
    </>
  );
}
