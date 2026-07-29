// @ts-check

import js from "@eslint/js";
import { defineConfig } from "eslint/config";
import tseslint from "typescript-eslint";

export default defineConfig([
  {
    ignores: ["**/dist/**", "**/coverage/**", "v2-baseline-worktree/**"],
  },
  {
    files: ["**/*.{js,cjs,mjs,ts,cts,mts}"],
    extends: [js.configs.recommended, tseslint.configs.recommended],
    linterOptions: {
      reportUnusedDisableDirectives: "error",
    },
  },
]);
