import { describe, expect, it } from "vitest";
// @ts-expect-error -- plain ESM script without type declarations
import { freshnessVerdict } from "../../scripts/data-freshness.node.mjs";

const DAY = 86_400_000;
const recipe = {
  buildId: "preview-20261020-pipeline-v5-example",
  observedAt: "2026-10-20T10:52:57Z",
  dataAsOf: "2026-10-17T00:00:00Z",
  maxAgeSeconds: 604_800,
};

describe("data-freshness dead-man", () => {
  it("ages the files' data date, not the observation run", () => {
    const verdict = freshnessVerdict(recipe, new Date(Date.parse(recipe.dataAsOf) + 6 * DAY));

    expect(verdict.stale).toBe(false);
    expect(verdict.ageSeconds).toBe(6 * 86_400);
    expect(verdict.message).toContain("data as of 2026-10-17 (files' data date) is 6.0 days old");
  });

  it("fires once the data is past the window even though the run is recent", () => {
    const verdict = freshnessVerdict(
      recipe,
      new Date(Date.parse(recipe.dataAsOf) + 7 * DAY + 1000),
    );

    expect(verdict.stale).toBe(true);
    expect(verdict.message).toMatch(/STALE\.$/);
  });

  it("falls back to the observation date for builds that predate dataAsOf", () => {
    const { dataAsOf: _unused, ...legacy } = recipe;
    void _unused;
    const verdict = freshnessVerdict(legacy, new Date(Date.parse(legacy.observedAt) + 8 * DAY));

    expect(verdict.stale).toBe(true);
    expect(verdict.message).toContain("(observation date)");
  });

  it("treats an unparseable date as stale rather than fresh", () => {
    expect(freshnessVerdict({ ...recipe, dataAsOf: "not-a-date" }).stale).toBe(true);
  });
});
