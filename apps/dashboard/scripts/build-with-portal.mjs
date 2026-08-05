import { access } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import process from "node:process";
import { fileURLToPath, URL } from "node:url";

const requiredPortalSources = [
  new URL("../../portal/src/LandingPortal.tsx", import.meta.url),
  new URL("../../portal/src/landing/Scene.tsx", import.meta.url),
  new URL("../../portal/src/landing/Suns.tsx", import.meta.url),
  new URL("../../portal/src/landing/Planets.tsx", import.meta.url),
];

await Promise.all(requiredPortalSources.map((source) => access(source)));

const npmCli = process.env.npm_execpath;
if (!npmCli) throw new Error("npm_execpath is required to run the packaged portal build.");

const result = spawnSync(process.execPath, [npmCli, "run", "build"], {
  cwd: fileURLToPath(new URL("..", import.meta.url)),
  stdio: "inherit",
  shell: false,
});

if (result.error) throw result.error;
process.exit(result.status ?? 1);
