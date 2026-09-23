// Cloudflare Workers build/dev config — the CURRENT official TanStack
// Start + Cloudflare architecture: @cloudflare/vite-plugin building the
// SSR environment directly, no Nitro involved (Nitro's own Cloudflare
// preset is the OLD approach; the current TanStack Start hosting docs
// direct Cloudflare deployments at this plugin instead).
//
// Deliberately a SEPARATE file from vite.config.ts, not a conditional
// branch inside it: vite.config.ts (Nitro, `defaultPreset:
// "cloudflare-module"` as a fallback, real preset resolution normally
// picks Netlify's own preset there) is still what `npm run build` /
// netlify.toml use for the existing, still-live Netlify deployment. This
// file is additive — it does not change what `npm run build` produces,
// so the Netlify path is untouched. Used via `npm run build:cloudflare`
// / `npm run dev:cloudflare` (both pass `-c vite.config.cloudflare.ts`).
//
// Mirrors vite.config.ts's non-Nitro plugin choices (tailwind, tsconfig
// paths, the app's `server: { entry: "server" }` redirect to
// src/server.ts, React) so behavior stays identical between the two
// deploy targets everywhere except the SSR bundler itself.

import { defineConfig, loadEnv, mergeConfig } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import { cloudflare } from "@cloudflare/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import tsConfigPaths from "vite-tsconfig-paths";
import viteReact from "@vitejs/plugin-react";

export default defineConfig(async ({ mode }) => {
  // Reproduces vite.config.ts's own VITE_* -> import.meta.env.VITE_*
  // define step for exact parity between the two build targets — see
  // that file's own comment for why this is otherwise redundant with
  // Vite's native import.meta.env exposure.
  const loadedEnv = loadEnv(mode, process.cwd(), "VITE_");
  const envDefine: Record<string, string> = {};
  for (const [key, value] of Object.entries(loadedEnv)) {
    envDefine[`import.meta.env.${key}`] = JSON.stringify(value);
  }

  return mergeConfig(
    {
      define: envDefine,
      css: { transformer: "lightningcss" as const },
      resolve: {
        alias: { "@": `${process.cwd()}/src` },
        dedupe: [
          "react",
          "react-dom",
          "react/jsx-runtime",
          "react/jsx-dev-runtime",
          "@tanstack/react-query",
          "@tanstack/query-core",
        ],
      },
      optimizeDeps: {
        include: [
          "react",
          "react-dom",
          "react-dom/client",
          "react/jsx-runtime",
          "react/jsx-dev-runtime",
        ],
        ignoreOutdatedRequests: true,
      },
      plugins: [
        // Must come before tanstackStart()/viteReact() — the current
        // official TanStack Start Cloudflare setup requires this
        // ordering (confirmed against the current TanStack Start hosting
        // docs, not an older/cached example). `viteEnvironment: { name:
        // "ssr" }` is the documented framework-specific option: it tells
        // the plugin which Vite environment TanStack Start's SSR bundle
        // lives in, rather than the plugin's own single-Worker default.
        cloudflare({ viteEnvironment: { name: "ssr" } }),
        tailwindcss(),
        tsConfigPaths({ projects: ["./tsconfig.json"] }),
        tanstackStart({
          importProtection: {
            behavior: "error",
            client: { files: ["**/server/**"], specifiers: ["server-only"] },
          },
          server: { entry: "server" },
        }),
        viteReact(),
      ],
    },
    {},
  );
});
