import { describe, expect, it } from "vitest";
// @ts-expect-error -- plain .mjs script, no declaration file
import { auditScope, touchesDependencies } from "../../scripts/audit-scope.mjs";

// Report mode (owner decision 2026-11-03) is for a change that leaves the dependency tree
// alone; anything the scope check cannot establish stays enforce.
const listing = (paths: string[]) => () => paths;
const REFRESH_PATHS = [
  "data/observations/current/provenance.json",
  "data/evidence/daily/2026-11-03/preview-20261103-pipeline-v6-eaf809959854/evidence.json",
  "apps/dashboard/app/generated/active-daily-evidence.json",
  "apps/dashboard/worker/v2-reference.ts",
];

describe("dependency audit scope", () => {
  it("lets a change with no dependency file report advisories", () => {
    expect(auditScope({ eligible: "true", base: "abc123" }, listing(REFRESH_PATHS)).mode).toBe(
      "report",
    );
  });

  it("enforces when any package.json, lockfile, .npmrc, vendored package or gate script changes", () => {
    for (const path of [
      "package.json",
      "package-lock.json",
      "packages/contracts/package.json",
      "apps/dashboard/package.json",
      ".npmrc",
      "vendor/braces/lib/parse.js",
      "scripts/security-audit.mjs",
      "scripts/audit-findings.mjs",
      "scripts/audit-scope.mjs",
    ]) {
      expect(touchesDependencies(path)).toBe(true);
      expect(
        auditScope({ eligible: "true", base: "abc123" }, listing([...REFRESH_PATHS, path])).mode,
      ).toBe("enforce");
    }
    expect(touchesDependencies("docs/package.json.md")).toBe(false);
  });

  it("enforces wherever report mode is not allowed, or the base is unknown", () => {
    const never = () => {
      throw new Error("must not diff");
    };
    expect(auditScope({ eligible: undefined, base: "abc123" }, never).mode).toBe("enforce");
    expect(auditScope({ eligible: "false", base: "abc123" }, never).mode).toBe("enforce");
    expect(auditScope({ eligible: "true", base: "" }, never).mode).toBe("enforce");
    expect(auditScope({ eligible: "true", base: "0".repeat(40) }, never).mode).toBe("enforce");
    const unknown = auditScope({ eligible: "true", base: "deadbeef" }, () => {
      throw new Error("fatal: bad revision 'deadbeef'");
    });
    expect(unknown).toEqual({
      mode: "enforce",
      reason: "cannot diff from deadbeef: fatal: bad revision 'deadbeef'",
    });
  });
});
