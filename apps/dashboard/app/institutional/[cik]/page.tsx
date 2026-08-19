import type { Metadata } from "next";
import { ResearchHeader } from "../../research-header";
import {
  CLASSIFICATION_LABELS,
  formatShares,
  formatUsdCompact,
  getInstitutionalManager,
  latestUsablePeriod,
  reportingLagDays,
} from "../institutional-data";

interface PageProps {
  params: Promise<{ cik: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { cik } = await params;
  const manager = getInstitutionalManager(cik);
  if (manager === null) return { title: "Manager unavailable — Akribeia" };
  return {
    title: `${manager.name} 13F — Akribeia`,
    description: `Receipted 13F holdings, quarter-over-quarter position changes, and filing history for ${manager.name}.`,
  };
}

const CLASSIFICATION_CHIP: Record<string, string> = {
  NEW: "state-chip state-chip-new",
  INCREASED: "state-chip state-chip-up",
  REDUCED: "state-chip state-chip-down",
  EXITED: "state-chip state-chip-exit",
  UNCHANGED: "state-chip",
};

export default async function InstitutionalManagerPage({ params }: PageProps) {
  const { cik } = await params;
  const manager = getInstitutionalManager(cik);

  if (manager === null) {
    return (
      <>
        <ResearchHeader active="institutional" />
        <main id="main-content" tabIndex={-1} className="research-page institutional-page">
          <section className="research-not-found">
            <p className="mono-label">INSTITUTIONAL MANAGER / UNAVAILABLE</p>
            <h1>No tracked manager with CIK “{cik}”.</h1>
            <p>
              The institutional directory is a curated, receipted set. Browse the{" "}
              <a href="/institutional">tracked managers</a>.
            </p>
          </section>
        </main>
      </>
    );
  }

  const period = latestUsablePeriod(manager);
  const filingDate = period?.filings.at(-1)?.filingDate ?? null;

  return (
    <>
      <ResearchHeader active="institutional" />
      <main id="main-content" tabIndex={-1} className="research-page institutional-page">
        <section className="research-route-hero">
          <p className="mono-label">13F MANAGER / {manager.category.toUpperCase()}</p>
          <h1>{manager.name}</h1>
          <p>
            SEC filer “{manager.filerNameFromSec}” · CIK {manager.cik}.{" "}
            {period === null
              ? "No usable reporting period in the current capture."
              : `Latest usable period ${period.periodOfReport}, filed ${filingDate ?? "unknown"}${
                  filingDate === null
                    ? ""
                    : ` — ${reportingLagDays(period.periodOfReport, filingDate)} days after quarter end`
                }.`}
          </p>
        </section>
        <div className="institutional-lag-banner" role="note">
          Quarter-end long-position snapshot from receipted 13F filings — not current positioning.
        </div>

        {period === null ? (
          <section className="institutional-empty">
            <p className="mono-label">HOLDINGS / UNAVAILABLE</p>
            <p>
              Every captured filing for this manager sits in an indeterminate amendment state, so no
              holdings set can be presented without guessing. The filing history below stays
              visible.
            </p>
          </section>
        ) : (
          <section aria-label="Holdings">
            <h2 className="institutional-section-title">
              Holdings as of {period.periodOfReport}
              <span className="institutional-subnote">
                {period.displayedPositionCount === period.positionCount
                  ? `all ${period.positionCount} positions`
                  : `top ${period.displayedPositionCount} of ${period.positionCount} positions by value`}
                {" · "}
                {formatUsdCompact(period.totalValueUsd)} reported
                {period.top10ConcentrationPct === null
                  ? ""
                  : ` · top 10 = ${period.top10ConcentrationPct.toFixed(1)}%`}
              </span>
            </h2>
            {period.effectiveState === "indeterminate-amendment" ? (
              <p className="institutional-warning">
                An amendment with unstated scope affects this period; the set below is the most
                complete defensible reconstruction and is excluded from delta computation.
              </p>
            ) : null}
            <div className="research-table-scroll">
              <table className="research-table institutional-table">
                <thead>
                  <tr>
                    <th scope="col">Issuer</th>
                    <th scope="col">Class</th>
                    <th scope="col">Instrument</th>
                    <th scope="col">Identity</th>
                    <th scope="col">Shares / principal</th>
                    <th scope="col">Value</th>
                    <th scope="col">Weight</th>
                  </tr>
                </thead>
                <tbody>
                  {period.positions.map((position) => (
                    <tr key={position.instrumentKey}>
                      <td>{position.nameOfIssuer}</td>
                      <td>{position.titleOfClass}</td>
                      <td className="institutional-category">{position.instrumentType}</td>
                      <td>
                        {position.identity.status === "resolved" ? (
                          <a
                            href={`/research/${position.identity.ticker}`}
                            className="institutional-manager-link"
                          >
                            {position.identity.ticker}
                          </a>
                        ) : position.identity.status === "excluded-contaminated" ? (
                          <span className="state-chip state-chip-warn">excluded</span>
                        ) : (
                          <span className="institutional-unresolved">unresolved</span>
                        )}
                      </td>
                      <td className="numeric">{formatShares(position.shares)}</td>
                      <td className="numeric">{formatUsdCompact(position.valueUsd)}</td>
                      <td className="numeric">
                        {period.totalValueUsd > 0
                          ? `${((position.valueUsd / period.totalValueUsd) * 100).toFixed(2)}%`
                          : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        <section aria-label="Quarter-over-quarter changes">
          <h2 className="institutional-section-title">Position changes</h2>
          {manager.deltas === null ? (
            <p className="institutional-empty-inline">
              Only one reporting period has been captured for this manager, so no
              quarter-over-quarter change ledger exists yet. It will populate with the next captured
              quarter.
            </p>
          ) : manager.deltas.state === "indeterminate-amendment" ? (
            <p className="institutional-empty-inline">
              An amendment with unstated scope makes one of the two latest periods indeterminate;
              computing changes across it would risk misclassifying amendments as trades, so this
              ledger is withheld.
            </p>
          ) : (
            <>
              <p className="institutional-subnote">
                {manager.deltas.fromPeriod} → {manager.deltas.toPeriod}
                {" · "}
                {manager.deltas.displayedEntryCount === manager.deltas.totalEntryCount
                  ? `all ${manager.deltas.totalEntryCount} changed instruments`
                  : `top ${manager.deltas.displayedEntryCount} of ${manager.deltas.totalEntryCount} instruments by value change (unchanged rows omitted)`}
              </p>
              <div className="research-table-scroll">
                <table className="research-table institutional-table">
                  <thead>
                    <tr>
                      <th scope="col">Issuer</th>
                      <th scope="col">Change</th>
                      <th scope="col">Prior shares</th>
                      <th scope="col">Current shares</th>
                      <th scope="col">Δ shares</th>
                      <th scope="col">Δ %</th>
                      <th scope="col">Prior value</th>
                      <th scope="col">Current value</th>
                    </tr>
                  </thead>
                  <tbody>
                    {manager.deltas.entries.map((entry) => (
                      <tr key={entry.instrumentKey}>
                        <td>
                          {entry.identityTicker !== null ? (
                            <a
                              href={`/research/${entry.identityTicker}`}
                              className="institutional-manager-link"
                            >
                              {entry.nameOfIssuer}
                            </a>
                          ) : (
                            entry.nameOfIssuer
                          )}
                          {entry.instrumentType !== "shares" ? (
                            <span className="institutional-category">
                              {" "}
                              ({entry.instrumentType})
                            </span>
                          ) : null}
                        </td>
                        <td>
                          <span className={CLASSIFICATION_CHIP[entry.classification]}>
                            {CLASSIFICATION_LABELS[entry.classification]}
                          </span>
                        </td>
                        <td className="numeric">{formatShares(entry.priorShares)}</td>
                        <td className="numeric">{formatShares(entry.currentShares)}</td>
                        <td className="numeric">
                          {entry.shareChange === null
                            ? "—"
                            : formatShares(Math.abs(entry.shareChange))}
                          {entry.shareChange !== null && entry.shareChange < 0 ? " sold" : ""}
                        </td>
                        <td className="numeric">
                          {entry.shareChangePct === null
                            ? "—"
                            : `${entry.shareChangePct > 0 ? "+" : ""}${entry.shareChangePct.toFixed(1)}%`}
                        </td>
                        <td className="numeric">{formatUsdCompact(entry.priorValueUsd)}</td>
                        <td className="numeric">{formatUsdCompact(entry.currentValueUsd)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </section>

        <section aria-label="Filing history">
          <h2 className="institutional-section-title">Captured filing history</h2>
          <div className="research-table-scroll">
            <table className="research-table institutional-table">
              <thead>
                <tr>
                  <th scope="col">Period</th>
                  <th scope="col">Accession</th>
                  <th scope="col">Form</th>
                  <th scope="col">Filed</th>
                  <th scope="col">Amendment</th>
                  <th scope="col">Value unit</th>
                  <th scope="col">In effective set</th>
                </tr>
              </thead>
              <tbody>
                {manager.periods.flatMap((periodRecord) =>
                  periodRecord.filings.map((filing) => (
                    <tr key={filing.accessionNumber}>
                      <td>{periodRecord.periodOfReport}</td>
                      <td className="institutional-accession">{filing.accessionNumber}</td>
                      <td>{filing.form}</td>
                      <td>{filing.filingDate}</td>
                      <td className="institutional-category">
                        {filing.amendmentType === "NOT-AN-AMENDMENT" ? "—" : filing.amendmentType}
                      </td>
                      <td className="institutional-category">
                        {filing.valueUnit}
                        {filing.unitDetection === "implied-price-correction" ? (
                          <span className="state-chip state-chip-warn">corrected ×1000</span>
                        ) : null}
                      </td>
                      <td>{filing.contributesToEffectiveSet ? "yes" : "superseded"}</td>
                    </tr>
                  )),
                )}
              </tbody>
            </table>
          </div>
        </section>

        <footer className="research-route-footer">
          <span>Receipted SEC EDGAR 13F source · amendment supersedence applied explicitly</span>
          <span>Research only · not investment advice</span>
        </footer>
      </main>
    </>
  );
}
