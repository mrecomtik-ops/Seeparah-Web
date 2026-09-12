import { defineConfig } from "vitest/config";
import path from "node:path";

// Standalone from vite.config.ts (which wraps @lovable.dev/vite-tanstack-config
// and isn't meant to carry test-runner config) — just enough to resolve the
// "@" alias for the pure-logic modules under test.
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
