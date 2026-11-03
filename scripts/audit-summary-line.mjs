/* global console, process */
// One line for the refresh PR body from scripts/security-audit.mjs's output (its last stdout
// line is the JSON result): which advisory mode ran, and any advisory report mode let through.
//
// Usage: node scripts/audit-summary-line.mjs <security-audit stdout file>
import { readFileSync } from "node:fs";

const result = JSON.parse(readFileSync(process.argv[2], "utf8").trim().split("\n").at(-1));
console.log(
  result.advisories.length === 0
    ? `dependency audit passed at high severity (${result.advisoryMode} mode)`
    : `dependency audit ran in report mode (no dependency file changed) and reported ${result.advisories.length} advisory finding(s), not blocking: ${result.advisories.join("; ")}`,
);
