export function ResearchHeader({
  active,
}: {
  active:
    | "research"
    | "prolepsis"
    | "risk"
    | "sectors"
    | "etfs"
    | "macro"
    | "strategies"
    | "portfolio"
    | "help";
}) {
  return (
    <>
      <a className="skip-link" href="#main-content">
        Skip to main content
      </a>
      <header className="site-header research-site-header">
        <a className="brand" href="/" aria-label="Akribeia quantitative research home">
          <span className="brand-mark" aria-hidden="true">
            A
          </span>
          <span>
            <strong>Akribeia</strong>
            <small>Research system</small>
          </span>
        </a>
        <nav className="primary-nav" aria-label="Core research navigation">
          <a href="/">Home</a>
          <a href="/dashboard#market-health">Market Health</a>
          <a href="/macro" aria-current={active === "macro" ? "page" : undefined}>
            Macro
          </a>
          <a href="/research" aria-current={active === "research" ? "page" : undefined}>
            Screener
          </a>
          <a href="/prolepsis" aria-current={active === "prolepsis" ? "page" : undefined}>
            Prolepsis
          </a>
          <a href="/risk" aria-current={active === "risk" ? "page" : undefined}>
            Risk Radar
          </a>
          <a href="/sectors" aria-current={active === "sectors" ? "page" : undefined}>
            Sectors
          </a>
          <a href="/etfs" aria-current={active === "etfs" ? "page" : undefined}>
            ETF Center
          </a>
          <a href="/strategies" aria-current={active === "strategies" ? "page" : undefined}>
            Strategies
          </a>
          <a href="/portfolio" aria-current={active === "portfolio" ? "page" : undefined}>
            Portfolio
          </a>
          <a href="/help" aria-current={active === "help" ? "page" : undefined}>
            Help
          </a>
        </nav>
        <div className="header-status" aria-label="Research data integrity">
          <span className="status-dot" aria-hidden="true" />
          V2 data · V3 controls
        </div>
      </header>
      <div className="research-context-bar">
        <span>Wave 2 / Core research parity</span>
        <span>Preserved no-floor universe · live data fails closed</span>
      </div>
    </>
  );
}
