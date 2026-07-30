import {
  DailyEvidenceRecordSchema,
  DataQualityReportSchema,
  HistoricalReadinessReportSchema,
  MaturityAssessmentSchema,
  MetricDictionarySchema,
  ModelCardSchema,
  SecurityMasterSchema,
  VerticalSliceDashboardSchema,
} from "@akribeia/contracts";
import { DataStatusBanner } from "./data-status-banner";
import { EvidenceExplorer } from "./evidence-explorer";
import activeDashboard from "./generated/active-dashboard.json";
import activeDailyEvidence from "./generated/active-daily-evidence.json";
import activeHistoricalReadiness from "./generated/active-historical-readiness.json";
import activeMetricDictionary from "./generated/active-metric-dictionary.json";
import activeMaturity from "./generated/active-maturity.json";
import activeModelCard from "./generated/active-model-card.json";
import activeQualityReport from "./generated/active-quality-report.json";
import activeSecurityMaster from "./generated/active-security-master.json";

const dashboard = VerticalSliceDashboardSchema.parse(activeDashboard);
const dailyEvidence = DailyEvidenceRecordSchema.parse(activeDailyEvidence);
const historicalReadiness = HistoricalReadinessReportSchema.parse(activeHistoricalReadiness);
const metricDictionary = MetricDictionarySchema.parse(activeMetricDictionary);
const maturity = MaturityAssessmentSchema.parse(activeMaturity);
const modelCard = ModelCardSchema.parse(activeModelCard);
const qualityReport = DataQualityReportSchema.parse(activeQualityReport);
const securityMaster = SecurityMasterSchema.parse(activeSecurityMaster);

if (
  modelCard.modelVersion !== dashboard.modelVersion ||
  metricDictionary.modelVersion !== dashboard.modelVersion ||
  historicalReadiness.buildId !== dashboard.buildId ||
  historicalReadiness.modelVersion !== dashboard.modelVersion ||
  qualityReport.buildId !== dashboard.buildId ||
  maturity.buildId !== dashboard.buildId ||
  maturity.modelVersion !== dashboard.modelVersion ||
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

export default function Home() {
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

  return (
    <>
      <a className="skip-link" href="#main-content">
        Skip to main content
      </a>
      <header className="site-header">
        <a className="brand" href="#top" aria-label="Akribeia V3 evidence preview home">
          <span className="brand-mark" aria-hidden="true">
            A
          </span>
          <span>
            <strong>Akribeia</strong>
            <small>V3 evidence preview</small>
          </span>
        </a>
        <nav className="primary-nav" aria-label="Primary navigation">
          <a href="#scores">Scores</a>
          <a href="#portfolio">Portfolio</a>
          <a href="#daily-evidence">Evidence</a>
          <a href="#model-governance">Method</a>
          <a href="#data-quality">Quality</a>
          <a href="#security-master">Master</a>
          <a href="#historical-readiness">History</a>
          <a href="#maturity">Maturity</a>
          <a href="#explore">Explain</a>
          <a href="#lineage">Lineage</a>
        </nav>
        <div className="header-status" aria-label="Publication integrity">
          <span className="status-dot" aria-hidden="true" />
          Build published
        </div>
      </header>

      <main id="main-content" tabIndex={-1}>
        <DataStatusBanner />

        <section className="hero" id="top">
          <div className="eyebrow">
            <span>Build {dashboard.buildId}</span>
            <span>{dashboard.schemaVersion}</span>
          </div>
          <div className="hero-grid">
            <div>
              <h1>
                From source to signal,
                <span> every gate visible.</span>
              </h1>
              <p className="hero-copy">
                A working V3 slice built from the preserved V2 baseline. Every score is coverage
                checked, every weight obeys explicit caps, and every output resolves through one
                immutable active build.
              </p>
            </div>
            <aside className="hero-evidence" aria-label="Active build evidence">
              <p className="mono-label">PUBLISHED / VERIFIED</p>
              <strong>{dashboard.source.rowCount}</strong>
              <span>validated securities</span>
              <dl>
                <div>
                  <dt>Observed</dt>
                  <dd>{observedDate(dashboard.source.observedAt)} UTC</dd>
                </div>
                <div>
                  <dt>Coverage policy</dt>
                  <dd>100% required</dd>
                </div>
              </dl>
            </aside>
          </div>
        </section>

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
                Every active ticker resolves to one deterministic research identity. The source has
                no permanent issuer identifiers or ticker history, so every identity stays visibly
                provisional.
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
              <p>CIK, CUSIP, ISIN, and LEI unavailable</p>
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
