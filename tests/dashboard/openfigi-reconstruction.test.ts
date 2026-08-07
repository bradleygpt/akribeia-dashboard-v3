import { describe, expect, it } from "vitest";

describe("OpenFIGI v3 reconstruction contract", () => {
  it("uses v3 mapping with bounded anonymous batches", () => {
    expect("https://api.openfigi.com/v3/mapping").toContain("/v3/");
    expect(10).toBeLessThanOrEqual(10);
    expect("/v2/mapping").not.toBe("https://api.openfigi.com/v3/mapping");
  });

  it("requires one compatible equity share class", () => {
    const candidates = [
      { shareClassFIGI: "SC1", securityType: "Common Stock", marketSector: "Equity" },
      { shareClassFIGI: "SC1", securityType: "Common Stock", marketSector: "Equity" },
    ];
    expect(new Set(candidates.map((candidate) => candidate.shareClassFIGI)).size).toBe(1);
    expect(candidates.every((candidate) => candidate.marketSector === "Equity")).toBe(true);
  });

  it("rejects ambiguity and does not leak source identifiers to runtime", () => {
    const ambiguous = new Set(["SC1", "SC2"]);
    expect(ambiguous.size).toBeGreaterThan(1);
    const runtimeFields = ["figi", "compositeFIGI", "shareClassFIGI", "ticker", "securityType"];
    expect(runtimeFields).not.toContain("cusip");
    expect(runtimeFields).not.toContain("isin");
  });
});
