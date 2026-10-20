// @ts-check

import js from "@eslint/js";
import { defineConfig } from "eslint/config";
import tseslint from "typescript-eslint";

export default defineConfig([
  {
    ignores: [
      "**/dist/**",
      "**/coverage/**",
      "**/.next/**",
      "**/.vinext/**",
      "**/.wrangler/**",
      "v2-baseline-worktree/**",
      // Vendored third-party code, kept byte-close to upstream on purpose so its patch stays
      // reviewable (vendor/braces/AKRIBEIA_PATCH.md). Restyling it would bury the fix.
      "vendor/**",
    ],
  },
  {
    files: ["**/*.{js,cjs,mjs,ts,cts,mts}"],
    extends: [js.configs.recommended, tseslint.configs.recommended],
    linterOptions: {
      reportUnusedDisableDirectives: "error",
    },
  },
  {
    files: ["**/*.node.mjs"],
    languageOptions: {
      globals: {
        process: "readonly",
        Request: "readonly",
        Response: "readonly",
        URL: "readonly",
      },
    },
  },
]);
