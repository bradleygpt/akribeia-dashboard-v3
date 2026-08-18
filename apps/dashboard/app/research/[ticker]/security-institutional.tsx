import {
  CLASSIFICATION_LABELS,
  formatShares,
  formatUsdCompact,
  getInstitutionalRollup,
  institutionalIntelligence,
} from "../../institutional/institutional-data";

const CLASSIFICATION_CHIP: Record<string, string> = {
  NEW: "state-chip state-chip-new",
  INCREASED: "state-chip state-chip-up",
  REDUCED: "state-chip state-chip-down",
  EXITED: "state-chip state-chip-exit",
  UNCHANGED: "state-chip",
};

export function SecurityInstitutional({ ticker }: { ticker: string }) {
  const rollup = getInstitutionalRollup(ticker);
  const managerCount = institutionalIntelligence.coverage.managerCount;
  const snapshotId = institutionalIntelligence.sourceReceipt.snapshotId;

  return (
    <section className="security-institutional" aria-labelledby="institutional-heading">
      <div className="security-section-heading">
        <div>
          <p className="mono-label">13F POSITIONING / QUARTER-END, FILED LATE</p>
          <h2 id="institutional-heading">Tracked institutional holders</h2>
        </div>
        <p>
          Across the {managerCount} tracked 13F filers (snapshot {snapshotId}) — quarterly
          disclosures with up to a 45-day lag, never current positioning.
        </p>
      </div>
      {rollup === null ? (
        <p className="institutional-empty-inline">
          None of the tracked managers reported a long position in {ticker.toUpperCase()} in their
          latest usable 13F period. That describes this curated panel only, not institutional
          ownership overall.
        </p>
      ) : (
        <div className="research-table-scroll">
          <table className="research-table institutional-table">
            <thead>
              <tr>
                <th scope="col">Manager</th>
                <th scope="col">Shares</th>
                <th scope="col">Reported value</th>
                <th scope="col">Book weight</th>
                <th scope="col">Latest change</th>
              </tr>
            </thead>
            <tbody>
              {rollup.holders.map((holder) => (
                <tr key={holder.cik}>
                  <td>
                    <a href={`/institutional/${holder.cik}`} className="institutional-manager-link">
                      {holder.managerName}
                    </a>
                  </td>
                  <td className="numeric">{formatShares(holder.shares)}</td>
                  <td className="numeric">{formatUsdCompact(holder.valueUsd)}</td>
                  <td className="numeric">
                    {holder.portfolioWeightPct === null
                      ? "—"
                      : `${holder.portfolioWeightPct.toFixed(2)}%`}
                  </td>
                  <td>
                    {holder.latestClassification === null ? (
                      <span className="institutional-unresolved">first captured quarter</span>
                    ) : (
                      <span className={CLASSIFICATION_CHIP[holder.latestClassification]}>
                        {CLASSIFICATION_LABELS[holder.latestClassification]}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
