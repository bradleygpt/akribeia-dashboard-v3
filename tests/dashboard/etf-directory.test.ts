import { describe, expect, it } from "vitest";
import {
  buildEtfDirectory,
  formatEtfPercent,
  formatUsdMagnitude,
} from "../../apps/dashboard/app/etfs/etf-directory";
import { loadResearchUniverse } from "../../apps/dashboard/app/research-data";

describe("expanded pinned ETF directory", () => {
  it("joins reference-only ETFs without inventing stock-model records", () => {
    const spy = loadResearchUniverse().rows.find(({ ticker }) => ticker === "SPY")!;
    const directory = buildEtfDirectory(
      [spy],
      {
        SPY: { shortName: "SPDR S&P 500 ETF", totalAssets: 781_188_857_856 },
        QQQM: { shortName: "Invesco NASDAQ 100 ETF", totalAssets: 55_000_000_000 },
      },
      {
        QQQM: { asset_class: "large_growth", aum: 55_000_000_000 },
      },
      { QQQM: "Reference-only ETF description" },
    );

    expect(directory.map(({ ticker }) => ticker)).toEqual(["QQQM", "SPY"]);
    expect(directory[0]).toMatchObject({
      ticker: "QQQM",
      name: "Invesco NASDAQ 100 ETF",
      description: "Reference-only ETF description",
      local: null,
    });
    expect(directory[1]?.local?.ticker).toBe("SPY");
  });

  it("formats dollar-denominated ETF assets by their actual magnitude", () => {
    expect(formatUsdMagnitude(781_188_857_856)).toBe("$781.2B");
    expect(formatUsdMagnitude(1_250_000_000_000)).toBe("$1.25T");
    expect(formatUsdMagnitude(null)).toBe("Unavailable");
  });

  it("keeps ratio and percentage-point ETF return fields in their documented units", () => {
    expect(formatEtfPercent(0.1812, "ratio")).toBe("+18.1%");
    expect(formatEtfPercent(10.16428, "percentage-points")).toBe("+10.2%");
    expect(formatEtfPercent(null, "ratio")).toBe("Unavailable");
  });
});
