import { describe, expect, it } from "vitest";
import { compareNullable, exactDateWithinRange } from "../../apps/dashboard/app/product-parity";

describe("dashboard parity sorting and generic exact-date filters", () => {
  it("sorts numbers numerically and text deterministically", () => {
    expect([10, 2, 1].toSorted((left, right) => compareNullable(left, right, "ascending"))).toEqual(
      [1, 2, 10],
    );
    expect(
      ["Zulu", "alpha", "Beta"].toSorted((left, right) =>
        compareNullable(left, right, "ascending"),
      ),
    ).toEqual(["alpha", "Beta", "Zulu"]);
  });

  it("keeps unavailable values last in both directions instead of treating them as zero", () => {
    expect(
      [null, 0, -1].toSorted((left, right) => compareNullable(left, right, "ascending")),
    ).toEqual([-1, 0, null]);
    expect(
      [null, 0, -1].toSorted((left, right) => compareNullable(left, right, "descending")),
    ).toEqual([0, -1, null]);
  });

  it("includes exact boundary dates and excludes recurring rows when a date range is active", () => {
    expect(exactDateWithinRange("2026-06-10", "2026-06-10", "2026-09-10")).toBe(true);
    expect(exactDateWithinRange("2026-09-10", "2026-06-10", "2026-09-10")).toBe(true);
    expect(exactDateWithinRange("2026-11-10", "2026-06-10", "2026-09-10")).toBe(false);
    expect(exactDateWithinRange(null, "2026-06-10", "2026-09-10")).toBe(false);
    expect(exactDateWithinRange(null, "", "")).toBe(true);
  });
});
