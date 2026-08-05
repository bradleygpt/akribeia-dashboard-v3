import { Scene } from "./landing/Scene";

export function LandingPortal() {
  return (
    <>
      <a className="portal-skip-link" href="#portal-navigation">
        Skip to portal navigation
      </a>
      <main className="portal-home" id="main-content">
        <header className="portal-masthead">
          <a className="portal-wordmark" href="/" aria-label="Akribeia portal home">
            <span aria-hidden="true">A</span>
            <strong>Akribeia</strong>
          </a>
          <p>Quantitative market research</p>
        </header>

        <section className="portal-intro" aria-labelledby="portal-title">
          <div>
            <p className="portal-kicker">THREE SYSTEMS / ONE RESEARCH UNIVERSE</p>
            <h1 id="portal-title">Enter the Akribeia intelligence system.</h1>
          </div>
          <p>
            Move from market conditions to security research and portfolio risk through one
            evidence-aware interface. Every body below is a direct destination.
          </p>
        </section>

        <Scene />

        <nav className="portal-destination-list" id="portal-navigation" aria-label="All products">
          <a href="/dashboard">
            <span>01</span>
            Market Health
          </a>
          <a href="/research">
            <span>02</span>
            Research
          </a>
          <a href="/etfs">
            <span>03</span>
            ETFs
          </a>
          <a href="/sectors">
            <span>04</span>
            Sectors
          </a>
          <a href="/risk">
            <span>05</span>
            Risk
          </a>
        </nav>

        <footer className="portal-footer">
          <span>Akribeia / research infrastructure</span>
          <span>Directional evidence, not investment advice</span>
        </footer>
      </main>
    </>
  );
}
