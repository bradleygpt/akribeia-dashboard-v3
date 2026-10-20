// Effective audit severity, extracted from security-audit.mjs so it can be unit-tested
// (audit 2026-10-20, G10). See security-audit.mjs for why the vendored braces finding is
// discounted -- and note it is only valid AFTER that script's guard has proven the patch.

const VENDORED_BRACES_ADVISORY = "GHSA-vfj7-8cjw-p6xm";
const VENDORED_BRACES_NODES = new Set(["node_modules/braces", "vendor/braces"]);
const SEVERITY_RANK = { info: 0, low: 1, moderate: 2, high: 3, critical: 4 };
function isVendoredBracesFinding(entry, item) {
  return (
    entry.name === "braces" &&
    typeof item.url === "string" &&
    item.url.endsWith(`/${VENDORED_BRACES_ADVISORY}`) &&
    (entry.nodes ?? []).every((node) => VENDORED_BRACES_NODES.has(node))
  );
}
export function effectiveFindings(report) {
  const vulnerabilities = report.vulnerabilities ?? {};
  const memo = new Map();
  const severityOf = (name, visiting) => {
    if (memo.has(name)) return memo.get(name);
    const entry = vulnerabilities[name];
    if (!entry || visiting.has(name)) return null;
    visiting.add(name);
    let severity = null;
    for (const item of entry.via ?? []) {
      const itemSeverity =
        typeof item === "string"
          ? severityOf(item, visiting)
          : isVendoredBracesFinding(entry, item)
            ? null
            : item.severity;
      if (
        itemSeverity &&
        (severity === null || SEVERITY_RANK[itemSeverity] > SEVERITY_RANK[severity])
      )
        severity = itemSeverity;
    }
    visiting.delete(name);
    memo.set(name, severity);
    return severity;
  };
  const entries = Object.values(vulnerabilities).map((entry) => ({
    ...entry,
    severity: severityOf(entry.name, new Set()),
    reportedSeverity: entry.severity,
  }));
  const count = (severity) => entries.filter((entry) => entry.severity === severity).length;
  return {
    entries,
    critical: count("critical"),
    high: count("high"),
    discounted: entries
      .filter((entry) => entry.severity !== entry.reportedSeverity)
      .map(({ name, reportedSeverity, severity }) => ({ name, reportedSeverity, severity })),
  };
}
