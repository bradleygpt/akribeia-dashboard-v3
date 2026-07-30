import { describe, expect, it } from "vitest";
import { calculateCoverageAwareComposite } from "../../packages/scoring/src/index.js";

const weights = { valuation: 20, growth: 20, profitability: 20, momentum: 20, revisions: 20 };

describe("calculateCoverageAwareComposite", () => {
  it("uses fixed total-weight normalization and reports full pillar lineage", () => {
    const result = calculateCoverageAwareComposite(
      { valuation: 10, growth: 8, profitability: 6, momentum: 4, revisions: 2 },
      weights,
      {
        minimumCoverage: 1,
        missingDataPolicy: "require-complete",
      },
    );

    expect(result.score).toBe(6);
    expect(result.coverage).toBe(1);
    expect(result.normalization).toBe("total-weight");
    expect(result.exclusionReasons).toEqual([]);
    expect(result.contributions).toEqual([
      {
        pillar: "valuation",
        value: 10,
        weight: 20,
        weightedValue: 200,
        status: "available",
      },
      {
        pillar: "growth",
        value: 8,
        weight: 20,
        weightedValue: 160,
        status: "available",
      },
      {
        pillar: "profitability",
        value: 6,
        weight: 20,
        weightedValue: 120,
        status: "available",
      },
      {
        pillar: "momentum",
        value: 4,
        weight: 20,
        weightedValue: 80,
        status: "available",
      },
      {
        pillar: "revisions",
        value: 2,
        weight: 20,
        weightedValue: 40,
        status: "available",
      },
    ]);
  });

  it("fails closed when strict coverage is incomplete", () => {
    const result = calculateCoverageAwareComposite(
      { valuation: 10, growth: null, profitability: 6, momentum: 4, revisions: 2 },
      weights,
      {
        minimumCoverage: 1,
        missingDataPolicy: "require-complete",
      },
    );

    expect(result).toMatchObject({
      score: null,
      coverage: 0.8,
      eligible: false,
      missingPillars: ["growth"],
      exclusionReasons: ["below-minimum-coverage", "missing-required-pillar"],
      normalization: "not-scored",
      missingDataPolicy: "require-complete",
    });
    expect(result.contributions[1]).toEqual({
      pillar: "growth",
      value: null,
      weight: 20,
      weightedValue: null,
      status: "missing",
    });
  });

  it("labels an explicitly requested available-weight renormalization", () => {
    const result = calculateCoverageAwareComposite(
      { valuation: 10, growth: null, profitability: 6, momentum: 4, revisions: 2 },
      weights,
      {
        minimumCoverage: 0.8,
        missingDataPolicy: "renormalize-explicitly",
      },
    );

    expect(result.score).toBe(5.5);
    expect(result.eligible).toBe(true);
    expect(result.normalization).toBe("available-weight");
    expect(result.missingPillars).toEqual(["growth"]);
    expect(result.exclusionReasons).toEqual([]);
  });

  it("is deterministic and rejects invalid weights instead of silently changing them", () => {
    const values = {
      valuation: 10,
      growth: 8,
      profitability: 6,
      momentum: 4,
      revisions: 2,
    };
    const options = {
      minimumCoverage: 1,
      missingDataPolicy: "require-complete",
    } as const;

    expect(calculateCoverageAwareComposite(values, weights, options)).toEqual(
      calculateCoverageAwareComposite(values, weights, options),
    );
    expect(() =>
      calculateCoverageAwareComposite(values, { ...weights, momentum: -1 }, options),
    ).toThrow('Weight for "momentum" must be a finite nonnegative number.');
  });
});
