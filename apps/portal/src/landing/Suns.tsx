const SUNS = [
  {
    className: "portal-sun-market",
    href: "/dashboard",
    eyebrow: "System 01",
    name: "Market Health",
    detail: "Macro, breadth, liquidity",
  },
  {
    className: "portal-sun-research",
    href: "/research",
    eyebrow: "System 02",
    name: "Research",
    detail: "Scores, factors, securities",
  },
  {
    className: "portal-sun-risk",
    href: "/risk",
    eyebrow: "System 03",
    name: "Risk",
    detail: "Consensus and disagreement",
  },
] as const;

export function Suns() {
  return (
    <div className="portal-suns">
      {SUNS.map((sun) => (
        <a
          className={`portal-sun ${sun.className}`}
          data-portal-sun="true"
          href={sun.href}
          key={sun.href}
        >
          <span className="portal-sun-core" aria-hidden="true" />
          <span className="portal-sun-copy">
            <small>{sun.eyebrow}</small>
            <strong>{sun.name}</strong>
            <em>{sun.detail}</em>
          </span>
        </a>
      ))}
    </div>
  );
}
