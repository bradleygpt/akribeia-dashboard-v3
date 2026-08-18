/* global URL, console */
import { readFile } from "node:fs/promises";
import { exec } from "node:child_process";
import { promisify } from "node:util";

const run = promisify(exec);

// Bounded, temporary development-dependency exceptions. Every exception pins
// the exact package node, version, dev-only status, and the exact advisory
// IDs it tolerates; anything else — a new advisory, a moved node, a version
// change, a production occurrence — fails closed. This is not an allowlist of
// packages: it is an enumeration of specific already-reviewed advisories on
// an unchanged dependency tree, each awaiting dependency-hygiene remediation
// rather than being hidden permanently.
const EXPIRES = "2026-09-30T23:59:59Z";

const HIGH_EXCEPTIONS = [
  {
    // Pre-existing exception (2026-08-06): nested Miniflare undici awaiting
    // upstream workers-sdk releases.
    name: "undici",
    node: "node_modules/miniflare/node_modules/undici",
    version: "7.28.0",
    advisories: [
      "GHSA-8xcm-r25x-g524",
      "GHSA-4cwx-7wf7-3272",
      "GHSA-m8rv-5g2x-5cg5",
      "GHSA-jr45-8vmc-qm54",
      "GHSA-v3r7-h72x-cjcm",
    ],
    reason:
      "Dev-only toolchain path (wrangler > miniflare > undici); absent from --omit=dev audit; fix ships via workers-sdk (undici >=7.29.0).",
    tracking: [
      "https://github.com/cloudflare/workers-sdk/issues/15007",
      "https://github.com/cloudflare/workers-sdk/issues/15042",
    ],
  },
  {
    // Registry drift observed 2026-08-18 against the unchanged lockfile:
    // ICNS/JXL/HEIF infinite-loop DoS advisories published for image-size.
    name: "image-size",
    node: "node_modules/image-size",
    version: "2.0.2",
    advisories: ["GHSA-5p2g-fcmc-qvqq", "GHSA-w3rx-r6r6-pgpr"],
    reason:
      "Dev-only build-tool path (@akribeia/dashboard > vinext > image-size); absent from --omit=dev audit; upstream fix requires the semver-major vinext 1.0.0-beta line — deferred to dependency-hygiene work.",
    tracking: [],
  },
  {
    // Registry drift observed 2026-08-18: nanoid zero-size generator loop.
    name: "nanoid",
    node: "node_modules/nanoid",
    version: "3.3.16",
    advisories: ["GHSA-2v37-7h3g-55p8"],
    reason:
      "Dev-only build-tool path (vite > postcss > nanoid); absent from --omit=dev audit; fixed upstream in nanoid 3.3.18 — deferred to dependency-hygiene work.",
    tracking: [],
  },
  {
    // vinext itself carries no advisory; npm marks it high purely because it
    // depends on the excepted image-size above. Tolerated only as that exact
    // transitive shadow.
    name: "vinext",
    node: "node_modules/vinext",
    version: "0.0.50",
    advisories: [],
    transitiveOf: "image-size",
    reason:
      "No advisory of its own; flagged transitively through the enumerated image-size advisories only.",
    tracking: [],
  },
];

if (Date.now() > Date.parse(EXPIRES)) throw new Error(`temporary exception expired: ${EXPIRES}`);
const [{ stdout: auditJson }, { stdout: productionAuditJson }, lockText] = await Promise.all([
  run("npm audit --json", { maxBuffer: 10 * 1024 * 1024, shell: true }).catch((error) => ({
    stdout: error.stdout,
  })),
  run("npm audit --omit=dev --json", { maxBuffer: 10 * 1024 * 1024, shell: true }),
  readFile(new URL("../package-lock.json", import.meta.url), "utf8"),
]);
const lock = JSON.parse(lockText);
const audit = JSON.parse(auditJson);
const productionAudit = JSON.parse(productionAuditJson);
const metadata = audit.metadata?.vulnerabilities ?? {};
const productionMetadata = productionAudit.metadata?.vulnerabilities ?? {};
if ((productionMetadata.critical ?? 0) !== 0 || (productionMetadata.high ?? 0) !== 0)
  throw new Error("production dependency audit is not clean");
if ((metadata.critical ?? 0) !== 0) throw new Error("critical vulnerabilities are not permitted");

// Every high finding must be one of the enumerated exceptions — no more, no
// fewer, and each must match its pinned node, version, and exact advisory set.
const highEntries = Object.values(audit.vulnerabilities ?? {}).filter(
  (entry) => entry.severity === "high",
);
if (
  (metadata.high ?? 0) !== HIGH_EXCEPTIONS.length ||
  highEntries.length !== HIGH_EXCEPTIONS.length
)
  throw new Error(
    `expected exactly the ${HIGH_EXCEPTIONS.length} enumerated high advisories, got ${metadata.high ?? 0}`,
  );
for (const exception of HIGH_EXCEPTIONS) {
  const entry = highEntries.find((candidate) => candidate.name === exception.name);
  if (!entry) throw new Error(`expected excepted high finding for ${exception.name} is missing`);
  if (entry.nodes?.length !== 1 || entry.nodes[0] !== exception.node)
    throw new Error(`unexpected audit node for ${exception.name}: ${JSON.stringify(entry.nodes)}`);
  const advisoryIds = entry.via
    .filter((item) => typeof item === "object" && item.url)
    .map((item) => item.url.split("/").pop())
    .toSorted();
  if (JSON.stringify(advisoryIds) !== JSON.stringify([...exception.advisories].toSorted()))
    throw new Error(`${exception.name} advisory set changed: ${JSON.stringify(advisoryIds)}`);
  if (exception.transitiveOf !== undefined) {
    const transitiveVia = entry.via.filter((item) => typeof item === "string");
    if (JSON.stringify(transitiveVia) !== JSON.stringify([exception.transitiveOf]))
      throw new Error(`${exception.name} transitive source changed: ${JSON.stringify(entry.via)}`);
  }
  const lockEntry = lock.packages?.[exception.node];
  if (!lockEntry || lockEntry.version !== exception.version || lockEntry.dev !== true)
    throw new Error(`${exception.name} lock path/version/dev status changed`);
}
const unexpectedHigh = highEntries.filter(
  (entry) => !HIGH_EXCEPTIONS.some((exception) => exception.name === entry.name),
);
if (unexpectedHigh.length > 0)
  throw new Error(
    `unenumerated high findings: ${JSON.stringify(unexpectedHigh.map(({ name }) => name))}`,
  );

if (lock.packages?.["node_modules/undici"])
  throw new Error("direct undici lock entry must remain absent");
if (lock.packages?.["node_modules/brace-expansion"]?.version !== "5.0.9")
  throw new Error("brace-expansion remediation missing");
if (lock.packages?.["node_modules/fast-uri"]?.version !== "3.1.5")
  throw new Error("fast-uri remediation missing");
const packageJson = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
if (packageJson.devDependencies?.undici || packageJson.overrides?.undici)
  throw new Error("direct undici pin/override must remain absent");
console.log(
  JSON.stringify({
    status: "passed",
    expires: EXPIRES,
    exceptions: HIGH_EXCEPTIONS.map(({ name, node, version, advisories, reason, tracking }) => ({
      name,
      node,
      version,
      developmentOnly: true,
      advisories,
      reason,
      tracking,
    })),
    productionAudit: {
      critical: productionMetadata.critical ?? 0,
      high: productionMetadata.high ?? 0,
    },
  }),
);
