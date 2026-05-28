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
  },
});
