export function RouteLoading({
  title = "Loading Akribeia intelligence",
  detail = "Verifying sources, assembling the research surface and preserving the active evidence boundary.",
}: {
  title?: string;
  detail?: string;
}) {
  return (
    <div
      className="akribeia-route-loading"
      role="status"
      aria-live="polite"
      aria-busy="true"
      data-route-loading="active"
    >
      <header className="akribeia-route-loading__header">
        <span className="akribeia-route-loading__mark" aria-hidden="true">
          A
        </span>
        <div>
          <strong>Akribeia</strong>
          <small>Quantitative research</small>
        </div>
      </header>

      <div className="akribeia-route-loading__hero">
        <p>RESEARCH SYSTEM / LIVE ASSEMBLY</p>
        <div className="akribeia-route-loading__title" role="heading" aria-level={1}>
          {title}
        </div>
        <span>{detail}</span>
      </div>

      <div className="akribeia-route-loading__progress" aria-hidden="true">
        <i />
      </div>

      <div className="akribeia-route-loading__grid" aria-hidden="true">
        {Array.from({ length: 6 }, (_, index) => (
          <article key={index}>
            <span />
            <strong />
            <i />
            <i />
          </article>
        ))}
      </div>
    </div>
  );
}
