import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const artifact = JSON.parse(
  readFileSync(
    new URL("../../apps/dashboard/public/data/etf-holdings-canonical.json", import.meta.url),
    "utf8",
  ),
) as {
  coverage: { canonicalEquities: number; equitiesCovered: number; equitiesUncovered: number };
  funds: Array<{ ticker: string }>;
  rows: Array<{ etfTicker: string; constituentTicker: string }>;
};

describe("canonical dashboard ETF coverage", () => {
  it("covers the exact canonical equity artifact and never retains directory-only ETFs", () => {
    expect(artifact.coverage.canonicalEquities).toBe(1291);
    expect(artifact.coverage.equitiesCovered + artifact.coverage.equitiesUncovered).toBe(1291);
    expect(artifact.funds.length).toBeGreaterThan(250);
    expect(new Set(artifact.rows.map((row) => row.etfTicker)).size).toBe(artifact.funds.length);
    expect(artifact.funds.map((fund) => fund.ticker)).toEqual(
      expect.arrayContaining(["SPY", "IVV", "VOO"]),
    );
  });

  it("contains no unknown constituents in the canonical projection", () => {
    const canonical = JSON.parse(
      readFileSync(
        new URL("../../data/reference/v2-baseline/fixtures/universe_floor0.json", import.meta.url),
        "utf8",
      ),
    );
    const tickers = new Set(
      canonical.rows
        .filter((row: { sector: string }) => row.sector !== "ETF")
        .map((row: { ticker: string }) => row.ticker),
    );
    expect(artifact.rows.every((row) => tickers.has(row.constituentTicker))).toBe(true);
  });
});
