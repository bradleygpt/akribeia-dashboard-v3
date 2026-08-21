import assert from "node:assert/strict";
import { access, readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

test("keeps the approved V2 loading experience byte-faithful and client-mounted", async () => {
  const [layout, shell, overlay, experienceCss, packageJson] = await Promise.all([
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/experience-shell.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/loading-overlay.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/experience.css", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
  ]);

  assert.match(layout, /<ExperienceShell\s*\/>\s*\{children\}/);
  assert.match(shell, /sessionStorage\.getItem\(INTRO_KEY\)/);
  assert.match(shell, /prefers-reduced-motion: reduce/);
  assert.match(shell, /navigator\.webdriver/);
  assert.match(shell, /className="akribeia-intro-veil"/);
  assert.match(shell, /<LoadingOverlay onDone=\{finishIntro\} \/>/);

  assert.match(overlay, /"use client"/);
  assert.match(overlay, /name: "starfield", dur: 2200/);
  assert.match(overlay, /name: "converge", dur: 5000/);
  assert.match(overlay, /name: "bear", dur: 2600/);
  assert.match(overlay, /name: "bigbang", dur: 1400/);
  assert.match(overlay, /name: "draw", dur: 4800/);
  assert.match(overlay, /name: "settle", dur: 2200/);
  assert.match(overlay, /className="akl-skip"/);
  assert.match(overlay, /finish\.current\(SKIP_FADE_MS\)/);

  assert.match(experienceCss, /body\.akribeia-experience-ready/);
  assert.match(experienceCss, /\.akribeia-intro-veil/);
  assert.match(experienceCss, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(packageJson, /experience-parity\.node\.mjs/);

  async function sourceFiles(directory) {
    const entries = await readdir(directory, { withFileTypes: true });
    const nested = await Promise.all(
      entries.map(async (entry) => {
        const path = join(directory, entry.name);
        if (entry.isDirectory()) return sourceFiles(path);
        return /\.(?:mjs|ts|tsx)$/.test(entry.name) ? [path] : [];
      }),
    );
    return nested.flat();
  }

  const appRoot = fileURLToPath(new URL("../app", import.meta.url));
  const importers = (
    await Promise.all(
      (await sourceFiles(appRoot)).map(async (path) => {
        const text = await readFile(path, "utf8");
        return /from "\.\/loading-overlay"/.test(text) ? [path] : [];
      }),
    )
  ).flat();
  assert.equal(importers.length, 1);
  assert.match(importers[0], /experience-shell\.tsx$/);
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
