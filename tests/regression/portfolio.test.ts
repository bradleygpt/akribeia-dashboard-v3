import { describe, expect, it } from "vitest";
import {
  constructRankedCappedPortfolio,
  projectToCappedSimplex,
} from "../../packages/portfolio/src/index.js";

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

describe("constructRankedCappedPortfolio", () => {
  const candidates = [
    { id: "A", sector: "Technology", score: 10 },
    { id: "B", sector: "Technology", score: 9 },
    { id: "C", sector: "Technology", score: 8 },
    { id: "D", sector: "Healthcare", score: 7 },
    { id: "E", sector: "Healthcare", score: 6 },
    { id: "F", sector: "Healthcare", score: 5 },
    { id: "G", sector: "Energy", score: 4 },
    { id: "H", sector: "Energy", score: 3 },
    { id: "I", sector: "Energy", score: 2 },
    { id: "J", sector: "Industrials", score: 1 },
  ];

  it("enforces exact position and sector caps deterministically", () => {
    const first = constructRankedCappedPortfolio(candidates, {
      maxPositionWeight: 0.12,
      maxSectorWeight: 0.3,
    });
    const second = constructRankedCappedPortfolio([...candidates].reverse(), {
      maxPositionWeight: 0.12,
      maxSectorWeight: 0.3,
    });

    expect(first).toEqual(second);
    expect(first.status).toBe("constructed");

    if (first.status === "constructed") {
      expect(first.totalWeight).toBeCloseTo(1, 12);
      expect(Math.max(...first.positions.map((position) => position.weight))).toBeLessThanOrEqual(
        0.12,
      );
      expect(Math.max(...Object.values(first.sectorWeights))).toBeLessThanOrEqual(0.3);
      expect(first.positions.map((position) => position.id)).toEqual([
        "A",
        "B",
        "C",
        "D",
        "E",
        "F",
        "G",
        "H",
        "I",
        "J",
      ]);
    }
  });

  it("reports infeasibility instead of returning a partial portfolio", () => {
    const result = constructRankedCappedPortfolio(candidates.slice(0, 3), {
      maxPositionWeight: 0.2,
      maxSectorWeight: 0.3,
    });

    expect(result.status).toBe("infeasible");

    if (result.status === "infeasible") {
      expect(result.maximumFeasibleWeight).toBeCloseTo(0.3, 12);
      expect(result.reasons[0]).toContain("1.000000 is required");
    }
  });
});
