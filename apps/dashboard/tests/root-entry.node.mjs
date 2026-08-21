import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function render(pathname) {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("root-entry-test", `${pathname}-${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);
  return worker.fetch(
    new Request(`http://localhost${pathname}`, { headers: { accept: "text/html" } }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

test("the root source is the preserved Market Health entry, not the portal", async () => {
  const [page, dashboardPage, shell] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/dashboard/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/experience-shell.tsx", import.meta.url), "utf8"),
  ]);

  assert.match(page, /export default function Home\(\) \{\s*return <MarketHealthDashboard \/>;/);
  assert.doesNotMatch(page, /LandingPortal/);
  assert.match(dashboardPage, /MarketHealthDashboard/);
  assert.match(shell, /LoadingOverlay/);
});

test("the packaged Worker serves the preserved entry at the root", async () => {
  const response = await render("/");
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /Market Health/);
  assert.match(html, /See the market whole/);
  assert.doesNotMatch(html, /data-portal-sun/);
  assert.doesNotMatch(html, /Enter the Akribeia intelligence system/);
});

test("Market Health remains navigable at the dashboard route", async () => {
  const response = await render("/dashboard");
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /Market Health/);
  assert.match(html, /Akribeia V3/);
});

test("shared product navigation points Market Health at the dashboard route", async () => {
  const response = await render("/research");
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /href="\/dashboard#market-health">Market Health<\/a>/);
});
