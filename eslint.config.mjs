import js from "@eslint/js";
import globals from "globals";

export default [
  { ignores: ["node_modules/", "coverage/", "_metadata/"] },
  js.configs.recommended,
  {
    // lib.js declares the StreamMode global and carries a CommonJS shim for
    // the Node test runner.
    files: ["lib.js"],
    languageOptions: {
      sourceType: "script",
      globals: {
        ...globals.browser,
        module: "readonly",
      },
    },
  },
  {
    // Extension sources are classic scripts, not modules: they consume the
    // StreamMode global that lib.js defines (manifest content_scripts order,
    // popup script order, importScripts in the worker).
    files: ["guard.js", "popup.js"],
    languageOptions: {
      sourceType: "script",
      globals: {
        ...globals.browser,
        ...globals.webextensions,
        StreamMode: "readonly",
      },
    },
  },
  {
    files: ["background.js"],
    languageOptions: {
      sourceType: "script",
      globals: {
        ...globals.serviceworker,
        ...globals.webextensions,
        StreamMode: "readonly",
      },
    },
  },
  {
    files: ["**/*.test.js", "*.mjs"],
    languageOptions: {
      sourceType: "module",
      globals: globals.node,
    },
  },
];
