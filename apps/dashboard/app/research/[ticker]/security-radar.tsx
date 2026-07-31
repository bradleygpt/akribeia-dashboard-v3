import { normalizeRadarAxes, RADAR_MAXIMUM } from "../../research-risk";

const PILLARS = ["Valuation", "Growth", "Profitability", "Momentum", "EPS Revisions"];
const CENTER = 150;
const RADIUS = 105;

function point(index: number, ratio: number): [number, number] {
  const angle = -Math.PI / 2 + (index * Math.PI * 2) / PILLARS.length;
  return [CENTER + Math.cos(angle) * RADIUS * ratio, CENTER + Math.sin(angle) * RADIUS * ratio];
}

export function SecurityRadar({
  pillars,
  grades,
}: {
  pillars: Readonly<Record<string, number | null>>;
  grades: Readonly<Record<string, string>>;
}) {
  const axes = normalizeRadarAxes(PILLARS, pillars);
  const complete = axes.every(({ normalized }) => normalized !== null);
  const rings = [0.25, 0.5, 0.75, 1];
  const polygon = complete
    ? axes.map(({ normalized }, index) => point(index, normalized ?? 0).join(",")).join(" ")
    : "";

  return (
    <section className="security-radar" aria-labelledby="security-radar-heading">
      <div className="security-section-heading">
        <div>
          <p className="mono-label">NORMALIZED ANALYTICAL RADAR</p>
          <h2 id="security-radar-heading">Five-pillar balance</h2>
        </div>
        <p>0–12 sector-relative scale · higher is better on every already-normalized axis.</p>
      </div>
      <div className="security-radar-layout">
        <figure>
          <svg
            viewBox="0 0 300 300"
            role="img"
            aria-labelledby="security-radar-title security-radar-description"
          >
            <title id="security-radar-title">Five-pillar research radar</title>
            <desc id="security-radar-description">
              {complete
                ? axes.map(({ name, value }) => `${name} ${value?.toFixed(2)} of 12`).join("; ")
                : "Radar geometry withheld because one or more pillar scores are unavailable."}
            </desc>
            {rings.map((ring) => (
              <polygon
                key={ring}
                points={axes.map((_, index) => point(index, ring).join(",")).join(" ")}
                className="security-radar-ring"
              />
            ))}
            {axes.map((axis, index) => {
              const [x, y] = point(index, 1);
              const [labelX, labelY] = point(index, 1.18);
              return (
                <g key={axis.name}>
                  <line x1={CENTER} y1={CENTER} x2={x} y2={y} />
                  <text x={labelX} y={labelY} textAnchor="middle">
                    {axis.name === "EPS Revisions" ? "EPS Rev." : axis.name}
                  </text>
                </g>
              );
            })}
            {complete ? <polygon points={polygon} className="security-radar-value" /> : null}
          </svg>
          {!complete ? (
            <figcaption>
              Incomplete pillar record — potentially misleading geometry withheld.
            </figcaption>
          ) : null}
        </figure>
        <table>
          <caption>Accessible radar values</caption>
          <thead>
            <tr>
              <th scope="col">Axis</th>
              <th scope="col">Score</th>
              <th scope="col">Grade</th>
              <th scope="col">Direction</th>
            </tr>
          </thead>
          <tbody>
            {axes.map(({ name, value }) => (
              <tr key={name}>
                <th scope="row">{name}</th>
                <td>{value === null ? "Unavailable" : `${value.toFixed(2)} / ${RADAR_MAXIMUM}`}</td>
                <td>{grades[name] ?? "—"}</td>
                <td>Higher is better</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
