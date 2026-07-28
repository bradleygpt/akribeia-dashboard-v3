import { describe, expect, it } from "vitest";
import { calculateComposite } from "../../packages/scoring/src/index.js";

const weights = { valuation: 20, growth: 20, profitability: 20, momentum: 20, revisions: 20 };

describe("calculateComposite", () => {
  it("normalizes weights and reports full coverage", () => {
    const result = calculateComposite({ valuation: 10, growth: 8, profitability: 6, momentum: 4, revisions: 2 }, weights);
    expect(result.score).toBe(6);
    expect(result.coverage).toBe(1);
  });

  it("does not treat missing values as zero", () => {
    const result = calculateComposite({ valuation: 10, growth: null, profitability: 6, momentum: 4, revisions: 2 }, weights);
    expect(result.score).toBe(5.5);
    expect(result.coverage).toBe(0.8);
  });
});
