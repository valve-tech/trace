import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 11800,
    host: true, // bind to 0.0.0.0 so the dev server is reachable from other devices on the LAN
    proxy: {
      "/health": {
        target: "http://localhost:10100",
        changeOrigin: true,
      },
      "/api": {
        target: "http://localhost:10100",
        changeOrigin: true,
      },
      "/rpc": {
        target: "http://localhost:10100",
        changeOrigin: true,
      },
      "/ws": {
        target: "ws://localhost:10100",
        ws: true,
      },
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test-setup.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      include: ["src/**/*.{ts,tsx}"],
      // Test scaffolding, type-only files, and the app entry are
      // excluded from the metric — they have no logic to cover.
      exclude: [
        "src/**/*.test.{ts,tsx}",
        "src/**/_test-utils.tsx",
        "src/test-setup.ts",
        "src/main.tsx",
        "src/vite-env.d.ts",
      ],
    },
  },
});
