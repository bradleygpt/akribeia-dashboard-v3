# Vendored braces 3.0.3 + nesting-depth limit

**Why this exists.** `GHSA-vfj7-8cjw-p6xm` (published 2026-09-18, high): braces is vulnerable
to stack-exhaustion denial of service through deeply nested patterns, for every version
`<= 3.0.3`, with **no patched release** (`first_patched_version: NONE` as of 2026-10-07).
It reaches this repo by one dev-only path:

```
vinext 1.0.x -> vite-plugin-commonjs 0.10.4 -> vite-plugin-dynamic-import 1.6.0
             -> fast-glob 3.3.3 -> micromatch 4.0.8 -> braces 3.0.3
```

vinext 1.0.1 and vite-plugin-commonjs 0.10.4 (both latest) keep the chain, so no upgrade
removes it. The project's audit standard is "fix at the root, no widening exceptions", so
instead of an audit exception the package is vendored here with the fix applied.

**What was measured on upstream 3.0.3** (`braces(p, {expand: true})`, nesting `n`):

| stack | result |
|---|---|
| default (984 KB) | no exhaustion up to n = 4,990 (the 10,000-char `maxLength` caps n below ~5,000) |
| 300 KB | stack exhausted at n = 2,000 |
| 100 KB | stack exhausted at n = 512 |

So the defect is real wherever the stack is constrained (worker threads, embedded runtimes),
even though our default-stack build is not exposed.

**The patch** (three hunks, `lib/constants.js` + `lib/parse.js`): a `MAX_DEPTH` of 128 checked
where the parser increments nesting depth, throwing `SyntaxError` -- the same shape as the
existing `maxLength` guard, including that an option (`maxDepth`) may only LOWER the cap.
Bounding parse depth bounds the recursion in the `compile`/`expand` AST walkers.

Verified before adoption: output identical to upstream for all 30 pattern x mode cases tested;
depth 128 accepted, 129 rejected; the depth-512 input that exhausts upstream's 100 KB stack
ends in a clean `SyntaxError` instead.

**How it is wired.** `vendor/braces` is an npm workspace (root `package.json`), so npm links
it into `node_modules/braces` and micromatch's `braces@^3.0.3` resolves to it. Its manifest
keeps runtime deps only (`fill-range`); the upstream dev tooling (mocha, gulp-format-md, ...)
is stripped so it does not enter the tree. `scripts/security-audit.mjs` fails closed if the
link or the patch is ever lost.

**Remove this** when braces publishes a release that fixes `GHSA-vfj7-8cjw-p6xm`: drop the
workspace entry and this directory, let npm resolve braces from the registry, and replace the
vendored-braces guard in `scripts/security-audit.mjs` with a version floor.
