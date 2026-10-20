import { describe, expect, it } from "vitest";
import { loadResearchUniverse } from "../../apps/dashboard/app/research-data.js";
import { runMonteCarlo } from "../../apps/dashboard/app/portfolio/monte-carlo.js";
import {
  analyzePortfolio,
  holdingsToCsv,
  parseHoldingsCsv,
  parseStoredHoldings,
} from "../../apps/dashboard/app/portfolio/portfolio-contract.js";

describe("recovered V2 portfolio contract", () => {
  it("loads the unversioned qd_holdings array without overwriting corruption", () => {
    expect(parseStoredHoldings('[{"ticker":"aapl","shares":2,"cost_basis":100}]')).toEqual({
      holdings: [{ ticker: "AAPL", shares: 2, cost_basis: 100 }],
      error: null,
    });
    expect(parseStoredHoldings("not-json")).toEqual({
      holdings: [],
      error: "Saved portfolio is corrupt and was not loaded or overwritten.",
    });
  });

  it("round-trips source-compatible CSV inputs and preserves valid zero absence", () => {
    const holdings = parseHoldingsCsv(
      "Symbol,Quantity,Cost Basis Per Share\nAAPL,2,$100.50\nSPY,1,\nBAD,0,10",
    );
    expect(holdings).toEqual([
      { ticker: "AAPL", shares: 2, cost_basis: 100.5 },
      { ticker: "SPY", shares: 1, cost_basis: null },
    ]);
    expect(parseHoldingsCsv(holdingsToCsv(holdings))).toEqual(holdings);
  });

  it("reads quoted brokerage fields with commas and escaped quotes", () => {
    // Splitting on every comma read "1,000" as 1 share and dropped or shifted any row with a
    // quoted description (audit 2026-10-20, G2).
    expect(
      parseHoldingsCsv(
        [
          "Symbol,Description,Quantity,Cost Basis Per Share",
          'AAPL,"Apple, Inc.","1,000",150.25',
          'MSFT,"Microsoft ""MSFT"" Corp",12,"$1,234.50"',
        ].join("\r\n"),
      ),
    ).toEqual([
      { ticker: "AAPL", shares: 1000, cost_basis: 150.25 },
      { ticker: "MSFT", shares: 12, cost_basis: 1234.5 },
    ]);
  });

  it("treats SPY stock grades as not applicable and uses only approved as-of values", () => {
    const analysis = analyzePortfolio(
      [
        { ticker: "AAPL", shares: 2, cost_basis: 200 },
        { ticker: "SPY", shares: 1, cost_basis: null },
      ],
      loadResearchUniverse().rows,
    );
    const spy = analysis.positions.find(({ ticker }) => ticker === "SPY");
    expect(spy).toMatchObject({
      isEtf: true,
      composite: null,
      rating: "Not applicable (ETF)",
      priceSource: "as_of",
    });
    expect(analysis.weightedComposite).not.toBeNull();
  });

  it("produces deterministic seeded V2 Monte Carlo percentiles and scenario ordering", () => {
    const analysis = analyzePortfolio(
      [
        { ticker: "AAPL", shares: 2, cost_basis: 100 },
        { ticker: "SPY", shares: 1, cost_basis: null },
      ],
      loadResearchUniverse().rows,
    );
    const base = runMonteCarlo(analysis.positions, analysis.totalValue, {
      simulations: 1000,
      horizonDays: 63,
      scenario: "Base",
      seed: 42,
    });
    const repeated = runMonteCarlo(analysis.positions, analysis.totalValue, {
      simulations: 1000,
      horizonDays: 63,
      scenario: "Base",
      seed: 42,
    });
    const bull = runMonteCarlo(analysis.positions, analysis.totalValue, {
      simulations: 1000,
      horizonDays: 63,
      scenario: "Bull",
      seed: 42,
    });
    expect(base).toEqual(repeated);
    expect(base?.percentiles.p5).toBeLessThan(base?.percentiles.p50 ?? 0);
    expect(base?.percentiles.p50).toBeLessThan(base?.percentiles.p95 ?? 0);
    expect(bull?.percentiles.p50).toBeGreaterThan(base?.percentiles.p50 ?? 0);
    expect(base?.assumptions).toHaveLength(2);
  });
});
