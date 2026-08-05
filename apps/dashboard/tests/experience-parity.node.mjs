import assert from "node:assert/strict";
import { access, readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

test("keeps the approved V2 experience outside the server-rendered research tree", async () => {
  const [layout, shell, css, experienceCss, packageJson] = await Promise.all([
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/experience-shell.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../app/experience.css", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
  ]);

  assert.match(layout, /<ExperienceShell\s*\/>\s*\{children\}/);
  assert.doesNotMatch(layout, /<ExperienceShell>\{children\}<\/ExperienceShell>/);
  assert.match(shell, /export function ExperienceShell\(\)/);
  assert.doesNotMatch(shell, /ReactNode/);
  assert.match(shell, /function describeDestination\(pathname: string\)/);
  assert.match(shell, /className="akribeia-route-transition"/);
  assert.match(shell, /data-route-transition="active"/);
  assert.match(shell, /sameDocument/);
  assert.match(shell, /event\.preventDefault\(\)/);
  assert.match(shell, /window\.location\.assign\(destination\.href\)/);
  assert.match(shell, /prefers-reduced-motion: reduce/);

  assert.match(experienceCss, /body\.akribeia-experience-ready/);
  assert.match(experienceCss, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(packageJson, /experience-worker-safe\.node\.mjs/);

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

  const sourceRoots = [
    fileURLToPath(new URL("../app", import.meta.url)),
    fileURLToPath(new URL("../worker", import.meta.url)),
  ];
  const sourceText = (
    await Promise.all(
      sourceRoots.flatMap(async (root) =>
        Promise.all((await sourceFiles(root)).map((path) => readFile(path, "utf8"))),
      ),
    )
  )
    .flat()
    .join("\n");
  assert.doesNotMatch(sourceText, /loading-overlay|route-loading/);
});

test("does not stream duplicate fallbacks around the large research routes", async () => {
  const removedFallbacks = [
    "../app/loading-overlay.tsx",
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
