import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request("http://localhost/", {
      headers: { accept: "text/html" },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );
}

test("server-renders the active Akribeia evidence dashboard", async () => {
  const response = await render();

  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();

  assert.match(html, /<title>Akribeia V3 — Evidence Preview<\/title>/i);
  assert.match(html, /From source to signal/);
  assert.match(html, /every gate visible/);
  assert.match(html, /preview-20260728-coverage-v2-a34fc842220f/);
  assert.match(html, /3\.0\.0-preview\.2/);
  assert.match(html, />643</);
  assert.match(html, /Missing inputs stay visible/);
  assert.match(html, /pillars\.EPS Revisions/);
  assert.match(html, /total-weight/);
  assert.match(html, /Highest composite scores/);
  assert.match(html, /MU/);
  assert.match(html, /NVDA/);
  assert.match(html, /Sector exposure/);
  assert.match(html, /No silent renormalization/);
  assert.match(html, /not investment advice/i);
  assert.doesNotMatch(html, /codex-preview|react-loading-skeleton|Your site is taking shape/i);
});

test("ships an integrity-valid immutable active build", async () => {
  const pointer = JSON.parse(
    await readFile(new URL("../public/data/active-build.json", import.meta.url), "utf8"),
  );
  const buildRoot = new URL(`../public/data/builds/${pointer.activeBuildId}/`, import.meta.url);
  const manifest = JSON.parse(await readFile(new URL("manifest.json", buildRoot), "utf8"));

  assert.equal(pointer.activeBuildId, manifest.buildId);
  assert.equal(manifest.status, "healthy");
  assert.equal(manifest.publication.decision, "publish");

  for (const artifact of Object.values(manifest.files)) {
    const payload = await readFile(new URL(artifact.path, buildRoot));
    const hash = createHash("sha256").update(payload).digest("hex");

    assert.equal(payload.byteLength, artifact.byteSize);
    assert.equal(hash, artifact.sha256);
  }

  const [publishedDashboard, projectedDashboard] = await Promise.all([
    readFile(new URL("dashboard.json", buildRoot), "utf8"),
    readFile(new URL("../app/generated/active-dashboard.json", import.meta.url), "utf8"),
  ]);

  assert.equal(projectedDashboard, publishedDashboard);
  assert.equal(JSON.parse(projectedDashboard).buildId, pointer.activeBuildId);
});
