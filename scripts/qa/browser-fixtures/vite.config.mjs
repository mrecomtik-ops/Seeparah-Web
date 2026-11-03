import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.dirname(fileURLToPath(import.meta.url));
const src = path.resolve(root, "../../../src");
export default defineConfig({
  root,
  plugins: [react()],
  // A browser-only, isolated fixture: real presentation components and
  // real shelf algorithms, but in-memory Supabase transport and synthetic
  // roles. NEVER points the test harness at production credentials.
  resolve: {
    alias: [
      { find: "@/integrations/supabase/client", replacement: path.join(root, "mock-supabase.ts") },
      { find: "@/lib/data", replacement: path.join(root, "mock-data.ts") },
      { find: "@/lib/library", replacement: path.join(root, "mock-library.ts") },
      { find: "@/lib/use-auth", replacement: path.join(root, "mock-auth.ts") },
      { find: "@", replacement: src },
    ],
    dedupe: ["react", "react-dom", "react/jsx-runtime", "@tanstack/react-query"],
  },
  server: { host: "127.0.0.1", port: 4179, strictPort: true },
});
