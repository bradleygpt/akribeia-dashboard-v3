import { describe, expect, it } from "vitest";
import {
  PORTFOLIO_WEIGHT_SCALE,
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
    expect(byId.A).toBe(0.5);
    expect(byId.B).toBe(0.333_333_333);
    expect(byId.C).toBe(0.166_666_667);
    expect(result.reduce((sum, x) => sum + x.weight, 0)).toBe(1);
    expect(result.reduce((sum, x) => sum + x.weightUnits, 0)).toBe(PORTFOLIO_WEIGHT_SCALE);
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
      expect(first.totalWeight).toBe(1);
      expect(first.totalWeightUnits).toBe(PORTFOLIO_WEIGHT_SCALE);
      expect(first.positions.reduce((sum, position) => sum + position.weightUnits, 0)).toBe(
        PORTFOLIO_WEIGHT_SCALE,
      );
      expect(
        Math.max(...first.positions.map((position) => position.weightUnits)),
      ).toBeLessThanOrEqual(120_000_000);
      expect(Math.max(...Object.values(first.sectorWeightUnits))).toBeLessThanOrEqual(300_000_000);
      expect(first.construction.method).toBe("ranked-greedy-integer-units-v1");
      expect(first.construction.bindingSectors).toEqual(["Energy", "Healthcare", "Technology"]);
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
      expect(result.maximumFeasibleWeightUnits).toBe(300_000_000);
      expect(result.infeasibility).toMatchObject({
        code: "insufficient-capped-capacity",
        requiredWeightUnits: PORTFOLIO_WEIGHT_SCALE,
        maximumFeasibleWeightUnits: 300_000_000,
        shortfallWeightUnits: 700_000_000,
      });
      expect(result.infeasibility.sectorCapacities).toEqual([
        {
          sector: "Technology",
          candidateCapacity: 0.6,
          candidateCapacityUnits: 600_000_000,
          cappedCapacity: 0.3,
          cappedCapacityUnits: 300_000_000,
        },
      ]);
    }
  });

  it("honors candidate-specific caps and reports which exact caps bind", () => {
    const result = constructRankedCappedPortfolio(
      candidates.map((candidate) =>
        candidate.id === "A" ? { ...candidate, maxWeight: 0.05 } : candidate,
      ),
      {
        maxPositionWeight: 0.12,
        maxSectorWeight: 0.3,
      },
    );

    expect(result.status).toBe("constructed");

    if (result.status === "constructed") {
      const position = result.positions.find(({ id }) => id === "A");

      expect(position).toMatchObject({
        weight: 0.05,
        weightUnits: 50_000_000,
        maxWeight: 0.05,
        maxWeightUnits: 50_000_000,
      });
      expect(result.construction.bindingPositionIds).toContain("A");
    }
  });

  it("is permutation-stable across deterministic generated candidate sets", () => {
    for (let seed = 1; seed <= 50; seed += 1) {
      let state = seed;
      const generated = Array.from({ length: 16 }, (_, index) => {
        state = (state * 1_664_525 + 1_013_904_223) >>> 0;

        return {
          id: `S${String(index).padStart(2, "0")}`,
          sector: `Sector-${index % 4}`,
          score: state / 0xffff_ffff,
        };
      });
      const rotated = [
        ...generated.slice(seed % generated.length),
        ...generated.slice(0, seed % generated.length),
      ];
      const constraints = {
        maxPositionWeight: 0.2,
        maxSectorWeight: 0.45,
      };
      const first = constructRankedCappedPortfolio(generated, constraints);
      const second = constructRankedCappedPortfolio(rotated, constraints);

      expect(first).toEqual(second);
      expect(first.status).toBe("constructed");

      if (first.status === "constructed") {
        expect(first.positions.reduce((sum, position) => sum + position.weightUnits, 0)).toBe(
          PORTFOLIO_WEIGHT_SCALE,
        );
        expect(
          Math.max(...first.positions.map((position) => position.weightUnits)),
        ).toBeLessThanOrEqual(200_000_000);
        expect(Math.max(...Object.values(first.sectorWeightUnits))).toBeLessThanOrEqual(
          450_000_000,
        );
      }
    }
  });

  it("rejects noncanonical identifiers and caps beyond the exact unit precision", () => {
    expect(() =>
      constructRankedCappedPortfolio([{ id: " A", sector: "Technology", score: 1 }], {
        maxPositionWeight: 0.2,
        maxSectorWeight: 0.5,
      }),
    ).toThrow("contain no surrounding whitespace");
    expect(() =>
      constructRankedCappedPortfolio(candidates, {
        maxPositionWeight: 0.123_456_789_1,
        maxSectorWeight: 0.5,
      }),
    ).toThrow("representable to nine decimal places");
  });
});
