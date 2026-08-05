const PLANETS = [
  {
    className: "portal-planet-etfs",
    href: "/etfs",
    label: "ETF intelligence",
    shortLabel: "ETFs",
  },
  {
    className: "portal-planet-sectors",
    href: "/sectors",
    label: "Sector analytics",
    shortLabel: "Sectors",
  },
] as const;

export function Planets() {
  return (
    <div className="portal-planets">
      {PLANETS.map((planet) => (
        <a
          aria-label={planet.label}
          className={`portal-planet ${planet.className}`}
          href={planet.href}
          key={planet.href}
        >
          <span aria-hidden="true" />
          <strong>{planet.shortLabel}</strong>
        </a>
      ))}
    </div>
  );
}
