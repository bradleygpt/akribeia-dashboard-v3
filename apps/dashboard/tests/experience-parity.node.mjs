import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

test("keeps the approved V2 experience outside the server-rendered research tree", async () => {
  const [layout, shell, overlay, css, packageJson] = await Promise.all([
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/experience-shell.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/loading-overlay.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
  ]);

  assert.match(layout, /<ExperienceShell\s*\/>\s*\{children\}/);
  assert.doesNotMatch(layout, /<ExperienceShell>\{children\}<\/ExperienceShell>/);
  assert.match(shell, /export function ExperienceShell\(\)/);
  assert.doesNotMatch(shell, /ReactNode/);
  assert.match(shell, /usePathname\(\)/);
  assert.match(shell, /className="akribeia-intro-veil"/);
  assert.match(shell, /data-route-transition="active"/);
  assert.match(shell, /router\.push\(relativeDestination\)/);
  assert.match(shell, /sessionStorage\.getItem\(INTRO_KEY\)/);
  assert.match(shell, /prefers-reduced-motion: reduce/);

  assert.match(overlay, /name: "starfield", dur: 2200/);
  assert.match(overlay, /name: "converge", dur: 5000/);
  assert.match(overlay, /name: "bear", dur: 2600/);
  assert.match(overlay, /name: "bigbang", dur: 1400/);
  assert.match(overlay, /name: "draw", dur: 4800/);
  assert.match(overlay, /name: "settle", dur: 2200/);
  assert.match(overlay, /className="akl-skip"/);
  assert.match(overlay, /finish\.current\(SKIP_FADE_MS\)/);
  assert.match(css, /body\.akribeia-experience-ready/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(packageJson, /experience-parity\.node\.mjs/);
});

test("does not stream duplicate fallbacks around the large research routes", async () => {
  const removedFallbacks = [
    "../app/loading.tsx",
    "../app/route-loading.tsx",
    "../app/research/loading.tsx",
    "../app/research/[ticker]/loading.tsx",
    "../app/risk/loading.tsx",
    "../app/sectors/loading.tsx",
    "../app/etfs/loading.tsx",
    "../app/etfs/[ticker]/loading.tsx",
  ];

  await Promise.all(
    removedFallbacks.map(async (path) => {
      await assert.rejects(access(new URL(path, import.meta.url)), { code: "ENOENT" });
    }),
  );
});

test("packages the V2 landing marks into the deployable client build", async () => {
  await Promise.all([
    access(new URL("../dist/client/landing/akribeia-mark-ai.png", import.meta.url)),
    access(new URL("../dist/client/landing/akribeia-mark-quant.png", import.meta.url)),
  ]);
});
