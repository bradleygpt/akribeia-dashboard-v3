import { ResearchHeader } from "../research-header";

export const metadata = {
  title: "Product Help — Akribeia",
  description:
    "Route-specific help for Akribeia data provenance, controls, unavailable states and keyboard navigation.",
};

const routes = [
  [
    "Market Health",
    "/dashboard#market-health",
    "Live gauges, preserved macro inputs, breadth and risk state. Each unavailable upstream source fails visibly.",
  ],
  [
    "Research",
    "/research",
    "Filter and sort the preserved full universe, compare securities, and open a security detail route.",
  ],
  [
    "Security details",
    "/research/AAPL",
    "Inspect pillar inputs, price periods, risk, peers and approved quarterly history for a stock.",
  ],
  [
    "ETFs",
    "/etfs",
    "Search the approved ETF union, explore templates, classifications, holdings and reverse look-through.",
  ],
  [
    "ETF details",
    "/etfs/SPY",
    "Inspect ETF-specific holdings and classification. Stock-model pillars remain suppressed when they are not valid for an ETF.",
  ],
  [
    "Sectors",
    "/sectors",
    "Compare stock-only sector aggregates and inspect the companies behind each aggregate.",
  ],
  [
    "Risk",
    "/risk",
    "Review source-attributed institutional risk themes, severity, direction, horizon and observable triggers.",
  ],
  [
    "Prolepsis",
    "/prolepsis",
    "Explore all 1,178 classifier rows. Target-basket membership and return-forecast availability are separate fields.",
  ],
  [
    "Strategies",
    "/strategies",
    "Review dated strategy definitions and holding records with live-versus-paper book labeling.",
  ],
  [
    "Macro",
    "/macro",
    "Review approved forecast consensus and the explicit unavailable states for macro event schedules and market-implied probabilities while their source contract remains pending.",
  ],
  [
    "Portfolio",
    "/portfolio",
    "Create, edit, import, export and delete a device-local holding list; inspect source-backed as-of diagnostics and the deterministic V2 Monte Carlo method.",
  ],
] as const;

export default function HelpPage() {
  return (
    <>
      <ResearchHeader active="help" />
      <main id="main-content" tabIndex={-1} className="research-page parity-page help-page">
        <section className="research-route-hero parity-route-hero">
          <p className="mono-label">HELP / ACTUAL PRODUCT CONTRACT</p>
          <h1>
            Use the evidence.
            <span> Read the limits.</span>
          </h1>
          <p>
            This guide describes the dashboard as implemented: where data comes from, how controls
            behave, and what unavailable means. It does not promise data or features that the
            current approved contracts do not supply.
          </p>
        </section>

        <nav className="help-index" aria-label="Help topics">
          <a href="#routes">Product routes</a>
          <a href="#controls">Controls</a>
          <a href="#quotes">Quote labels</a>
          <a href="#provenance">Provenance</a>
          <a href="#limits">Limitations</a>
          <a href="#keyboard">Keyboard</a>
        </nav>

        <section className="parity-section" id="routes" aria-labelledby="routes-heading">
          <div className="research-subheading">
            <div>
              <p className="mono-label">ROUTE GUIDE</p>
              <h2 id="routes-heading">Product surfaces</h2>
            </div>
            <span>Each link opens an implemented dashboard route</span>
          </div>
          <div className="help-route-grid">
            {routes.map(([name, href, description]) => (
              <article key={name}>
                <h3>
                  <a href={href}>{name}</a>
                </h3>
                <p>{description}</p>
                <code>{href}</code>
              </article>
            ))}
          </div>
        </section>

        <section
          className="parity-section parity-section-alt"
          id="controls"
          aria-labelledby="controls-heading"
        >
          <div className="research-subheading">
            <div>
              <p className="mono-label">FILTER / SORT / PERIOD</p>
              <h2 id="controls-heading">Controls</h2>
            </div>
          </div>
          <div className="help-columns">
            <article>
              <h3>Period selectors</h3>
              <p>
                Security price history supports <strong>1D, WTD, 1W, 1M and MTD</strong>, plus the
                existing longer periods. The selected period controls both the requested range and
                the displayed label.
              </p>
              <p>
                1M means the latest available close compared with the available close on or
                immediately before the one-calendar-month anchor. Exact start and end dates are
                shown. Non-daily periods are not labeled daily change.
              </p>
            </article>
            <article>
              <h3>Sorting</h3>
              <p>
                Activate a table-header button to sort ascending; activate it again to reverse
                direction. Numeric values sort numerically, dates chronologically, and text
                lexically. Unavailable values are kept separate from zero and remain predictably
                last.
              </p>
            </article>
            <article>
              <h3>Filters</h3>
              <p>
                Filters reduce only the displayed set. Reset or clear controls to restore the full
                eligible route universe. Prolepsis quote failures never remove classifier rows, and
                ETF/security availability rules remain unchanged by filtering.
              </p>
            </article>
          </div>
        </section>

        <section className="parity-section" id="quotes" aria-labelledby="quotes-heading">
          <div className="research-subheading">
            <div>
              <p className="mono-label">PRICE PROVENANCE</p>
              <h2 id="quotes-heading">Live, as_of and unavailable</h2>
            </div>
          </div>
          <dl className="help-definition-list">
            <div>
              <dt>
                <span className="source-chip" data-source="live">
                  live
                </span>
              </dt>
              <dd>
                A finite quote returned by the current bounded quote request. Its visible timestamp
                identifies when the response was produced.
              </dd>
            </div>
            <div>
              <dt>
                <span className="source-chip" data-source="as_of">
                  as_of
                </span>
              </dt>
              <dd>
                A finite value retained from the approved dated artifact because no finite live
                overlay was available. It is not described as live.
              </dd>
            </div>
            <div>
              <dt>
                <span className="source-chip" data-source="unavailable">
                  unavailable
                </span>
              </dt>
              <dd>
                No approved finite value is available. The row remains visible when the surrounding
                product contract requires it.
              </dd>
            </div>
          </dl>
        </section>

        <section
          className="parity-section parity-section-alt"
          id="provenance"
          aria-labelledby="provenance-heading"
        >
          <div className="research-subheading">
            <div>
              <p className="mono-label">SOURCE DISCIPLINE</p>
              <h2 id="provenance-heading">Data provenance</h2>
            </div>
          </div>
          <div className="help-columns">
            <article>
              <h3>Pinned references</h3>
              <p>
                V2 reference adapters identify the exact frozen application or data commit. Source
                dates and generated-at values are shown when supplied.
              </p>
            </article>
            <article>
              <h3>Displayed artifacts</h3>
              <p>
                The research and Prolepsis routes use validated displayed artifacts. The dashboard
                does not regenerate classifiers, predictions, targets, ranks or source outputs.
              </p>
            </article>
            <article>
              <h3>Derived display values</h3>
              <p>
                Where the dashboard computes a display aggregate, its population and units are
                stated. Missing values are not silently filled and valid zero values are preserved.
              </p>
            </article>
          </div>
        </section>

        <section className="parity-section" id="limits" aria-labelledby="limits-heading">
          <div className="research-subheading">
            <div>
              <p className="mono-label">KNOWN LIMITS</p>
              <h2 id="limits-heading">Interpret unavailable data</h2>
            </div>
          </div>
          <ul className="help-limit-list">
            <li>
              Unavailable is an integrity state, not a negative score, zero, or failed security.
            </li>
            <li>
              SPY and other ETFs do not receive stock-model pillar grades when the approved contract
              does not support them.
            </li>
            <li>
              Macro recurring schedules do not contain exact event dates or times; policy
              probabilities are dated heuristics, not live event probabilities.
            </li>
            <li>
              Strategy paper books are research records, not live positions. Historical performance
              does not predict future results.
            </li>
            <li>
              Portfolio inputs are stored only in this browser. Monte Carlo is a scenario simulation
              under disclosed assumptions—not a forecast, guarantee, or recommendation.
            </li>
            <li>
              All content is informational research, not investment advice or a trading instruction.
            </li>
          </ul>
        </section>

        <section
          className="parity-section parity-section-alt"
          id="keyboard"
          aria-labelledby="keyboard-heading"
        >
          <div className="research-subheading">
            <div>
              <p className="mono-label">ACCESSIBILITY</p>
              <h2 id="keyboard-heading">Keyboard navigation</h2>
            </div>
          </div>
          <div className="help-columns">
            <article>
              <h3>Move</h3>
              <p>
                Use Tab and Shift+Tab to move through navigation, filters, links and sortable
                headers. The first focusable link skips directly to main content.
              </p>
            </article>
            <article>
              <h3>Activate</h3>
              <p>
                Use Enter on links and Enter or Space on buttons, disclosure controls and sorting
                controls. Native select and input keyboard behavior is preserved.
              </p>
            </article>
            <article>
              <h3>Status</h3>
              <p>
                Loading, partial, failure and quote states use status/live-region semantics.
                Reduced-motion preference suppresses the animated route transition without blocking
                navigation.
              </p>
            </article>
          </div>
        </section>

        <footer className="research-route-footer">
          <span>Help reflects the current dashboard release candidate</span>
          <span>No unsupported parity or performance claim</span>
        </footer>
      </main>
    </>
  );
}
