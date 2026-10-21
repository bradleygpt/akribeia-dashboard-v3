import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

// The nightly starts the refresh once its bake publishes; GitHub's 05:45 UTC schedule is the
// backup. A backup (or any repeat) for a date that already has a refresh PR must do nothing.
const SCRIPT = resolve("scripts/refresh-disposition.node.mjs");
const REPO = "bradleygpt/akribeia-dashboard-v3";
const PULLS = `https://api.github.com/repos/${REPO}/pulls?state=all&sort=created&direction=desc&per_page=100&page=1`;

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

const pr = (number: number, head: string, state: "open" | "closed", merged = false) => ({
  number,
  state,
  merged_at: merged ? "2026-10-22T05:41:00Z" : null,
  head: { ref: head },
});

function decide(ingest: object, pulls: unknown, status = 200) {
  const root = mkdtempSync(join(tmpdir(), "akribeia-refresh-disposition-"));
  roots.push(root);
  writeFileSync(join(root, "ingest.json"), JSON.stringify(ingest));
  writeFileSync(
    join(root, "fixtures.json"),
    JSON.stringify({ [PULLS]: { status, body: JSON.stringify(pulls) } }),
  );
  const stub = join(root, "fetch-stub.mjs");
  writeFileSync(
    stub,
    `import { readFileSync } from "node:fs";
const fixtures = JSON.parse(readFileSync(process.env.DISPOSITION_FIXTURES, "utf8"));
globalThis.fetch = async (url) => {
  const f = fixtures[url];
  return f ? new Response(f.body, { status: f.status }) : new Response("unexpected " + url, { status: 599 });
};
`,
  );
  const result = spawnSync(
    process.execPath,
    [
      "--import",
      pathToFileURL(stub).href,
      SCRIPT,
      "--ingest-summary",
      "ingest.json",
      "--repo",
      REPO,
    ],
    {
      cwd: root,
      encoding: "utf8",
      env: { ...process.env, DISPOSITION_FIXTURES: join(root, "fixtures.json"), GH_TOKEN: "" },
    },
  );
  return {
    status: result.status,
    stderr: result.stderr,
    out: result.status === 0 ? JSON.parse(result.stdout) : null,
  };
}

const ingested = { ingested: true, disposition: "ingested", observedAt: "2026-10-22T05:29:43Z" };
const stall = {
  ingested: false,
  disposition: "no-new-upstream-data",
  observationDate: "2026-10-22",
};

describe("refresh disposition (nightly trigger + 05:45 UTC backup)", () => {
  it("does nothing when the nightly-triggered run's PR for that date is still open", () => {
    const { status, out } = decide(ingested, [
      pr(101, "automation/point-in-time-refresh-2026-10-22-39700000001", "open"),
      pr(99, "automation/point-in-time-refresh-2026-10-21-39626883165", "closed", true),
    ]);
    expect(status).toBe(0);
    expect(out).toEqual({
      disposition: "already-proposed",
      observationDate: "2026-10-22",
      proposal: {
        number: 101,
        state: "open",
        head: "automation/point-in-time-refresh-2026-10-22-39700000001",
      },
    });
  });

  it("does nothing when that date's PR has already merged", () => {
    const { out } = decide(ingested, [
      pr(101, "automation/point-in-time-refresh-2026-10-22-39700000001", "closed", true),
    ]);
    expect(out.disposition).toBe("already-proposed");
    expect(out.proposal.state).toBe("merged");
  });

  it("records no second no-new-upstream-data day once that date's stall PR exists", () => {
    const { out } = decide(stall, [pr(102, "automation/no-new-upstream-data-2026-10-22", "open")]);
    expect(out.disposition).toBe("already-proposed");
  });

  it("proceeds when the only PR for that date was closed unmerged, or is for another date", () => {
    expect(
      decide(ingested, [
        pr(101, "automation/point-in-time-refresh-2026-10-22-39700000001", "closed"),
        pr(99, "automation/point-in-time-refresh-2026-10-21-39626883165", "closed", true),
      ]).out,
    ).toEqual({ disposition: "ingested", observationDate: "2026-10-22", proposal: null });
    expect(decide(stall, []).out.disposition).toBe("no-new-upstream-data");
  });

  it("passes an already-observed run through without asking GitHub", () => {
    const { status, out } = decide(
      { ingested: false, disposition: "already-observed", observationDate: "2026-10-22" },
      [],
      500,
    );
    expect(status).toBe(0);
    expect(out.disposition).toBe("already-observed");
  });

  it("fails loudly rather than risk a duplicate when GitHub cannot be asked", () => {
    const { status, stderr } = decide(ingested, { message: "boom" }, 502);
    expect(status).toBe(1);
    expect(stderr).toContain("HTTP 502");
  });
});

describe("refresh workflow wiring", () => {
  const workflow = readFileSync(".github/workflows/point-in-time-refresh.yml", "utf8");
  const steps = workflow
    .split(/\n {6}- (?=name:|uses:)/)
    .slice(1)
    .map((step) => ({
      name: /^name: (.*)$/m.exec(step)?.[1] ?? step.split("\n")[0],
      condition: /^ {8}if: (.*(?:\n {10}.*)*)$/m.exec(step)?.[1] ?? null,
    }));
  const afterIngest = steps.slice(steps.findIndex(({ name }) => name.startsWith("Ingest")) + 1);

  it("routes the ingest through the PR check", () => {
    expect(workflow).toContain("node scripts/refresh-disposition.node.mjs");
  });

  it("gives an already-proposed run nothing to do: every later step needs another disposition", () => {
    expect(afterIngest.length).toBeGreaterThan(5);
    for (const { name, condition } of afterIngest) {
      expect(condition, name).not.toBeNull();
      expect(condition, name).not.toContain("already-proposed");
      expect(condition, name).toMatch(
        /steps\.ingest\.outputs\.disposition == '(ingested|no-new-upstream-data|already-observed)'|steps\.(refresh|stall)_pr\.outputs\.pr_url/,
      );
    }
  });
});
