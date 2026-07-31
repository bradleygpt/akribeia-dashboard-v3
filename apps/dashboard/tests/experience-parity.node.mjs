import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

test("restores the approved V2 front door and dynamic route experience", async () => {
  const [layout, shell, overlay, routeLoading, css, packageJson] = await Promise.all([
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/experience-shell.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/loading-overlay.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/route-loading.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
  ]);

  assert.match(layout, /<ExperienceShell>\{children\}<\/ExperienceShell>/);
  assert.match(shell, /sessionStorage\.getItem\(INTRO_KEY\)/);
  assert.match(shell, /prefers-reduced-motion: reduce/);
  assert.match(shell, /router\.push\(relativeDestination\)/);
  assert.match(shell, /data-route-transition="active"/);

  assert.match(overlay, /name: "starfield", dur: 2200/);
  assert.match(overlay, /name: "converge", dur: 5000/);
  assert.match(overlay, /name: "bear", dur: 2600/);
  assert.match(overlay, /name: "bigbang", dur: 1400/);
  assert.match(overlay, /name: "draw", dur: 4800/);
  assert.match(overlay, /name: "settle", dur: 2200/);
  assert.match(overlay, /className="akl-skip"/);
  assert.match(overlay, /finish\.current\(SKIP_FADE_MS\)/);
  assert.match(overlay, /skip →/i);

  assert.match(routeLoading, /data-route-loading="active"/);
  assert.match(css, /AKRIBEIA_DYNAMIC_PARITY_START/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(packageJson, /experience-parity\.node\.mjs/);

  const loadingFiles = [
    "../app/loading.tsx",
    "../app/research/loading.tsx",
    "../app/research/[ticker]/loading.tsx",
    "../app/risk/loading.tsx",
    "../app/sectors/loading.tsx",
    "../app/etfs/loading.tsx",
    "../app/etfs/[ticker]/loading.tsx",
  ];

  await Promise.all(loadingFiles.map((path) => access(new URL(path, import.meta.url))));
});

test("packages the V2 landing marks into the deployable client build", async () => {
  await Promise.all([
    access(new URL("../dist/client/landing/akribeia-mark-ai.png", import.meta.url)),
    access(new URL("../dist/client/landing/akribeia-mark-quant.png", import.meta.url)),
  ]);
});
