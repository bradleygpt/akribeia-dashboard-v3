// Post-deploy check for .github/workflows/deploy.yml (also runnable by hand after a manual
// `wrangler deploy`). Run from apps/dashboard:
//
//   node --import ./tests/register-worker-hooks.node.mjs scripts/check-deployed-bundle.node.mjs \
//     [--version-id <id wrangler printed>]
//
// The live /api/v3/health sits behind Cloudflare Access, so this calls the BUILT bundle -- the
// exact bytes wrangler uploaded, with the vars of the wrangler.json it deployed -- on a local
// host, and fails unless:
//   * /api/v3/health answers 200 and its buildId is the active build on this checkout
//     (public/data/active-build.json), i.e. the bundle serves main's build;
//   * a workers.dev request without an Access token is refused 403 by the Worker itself;
//   * with --version-id, Cloudflare reports that version serving 100% of akribeia-dashboard.
// A "degraded" health (stale data) is a warning: the deploy is still the right code.

import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

const DASHBOARD = new URL("..", import.meta.url);
const WORKER_NAME = "akribeia-dashboard";
const WORKERS_DEV = "https://akribeia-dashboard.akribeia-insights.workers.dev";

const args = process.argv.slice(2);
const versionFlag = args.indexOf("--version-id");
const versionId = versionFlag === -1 ? null : args[versionFlag + 1];

const say = (line) => process.stdout.write(`${line}\n`);
const failures = [];
const fail = (message) => {
  failures.push(message);
  say(`::error::${message}`);
};

const activeBuildId = JSON.parse(
  await readFile(new URL("public/data/active-build.json", DASHBOARD), "utf8"),
).activeBuildId;
const wrangler = JSON.parse(
  await readFile(new URL("dist/server/wrangler.json", DASHBOARD), "utf8"),
);
const { default: worker } = await import(new URL("dist/server/index.js", DASHBOARD).href);
const env = {
  ...wrangler.vars,
  ASSETS: {
    async fetch(request) {
      const path = new URL(request.url).pathname.replace(/^\/+/, "");
      try {
        return new Response(await readFile(new URL(`dist/client/${path}`, DASHBOARD)), {
          status: 200,
        });
      } catch {
        return new Response("Not found", { status: 404 });
      }
    },
  },
};
const ctx = { waitUntil() {}, passThroughOnException() {} };

const health = await worker.fetch(new Request("http://127.0.0.1/api/v3/health"), env, ctx);
const body = await health.json().catch(() => ({}));
say(
  `bundle health: HTTP ${health.status} status=${body.status} buildId=${body.buildId} ` +
    `model=${body.modelVersion} dataAsOf=${body.freshness?.dataAsOf}`,
);
if (health.status !== 200) fail(`deployed bundle health answered HTTP ${health.status}`);
if (body.buildId !== activeBuildId)
  fail(`deployed bundle serves build ${body.buildId}, but main's active build is ${activeBuildId}`);
if (body.status !== "healthy")
  say(`::warning::deployed bundle health is ${body.status} (data freshness), not healthy`);

const denied = await worker.fetch(new Request(`${WORKERS_DEV}/api/v3/health`), env, ctx);
if (denied.status !== 403)
  fail(`workers.dev without an Access token answered ${denied.status}, expected 403`);

if (versionId) {
  try {
    // the repo's pinned wrangler, the one that deployed
    const wranglerBin = join(
      dirname(createRequire(import.meta.url).resolve("wrangler/package.json")),
      "bin",
      "wrangler.js",
    );
    const status = JSON.parse(
      execFileSync(
        process.execPath,
        [wranglerBin, "deployments", "status", "--name", WORKER_NAME, "--json"],
        { encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] },
      ),
    );
    const live = (status.versions ?? []).map((v) => `${v.version_id}@${v.percentage}%`);
    say(`live versions: ${live.join(", ")}`);
    const serving = (status.versions ?? []).find((v) => v.version_id === versionId);
    if (!serving || serving.percentage !== 100)
      fail(`Cloudflare is not serving ${versionId} at 100% (live: ${live.join(", ")})`);
  } catch (error) {
    fail(`could not read the live deployment: ${error instanceof Error ? error.message : error}`);
  }
}

if (failures.length > 0) {
  say(`deployed bundle check FAILED (${failures.length})`);
  process.exit(1);
}
say(`deployed bundle check passed: ${activeBuildId}`);
