import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import {
  UpstreamStallLedgerSchema,
  UpstreamStallRecordSchema,
} from "../../packages/contracts/src/index.js";

// The ingest gates every scheduled refresh and had no test (audit 2026-10-20, G10). It runs
// here as a child process in a temp cwd, with fetch replaced by a stub that serves fixtures
// for exactly the URLs the script requests -- no network.
const SCRIPT = resolve("scripts/ingest-v2-observation.node.mjs");
const V2 = "a".repeat(40);
const DATA = "b".repeat(40);
const RAW = `https://raw.githubusercontent.com/bradleygpt/quant-dashboard-pro-v2/${V2}/public/data`;
const CDN = `https://cdn.jsdelivr.net/gh/bradleygpt/akribeia-data@${DATA}/data`;
const FLOORS = [0, 1, 10];
const sha256 = (text: string) => createHash("sha256").update(text).digest("hex");

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function universe(floor: number): string {
  const rows = Array.from({ length: 100 }, (_, index) => ({ ticker: `T${floor}X${index}` }));
  return JSON.stringify({
    meta: { floor, n_total: rows.length, n_stocks: 95, n_etf: 5 },
    rows,
  });
}

interface Fixture {
  root: string;
  run: (...extraArgs: string[]) => ReturnType<typeof spawnSync>;
  recipeBefore: string;
}

function fixture(
  options: {
    asOf?: Record<number, string | undefined>;
    corruptDigest?: number;
    generatedAt?: string;
  } = {},
): Fixture {
  const root = mkdtempSync(join(tmpdir(), "akribeia-ingest-"));
  roots.push(root);
  const files: Record<string, string> = {};
  const pinned: Record<string, { sha256: string; as_of?: string }> = {};
  for (const floor of FLOORS) {
    const body = universe(floor);
    files[`${CDN}/universe_floor${floor}.json`] = body;
    const asOf = options.asOf ? options.asOf[floor] : "2026-10-20";
    pinned[`universe_floor${floor}.json`] = {
      sha256: options.corruptDigest === floor ? "0".repeat(64) : sha256(body),
      ...(asOf === undefined ? {} : { as_of: asOf }),
    };
  }
  // The bake stamps UTC with a Z (since 2026-10-20); one hour old keeps the 48 h check green.
  const generatedAt =
    options.generatedAt ?? `${new Date(Date.now() - 3_600_000).toISOString().slice(0, 19)}Z`;
  files[`${RAW}/meta.json`] = JSON.stringify({
    generated_at: generatedAt,
    source_commit: "abc1234",
  });
  files[`${RAW}/freshness_manifest.json`] = JSON.stringify({
    blob: { commit_sha: DATA, version: "20261020T000000Z", files: pinned },
  });

  const fixturesPath = join(root, "fixtures.json");
  writeFileSync(fixturesPath, JSON.stringify(files));
  const stubPath = join(root, "fetch-stub.mjs");
  writeFileSync(
    stubPath,
    `import { readFileSync } from "node:fs";
const files = JSON.parse(readFileSync(process.env.FETCH_FIXTURES, "utf8"));
globalThis.fetch = async (url) =>
  url in files ? new Response(files[url], { status: 200 }) : new Response("missing", { status: 404 });
`,
  );
  mkdirSync(join(root, "data", "preview"), { recursive: true });
  const recipeBefore = `${JSON.stringify(
    {
      buildId: "preview-20261002-pipeline-v5-previous",
      evaluatedAt: "2026-10-02T11:00:00Z",
      observedAt: "2026-10-02T10:42:30Z",
      dataAsOf: "2026-10-01T00:00:00Z",
      maxAgeSeconds: 604800,
      schemaVersion: "3.0.0",
      modelVersion: "3.0.0",
    },
    null,
    2,
  )}\n`;
  writeFileSync(join(root, "data", "preview", "vertical-slice-build.json"), recipeBefore);

  return {
    root,
    recipeBefore,
    run: (...extraArgs) =>
      spawnSync(
        process.execPath,
        ["--import", pathToFileURL(stubPath).href, SCRIPT, "--v2-commit", V2, ...extraArgs],
        { cwd: root, encoding: "utf8", env: { ...process.env, FETCH_FIXTURES: fixturesPath } },
      ),
  };
}

describe("V2 observation ingest", () => {
  it("ingests the pinned bake and records the oldest partition's data date", () => {
    const { root, run } = fixture({ asOf: { 0: "2026-10-20", 1: "2026-10-17", 10: "2026-10-20" } });
    const result = run();

    expect(result.status, String(result.stderr)).toBe(0);
    const recipe = JSON.parse(
      readFileSync(join(root, "data/preview/vertical-slice-build.json"), "utf8"),
    );
    const provenance = JSON.parse(
      readFileSync(join(root, "data/observations/current/provenance.json"), "utf8"),
    );
    expect(recipe.dataAsOf).toBe("2026-10-17T00:00:00Z");
    expect(provenance.data_as_of).toBe("2026-10-17T00:00:00Z");
    expect(provenance.bulk_data_commit).toBe(DATA);
    expect(provenance.v2_commit).toBe(V2);
    expect(provenance.files["universe_floor1.json"].as_of).toBe("2026-10-17");
    const floor10Sha = provenance.files["universe_floor10.json"].sha256;
    expect(recipe.buildId).toMatch(
      new RegExp(`^preview-\\d{8}-pipeline-v6-${floor10Sha.slice(0, 12)}$`),
    );
    expect(recipe.observedAt.slice(0, 10)).toBe(
      recipe.buildId.slice(8, 12) +
        "-" +
        recipe.buildId.slice(12, 14) +
        "-" +
        recipe.buildId.slice(14, 16),
    );
  });

  it("refuses a partition whose bytes differ from the pinned digest and writes nothing", () => {
    const { root, run, recipeBefore } = fixture({ corruptDigest: 1 });
    const result = run();

    expect(result.status).not.toBe(0);
    expect(String(result.stderr)).toContain("universe_floor1.json does not match the SHA-256");
    expect(existsSync(join(root, "data/observations/current"))).toBe(false);
    expect(readFileSync(join(root, "data/preview/vertical-slice-build.json"), "utf8")).toBe(
      recipeBefore,
    );
  });

  it("records a legacy zone-less stamp at the bake host's Eastern instant", () => {
    // An older bake's naive Eastern wall time for one hour ago.
    const instant = new Date(Math.floor((Date.now() - 3_600_000) / 1000) * 1000);
    const parts = Object.fromEntries(
      new Intl.DateTimeFormat("en-US", {
        timeZone: "America/New_York",
        hourCycle: "h23",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      })
        .formatToParts(instant)
        .map(({ type, value }) => [type, value]),
    );
    const wall = `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}`;
    const { root, run } = fixture({ generatedAt: wall });
    const result = run();

    expect(result.status, String(result.stderr)).toBe(0);
    const provenance = JSON.parse(
      readFileSync(join(root, "data/observations/current/provenance.json"), "utf8"),
    );
    expect(provenance.observed_at).toBe(instant.toISOString());
  });

  it("refuses a pin without a data date", () => {
    const result = fixture({ asOf: { 0: "2026-10-20", 1: undefined, 10: "2026-10-20" } }).run();

    expect(result.status).not.toBe(0);
    expect(String(result.stderr)).toContain("records no as_of data date for universe_floor1.json");
  });

  it("refuses a data commit other than the one V2 pins", () => {
    const result = fixture().run("c".repeat(40));

    expect(result.status).not.toBe(0);
    expect(String(result.stderr)).toContain("is not the commit V2");
  });

  it("records a later bake of byte-identical partitions as a no-new-upstream-data day", () => {
    const { root, run } = fixture();
    expect(run().status).toBe(0);
    // Age the active observation three days: the same bytes now arrive on a later bake date.
    const provenancePath = join(root, "data/observations/current/provenance.json");
    const recipePath = join(root, "data/preview/vertical-slice-build.json");
    const provenance = JSON.parse(readFileSync(provenancePath, "utf8"));
    const earlier = new Date(Date.parse(provenance.observed_at) - 3 * 86_400_000).toISOString();
    writeFileSync(provenancePath, JSON.stringify({ ...provenance, observed_at: earlier }));
    const recipeBefore = readFileSync(recipePath, "utf8");
    const provenanceBefore = readFileSync(provenancePath, "utf8");

    const result = run();
    expect(result.status, String(result.stderr)).toBe(0);
    const summary = JSON.parse(String(result.stdout));
    expect(summary).toMatchObject({
      ingested: false,
      disposition: "no-new-upstream-data",
      recordDisposition: "recorded",
    });
    // nothing is ingested: no new observation, recipe or build
    expect(readFileSync(recipePath, "utf8")).toBe(recipeBefore);
    expect(readFileSync(provenancePath, "utf8")).toBe(provenanceBefore);

    const recordText = readFileSync(join(root, summary.stallRecord), "utf8");
    const record = UpstreamStallRecordSchema.parse(JSON.parse(recordText));
    expect(record).toMatchObject({
      observationDate: summary.observationDate,
      countsTowardProspectiveHistory: false,
      v2Commit: V2,
      bulkDataCommit: DATA,
      unchangedSince: {
        observationDate: earlier.slice(0, 10),
        buildId: JSON.parse(recipeBefore).buildId,
      },
    });
    expect(record.universeSha256).toEqual(
      Object.fromEntries(
        Object.entries(provenance.files as Record<string, { sha256: string }>).map(
          ([name, file]) => [name, file.sha256],
        ),
      ),
    );
    expect(
      readFileSync(
        join(
          root,
          "apps/dashboard/public/data/evidence/upstream-stalls",
          `${record.observationDate}.json`,
        ),
        "utf8",
      ),
    ).toBe(recordText);
    const ledger = UpstreamStallLedgerSchema.parse(
      JSON.parse(
        readFileSync(
          join(root, "apps/dashboard/app/generated/active-upstream-stalls.json"),
          "utf8",
        ),
      ),
    );
    expect(ledger.stalls).toEqual([record]);

    // the same date again keeps the first record
    const again = run();
    expect(again.status, String(again.stderr)).toBe(0);
    expect(JSON.parse(String(again.stdout)).recordDisposition).toBe("already-recorded");
    expect(readFileSync(join(root, summary.stallRecord), "utf8")).toBe(recordText);
  });

  it("treats the same bake again as already observed and records nothing", () => {
    const { root, run } = fixture();
    expect(run().status).toBe(0);
    const recipe = readFileSync(join(root, "data/preview/vertical-slice-build.json"), "utf8");

    const result = run();
    expect(result.status, String(result.stderr)).toBe(0);
    expect(JSON.parse(String(result.stdout))).toMatchObject({
      ingested: false,
      disposition: "already-observed",
    });
    expect(readFileSync(join(root, "data/preview/vertical-slice-build.json"), "utf8")).toBe(recipe);
    expect(existsSync(join(root, "data/evidence/upstream-stalls"))).toBe(false);
  });
});
