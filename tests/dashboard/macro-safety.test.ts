import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const repositoryRoot = join(import.meta.dirname, "..", "..");
const workbenchSource = readFileSync(
  join(repositoryRoot, "apps", "dashboard", "app", "macro", "macro-workbench.tsx"),
  "utf8",
);
const pageSource = readFileSync(
  join(repositoryRoot, "apps", "dashboard", "app", "macro", "page.tsx"),
  "utf8",
);
const marketHealthPanelSource = readFileSync(
  join(repositoryRoot, "apps", "dashboard", "app", "market-health-panel.tsx"),
  "utf8",
);

describe("macro contract safety", () => {
  it("renders an explicit unavailable state with no heuristic fallback", () => {
    expect(workbenchSource).toMatch(
      /Market-implied FOMC probabilities unavailable: no permitted free official source is\s+configured\./,
    );
    expect(workbenchSource).not.toContain("licensed source");
    expect(pageSource).not.toContain("licensed source");
    expect(marketHealthPanelSource).not.toContain("licensed source");
    expect(workbenchSource).toContain("No heuristic, inferred value or stale pinned meeting date");
    expect(workbenchSource).not.toMatch(/cut_probability|hold_probability|hike_probability/);
    expect(workbenchSource).not.toMatch(/\b35\b|\b55\b|\b10\b/);
    expect(marketHealthPanelSource).not.toMatch(
      /cut_probability|hold_probability|hike_probability/,
    );
  });

  it("does not render conflicting pinned FOMC dates as authoritative", () => {
    const userVisibleSources = `${pageSource}\n${workbenchSource}\n${marketHealthPanelSource}`;
    expect(userVisibleSources).not.toMatch(/2026-05-06|2026-06-18|2026-09-17|2026-11-05/);
    expect(userVisibleSources).not.toContain("Pinned V2 FOMC meeting schedule");
    expect(workbenchSource).toContain(
      "Exact event instances are unavailable. No date, time, timezone or recurrence is inferred.",
    );
    expect(userVisibleSources).not.toMatch(/35\s*\/\s*55\s*\/\s*10/);
  });

  it("attempts no market-health or external macro request from the Macro route", () => {
    const fetchTargets = [...workbenchSource.matchAll(/fetch\((?:\s*)["']([^"']+)["']/g)].map(
      (match) => match[1],
    );
    expect(fetchTargets).toEqual(["/api/v3/research-reference?dataset=macro-forecasts"]);
    expect(workbenchSource).not.toMatch(/cme|ism|bls|fedwatch|https?:\/\//i);
  });

  it("keeps the approved forecast consensus visibly distinct from the blocked contract", () => {
    expect(pageSource).toMatch(/approved institutional forecast\s+consensus remains\s+separate/i);
    expect(workbenchSource).toContain("Macro forecast consensus");
    expect(workbenchSource).toContain("Contract pending");
  });
});
