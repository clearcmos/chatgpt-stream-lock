import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.js"],
    coverage: {
      provider: "v8",
      // Coverage is gated on the pure module only. guard.js, background.js,
      // and popup.js are browser-bound (DOM, chrome.*, service-worker
      // lifecycle) and are exercised against the live extension instead; see
      // CLAUDE.md "Testing" for the exemption rationale.
      include: ["lib.js"],
      thresholds: {
        lines: 80,
        branches: 80,
      },
    },
  },
});
