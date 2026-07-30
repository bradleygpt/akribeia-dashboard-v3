import { describe, expect, it } from "vitest";
import {
  calculateComposite,
  calculateCoverageAwareComposite,
} from "../../packages/scoring/src/index.js";

const weights = { valuation: 20, growth: 20, profitability: 20, momentum: 20, revisions: 20 };

describe("calculateComposite", () => {
  it("normalizes weights and reports full coverage", () => {
    const result = calculateComposite(
      { valuation: 10, growth: 8, profitability: 6, momentum: 4, revisions: 2 },
      weights,
    );
    expect(result.score).toBe(6);
    expect(result.coverage).toBe(1);
  });

  it("does not treat missing values as zero", () => {
    const result = calculateComposite(
      { valuation: 10, growth: null, profitability: 6, momentum: 4, revisions: 2 },
      weights,
    );
    expect(result.score).toBe(5.5);
    expect(result.coverage).toBe(0.8);
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
      normalization: "not-scored",
      missingDataPolicy: "require-complete",
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
  });
});
