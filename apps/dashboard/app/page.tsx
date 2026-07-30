import { VerticalSliceDashboardSchema } from "@akribeia/contracts";
import activeDashboard from "./generated/active-dashboard.json";

const dashboard = VerticalSliceDashboardSchema.parse(activeDashboard);

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
  ["01", "Repository snapshot"],
  ["02", "Contract validation"],
  ["03", "Coverage gate"],
  ["04", "Portfolio caps"],
  ["05", "Atomic publish"],
  ["06", "Active selection"],
] as const;

export default function Home() {
  const portfolioByTicker = new Map(
    dashboard.portfolio.positions.map((position) => [position.ticker, position]),
  );
  const sortedSectors = Object.entries(dashboard.portfolio.sectorWeights).sort(([left], [right]) =>
    left.localeCompare(right),
  );

  return (
    <main>
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
        <div className="header-status" aria-label="Publication status">
          <span className="status-dot" aria-hidden="true" />
          Active build verified
        </div>
      </header>

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
            <p className="mono-label">ACTIVE / HEALTHY</p>
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
          {pipelineStages.map(([number, label]) => (
            <li key={number}>
              <span>{number}</span>
              <strong>{label}</strong>
              <small>Passed</small>
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

      <div className="content-grid">
        <section className="panel rankings" aria-labelledby="rankings-heading">
          <div className="panel-heading">
            <div>
              <p className="mono-label">MODEL OUTPUT</p>
              <h2 id="rankings-heading">Highest composite scores</h2>
            </div>
            <span className="panel-note">Equal five-pillar weighting</span>
          </div>
          <div className="table-scroll">
            <table>
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

        <aside className="panel portfolio-panel" aria-labelledby="portfolio-heading">
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
        </aside>
      </div>

      <section className="lineage" aria-labelledby="lineage-heading">
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
          </dl>
        </div>
      </section>

      <footer>
        <span>Akribeia V3 · immutable evidence preview</span>
        <p>{dashboard.notice}</p>
      </footer>
    </main>
  );
}
