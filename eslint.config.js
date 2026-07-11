"use strict";

/**
 * Flat ESLint config (ESLint 9+).
 * - src/ and tests/ are Node CommonJS.
 * - public/ is browser code.
 * - Generated/vendored/Python artifacts are ignored.
 */

const js = require("@eslint/js");
const prettier = require("eslint-config-prettier");

const NODE_GLOBALS = {
  require: "readonly",
  module: "writable",
  process: "readonly",
  console: "readonly",
  Buffer: "readonly",
  __dirname: "readonly",
  setTimeout: "readonly",
  clearTimeout: "readonly",
  URL: "readonly",
  fetch: "readonly",
  AbortController: "readonly",
};

const BROWSER_GLOBALS = {
  window: "readonly",
  document: "readonly",
  fetch: "readonly",
  URL: "readonly",
  localStorage: "readonly",
  requestAnimationFrame: "readonly",
  performance: "readonly",
  setTimeout: "readonly",
  clearTimeout: "readonly",
  console: "readonly",
};

module.exports = [
  {
    ignores: ["node_modules/**", ".venv/**", ".cache/**", "**/*.py", "coverage/**"],
  },
  js.configs.recommended,
  {
    files: ["src/**/*.js", "tests/**/*.js", "*.config.js"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "commonjs",
      globals: NODE_GLOBALS,
    },
    rules: {
      "no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
      "no-console": "off",
    },
  },
  {
    files: ["public/**/*.js"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "script",
      globals: BROWSER_GLOBALS,
    },
    rules: {
      "no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
    },
  },
  prettier,
];
