/* global console, process */
// Decides whether new advisories fail the dependency audit (owner decision 2026-11-03).
//
// From 2026-10-24 to 2026-11-02 a new zod advisory failed the audit on every point-in-time
// refresh, so no data reached production -- while production kept serving the same code, with
// the same zod, just with stale data. Blocking a change that leaves the dependency tree alone
// buys no security. So a change that touches no dependency file runs the audit in `report`
// mode: advisories become warnings (the daily dependency-audit workflow alerts on them), and
// every other check in scripts/security-audit.mjs still fails closed. Anything that changes
// dependencies, or the gate itself, stays `enforce`.
//
// Inputs (environment):
//   AUDIT_SCOPE_ELIGIBLE  "true" only where the caller allows report mode at all
//   AUDIT_SCOPE_BASE      the commit the change is measured from
//   AUDIT_SCOPE_HEAD      the commit under test; omitted = the working tree, untracked included
// Prints `enforce` or `report` on stdout and the reason on stderr. Anything it cannot
// establish -- not eligible, no base, an unknown commit -- is `enforce`.
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";

// Dependency files anywhere in the tree (every workspace has its own package.json), the
// vendored braces workspace, and the audit gate's own scripts.
const DEPENDENCY_FILE = /(^|\/)(package\.json|package-lock\.json|npm-shrinkwrap\.json|\.npmrc)$/;
const GATE_PATHS = [
  /^vendor\//,
  /^scripts\/security-audit\.mjs$/,
  /^scripts\/audit-findings\.mjs$/,
  /^scripts\/audit-scope\.mjs$/,
];

export const touchesDependencies = (path) =>
  DEPENDENCY_FILE.test(path) || GATE_PATHS.some((pattern) => pattern.test(path));

const git = (...args) =>
  execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] })
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

export function changedPaths(base, head) {
  if (head) return git("diff", "--name-only", `${base}...${head}`);
  return [
    ...git("diff", "--name-only", base),
    ...git("ls-files", "--others", "--exclude-standard"),
  ];
}

export function auditScope({ eligible, base, head }, listChanged = changedPaths) {
  if (eligible !== "true") return { mode: "enforce", reason: "report mode is not allowed here" };
  if (!base || /^0+$/.test(base))
    return { mode: "enforce", reason: "no base commit to measure the change from" };
  let paths;
  try {
    paths = listChanged(base, head);
  } catch (error) {
    return { mode: "enforce", reason: `cannot diff from ${base}: ${error.message.split("\n")[0]}` };
  }
  const dependencyPaths = paths.filter(touchesDependencies);
  if (dependencyPaths.length > 0)
    return {
      mode: "enforce",
      reason: `dependency files changed: ${dependencyPaths.slice(0, 10).join(", ")}`,
    };
  return {
    mode: "report",
    reason: `${paths.length} changed path(s) since ${base.slice(0, 12)}, none of them a dependency file`,
  };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const { mode, reason } = auditScope({
    eligible: process.env.AUDIT_SCOPE_ELIGIBLE,
    base: process.env.AUDIT_SCOPE_BASE,
    head: process.env.AUDIT_SCOPE_HEAD || undefined,
  });
  console.error(`audit scope: ${mode} (${reason})`);
  console.log(mode);
}
