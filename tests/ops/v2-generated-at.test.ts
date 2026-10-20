import { describe, expect, it } from "vitest";
import { parseGeneratedAt } from "../../scripts/v2-generated-at.mjs";

// meta.generated_at was the bake host's naive Eastern time read as UTC, so observations were
// recorded 4-5 h early (2026-10-20: a 14:52Z bake stamped "2026-10-20T10:52:57").
describe("V2 bake generated_at", () => {
  it("reads an explicit zone exactly", () => {
    expect(parseGeneratedAt("2026-10-20T14:52:57Z").toISOString()).toBe("2026-10-20T14:52:57.000Z");
    expect(parseGeneratedAt("2026-10-20T16:52:57+02:00").toISOString()).toBe(
      "2026-10-20T14:52:57.000Z",
    );
  });

  it("reads a zone-less stamp as the bake host's Eastern wall time", () => {
    // the 2026-10-20 bake: EDT, UTC-4
    expect(parseGeneratedAt("2026-10-20T10:52:57").toISOString()).toBe("2026-10-20T14:52:57.000Z");
    // a 22:00 winter nightly: EST, UTC-5, already the next UTC day
    expect(parseGeneratedAt("2026-01-15T22:00:00").toISOString()).toBe("2026-01-16T03:00:00.000Z");
    // either side of the 2026-03-08 spring-forward
    expect(parseGeneratedAt("2026-03-07T12:00:00").toISOString()).toBe("2026-03-07T17:00:00.000Z");
    expect(parseGeneratedAt("2026-03-09T12:00:00").toISOString()).toBe("2026-03-09T16:00:00.000Z");
    expect(parseGeneratedAt("2026-10-20T10:52").toISOString()).toBe("2026-10-20T14:52:00.000Z");
  });

  it("refuses anything else", () => {
    for (const value of ["", "yesterday", "2026-10-20", "2026-10-20T25:00:00Z", null]) {
      expect(() => parseGeneratedAt(value)).toThrow("unparseable generated_at");
    }
  });
});
