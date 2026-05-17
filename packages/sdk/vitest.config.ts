import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.{ts,tsx}"],
    // jsdom is needed for React Testing Library tests; node test files
    // don't pay a meaningful cost from running under jsdom.
    environment: "jsdom",
    globals: false,
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      include: ["src/**/*.{ts,tsx}"],
      // Re-export barrels and pure type files have no logic to cover.
      exclude: ["src/**/index.ts", "src/types.ts"],
      all: true,
      // 100% across the board is a hard gate. Coverage degradations fail
      // the test suite (and therefore CI). Policy: every change to src/
      // ships tests that maintain 100%. If a path is genuinely impossible
      // to exercise, extract it into a pure helper that CAN be tested
      // directly (see src/util/errors.ts for the prior example).
      thresholds: {
        statements: 100,
        branches: 100,
        functions: 100,
        lines: 100,
      },
    },
  },
});
