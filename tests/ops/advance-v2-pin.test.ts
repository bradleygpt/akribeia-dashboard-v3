import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

// scripts/advance-v2-pin.node.mjs runs inside every point-in-time refresh. It runs here as a
// child process in a temp copy of the four files it edits, with fetch replaced by a stub that
// serves GitHub API and raw-file fixtures -- no network.
const SCRIPT = resolve("scripts/advance-v2-pin.node.mjs");
const FILES = [
  "apps/dashboard/worker/market-health-api.ts",
  "apps/dashboard/worker/research-reference-api.ts",
  "tests/dashboard/market-health-api.test.ts",
  "tests/dashboard/research-workflows.test.ts",
];
const LIVE_PIN = /V2_APP_COMMIT = "([0-9a-f]{40})"/.exec(readFileSync(FILES[0], "utf8"))![1]!;
const OLD = "a".repeat(40);
const NEW = "b".repeat(40);
const API = "https://api.github.com/repos/bradleygpt/quant-dashboard-pro-v2";
const RAW = "https://raw.githubusercontent.com/bradleygpt/quant-dashboard-pro-v2";
const BAKE =
  "data: nightly local bake 2026-10-21T05:02Z (chain: stage5+earnings+bake+validate+publish)";

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

const commit = (sha: string, date: string, message: string) => ({
  sha,
  commit: { message, committer: { date } },
});

function run(fixtures: Record<string, { status?: number; body: unknown }>) {
  const root = mkdtempSync(join(tmpdir(), "akribeia-v2-pin-"));
  roots.push(root);
  for (const file of FILES) {
    mkdirSync(dirname(join(root, file)), { recursive: true });
    writeFileSync(join(root, file), readFileSync(file, "utf8").split(LIVE_PIN).join(OLD));
  }
  const fixturesPath = join(root, "fixtures.json");
  writeFileSync(
    fixturesPath,
    JSON.stringify(
      Object.fromEntries(
        Object.entries(fixtures).map(([url, f]) => [
          url,
          {
            status: f.status ?? 200,
            body: typeof f.body === "string" ? f.body : JSON.stringify(f.body),
          },
        ]),
      ),
    ),
  );
  const stub = join(root, "fetch-stub.mjs");
  writeFileSync(
    stub,
    `import { readFileSync } from "node:fs";
const fixtures = JSON.parse(readFileSync(process.env.PIN_FIXTURES, "utf8"));
globalThis.fetch = async (url) => {
  const f = fixtures[url];
  if (f) return new Response(f.body, { status: f.status });
  // every other pinned file at the candidate parses
  if (url.startsWith(${JSON.stringify(`${RAW}/${NEW}/public/data/`)})) return new Response("{}", { status: 200 });
  return new Response("missing", { status: 404 });
};
`,
  );
  const result = spawnSync(
    process.execPath,
    ["--import", pathToFileURL(stub).href, SCRIPT, "--summary-path", "summary.json"],
    {
      cwd: root,
      encoding: "utf8",
      env: { ...process.env, PIN_FIXTURES: fixturesPath, GH_TOKEN: "" },
    },
  );
  const read = (file: string) => readFileSync(join(root, file), "utf8");
  return { result, summary: JSON.parse(read("summary.json")), read };
}

const history = (newestFirst: ReturnType<typeof commit>[]) => ({
  [`${API}/commits?sha=main&per_page=60`]: { body: newestFirst },
  [`${API}/commits/${OLD}`]: { body: commit(OLD, "2026-10-20T14:54:11Z", BAKE) },
});

describe("V2 reference pin advance", () => {
  it("moves the pin to the newest healthy nightly bake once every pinned file parses", () => {
    const { result, summary, read } = run(
      history([
        commit(
          "c".repeat(40),
          "2026-10-21T09:00:00Z",
          "chore: bake data refresh 2026-10-21T09:00Z",
        ),
        commit(NEW, "2026-10-21T05:02:00Z", BAKE),
        commit(OLD, "2026-10-20T14:54:11Z", BAKE),
      ]),
    );

    expect(result.status, result.stderr).toBe(0);
    // the newer CI data refresh is not a nightly bake, so the bake below it is chosen
    expect(summary).toMatchObject({ disposition: "advanced", from: OLD, to: NEW, failures: [] });
    expect(summary.files_checked).toBe(29);
    for (const file of FILES) {
      expect(read(file)).toContain(NEW);
      expect(read(file)).not.toContain(OLD);
    }
  });

  it("keeps the old pin when a pinned file fails to parse at the new bake", () => {
    const { result, summary, read } = run({
      ...history([commit(NEW, "2026-10-21T05:02:00Z", BAKE)]),
      [`${RAW}/${NEW}/public/data/risk_radar.json`]: { body: "{not json" },
    });

    expect(result.status).toBe(0);
    expect(summary.disposition).toBe("kept");
    expect(summary.failures).toEqual([expect.stringContaining("risk_radar.json")]);
    for (const file of FILES) expect(read(file)).toContain(OLD);
  });

  it("keeps the old pin when a pinned file is missing at the new bake", () => {
    const { summary, read } = run({
      ...history([commit(NEW, "2026-10-21T05:02:00Z", BAKE)]),
      [`${RAW}/${NEW}/public/data/market_static.json`]: { status: 404, body: "missing" },
    });

    expect(summary.disposition).toBe("kept");
    expect(summary.failures).toEqual(["market_static.json: HTTP 404"]);
    expect(read(FILES[0])).toContain(OLD);
  });

  it("does nothing when the pin is already the newest healthy bake, and never moves back", () => {
    expect(run(history([commit(OLD, "2026-10-20T14:54:11Z", BAKE)])).summary.disposition).toBe(
      "unchanged",
    );
    const backwards = run(history([commit(NEW, "2026-10-19T05:00:00Z", BAKE)]));
    expect(backwards.summary.disposition).toBe("kept");
    expect(backwards.summary.reason).toContain("not newer than the pin");
    expect(backwards.read(FILES[1])).toContain(OLD);
  });
});
