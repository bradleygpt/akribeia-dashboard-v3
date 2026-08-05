import {
  BenchmarkReadinessSchema,
  CorporateActionReadinessSchema,
  DailyEvidenceRecordSchema,
  DataQualityReportSchema,
  ExitDispositionReadinessSchema,
  ExecutionCostReadinessSchema,
  FilingAvailabilityReportSchema,
  HistoricalReadinessReportSchema,
  MaturityAssessmentSchema,
  MetricDictionarySchema,
  ModelCardSchema,
  ProspectiveReadinessSchema,
  SecRegistrantCrosswalkSchema,
  SecurityMasterSchema,
  UniverseMembershipReadinessSchema,
  VerticalSliceDashboardSchema,
  WalkForwardReadinessSchema,
} from "@akribeia/contracts";
import { DataStatusBanner } from "./data-status-banner";
import { EvidenceExplorer } from "./evidence-explorer";
import { FullUniverseExplorer } from "./full-universe-explorer";
import { MarketHealthPanel } from "./market-health-panel";
import { computeMarketBreadth } from "./market-health";
import { loadV2Universe } from "./v2-universe";
import { LandingPortal } from "../../portal/src/LandingPortal";
import activeBenchmarkReadiness from "./generated/active-benchmark-readiness.json";
import activeDashboard from "./generated/active-dashboard.json";
import activeCorporateActionReadiness from "./generated/active-corporate-action-readiness.json";
import activeDailyEvidence from "./generated/active-daily-evidence.json";
import activeExitDispositionReadiness from "./generated/active-exit-disposition-readiness.json";
import activeExecutionCostReadiness from "./generated/active-execution-cost-readiness.json";
import activeFilingAvailability from "./generated/active-filing-availability.json";
import activeHistoricalReadiness from "./generated/active-historical-readiness.json";
import activeMetricDictionary from "./generated/active-metric-dictionary.json";
import activeMaturity from "./generated/active-maturity.json";
import activeModelCard from "./generated/active-model-card.json";
import activeProspectiveReadiness from "./generated/active-prospective-readiness.json";
import activeQualityReport from "./generated/active-quality-report.json";
import activeSecRegistrants from "./generated/active-sec-registrants.json";
import activeSecurityMaster from "./generated/active-security-master.json";
import activeUniverseMembership from "./generated/active-universe-membership.json";
import activeWalkForwardReadiness from "./generated/active-walk-forward-readiness.json";

const benchmarkReadiness = BenchmarkReadinessSchema.parse(activeBenchmarkReadiness);
const dashboard = VerticalSliceDashboardSchema.parse(activeDashboard);
const corporateActionReadiness = CorporateActionReadinessSchema.parse(
  activeCorporateActionReadiness,
);
const dailyEvidence = DailyEvidenceRecordSchema.parse(activeDailyEvidence);
const exitDisposition = ExitDispositionReadinessSchema.parse(activeExitDispositionReadiness);
const executionCostReadiness = ExecutionCostReadinessSchema.parse(activeExecutionCostReadiness);
const filingAvailability = FilingAvailabilityReportSchema.parse(activeFilingAvailability);
const historicalReadiness = HistoricalReadinessReportSchema.parse(activeHistoricalReadiness);
const metricDictionary = MetricDictionarySchema.parse(activeMetricDictionary);
const maturity = MaturityAssessmentSchema.parse(activeMaturity);
const modelCard = ModelCardSchema.parse(activeModelCard);
const prospectiveReadiness = ProspectiveReadinessSchema.parse(activeProspectiveReadiness);
const qualityReport = DataQualityReportSchema.parse(activeQualityReport);
const secRegistrants = SecRegistrantCrosswalkSchema.parse(activeSecRegistrants);
const securityMaster = SecurityMasterSchema.parse(activeSecurityMaster);
const universeMembership = UniverseMembershipReadinessSchema.parse(activeUniverseMembership);
const walkForwardReadiness = WalkForwardReadinessSchema.parse(activeWalkForwardReadiness);
const v2Universe = loadV2Universe();
const marketBreadth = computeMarketBreadth(v2Universe.rows);

if (
  modelCard.modelVersion !== dashboard.modelVersion ||
  benchmarkReadiness.buildId !== dashboard.buildId ||
  benchmarkReadiness.modelVersion !== dashboard.modelVersion ||
  corporateActionReadiness.buildId !== dashboard.buildId ||
  corporateActionReadiness.modelVersion !== dashboard.modelVersion ||
  exitDisposition.buildId !== dashboard.buildId ||
  exitDisposition.modelVersion !== dashboard.modelVersion ||
  executionCostReadiness.buildId !== dashboard.buildId ||
  executionCostReadiness.modelVersion !== dashboard.modelVersion ||
  metricDictionary.modelVersion !== dashboard.modelVersion ||
  filingAvailability.buildId !== dashboard.buildId ||
  filingAvailability.modelVersion !== dashboard.modelVersion ||
  historicalReadiness.buildId !== dashboard.buildId ||
  historicalReadiness.modelVersion !== dashboard.modelVersion ||
  universeMembership.buildId !== dashboard.buildId ||
  universeMembership.modelVersion !== dashboard.modelVersion ||
  walkForwardReadiness.buildId !== dashboard.buildId ||
  walkForwardReadiness.modelVersion !== dashboard.modelVersion ||
  prospectiveReadiness.buildId !== dashboard.buildId ||
  prospectiveReadiness.modelVersion !== dashboard.modelVersion ||
  qualityReport.buildId !== dashboard.buildId ||
  maturity.buildId !== dashboard.buildId ||
  maturity.modelVersion !== dashboard.modelVersion ||
  secRegistrants.buildId !== dashboard.buildId ||
  secRegistrants.modelVersion !== dashboard.modelVersion ||
  securityMaster.buildId !== dashboard.buildId ||
  securityMaster.source.contentSha256 !== dashboard.source.contentSha256
) {
  throw new Error("Active evidence artifacts do not match the dashboard build lineage.");
}

function percent(value: number, digits = 0): string {
  return `${(value * 100).toFixed(digits)}%`;
}

function score(value: number): string {
  return value.toFixed(2);
}

function observedDate(value: string): string {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(new Date(value));
}

const pipelineStages = [
  [
    "01",
    "Repository snapshot",
    `${Math.floor(dashboard.source.ageSeconds / 3600)}h / ${Math.floor(
      dashboard.source.maxAgeSeconds / 3600,
    )}h`,
  ],
  ["02", "Contract validation", `${dashboard.source.rowCount} rows valid`],
  ["03", "Coverage gate", `${dashboard.scoring.factorCoverage.length} factors reconciled`],
  ["04", "Portfolio caps", `${dashboard.portfolio.totalWeightUnits.toLocaleString("en-US")} units`],
  ["05", "Atomic publish", `${dashboard.pipeline.requiredArtifacts.length} SHA-256 artifacts`],
  ["06", "Active selection", "Pointer + rollback"],
] as const;

export function MarketHealthDashboard() {
  const portfolioByTicker = new Map(
    dashboard.portfolio.positions.map((position) => [position.ticker, position]),
  );
  const sortedSectors = Object.entries(dashboard.portfolio.sectorWeights).sort(([left], [right]) =>
    left.localeCompare(right),
  );
  const securityMasterByTicker = new Map(
    securityMaster.securities.map((security) => [security.currentTicker, security]),
  );
  const visibleMasterEntries = dashboard.topScores.slice(0, 6).map((security) => {
    const masterEntry = securityMasterByTicker.get(security.ticker);

    if (masterEntry === undefined) {
      throw new Error(`Security master is missing dashboard ticker "${security.ticker}".`);
    }

    return masterEntry;
  });
  const leadingTickers = new Set(dashboard.topScores.map(({ ticker }) => ticker));
  const visibleRegistrantEntries = secRegistrants.matches
    .filter(({ ticker }) => leadingTickers.has(ticker))
    .slice(0, 6);

  return (
    <>
      <a className="skip-link" href="#main-content">
        Skip to main content
      </a>
      <header className="site-header">
        <a className="brand" href="#top" aria-label="Akribeia quantitative research home">
          <span className="brand-mark" aria-hidden="true">
            A
          </span>
          <span>
            <strong>Akribeia</strong>
            <small>Quantitative research</small>
          </span>
        </a>
        <nav className="primary-nav" aria-label="Primary navigation">
          <a href="#top">Home</a>
          <a href="#market-health">Market Health</a>
          <a href="/research">Research</a>
          <a href="/risk">Risk Radar</a>
          <a href="/sectors">Sectors</a>
          <a href="/etfs">ETF Center</a>
          <a href="#daily-evidence">Evidence</a>
        </nav>
        <div className="header-status" aria-label="Publication integrity">
          <span className="status-dot" aria-hidden="true" />
          Trust core active
        </div>
      </header>
      <nav className="integrity-nav" aria-label="Research integrity navigation">
        <span>Research integrity</span>
        <a href="#daily-evidence">Receipts</a>
        <a href="#model-governance">Method</a>
        <a href="#data-quality">Data quality</a>
        <a href="#prospective-readiness">Prospective gate</a>
        <a href="#lineage">Lineage</a>
      </nav>

      <main id="main-content" tabIndex={-1}>
        <DataStatusBanner />

        <section className="hero" id="top">
          <div className="eyebrow">
            <span>Market intelligence · quantitative research · visible evidence</span>
            <span>V3 trust core / {dashboard.schemaVersion}</span>
          </div>
          <div className="hero-grid">
            <div>
              <h1>
                See the market whole.
                <span> Test every signal.</span>
              </h1>
              <p className="hero-copy">
                Akribeia connects market regime, macro and earnings health, quantitative scoring,
                valuation, and portfolio research in one disciplined system. Explore the full market
                surface, then inspect the evidence behind every published result.
              </p>
              <div className="hero-actions" aria-label="Start exploring Akribeia">
                <a href="#market-health">Open Market Health</a>
                <a href="/research">Research all 1,361 securities</a>
              </div>
            </div>
            <aside className="hero-evidence" aria-label="Akribeia coverage and trust">
              <p className="mono-label">COMPLETE V2 COVERAGE / V3 TRUST</p>
              <strong>{v2Universe.total.toLocaleString("en-US")}</strong>
              <span>securities available with zero product-level exclusions</span>
              <dl>
                <div>
                  <dt>Market Health</dt>
                  <dd>Regime · macro · earnings · breadth · risk</dd>
                </div>
                <div>
                  <dt>Published evidence</dt>
                  <dd>{dashboard.buildId}</dd>
                </div>
                <div>
                  <dt>Trust policy</dt>
                  <dd>Fail closed · immutable · traceable</dd>
                </div>
              </dl>
            </aside>
          </div>
          <nav className="product-doors" aria-label="Akribeia product areas">
            <a href="#market-health">
              <span>01</span>
              <strong>Market Health</strong>
              <small>Regime, macro, earnings, breadth and risk</small>
            </a>
            <a href="#universe">
              <span>02</span>
              <strong>Full Universe</strong>
              <small>1,361 scored securities without a hidden cap floor</small>
            </a>
            <a href="#scores">
              <span>03</span>
              <strong>Research Preview</strong>
              <small>Scores, constraints and a published model portfolio</small>
            </a>
            <a href="/research">
              <span>04</span>
              <strong>Core Research</strong>
              <small>Advanced screens, comparison, watchlists and security detail</small>
            </a>
            <a href="/risk">
              <span>05</span>
              <strong>Risk Radar</strong>
              <small>Source-attributed risks, severity, horizon and watch signals</small>
            </a>
            <a href="/sectors">
              <span>06</span>
              <strong>Sector Analytics</strong>
              <small>Valuation, score quality, dispersion and pillar profiles</small>
            </a>
            <a href="/etfs">
              <span>07</span>
              <strong>ETF Center</strong>
              <small>Comparison, model templates, holdings and look-through</small>
            </a>
            <a href="#daily-evidence">
              <span>08</span>
              <strong>Evidence</strong>
              <small>Receipts, lineage, quality and readiness gates</small>
            </a>
          </nav>
        </section>

        <MarketHealthPanel
          breadth={marketBreadth}
          universeAsOf={v2Universe.provenance.publishedAt.slice(0, 10)}
        />

        <section className="pipeline" aria-labelledby="pipeline-heading">
          <div className="section-heading">
            <p className="mono-label">PUBLICATION CHAIN</p>
            <h2 id="pipeline-heading">One build, end to end</h2>
          </div>
          <ol>
            {pipelineStages.map(([number, label, detail]) => (
              <li key={number}>
                <span>{number}</span>
                <strong>{label}</strong>
                <small>{detail}</small>
              </li>
            ))}
          </ol>
        </section>

        <section className="metrics" aria-label="Build summary">
          <article>
            <p>Source universe</p>
            <strong>{dashboard.source.rowCount}</strong>
            <span>$10B+ baseline rows</span>
          </article>
          <article>
            <p>Eligible scores</p>
            <strong>{dashboard.scoring.eligibleSecurities}</strong>
            <span>{dashboard.scoring.excludedSecurities} excluded by coverage</span>
          </article>
          <article>
            <p>Average coverage</p>
            <strong>{percent(dashboard.scoring.averageCoverage)}</strong>
            <span>No silent renormalization</span>
          </article>
          <article>
            <p>Portfolio</p>
            <strong>{dashboard.portfolio.positions.length}</strong>
            <span>
              {percent(dashboard.portfolio.constraints.maxPositionWeight)} position /{" "}
              {percent(dashboard.portfolio.constraints.maxSectorWeight)} sector
            </span>
          </article>
        </section>

        <section className="full-universe" id="universe" aria-labelledby="full-universe-heading">
          <div className="full-universe-heading">
            <div>
              <p className="mono-label">AUTHORITATIVE V2 COVERAGE</p>
              <h2 id="full-universe-heading">Every validated name. No hidden cap floor.</h2>
              <p>
                Search the complete preserved V2 universe. The equal-weight composite and rating
                below are the V2-authored values; V3 does not recalculate or silently remove rows.
              </p>
            </div>
            <dl aria-label="Full universe reconciliation">
              <div>
                <dt>Total</dt>
                <dd>{v2Universe.total.toLocaleString("en-US")}</dd>
              </div>
              <div>
                <dt>Stocks</dt>
                <dd>{v2Universe.stocks.toLocaleString("en-US")}</dd>
              </div>
              <div>
                <dt>ETFs</dt>
                <dd>{v2Universe.etfs.toLocaleString("en-US")}</dd>
              </div>
              <div>
                <dt>Excluded</dt>
                <dd>0</dd>
              </div>
            </dl>
          </div>

          <FullUniverseExplorer rows={v2Universe.rows} sectors={v2Universe.sectors} />

          <div className="universe-provenance">
            <span>
              V2 app {v2Universe.provenance.appCommit.slice(0, 9)} · data{" "}
              {v2Universe.provenance.bulkDataCommit.slice(0, 9)}
            </span>
            <span>
              SHA-256 <code>{v2Universe.provenance.sha256}</code>
            </span>
          </div>
        </section>

        <section
          className="exit-disposition prospective-readiness"
          id="prospective-readiness"
          aria-labelledby="prospective-readiness-heading"
        >
          <div className="exit-disposition-heading">
            <div>
              <p className="mono-label">PROSPECTIVE VALIDATION / LIVE CLOCK</p>
              <h2 id="prospective-readiness-heading">
                One day recorded. Twenty-nine still must happen.
              </h2>
              <p>
                The repository can receipt a daily research build, but elapsed calendar evidence
                cannot be backfilled. Certification stays blocked until independent observation days
                also contain executable portfolios, costed returns, an approved benchmark, and a
                completed monthly review.
              </p>
            </div>
            <a
              href={`/data/evidence/prospective-readiness/builds/${prospectiveReadiness.buildId}/prospective-readiness.json`}
            >
              View immutable evidence
            </a>
          </div>
          <div className="exit-disposition-summary" aria-label="Prospective validation progress">
            <article>
              <span>Immutable observation days</span>
              <strong>
                {prospectiveReadiness.progress.uniqueObservationDayCount} /{" "}
                {prospectiveReadiness.requirements.immutableDailyObservationDays}
              </strong>
              <p>
                {prospectiveReadiness.progress.remainingObservationDayCount} independent days remain
              </p>
            </article>
            <article data-status="blocked">
              <span>Executable portfolios</span>
              <strong>{prospectiveReadiness.progress.executablePortfolioRecordCount}</strong>
              <p>fills and prior holdings absent</p>
            </article>
            <article data-status="blocked">
              <span>Costed returns</span>
              <strong>{prospectiveReadiness.progress.costedReturnObservationCount}</strong>
              <p>missing costs never become zero</p>
            </article>
            <article data-status="blocked">
              <span>Monthly validation reports</span>
              <strong>{prospectiveReadiness.progress.monthlyValidationReportCount}</strong>
              <p>first 30-day window incomplete</p>
            </article>
          </div>
          <div
            className="table-scroll exit-disposition-table"
            tabIndex={0}
            role="region"
            aria-label="Prospective certification conditions"
          >
            <table>
              <caption className="sr-only">
                Evidence conditions required before prospective certification
              </caption>
              <thead>
                <tr>
                  <th scope="col">Certification condition</th>
                  <th scope="col">Progress</th>
                  <th scope="col">Required evidence</th>
                </tr>
              </thead>
              <tbody>
                {prospectiveReadiness.certificationConditions.map((condition) => (
                  <tr key={condition.key}>
                    <td>
                      <strong>{condition.key.replaceAll("-", " ")}</strong>
                    </td>
                    <td data-status="unmatched">
                      <strong className="unverified">
                        {condition.observedCount}
                        {condition.requiredCount === null
                          ? " / policy"
                          : ` / ${condition.requiredCount}`}
                      </strong>
                    </td>
                    <td>{condition.detail}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <aside className="exit-disposition-limitation" role="note">
            <strong>Elapsed evidence cannot be generated on demand</strong>
            <p>{prospectiveReadiness.limitations[0]}</p>
          </aside>
        </section>

        <section
          className="exit-disposition walk-forward-readiness"
          id="walk-forward-readiness"
          aria-labelledby="walk-forward-readiness-heading"
        >
          <div className="exit-disposition-heading">
            <div>
              <p className="mono-label">WALK-FORWARD / FAIL-CLOSED</p>
              <h2 id="walk-forward-readiness-heading">Two snapshots. Zero eligible folds.</h2>
              <p>
                The active Phase 3 reports now reconcile into one fold-readiness gate. Partial
                inventory and filing evidence cannot substitute for point-in-time universes,
                actions, execution, benchmark returns, or a frozen evaluation protocol.
              </p>
            </div>
            <a
              href={`/data/evidence/walk-forward-readiness/builds/${walkForwardReadiness.buildId}/walk-forward-readiness.json`}
            >
              View immutable evidence
            </a>
          </div>
          <div className="exit-disposition-summary" aria-label="Walk-forward readiness">
            <article>
              <span>Snapshots inventoried</span>
              <strong>{walkForwardReadiness.calendar.snapshotCount}</strong>
              <p>both timezone unspecified</p>
            </article>
            <article data-status="blocked">
              <span>Point-in-time eligible</span>
              <strong>{walkForwardReadiness.calendar.pointInTimeEligibleSnapshotCount}</strong>
              <p>record-level availability absent</p>
            </article>
            <article data-status="blocked">
              <span>Eligible folds</span>
              <strong>{walkForwardReadiness.calendar.eligibleFoldCount}</strong>
              <p>no training or test interval</p>
            </article>
            <article data-status="blocked">
              <span>Performance comparisons</span>
              <strong>{walkForwardReadiness.calendar.performanceComparisonCount}</strong>
              <p>no return is computed</p>
            </article>
          </div>
          <div
            className="table-scroll exit-disposition-table"
            tabIndex={0}
            role="region"
            aria-label="Walk-forward readiness controls"
          >
            <table>
              <caption className="sr-only">
                Controls required before a walk-forward fold can be evaluated
              </caption>
              <thead>
                <tr>
                  <th scope="col">Control</th>
                  <th scope="col">Status</th>
                  <th scope="col">Evidence boundary</th>
                </tr>
              </thead>
              <tbody>
                {walkForwardReadiness.controls.map((control) => (
                  <tr key={control.key}>
                    <td>
                      <strong>{control.key.replaceAll("-", " ")}</strong>
                    </td>
                    <td data-status={control.status}>
                      <strong className={control.status === "blocked" ? "unverified" : undefined}>
                        {control.status}
                      </strong>
                    </td>
                    <td>{control.detail}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <aside className="exit-disposition-limitation" role="note">
            <strong>Readiness is not a backtest</strong>
            <p>{walkForwardReadiness.limitations[2]}</p>
          </aside>
        </section>

        <section
          className="universe-membership"
          id="universe-membership"
          aria-labelledby="universe-membership-heading"
        >
          <div className="universe-membership-heading">
            <div>
              <p className="mono-label">UNIVERSE MEMBERSHIP / OBSERVED CHANGE</p>
              <h2 id="universe-membership-heading">
                The universe changed. Eligibility history did not appear.
              </h2>
              <p>
                Receipted June and July $10B cross-sections show exactly which ticker labels entered
                and exited. That makes membership drift visible—but does not turn two snapshots into
                a survivorship-controlled history.
              </p>
            </div>
            <a
              href={`/data/evidence/universe-membership/builds/${universeMembership.buildId}/universe-membership.json`}
            >
              View immutable evidence
            </a>
          </div>
          <div className="universe-membership-summary" aria-label="Observed membership comparison">
            <article>
              <span>Continuing</span>
              <strong>{universeMembership.comparison.continuingTickerCount}</strong>
              <p>of {universeMembership.comparison.unionTickerCount} distinct ticker labels</p>
            </article>
            <article>
              <span>Entrants</span>
              <strong>{universeMembership.comparison.entrantCount}</strong>
              <p>{percent(universeMembership.comparison.entrantRate, 1)} of the July snapshot</p>
            </article>
            <article>
              <span>Exits</span>
              <strong>{universeMembership.comparison.exitCount}</strong>
              <p>{percent(universeMembership.comparison.exitRate, 1)} of the June snapshot</p>
            </article>
            <article data-status="blocked">
              <span>Historical eligibility</span>
              <strong>0</strong>
              <p>effective membership intervals available</p>
            </article>
          </div>
          <div className="universe-membership-ledger">
            <div>
              <div className="membership-list-heading">
                <strong>Observed entrants</strong>
                <span>July only / {universeMembership.entrants.length}</span>
              </div>
              <ul aria-label="Ticker labels observed only in the July snapshot">
                {universeMembership.entrants.map((entry) => (
                  <li key={entry.ticker}>
                    <strong>{entry.ticker}</strong>
                    <span>{entry.name}</span>
                    <small>${entry.laterMarketCapB.toFixed(1)}B</small>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <div className="membership-list-heading">
                <strong>Observed exits</strong>
                <span>June only / {universeMembership.exits.length}</span>
              </div>
              <ul aria-label="Ticker labels observed only in the June snapshot">
                {universeMembership.exits.map((entry) => (
                  <li key={entry.ticker}>
                    <strong>{entry.ticker}</strong>
                    <span>{entry.name}</span>
                    <small>${entry.earlierMarketCapB.toFixed(1)}B</small>
                  </li>
                ))}
              </ul>
            </div>
          </div>
          <div className="membership-controls" aria-label="Universe membership controls">
            {universeMembership.controls.map((control) => (
              <article data-status={control.status} key={control.key}>
                <span>{control.key.replaceAll("-", " ")}</span>
                <strong>{control.status}</strong>
                <p>{control.detail}</p>
              </article>
            ))}
          </div>
          <aside className="membership-limitation" role="note">
            <strong>Observed difference, not a constituent event</strong>
            <p>{universeMembership.limitations[0]}</p>
          </aside>
        </section>

        <section
          className="corporate-actions"
          id="corporate-actions"
          aria-labelledby="corporate-actions-heading"
        >
          <div className="corporate-actions-heading">
            <div>
              <p className="mono-label">CORPORATE ACTIONS / PRICE COMPARABILITY</p>
              <h2 id="corporate-actions-heading">
                Five discontinuities. Zero verified adjustments.
              </h2>
              <p>
                Extreme price changes across continuing ticker labels are measured against market
                capitalization and implied shares. The signals expose where comparison can break;
                they do not manufacture split ratios or adjusted returns.
              </p>
            </div>
            <a
              href={`/data/evidence/corporate-action-readiness/builds/${corporateActionReadiness.buildId}/corporate-action-readiness.json`}
            >
              View immutable evidence
            </a>
          </div>
          <div className="corporate-actions-summary" aria-label="Corporate-action readiness">
            <article>
              <span>Compared</span>
              <strong>{corporateActionReadiness.comparison.commonTickerCount}</strong>
              <p>continuing ticker labels</p>
            </article>
            <article>
              <span>Extreme price moves</span>
              <strong>{corporateActionReadiness.coverage.thresholdObservationCount}</strong>
              <p>outside 0.5×–2.0×</p>
            </article>
            <article>
              <span>Possible share discontinuity</span>
              <strong>
                {corporateActionReadiness.coverage.possibleShareCountDiscontinuityCount}
              </strong>
              <p>unverified diagnostic signals</p>
            </article>
            <article data-status="blocked">
              <span>Verified actions</span>
              <strong>{corporateActionReadiness.coverage.verifiedCorporateActionCount}</strong>
              <p>adjusted series also unavailable</p>
            </article>
          </div>
          <div
            className="table-scroll corporate-action-table"
            tabIndex={0}
            role="region"
            aria-label="Unverified price comparability observations"
          >
            <table>
              <caption className="sr-only">
                Extreme snapshot price changes and unverified comparability signals
              </caption>
              <thead>
                <tr>
                  <th scope="col">Ticker</th>
                  <th scope="col">Signal</th>
                  <th scope="col">Price</th>
                  <th scope="col">Market cap</th>
                  <th scope="col">Implied shares</th>
                  <th scope="col">Verification</th>
                </tr>
              </thead>
              <tbody>
                {corporateActionReadiness.observations.map((observation) => (
                  <tr key={observation.ticker}>
                    <td>
                      <strong>{observation.ticker}</strong>
                      <small>{observation.name}</small>
                    </td>
                    <td>{observation.signal.replaceAll("-", " ")}</td>
                    <td>
                      {observation.earlierPrice.toFixed(2)} → {observation.laterPrice.toFixed(2)}
                      <small>{observation.priceRatio.toFixed(3)}×</small>
                    </td>
                    <td>
                      ${observation.earlierMarketCapB.toFixed(1)}B → $
                      {observation.laterMarketCapB.toFixed(1)}B
                      <small>{observation.marketCapRatio.toFixed(3)}×</small>
                    </td>
                    <td>{observation.impliedSharesRatio.toFixed(3)}×</td>
                    <td>
                      <strong className="unverified">unverified</strong>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="corporate-action-controls" aria-label="Corporate-action controls">
            {corporateActionReadiness.controls.map((control) => (
              <article data-status={control.status} key={control.key}>
                <span>{control.key.replaceAll("-", " ")}</span>
                <strong>{control.status}</strong>
                <p>{control.detail}</p>
              </article>
            ))}
          </div>
          <aside className="corporate-action-limitation" role="note">
            <strong>No synthetic adjustment</strong>
            <p>{corporateActionReadiness.limitations[4]}</p>
          </aside>
        </section>

        <section
          className="exit-disposition"
          id="exit-disposition"
          aria-labelledby="exit-disposition-heading"
        >
          <div className="exit-disposition-heading">
            <div>
              <p className="mono-label">EXIT DISPOSITION / CURRENT ASSOCIATION CHECK</p>
              <h2 id="exit-disposition-heading">Leaving the file is not a delisting.</h2>
              <p>
                Eleven of thirteen June-only ticker labels still appear in the checksum-pinned SEC
                association snapshot. BLD and HOLX are unmatched, but neither result establishes a
                historical listing event.
              </p>
            </div>
            <a
              href={`/data/evidence/exit-disposition-readiness/builds/${exitDisposition.buildId}/exit-disposition-readiness.json`}
            >
              View immutable evidence
            </a>
          </div>
          <div className="exit-disposition-summary" aria-label="Observed exit disposition coverage">
            <article>
              <span>Observed exits</span>
              <strong>{exitDisposition.coverage.observedExitCount}</strong>
              <p>ticker labels present only in June</p>
            </article>
            <article>
              <span>Current SEC association</span>
              <strong>{exitDisposition.coverage.currentSecAssociationCount}</strong>
              <p>evidence against equating exit with delisting</p>
            </article>
            <article>
              <span>Current unmatched</span>
              <strong>{exitDisposition.coverage.unmatchedCurrentAssociationCount}</strong>
              <p>BLD and HOLX remain unresolved</p>
            </article>
            <article data-status="blocked">
              <span>Historical disposition resolved</span>
              <strong>{exitDisposition.coverage.historicalDispositionResolvedCount}</strong>
              <p>no ticker or listing intervals</p>
            </article>
          </div>
          <div
            className="table-scroll exit-disposition-table"
            tabIndex={0}
            role="region"
            aria-label="Current SEC association check for observed exits"
          >
            <table>
              <caption className="sr-only">
                Current SEC associations and unresolved historical disposition for observed exits
              </caption>
              <thead>
                <tr>
                  <th scope="col">Observed exit</th>
                  <th scope="col">June snapshot</th>
                  <th scope="col">Current association</th>
                  <th scope="col">CIK</th>
                  <th scope="col">Historical disposition</th>
                </tr>
              </thead>
              <tbody>
                {exitDisposition.entries.map((entry) => (
                  <tr key={entry.ticker}>
                    <td>
                      <strong>{entry.ticker}</strong>
                    </td>
                    <td>
                      {entry.snapshotName}
                      <small>${entry.earlierMarketCapB.toFixed(1)}B</small>
                    </td>
                    <td data-status={entry.currentAssociationStatus}>
                      <strong>{entry.currentAssociationStatus}</strong>
                      <small>
                        {entry.currentSecAssociation?.title ?? "No exact current match"}
                      </small>
                    </td>
                    <td>
                      <code>{entry.currentSecAssociation?.cik ?? "unavailable"}</code>
                    </td>
                    <td>
                      <strong className="unverified">{entry.historicalDispositionStatus}</strong>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <aside className="exit-disposition-limitation" role="note">
            <strong>Current is not historical</strong>
            <p>{exitDisposition.limitations[1]}</p>
          </aside>
        </section>

        <section
          className="exit-disposition execution-readiness"
          id="execution-costs"
          aria-labelledby="execution-costs-heading"
        >
          <div className="exit-disposition-heading">
            <div>
              <p className="mono-label">EXECUTION ECONOMICS / FAIL-CLOSED</p>
              <h2 id="execution-costs-heading">Nine targets. Zero invented fills or costs.</h2>
              <p>
                Exact model weights and research prices are preserved. With no capital base, prior
                holdings, execution time, trade prices, liquidity model, or fee schedule, trades,
                turnover, costs, and net return stay unavailable.
              </p>
            </div>
            <a
              href={`/data/evidence/execution-cost-readiness/builds/${executionCostReadiness.buildId}/execution-cost-readiness.json`}
            >
              View immutable evidence
            </a>
          </div>
          <div className="exit-disposition-summary" aria-label="Execution-cost readiness">
            <article>
              <span>Exact targets</span>
              <strong>{executionCostReadiness.portfolio.positionCount}</strong>
              <p>
                {executionCostReadiness.portfolio.totalTargetWeightUnits.toLocaleString()} units
              </p>
            </article>
            <article>
              <span>Priced executions</span>
              <strong>{executionCostReadiness.portfolio.pricedExecutionCount}</strong>
              <p>research prices are not fills</p>
            </article>
            <article data-status="blocked">
              <span>Transaction cost</span>
              <strong>—</strong>
              <p>null, never silently zero</p>
            </article>
            <article data-status="blocked">
              <span>Net return</span>
              <strong>—</strong>
              <p>not performance eligible</p>
            </article>
          </div>
          <div
            className="table-scroll exit-disposition-table"
            tabIndex={0}
            role="region"
            aria-label="Exact portfolio targets without execution assumptions"
          >
            <table>
              <caption className="sr-only">
                Model targets and unavailable execution economics
              </caption>
              <thead>
                <tr>
                  <th scope="col">Rank</th>
                  <th scope="col">Ticker</th>
                  <th scope="col">Target</th>
                  <th scope="col">Research price</th>
                  <th scope="col">Execution price</th>
                  <th scope="col">Estimated cost</th>
                </tr>
              </thead>
              <tbody>
                {executionCostReadiness.targets.map((target) => (
                  <tr key={target.ticker}>
                    <td>{target.rank}</td>
                    <td>
                      <strong>{target.ticker}</strong>
                      <small>{target.sector}</small>
                    </td>
                    <td>
                      {percent(target.targetWeight)}
                      <small>{target.targetWeightUnits.toLocaleString()} units</small>
                    </td>
                    <td>${target.researchSnapshotPrice.toFixed(2)}</td>
                    <td>
                      <strong className="unverified">unavailable</strong>
                    </td>
                    <td>
                      <strong className="unverified">unavailable</strong>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <aside className="exit-disposition-limitation" role="note">
            <strong>No zero-cost shortcut</strong>
            <p>{executionCostReadiness.limitations[2]}</p>
          </aside>
        </section>

        <section
          className="exit-disposition benchmark-readiness"
          id="benchmark-readiness"
          aria-labelledby="benchmark-readiness-heading"
        >
          <div className="exit-disposition-heading">
            <div>
              <p className="mono-label">BENCHMARK EVIDENCE / CANDIDATES ONLY</p>
              <h2 id="benchmark-readiness-heading">Eight candidates. No benchmark return.</h2>
              <p>
                Both receipted snapshots contain eight broad U.S. equity proxy candidates. Their
                observed prices are comparable as source facts, but no benchmark is selected and no
                price or total return is inferred.
              </p>
            </div>
            <a
              href={`/data/evidence/benchmark-readiness/builds/${benchmarkReadiness.buildId}/benchmark-readiness.json`}
            >
              View immutable evidence
            </a>
          </div>
          <div className="exit-disposition-summary" aria-label="Benchmark readiness">
            <article>
              <span>Proxy candidates</span>
              <strong>{benchmarkReadiness.coverage.candidateCount}</strong>
              <p>present in both receipted snapshots</p>
            </article>
            <article>
              <span>Current SEC associations</span>
              <strong>
                {benchmarkReadiness.coverage.currentSecFundAssociationCount} /{" "}
                {benchmarkReadiness.coverage.candidateCount}
              </strong>
              <p>SPLG and SPY remain unmatched</p>
            </article>
            <article data-status="blocked">
              <span>Selected benchmark</span>
              <strong>—</strong>
              <p>no approved benchmark mandate</p>
            </article>
            <article data-status="blocked">
              <span>Total-return observations</span>
              <strong>{benchmarkReadiness.coverage.totalReturnObservationCount}</strong>
              <p>price comparisons are not returns</p>
            </article>
          </div>
          <div
            className="table-scroll exit-disposition-table"
            tabIndex={0}
            role="region"
            aria-label="Broad U.S. equity benchmark proxy candidates"
          >
            <table>
              <caption className="sr-only">
                Candidate benchmark proxies without selected or computed benchmark returns
              </caption>
              <thead>
                <tr>
                  <th scope="col">Candidate</th>
                  <th scope="col">June price</th>
                  <th scope="col">July price</th>
                  <th scope="col">Observed price change</th>
                  <th scope="col">Current SEC identity</th>
                  <th scope="col">Total return</th>
                </tr>
              </thead>
              <tbody>
                {benchmarkReadiness.candidates.map((candidate) => (
                  <tr key={candidate.ticker}>
                    <td>
                      <strong>{candidate.ticker}</strong>
                      <small>{candidate.name}</small>
                    </td>
                    <td>${candidate.earlierPrice.toFixed(2)}</td>
                    <td>${candidate.laterPrice.toFixed(2)}</td>
                    <td>
                      {percent(candidate.observedPriceChange, 2)}
                      <small>not a return</small>
                    </td>
                    <td
                      data-status={
                        candidate.currentSecFundAssociation === null ? "unmatched" : "present"
                      }
                    >
                      <strong>
                        {candidate.currentSecFundAssociation === null ? "unmatched" : "present"}
                      </strong>
                      <small>
                        {candidate.currentSecFundAssociation?.seriesId ?? "No exact current match"}
                      </small>
                    </td>
                    <td>
                      <strong className="unverified">unavailable</strong>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <aside className="exit-disposition-limitation" role="note">
            <strong>Price change is not return</strong>
            <p>{benchmarkReadiness.limitations[1]}</p>
          </aside>
        </section>

        <section
          className="filing-availability"
          id="filing-availability"
          aria-labelledby="filing-availability-heading"
        >
          <div className="filing-availability-heading">
            <div>
              <p className="mono-label">
                FILING AVAILABILITY / CUTOFF {filingAvailability.decisionCutoffAt.slice(0, 10)}
              </p>
              <h2 id="filing-availability-heading">Accepted before the decision—or excluded.</h2>
              <p>
                SEC acceptance timestamps define the earliest supported filing boundary for the
                visible top-score and active-portfolio set. Filings after the model cutoff are
                counted and excluded, never allowed to leak backward.
              </p>
            </div>
            <a
              href={`/data/evidence/filing-availability/builds/${filingAvailability.buildId}/filing-availability.json`}
            >
              View availability evidence
            </a>
          </div>
          <div className="filing-availability-summary" aria-label="Filing availability coverage">
            <article>
              <span>Submission histories</span>
              <strong>
                {filingAvailability.coverage.submissionHistoryCount} /{" "}
                {filingAvailability.coverage.selectedTickerCount}
              </strong>
              <p>
                {percent(filingAvailability.coverage.submissionCoverage, 1)} selected-set coverage
              </p>
            </article>
            <article>
              <span>Periodic filing available</span>
              <strong>{filingAvailability.coverage.periodicFilingAvailableCount}</strong>
              <p>10-K or 10-Q family at/before cutoff</p>
            </article>
            <article>
              <span>Post-cutoff excluded</span>
              <strong>{filingAvailability.coverage.excludedPostCutoffFilingCount}</strong>
              <p>captured filings withheld from the decision</p>
            </article>
            <article data-status="blocked">
              <span>Historical validation</span>
              <strong>Blocked</strong>
              <p>retrospective metadata is not acquisition-time proof</p>
            </article>
          </div>
          <div className="filing-availability-ledger">
            <div
              className="table-scroll"
              tabIndex={0}
              role="region"
              aria-label="SEC filing availability examples"
            >
              <table>
                <caption className="sr-only">
                  Latest eligible periodic and current filings by selected ticker
                </caption>
                <thead>
                  <tr>
                    <th scope="col">Ticker / CIK</th>
                    <th scope="col">Latest periodic</th>
                    <th scope="col">Latest current</th>
                    <th scope="col">Later excluded</th>
                  </tr>
                </thead>
                <tbody>
                  {filingAvailability.entries.slice(0, 7).map((entry) => (
                    <tr key={entry.provisionalSecurityId}>
                      <td>
                        <strong>{entry.ticker}</strong>
                        <code>{entry.cik}</code>
                      </td>
                      <td>
                        <strong>{entry.latestPeriodic?.form ?? "Unavailable"}</strong>
                        <small>
                          {entry.latestPeriodic === null
                            ? "No eligible filing"
                            : observedDate(entry.latestPeriodic.acceptedAt)}
                        </small>
                      </td>
                      <td>
                        <strong>{entry.latestCurrent?.form ?? "Unavailable"}</strong>
                        <small>
                          {entry.latestCurrent === null
                            ? "No eligible filing"
                            : observedDate(entry.latestCurrent.acceptedAt)}
                        </small>
                      </td>
                      <td>{entry.filingsAfterCutoffExcluded}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <aside aria-label="Filing availability boundary">
              <strong>Retrospective metadata</strong>
              <p>{filingAvailability.limitations[0]}</p>
              <dl>
                <div>
                  <dt>Decision cutoff</dt>
                  <dd>{observedDate(filingAvailability.decisionCutoffAt)}</dd>
                </div>
                <div>
                  <dt>Captured</dt>
                  <dd>{observedDate(filingAvailability.generatedAt)}</dd>
                </div>
                <div>
                  <dt>Unmatched</dt>
                  <dd>{filingAvailability.unmatched.map(({ ticker }) => ticker).join(", ")}</dd>
                </div>
              </dl>
            </aside>
          </div>
        </section>

        <section
          className="daily-evidence"
          id="daily-evidence"
          aria-labelledby="daily-evidence-heading"
        >
          <div className="daily-evidence-intro">
            <p className="mono-label">IMMUTABLE DAILY RECORD</p>
            <h2 id="daily-evidence-heading">A dated receipt, with limits intact</h2>
            <p>
              The active build is preserved as a schema-validated daily record. Artifact digests,
              model lineage, scoring coverage, and all portfolio positions travel together; absent
              comparison data stays absent.
            </p>
            <div className="evidence-links">
              <a
                href={`/data/evidence/daily/${dailyEvidence.asOfDate}/${dailyEvidence.build.buildId}/evidence.json`}
              >
                View daily JSON
              </a>
              <a
                href={`/data/evidence/daily/${dailyEvidence.asOfDate}/${dailyEvidence.build.buildId}/reproducibility.json`}
              >
                View reproduction report
              </a>
            </div>
          </div>
          <div className="evidence-ledger">
            <dl>
              <div>
                <dt>Evidence date</dt>
                <dd>{dailyEvidence.asOfDate}</dd>
              </div>
              <div>
                <dt>Maturity</dt>
                <dd>{dailyEvidence.maturity}</dd>
              </div>
              <div>
                <dt>Receipted artifacts</dt>
                <dd>{dailyEvidence.artifacts.length} / verified</dd>
              </div>
              <div>
                <dt>Portfolio records</dt>
                <dd>{dailyEvidence.portfolio.positions.length}</dd>
              </div>
              <div>
                <dt>Benchmark</dt>
                <dd data-status={dailyEvidence.benchmark.status}>
                  {dailyEvidence.benchmark.status}
                </dd>
              </div>
              <div>
                <dt>Performance</dt>
                <dd>{dailyEvidence.performance.status}</dd>
              </div>
            </dl>
            <aside aria-label="Evidence limitation">
              <strong>No synthetic comparison</strong>
              <p>{dailyEvidence.benchmark.reason}</p>
              <p>{dailyEvidence.performance.reason}</p>
            </aside>
          </div>
        </section>

        <section
          className="model-governance"
          id="model-governance"
          aria-labelledby="model-governance-heading"
        >
          <div className="governance-heading">
            <div>
              <p className="mono-label">MODEL GOVERNANCE / {modelCard.modelVersion}</p>
              <h2 id="model-governance-heading">What the model is—and is not</h2>
              <p>{modelCard.purpose}</p>
            </div>
            <aside aria-label="Model maturity">
              <span>{modelCard.maturity}</span>
              <strong>Not release eligible</strong>
              <p>{modelCard.limitations[4]}</p>
            </aside>
          </div>

          <div className="validation-ledger" aria-label="Model validation gates">
            {modelCard.validation.map((validation) => (
              <article data-status={validation.status} key={validation.gate}>
                <div>
                  <strong>{validation.gate.replaceAll("-", " ")}</strong>
                  <span>{validation.status.replaceAll("-", " ")}</span>
                </div>
                <p>{validation.summary}</p>
              </article>
            ))}
          </div>

          <div className="dictionary-heading">
            <div>
              <p className="mono-label">METRIC DICTIONARY</p>
              <h3>Five pillars, 26 preserved components</h3>
            </div>
            <div className="governance-links">
              <a
                href={`/data/evidence/governance/models/${modelCard.modelVersion}/model-card.json`}
              >
                View model card
              </a>
              <a
                href={`/data/evidence/governance/models/${modelCard.modelVersion}/metric-dictionary.json`}
              >
                View metric dictionary
              </a>
            </div>
          </div>
          <div className="metric-dictionary">
            {metricDictionary.pillars.map((pillar) => (
              <article key={pillar.pillar}>
                <header>
                  <div>
                    <strong>{pillar.displayName}</strong>
                    <code>{pillar.sourceField}</code>
                  </div>
                  <span>{percent(pillar.weight)}</span>
                </header>
                <ul>
                  {pillar.components.map((component) => (
                    <li key={component.key}>
                      <span>{component.name}</span>
                      <abbr
                        title={
                          component.direction === "higher-is-better"
                            ? "Higher is better"
                            : "Lower is better"
                        }
                      >
                        {component.direction === "higher-is-better" ? "↑" : "↓"}
                      </abbr>
                    </li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
          <div className="method-caveat" role="note">
            <strong>Known methodology gap</strong>
            <p>{metricDictionary.caveat}</p>
          </div>
        </section>

        <section className="data-quality" id="data-quality" aria-labelledby="data-quality-heading">
          <div className="quality-heading">
            <div>
              <p className="mono-label">DATA QUALITY / ACTIVE BUILD</p>
              <h2 id="data-quality-heading">Measured now. Compared when evidence exists.</h2>
            </div>
            <a href={`/data/evidence/quality/builds/${qualityReport.buildId}/quality-drift.json`}>
              View quality report
            </a>
          </div>
          <div className="quality-grid">
            <article>
              <span>Quality gate</span>
              <strong>{qualityReport.quality.status}</strong>
              <p>{qualityReport.quality.rowCount} schema-valid score rows</p>
            </article>
            <article>
              <span>Unique tickers</span>
              <strong>{qualityReport.quality.uniqueTickerCount}</strong>
              <p>{qualityReport.quality.duplicateTickers.length} duplicates</p>
            </article>
            <article>
              <span>Invalid values</span>
              <strong>
                {qualityReport.quality.invalidPriceCount +
                  qualityReport.quality.invalidMarketCapCount}
              </strong>
              <p>price or market-cap violations</p>
            </article>
            <article>
              <span>Score range</span>
              <strong>
                {score(qualityReport.quality.scoreDistribution.minimum)}–
                {score(qualityReport.quality.scoreDistribution.maximum)}
              </strong>
              <p>median {score(qualityReport.quality.scoreDistribution.median)}</p>
            </article>
          </div>
          <aside className="drift-state" data-status={qualityReport.drift.status}>
            <div>
              <span>Temporal drift</span>
              <strong>{qualityReport.drift.status.replaceAll("-", " ")}</strong>
            </div>
            <p>{qualityReport.drift.reason}</p>
          </aside>
        </section>

        <section
          className="security-master"
          id="security-master"
          aria-labelledby="security-master-heading"
        >
          <div className="security-master-heading">
            <div>
              <p className="mono-label">SECURITY MASTER / {securityMaster.asOfDate}</p>
              <h2 id="security-master-heading">Identity evidence, without false permanence.</h2>
              <p>
                Every active ticker resolves to one deterministic research identity. This artifact
                has no permanent issuer identifiers or ticker history, so every identity stays
                visibly provisional; a separate current SEC association snapshot follows.
              </p>
            </div>
            <a
              href={`/data/evidence/security-master/builds/${securityMaster.buildId}/security-master.json`}
            >
              View security master
            </a>
          </div>
          <div className="security-master-summary" aria-label="Security master coverage">
            <article>
              <span>Observed securities</span>
              <strong>{securityMaster.coverage.securityCount}</strong>
              <p>one record per validated ticker</p>
            </article>
            <article>
              <span>Unique research IDs</span>
              <strong>{securityMaster.coverage.uniqueSecurityIdCount}</strong>
              <p>{securityMaster.coverage.duplicateSecurityIds.length} collisions</p>
            </article>
            <article>
              <span>Permanent identifiers</span>
              <strong>{securityMaster.coverage.permanentIdentifierCount}</strong>
              <p>not embedded in this security-master artifact</p>
            </article>
            <article data-status={securityMaster.status}>
              <span>Identity status</span>
              <strong>{securityMaster.status}</strong>
              <p>{securityMaster.identityPolicy.identifierBasis.replaceAll("-", " ")}</p>
            </article>
          </div>
          <div className="security-master-ledger">
            <div
              className="table-scroll"
              tabIndex={0}
              role="region"
              aria-label="Provisional security identity examples"
            >
              <table>
                <caption className="sr-only">
                  Example provisional security identities and current source classifications
                </caption>
                <thead>
                  <tr>
                    <th scope="col">Current ticker</th>
                    <th scope="col">Research identity</th>
                    <th scope="col">Name</th>
                    <th scope="col">Sector</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleMasterEntries.map((security) => (
                    <tr key={security.securityId}>
                      <td>
                        <strong>{security.currentTicker}</strong>
                      </td>
                      <td>
                        <code>{security.securityId}</code>
                      </td>
                      <td>{security.name}</td>
                      <td>{security.sector}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <aside data-status="provisional" aria-label="Identity limitation">
              <strong>Ticker history unavailable</strong>
              <p>{securityMaster.limitations[1]}</p>
              <p>{securityMaster.limitations[2]}</p>
            </aside>
          </div>
        </section>

        <section
          className="sec-registrants"
          id="sec-registrants"
          aria-labelledby="sec-registrants-heading"
        >
          <div className="sec-registrants-heading">
            <div>
              <p className="mono-label">
                SEC REGISTRANT SNAPSHOT / {secRegistrants.sourceReceipt.snapshotId}
              </p>
              <h2 id="sec-registrants-heading">
                Every ticker checked. Identity scope stays honest.
              </h2>
              <p>
                Exact current-ticker matching connects the active universe to checksum-pinned SEC
                filer and registered-fund records. Unmatched tickers stay unresolved, and a CIK is
                never presented as permanent exchange-listing identity.
              </p>
            </div>
            <a
              href={`/data/evidence/sec-registrants/builds/${secRegistrants.buildId}/sec-registrants.json`}
            >
              View crosswalk evidence
            </a>
          </div>
          <div className="sec-registrants-summary" aria-label="SEC registrant match coverage">
            <article>
              <span>Exact associations</span>
              <strong>
                {secRegistrants.coverage.matchedSecurityCount} /{" "}
                {secRegistrants.coverage.activeSecurityCount}
              </strong>
              <p>
                {percent(secRegistrants.coverage.registrantCoverage, 1)} current-ticker coverage
              </p>
            </article>
            <article>
              <span>Company CIK matches</span>
              <strong>
                {secRegistrants.coverage.companyCikMatchCount} /{" "}
                {secRegistrants.coverage.operatingCompanyCount}
              </strong>
              <p>{percent(secRegistrants.coverage.companyCikCoverage, 1)} registrant coverage</p>
            </article>
            <article>
              <span>Fund class matches</span>
              <strong>
                {secRegistrants.coverage.fundClassMatchCount} /{" "}
                {secRegistrants.coverage.registeredFundCount}
              </strong>
              <p>{percent(secRegistrants.coverage.fundClassCoverage, 1)} class coverage</p>
            </article>
            <article data-status="blocked">
              <span>Listing identity</span>
              <strong>
                {percent(secRegistrants.coverage.operatingCompanyListingIdentityCoverage)}
              </strong>
              <p>CIK identifies the registrant, not its exchange listing</p>
            </article>
          </div>
          <div className="sec-registrants-ledger">
            <div
              className="table-scroll"
              tabIndex={0}
              role="region"
              aria-label="Exact SEC registrant association examples"
            >
              <table>
                <caption className="sr-only">
                  Exact current-ticker SEC registrant associations for leading scores
                </caption>
                <thead>
                  <tr>
                    <th scope="col">Ticker</th>
                    <th scope="col">SEC identity</th>
                    <th scope="col">Registrant or fund</th>
                    <th scope="col">Scope</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleRegistrantEntries.map((entry) => (
                    <tr key={entry.provisionalSecurityId}>
                      <td>
                        <strong>{entry.ticker}</strong>
                      </td>
                      <td>
                        <code>{`CIK ${entry.cik}`}</code>
                        {entry.seriesId !== null && (
                          <small>
                            {entry.seriesId} / {entry.classId}
                          </small>
                        )}
                      </td>
                      <td>{entry.secTitle ?? "Registered fund class"}</td>
                      <td>{entry.identityScope.replaceAll("-", " ")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <aside aria-label="Unmatched SEC ticker associations">
              <div>
                <strong>{`${secRegistrants.coverage.unmatchedSecurityCount} unresolved`}</strong>
                <span>{`${secRegistrants.coverage.ambiguousSecurityCount} ambiguous`}</span>
              </div>
              <p>No fuzzy or company-name fallback is used.</p>
              <ul>
                {secRegistrants.unmatched.map(({ ticker, expectedSource }) => (
                  <li key={ticker}>
                    <strong>{ticker}</strong>
                    <span>{expectedSource.replaceAll("-", " ")}</span>
                  </li>
                ))}
              </ul>
            </aside>
          </div>
          <aside className="sec-registrants-limitation" role="note">
            <strong>Current association only</strong>
            <p>{secRegistrants.limitations[2]}</p>
          </aside>
        </section>

        <section
          className="historical-readiness"
          id="historical-readiness"
          aria-labelledby="historical-readiness-heading"
        >
          <div className="historical-readiness-heading">
            <div>
              <p className="mono-label">POINT-IN-TIME READINESS / FAIL-CLOSED</p>
              <h2 id="historical-readiness-heading">Two snapshots are not a backtest.</h2>
              <p>
                June and July research cross-sections are preserved, hashed, and reproducible. They
                do not contain the availability-time, identity-history, universe, corporate-action,
                benchmark, or execution evidence required for historical validation.
              </p>
            </div>
            <aside data-status={historicalReadiness.status} aria-label="Historical readiness">
              <span>Historical validation</span>
              <strong>{historicalReadiness.status}</strong>
              <p>
                {historicalReadiness.inventory.snapshotCount} snapshots inventoried /{" "}
                {historicalReadiness.blockers.length} controls unresolved
              </p>
            </aside>
          </div>
          <div className="historical-readiness-grid">
            <div
              className="table-scroll"
              tabIndex={0}
              role="region"
              aria-label="Preserved historical snapshot inventory"
            >
              <table>
                <caption className="sr-only">
                  Preserved cross-sectional research snapshots and row counts
                </caption>
                <thead>
                  <tr>
                    <th scope="col">Research snapshot</th>
                    <th scope="col">Declared generation</th>
                    <th scope="col">$0B rows</th>
                    <th scope="col">$10B rows</th>
                  </tr>
                </thead>
                <tbody>
                  {historicalReadiness.snapshots.map((snapshot) => (
                    <tr key={snapshot.snapshotId}>
                      <td>
                        <strong>{snapshot.label}</strong>
                        <small>{snapshot.observationKind.replaceAll("-", " ")}</small>
                      </td>
                      <td>
                        <code>{snapshot.declaredGeneratedAt}</code>
                        <small>{snapshot.timestampStatus.replaceAll("-", " ")}</small>
                      </td>
                      <td>
                        {snapshot.artifacts[0]!.rowCount}
                        <small>
                          {snapshot.artifacts[0]!.strictInputContractStatus} /{" "}
                          {snapshot.artifacts[0]!.strictInputIssueCount} issues
                        </small>
                      </td>
                      <td>
                        {snapshot.artifacts[1]!.rowCount}
                        <small>
                          {snapshot.artifacts[1]!.strictInputContractStatus} /{" "}
                          {snapshot.artifacts[1]!.strictInputIssueCount} issues
                        </small>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="historical-control-ledger">
              <div>
                <strong>Readiness controls</strong>
                <a
                  href={`/data/evidence/historical-readiness/builds/${historicalReadiness.buildId}/historical-readiness.json`}
                >
                  View full report
                </a>
              </div>
              <ul>
                {historicalReadiness.controls.map((control) => (
                  <li data-status={control.status} key={control.key}>
                    <span>{control.key.replaceAll("-", " ")}</span>
                    <strong>{control.status}</strong>
                  </li>
                ))}
              </ul>
            </div>
          </div>
          <aside className="historical-conclusion" role="note">
            <strong>No performance claim</strong>
            <p>{historicalReadiness.conclusion}</p>
          </aside>
        </section>

        <section className="maturity-assessment" id="maturity" aria-labelledby="maturity-heading">
          <div className="maturity-heading">
            <div>
              <p className="mono-label">EVIDENCE MATURITY / FAIL-CLOSED</p>
              <h2 id="maturity-heading">Working product. Research-preview evidence.</h2>
              <p>
                Product capability and evidence maturity are separate. V3 works end to end, but its
                label cannot advance until each later transition has the evidence shown here.
              </p>
            </div>
            <aside aria-label="Current evidence maturity">
              <span>Current level</span>
              <strong>{maturity.currentLevel.replaceAll("-", " ")}</strong>
              <p>{maturity.releaseEligible ? "Release eligible" : "Not release eligible"}</p>
            </aside>
          </div>
          <ol className="maturity-ladder" aria-label="Evidence maturity levels">
            {maturity.levels.map((level, index) => (
              <li data-status={level.status} key={level.level}>
                <span>{String(index + 1).padStart(2, "0")}</span>
                <strong>{level.level.replaceAll("-", " ")}</strong>
                <small>{level.status}</small>
              </li>
            ))}
          </ol>
          <div className="maturity-evidence">
            <dl>
              <div>
                <dt>Immutable daily builds</dt>
                <dd>
                  {maturity.observations.immutableDailyBuilds} /{" "}
                  {maturity.observations.requiredDailyBuilds}
                </dd>
              </div>
              <div>
                <dt>Model gates passing</dt>
                <dd>
                  {maturity.observations.modelValidationPasses} /{" "}
                  {maturity.observations.modelValidationTotal}
                </dd>
              </div>
              <div>
                <dt>Permanent identifiers</dt>
                <dd>{maturity.observations.permanentIdentifierCount}</dd>
              </div>
              <div>
                <dt>Temporal drift</dt>
                <dd>{maturity.observations.driftStatus.replaceAll("-", " ")}</dd>
              </div>
            </dl>
            <div>
              <div className="maturity-blocker-heading">
                <strong>Next-level blockers</strong>
                <a href={`/data/evidence/maturity/builds/${maturity.buildId}/maturity.json`}>
                  View full assessment
                </a>
              </div>
              <ul>
                {maturity.levels
                  .find(({ level }) => level === "validation-candidate")!
                  .requirements.filter(({ status }) => status === "blocked")
                  .map((requirement) => (
                    <li key={requirement.key}>{requirement.detail}</li>
                  ))}
              </ul>
            </div>
          </div>
          <aside className="cutover-lock" data-status={maturity.cutover.status}>
            <strong>Production cutover: {maturity.cutover.status.replaceAll("-", " ")}</strong>
            <p>{maturity.cutover.reason}</p>
          </aside>
        </section>

        <section className="factor-audit" id="scores" aria-labelledby="factor-audit-heading">
          <div className="section-heading">
            <p className="mono-label">FACTOR COVERAGE</p>
            <h2 id="factor-audit-heading">Missing inputs stay visible</h2>
          </div>
          <p className="factor-intro">
            Each pillar is measured against the full source universe before scoring. Incomplete
            securities are excluded with a recorded reason; their remaining factors are never
            silently reweighted.
          </p>
          <div className="factor-grid">
            {dashboard.scoring.factorCoverage.map((factor) => (
              <article key={factor.pillar}>
                <div>
                  <strong>{factor.pillar}</strong>
                  <span>{percent(factor.coverage, 1)}</span>
                </div>
                <div
                  className="factor-track"
                  role="img"
                  aria-label={`${factor.pillar} coverage is ${percent(factor.coverage, 1)}`}
                >
                  <span style={{ width: percent(factor.coverage) }} />
                </div>
                <dl>
                  <div>
                    <dt>Available</dt>
                    <dd>{factor.availableSecurities}</dd>
                  </div>
                  <div>
                    <dt>Missing</dt>
                    <dd>{factor.missingSecurities}</dd>
                  </div>
                </dl>
                <code>{factor.sourceField}</code>
              </article>
            ))}
          </div>
        </section>

        <div className="content-grid">
          <section className="panel rankings" aria-labelledby="rankings-heading">
            <div className="panel-heading">
              <div>
                <p className="mono-label">MODEL OUTPUT</p>
                <h2 id="rankings-heading">Highest composite scores</h2>
              </div>
              <span className="panel-note">Equal five-pillar weighting</span>
            </div>
            <div
              className="table-scroll"
              tabIndex={0}
              role="region"
              aria-label="Composite score ranking table"
            >
              <table>
                <caption className="sr-only">
                  Highest composite scores with sector, factor coverage, score, and portfolio weight
                </caption>
                <thead>
                  <tr>
                    <th scope="col">Rank / security</th>
                    <th scope="col">Sector</th>
                    <th scope="col">Coverage</th>
                    <th scope="col">Score</th>
                    <th scope="col">Portfolio</th>
                  </tr>
                </thead>
                <tbody>
                  {dashboard.topScores.map((security, index) => {
                    const position = portfolioByTicker.get(security.ticker);

                    return (
                      <tr key={security.ticker}>
                        <td>
                          <span className="rank">{String(index + 1).padStart(2, "0")}</span>
                          <span className="security">
                            <strong>{security.ticker}</strong>
                            <small>{security.name}</small>
                          </span>
                        </td>
                        <td>{security.sector}</td>
                        <td>
                          <span className="coverage">
                            <span style={{ width: percent(security.coverage) }} />
                          </span>
                          {percent(security.coverage)}
                        </td>
                        <td className="score">{score(security.score)}</td>
                        <td>
                          {position ? (
                            <span className="weight-chip">{percent(position.weight)}</span>
                          ) : (
                            <span className="muted">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>

          <aside
            className="panel portfolio-panel"
            id="portfolio"
            aria-labelledby="portfolio-heading"
          >
            <div className="panel-heading">
              <div>
                <p className="mono-label">CONSTRAINED BOOK</p>
                <h2 id="portfolio-heading">Sector exposure</h2>
              </div>
              <span className="verified-badge">Verified</span>
            </div>
            <div className="sector-list">
              {sortedSectors.map(([sector, weight]) => (
                <div className="sector-row" key={sector}>
                  <div>
                    <span>{sector}</span>
                    <strong>{percent(weight)}</strong>
                  </div>
                  <div
                    className="sector-track"
                    role="img"
                    aria-label={`${sector} is ${percent(weight)} of the portfolio`}
                  >
                    <span
                      style={{
                        width: percent(weight / dashboard.portfolio.constraints.maxSectorWeight),
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
            <div className="constraint-grid">
              <div>
                <span>Largest position</span>
                <strong>
                  {percent(
                    Math.max(...dashboard.portfolio.positions.map((position) => position.weight)),
                  )}
                </strong>
              </div>
              <div>
                <span>Largest sector</span>
                <strong>
                  {percent(Math.max(...Object.values(dashboard.portfolio.sectorWeights)))}
                </strong>
              </div>
              <div>
                <span>Invested</span>
                <strong>{percent(dashboard.portfolio.totalWeight)}</strong>
              </div>
            </div>
            <div className="allocation-evidence">
              <p className="mono-label">EXACT CONSTRAINT LEDGER</p>
              <dl>
                <div>
                  <dt>Method</dt>
                  <dd>{dashboard.portfolio.construction.method}</dd>
                </div>
                <div>
                  <dt>Weight units</dt>
                  <dd>
                    {dashboard.portfolio.totalWeightUnits.toLocaleString("en-US")} /{" "}
                    {dashboard.portfolio.construction.weightScale.toLocaleString("en-US")}
                  </dd>
                </div>
                <div>
                  <dt>Capped capacity</dt>
                  <dd>{percent(dashboard.portfolio.construction.maximumFeasibleWeight)}</dd>
                </div>
                <div>
                  <dt>Binding sectors</dt>
                  <dd>{dashboard.portfolio.construction.bindingSectors.join(", ") || "None"}</dd>
                </div>
              </dl>
            </div>
          </aside>
        </div>

        <EvidenceExplorer />

        <section className="status-guide" aria-labelledby="status-guide-heading">
          <div>
            <p className="mono-label">AVAILABILITY CONTRACT</p>
            <h2 id="status-guide-heading">The interface says what it knows</h2>
          </div>
          <ul>
            <li>
              <strong>Current</strong>
              <span>Integrity and freshness pass.</span>
            </li>
            <li>
              <strong>Stale</strong>
              <span>Verified history remains visible with a freshness warning.</span>
            </li>
            <li>
              <strong>Degraded</strong>
              <span>Explicit fallback or delayed inputs use last-known-good evidence.</span>
            </li>
            <li>
              <strong>Unavailable</strong>
              <span>Missing or failed evidence is withheld.</span>
            </li>
            <li>
              <strong>Error</strong>
              <span>Schema, lineage, size, or hash verification failed.</span>
            </li>
          </ul>
        </section>

        <section className="lineage" id="lineage" aria-labelledby="lineage-heading">
          <div className="section-heading">
            <p className="mono-label">LINEAGE</p>
            <h2 id="lineage-heading">The receipt travels with the result</h2>
          </div>
          <div className="lineage-grid">
            <dl>
              <div>
                <dt>Repository source</dt>
                <dd>{dashboard.source.repositoryPath}</dd>
              </div>
              <div>
                <dt>Source commit</dt>
                <dd>{dashboard.source.sourceCommit}</dd>
              </div>
              <div>
                <dt>Content SHA-256</dt>
                <dd>{dashboard.source.contentSha256}</dd>
              </div>
            </dl>
            <dl>
              <div>
                <dt>Model version</dt>
                <dd>{dashboard.modelVersion}</dd>
              </div>
              <div>
                <dt>Schema version</dt>
                <dd>{dashboard.schemaVersion}</dd>
              </div>
              <div>
                <dt>Missing-data policy</dt>
                <dd>{dashboard.scoring.missingDataPolicy}</dd>
              </div>
              <div>
                <dt>Eligible normalization</dt>
                <dd>{dashboard.scoring.eligibleNormalization}</dd>
              </div>
              <div>
                <dt>Retry mode</dt>
                <dd>{dashboard.pipeline.retryMode}</dd>
              </div>
              <div>
                <dt>Rollback mode</dt>
                <dd>{dashboard.pipeline.rollbackMode}</dd>
              </div>
            </dl>
          </div>
        </section>

        <footer>
          <span>Akribeia V3 · immutable evidence preview</span>
          <p>{dashboard.notice}</p>
        </footer>
      </main>
    </>
  );
}

export default function Home() {
  return <LandingPortal />;
}
