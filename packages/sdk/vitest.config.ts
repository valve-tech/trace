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
      thresholds: {
        statements: 95,
        branches: 90,
        functions: 95,
        lines: 95,
      },
    },
  },
});
