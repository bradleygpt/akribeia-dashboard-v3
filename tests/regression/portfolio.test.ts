import { describe, expect, it } from "vitest";
import { projectToCappedSimplex } from "../../packages/portfolio/src/index.js";

describe("projectToCappedSimplex", () => {
  it("does not violate caps after redistribution", () => {
    const result = projectToCappedSimplex([
      { id: "A", rawWeight: 0.7, maxWeight: 0.5 },
      { id: "B", rawWeight: 0.2, maxWeight: 0.5 },
      { id: "C", rawWeight: 0.1, maxWeight: 0.5 },
    ]);
    const byId = Object.fromEntries(result.map((x) => [x.id, x.weight]));
    expect(byId.A).toBeCloseTo(0.5, 10);
    expect(byId.B).toBeCloseTo(1 / 3, 10);
    expect(byId.C).toBeCloseTo(1 / 6, 10);
    expect(result.reduce((sum, x) => sum + x.weight, 0)).toBeCloseTo(1, 10);
    expect(Math.max(...result.map((x) => x.weight))).toBeLessThanOrEqual(0.5 + 1e-12);
  });
});
