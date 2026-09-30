/**
 * Module-resolution hooks so the built Worker bundle can be imported under plain Node.
 *
 * WHY THIS EXISTS. The suites below load `dist/server/index.js` directly and call
 * `worker.fetch(...)`. From vinext 1.0.0 the bundle carries a top-level
 * `import * as ns from "cloudflare:workers"`, a workerd-only scheme that Node's default
 * ESM loader rejects outright (ERR_UNSUPPORTED_ESM_URL_SCHEME), so every one of those
 * suites failed to even load. Node has no built-in resolution for `cloudflare:`.
 *
 * WHY AN EMPTY STUB IS FAITHFUL, NOT A GUESS. The bundle imports that namespace and never
 * dereferences it -- verified at zero `ns.<member>` references in the emitted bundle. It is
 * a dead import the bundler hoists, so supplying an empty module cannot change any code
 * path the tests exercise. This substitutes nothing that is actually used, and it weakens
 * no assertion: every suite asserts exactly what it asserted before.
 *
 * THE RISK THIS WOULD OTHERWISE CARRY, AND THE GUARD FOR IT. If a later build DID start
 * using a member, `ns.foo` on an empty namespace yields undefined rather than throwing --
 * the stub would quietly lie and the tests would pass against a Worker that is broken in
 * production. tests/worker-runtime-contract.node.mjs asserts the import stays unused, so
 * that day fails closed here instead of at the edge.
 */
const STUB_SCHEME = "akribeia-worker-stub:";

export async function resolve(specifier, context, next) {
  if (specifier.startsWith("cloudflare:")) {
    return { url: `${STUB_SCHEME}${specifier}`, shortCircuit: true };
  }
  return next(specifier, context);
}

export async function load(url, context, next) {
  if (url.startsWith(STUB_SCHEME)) {
    return { format: "module", source: "export {};", shortCircuit: true };
  }
  return next(url, context);
}
