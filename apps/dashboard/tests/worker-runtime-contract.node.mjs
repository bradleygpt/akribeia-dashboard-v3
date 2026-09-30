/**
 * Guards the assumption that makes the `cloudflare:` stub in worker-runtime-hooks.node.mjs
 * faithful: the built bundle imports the workerd namespace but never reads from it.
 *
 * If a future vinext/plugin-rsc build starts dereferencing it, the stub would hand back
 * undefined instead of a real binding and every suite would keep passing against a Worker
 * that is broken in production. That must fail here, loudly, rather than at the edge.
 */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const BUNDLE = new URL("../dist/server/index.js", import.meta.url);

test("the cloudflare: worker namespace import is present but unused", async () => {
  const source = await readFile(BUNDLE, "utf8");
  const namespaceImport =
    /import\s*\*\s*as\s*([A-Za-z_$][\w$]*)\s*from\s*"cloudflare:workers"/.exec(source);

  if (namespaceImport === null) {
    // The import disappeared: the stub is now unnecessary but harmless. Assert no OTHER
    // form of cloudflare: import slipped in that the stub would not cover.
    const otherForms = source.match(/from\s*"cloudflare:[^"]*"/g) ?? [];
    for (const form of otherForms) {
      assert.match(
        form,
        /"cloudflare:workers"/,
        `unrecognised cloudflare: import ${form} — extend worker-runtime-hooks.node.mjs`,
      );
    }
    return;
  }

  const alias = namespaceImport[1];
  const dereferences = source.match(new RegExp(`\\b${alias}\\s*\\.`, "g")) ?? [];
  assert.equal(
    dereferences.length,
    0,
    `the bundle now reads ${dereferences.length} member(s) off the cloudflare:workers ` +
      `namespace (${alias}). The empty stub in worker-runtime-hooks.node.mjs would return ` +
      `undefined for those, so the suites would pass against a broken Worker. Provide a ` +
      `real binding for each member instead of widening the stub.`,
  );
});
