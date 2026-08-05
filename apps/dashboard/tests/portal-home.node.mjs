import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function render(pathname) {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("portal-home-test", `${pathname}-${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);
  return worker.fetch(
    new Request(`http://localhost${pathname}`, { headers: { accept: "text/html" } }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

test("the root source is the static three-sun portal", async () => {
  const [page, landing, suns, planets, buildScript] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../../portal/src/LandingPortal.tsx", import.meta.url), "utf8"),
    readFile(new URL("../../portal/src/landing/Suns.tsx", import.meta.url), "utf8"),
    readFile(new URL("../../portal/src/landing/Planets.tsx", import.meta.url), "utf8"),
    readFile(new URL("../scripts/build-with-portal.mjs", import.meta.url), "utf8"),
  ]);

  assert.match(page, /return <LandingPortal\s*\/>/);
  assert.doesNotMatch(landing, /"use client"/);
  assert.equal((suns.match(/data-portal-sun="true"/g) ?? []).length, 1);
  assert.match(suns, /Market Health/);
  assert.match(suns, /Research/);
  assert.match(suns, /Risk/);
  assert.match(planets, /ETF intelligence/);
  assert.match(planets, /Sector analytics/);
  assert.match(buildScript, /npm_execpath/);
});

test("the packaged Worker renders all portal destinations as links", async () => {
  const response = await render("/");
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /Enter the Akribeia intelligence system/);
  assert.equal((html.match(/data-portal-sun="true"/g) ?? []).length, 3);
  for (const href of ["/dashboard", "/research", "/etfs", "/sectors", "/risk"]) {
    assert.match(html, new RegExp(`href="${href}"`));
  }
  assert.match(html, /Skip to portal navigation/);
});

test("Market Health remains navigable after the portal becomes home", async () => {
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
  assert.doesNotMatch(html, /href="\/#market-health">Market Health<\/a>/);
});
