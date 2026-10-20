import { describe, expect, it } from "vitest";
// @ts-expect-error -- plain ESM script without type declarations
import { effectiveFindings } from "../../scripts/audit-findings.mjs";

const BRACES_ADVISORY = {
  source: 1,
  name: "braces",
  dependency: "braces",
  title: "braces vulnerable to stack-exhaustion denial of service",
  url: "https://github.com/advisories/GHSA-vfj7-8cjw-p6xm",
  severity: "high",
  range: "<=3.0.3",
};

// The shape npm 10 reports for the vendored workspace (CI, 2026-10-07 .. 10-20): braces high
// on both nodes, micromatch high through it, vinext high through micromatch + its own moderate.
function npm10Report(overrides: { bracesNodes?: string[]; advisoryUrl?: string } = {}) {
  return {
    auditReportVersion: 2,
    vulnerabilities: {
      braces: {
        name: "braces",
        severity: "high",
        via: [{ ...BRACES_ADVISORY, url: overrides.advisoryUrl ?? BRACES_ADVISORY.url }],
        nodes: overrides.bracesNodes ?? ["node_modules/braces", "vendor/braces"],
      },
      micromatch: { name: "micromatch", severity: "high", via: ["braces"], nodes: [] },
      vinext: {
        name: "vinext",
        severity: "high",
        via: [
          "micromatch",
          { source: 2, name: "vinext", url: "https://example.test/moderate", severity: "moderate" },
        ],
        nodes: [],
      },
    },
    metadata: { vulnerabilities: { high: 3, critical: 0, moderate: 0 } },
  };
}

describe("security-audit effective findings", () => {
  it("discounts the vendored braces advisory and recomputes its dependents", () => {
    const findings = effectiveFindings(npm10Report());

    expect(findings.high).toBe(0);
    expect(findings.critical).toBe(0);
    expect(findings.discounted).toEqual([
      { name: "braces", reportedSeverity: "high", severity: null },
      { name: "micromatch", reportedSeverity: "high", severity: null },
      // vinext keeps its own moderate advisory: only the braces path is discounted.
      { name: "vinext", reportedSeverity: "high", severity: "moderate" },
    ]);
  });

  it("counts a different advisory on braces", () => {
    const findings = effectiveFindings(
      npm10Report({ advisoryUrl: "https://github.com/advisories/GHSA-zzzz-zzzz-zzzz" }),
    );

    expect(findings.high).toBe(3);
    expect(findings.discounted).toEqual([]);
  });

  it("counts braces when any node is not the vendored workspace", () => {
    const findings = effectiveFindings(
      npm10Report({
        bracesNodes: ["node_modules/braces", "vendor/braces", "node_modules/x/node_modules/braces"],
      }),
    );

    expect(findings.high).toBe(3);
  });

  it("is a no-op for npm 11's report, which omits the workspace", () => {
    expect(effectiveFindings({ auditReportVersion: 2, vulnerabilities: {} })).toEqual({
      entries: [],
      critical: 0,
      high: 0,
      discounted: [],
    });
  });
});
