/* global URL, console */
import { readFile } from "node:fs/promises";
import { exec } from "node:child_process";
import { promisify } from "node:util";

const run = promisify(exec);
const EXPIRES = "2026-08-19T23:59:59Z";
const EXPECTED_NODE = "node_modules/miniflare/node_modules/undici";
const EXPECTED_VERSION = "7.28.0";
const EXPECTED_ADVISORIES = [
  "GHSA-8xcm-r25x-g524",
  "GHSA-4cwx-7wf7-3272",
  "GHSA-m8rv-5g2x-5cg5",
  "GHSA-jr45-8vmc-qm54",
  "GHSA-v3r7-h72x-cjcm",
].toSorted();
const WORKERS_SDK_ISSUES = [
  "https://github.com/cloudflare/workers-sdk/issues/15007",
  "https://github.com/cloudflare/workers-sdk/issues/15042",
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
if ((metadata.high ?? 0) !== 1)
  throw new Error(`expected exactly one high advisory, got ${metadata.high ?? 0}`);
const undici = Object.values(audit.vulnerabilities ?? {}).find((entry) => entry.name === "undici");
if (!undici || undici.nodes?.length !== 1 || undici.nodes[0] !== EXPECTED_NODE)
  throw new Error("unexpected undici audit node");
const advisoryIds = undici.via
  .filter((item) => typeof item === "object" && item.url)
  .map((item) => item.url.split("/").pop())
  .toSorted();
if (JSON.stringify(advisoryIds) !== JSON.stringify(EXPECTED_ADVISORIES))
  throw new Error(`undici advisory set changed: ${JSON.stringify(advisoryIds)}`);
const nested = lock.packages?.[EXPECTED_NODE];
if (!nested || nested.version !== EXPECTED_VERSION || nested.dev !== true)
  throw new Error("nested Miniflare undici path/version/dev status changed");
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
    exception: {
      node: EXPECTED_NODE,
      version: EXPECTED_VERSION,
      developmentOnly: true,
      expires: EXPIRES,
    },
    advisories: EXPECTED_ADVISORIES,
    productionAudit: {
      critical: productionMetadata.critical ?? 0,
      high: productionMetadata.high ?? 0,
    },
    workersSdkIssues: WORKERS_SDK_ISSUES,
  }),
);
