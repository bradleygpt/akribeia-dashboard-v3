/**
 * Registers the worker-runtime resolution hooks for the node:test run.
 * Loaded via `node --import ./tests/register-worker-hooks.mjs`, so the hooks are installed
 * before any suite imports the built Worker bundle.
 */
import { register } from "node:module";

register(new URL("./worker-runtime-hooks.mjs", import.meta.url));
