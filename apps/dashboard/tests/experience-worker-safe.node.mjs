import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

test("mounts lightweight navigation motion outside the server research tree", async () => {
  const [layout, shell, css, packageJson] = await Promise.all([
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/experience-shell.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/experience.css", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
  ]);

  assert.match(layout, /<ExperienceShell\s*\/>\s*\{children\}/);
  assert.doesNotMatch(layout, /<ExperienceShell>\{children\}<\/ExperienceShell>/);

  assert.match(shell, /export function ExperienceShell\(\)/);
  assert.match(shell, /window\.location\.assign\(destination\.href\)/);
  assert.match(shell, /data-route-transition="active"/);
  assert.match(shell, /prefers-reduced-motion: reduce/);
  assert.match(shell, /pathname === "\/dashboard".*Loading Market Health/);
  assert.match(shell, /pathname === "\/".*Returning to Market Health/);

  assert.doesNotMatch(shell, /next\/navigation/);
  assert.doesNotMatch(shell, /requestAnimationFrame/);

  assert.match(css, /\.akribeia-route-transition/);
  assert.match(css, /akribeia-card-arrive/);
  assert.match(css, /prefers-reduced-motion: reduce/);

  assert.match(packageJson, /experience-worker-safe\.node\.mjs/);
});

test("restores the preserved loading intro without streamed route fallbacks", async () => {
  const shell = await readFile(new URL("../app/experience-shell.tsx", import.meta.url), "utf8");

  assert.match(shell, /import LoadingOverlay from "\.\/loading-overlay"/);
  assert.match(shell, /sessionStorage\.getItem\(INTRO_KEY\)/);
  assert.match(shell, /className="akribeia-intro-veil"/);
  await access(new URL("../app/loading-overlay.tsx", import.meta.url));

  const prohibitedFiles = [
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
    prohibitedFiles.map(async (path) => {
      await assert.rejects(access(new URL(path, import.meta.url)), {
        code: "ENOENT",
      });
    }),
  );
});
