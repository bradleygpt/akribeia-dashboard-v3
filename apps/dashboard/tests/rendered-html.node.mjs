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
  assert.match(html, /class="skip-link" href="#main-content"/);
  assert.match(html, /<nav class="primary-nav" aria-label="Primary navigation">/);
  assert.match(html, /<main id="main-content" tabindex="-1">/);
  assert.match(html, /data-state="loading"/);
  assert.match(html, /aria-live="polite" role="status"/);
  assert.match(html, /Verifying the active evidence build/);
  assert.match(html, /From source to signal/);
  assert.match(html, /every gate visible/);
  assert.match(html, /preview-20260728-pipeline-v4-a34fc842220f/);
  assert.match(html, /3\.0\.0-preview\.4/);
  assert.match(html, />643</);
  assert.match(html, /Missing inputs stay visible/);
  assert.match(html, /pillars\.EPS Revisions/);
  assert.match(html, /total-weight/);
  assert.match(html, /EXACT CONSTRAINT LEDGER/);
  assert.match(html, /ranked-greedy-integer-units-v1/);
  assert.match(html, /1,000,000,000/);
  assert.match(html, /35h \/ 168h/);
  assert.match(html, /3 SHA-256 artifacts/);
  assert.match(html, /verify-and-reuse/);
  assert.match(html, /validated-pointer-and-projection/);
  assert.match(html, /Highest composite scores/);
  assert.match(html, /MU/);
  assert.match(html, /NVDA/);
  assert.match(html, /Sector exposure/);
  assert.match(html, /Composite score ranking table/);
  assert.match(html, /Highest composite scores with sector, factor coverage, score/);
  assert.match(html, /The interface says what it knows/);
  assert.match(html, /Verified history remains visible with a freshness warning/);
  assert.match(html, /Missing or failed evidence is withheld/);
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

test("preserves the dashboard accessibility contract", async () => {
  const response = await render();
  const html = await response.text();
  const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map((match) => match[1]);
  const labelledBy = [...html.matchAll(/\saria-labelledby="([^"]+)"/g)].flatMap((match) =>
    match[1].split(/\s+/),
  );
  const fragmentLinks = [...html.matchAll(/\shref="#([^"]+)"/g)].map((match) => match[1]);

  assert.equal(new Set(ids).size, ids.length, "Rendered IDs must be unique.");
  assert.equal((html.match(/<h1\b/g) ?? []).length, 1, "The page must have exactly one h1.");
  assert.match(html, /<html lang="en">/);
  assert.match(html, /<main id="main-content" tabindex="-1">/);
  assert.match(html, /class="table-scroll" tabindex="0" role="region"/);
  assert.match(html, /<caption class="sr-only">/);
  assert.match(html, /role="img" aria-label="[^"]+"/);

  for (const referencedId of [...labelledBy, ...fragmentLinks]) {
    assert.ok(ids.includes(referencedId), `Missing referenced landmark ID "${referencedId}".`);
  }
});
