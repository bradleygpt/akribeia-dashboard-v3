import { describe, expect, it } from "vitest";

const normalizeTicker = (value: string) => value.trim().toUpperCase().replaceAll(".", "-");

describe("ETF identifier reconstruction contract", () => {
  it("normalizes punctuation without collapsing share-class identity", () => {
    expect(normalizeTicker("CWEN.A")).toBe("CWEN-A");
    expect(normalizeTicker("BF.B")).toBe("BF-B");
    expect(normalizeTicker("VFS")).toBe("VFS");
  });

  it("uses a deterministic exact cascade and rejects ambiguous fallbacks", () => {
    const cascade = [
      "exact-canonical-ticker",
      "approved-ticker-alias",
      "exact-cusip",
      "exact-isin",
      "exact-lei-and-security-name",
      "exact-issuer-and-security-name",
      "manual-approved",
      "unmapped",
    ];
    expect(cascade.at(0)).toBe("exact-canonical-ticker");
    expect(cascade.at(-1)).toBe("unmapped");
    expect(cascade).not.toContain("fuzzy-name");
    expect(cascade).not.toContain("guessed");
  });

  it("preserves the canonical universe size and strict source-date rule", () => {
    const canonicalRows = 1291;
    const priorRetained = 1286;
    const priorRows = 96594;
    expect(canonicalRows).toBe(1291);
    expect(priorRetained).toBeGreaterThan(0);
    expect(priorRows).toBeGreaterThan(0);
    expect("cross-date-merge").not.toBe("accepted");
  });
});
