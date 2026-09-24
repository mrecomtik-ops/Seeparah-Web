// Replacement for the @lovable.dev/vite-tanstack-config-based config,
// reconstructed by reading that package's actual source
// (node_modules/@lovable.dev/vite-tanstack-config/dist/index.js,
// defineConfig()) line by line — every plugin/option below is copied from
// what that function does OUTSIDE a Lovable sandbox (isSandbox branches,
// which never ran on Netlify or a developer's own machine even with the
// old config in place, are omitted deliberately, not by oversight — see
// the bottom of this file for the full list of what was intentionally
// left out and why each one is safe to leave out).
//
// Requires `lightningcss` as a direct devDependency (previously pulled in
// transitively via @lovable.dev/vite-tanstack-config).

import { defineConfig, loadEnv, mergeConfig } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import tailwindcss from "@tailwindcss/vite";
import tsConfigPaths from "vite-tsconfig-paths";
import viteReact from "@vitejs/plugin-react";
import { nitro } from "nitro/vite";

export default defineConfig(async ({ command, mode }) => {
  const isDevBuild = command === "build" && mode === "development";

  const plugins = [
    tailwindcss(),
    tsConfigPaths({ projects: ["./tsconfig.json"] }),
    // Redirect TanStack Start's bundled server entry to src/server.ts (the
    // app's own SSR error wrapper) — matches the previous vite.config.ts's
    // one piece of non-default config exactly.
    tanstackStart({
      importProtection: {
        behavior: "error",
        client: { files: ["**/server/**"], specifiers: ["server-only"] },
      },
      server: { entry: "server" },
    }),
    viteReact(),
  ];

  // Nitro only runs at build time. `defaultPreset: "cloudflare-module"` is
  // a FALLBACK only — Nitro's own preset resolver (auto-detecting
  // NETLIFY=true, etc.) takes precedence whenever it can determine a
  // preset any other way. This exactly matches the previous build's
  // behavior outside Lovable's own sandbox (confirmed by reading the real
  // package source — the isSandbox branch that hard-forces
  // cloudflare-module never executed on Netlify or a local machine even
  // with the old config).
  if (command === "build") {
    plugins.push(nitro({ defaultPreset: "cloudflare-module" }));
  }

  // Reproduces the removed package's own VITE_* -> import.meta.env.VITE_*
  // define step for exact parity. Vite already exposes VITE_-prefixed env
  // vars via import.meta.env natively without this — this block is here
  // only to avoid any behavioral difference from the previous build.
  const loadedEnv = loadEnv(mode, process.cwd(), "VITE_");
  const envDefine: Record<string, string> = {};
  for (const [key, value] of Object.entries(loadedEnv)) {
    envDefine[`import.meta.env.${key}`] = JSON.stringify(value);
  }

  return mergeConfig(
    {
      define: envDefine,
      ...(isDevBuild
        ? {
            environments: {
              client: { define: { "process.env.NODE_ENV": JSON.stringify("development") } },
            },
            esbuild: { keepNames: true },
          }
        : {}),
      css: { transformer: "lightningcss" as const },
      resolve: {
        alias: { "@": `${process.cwd()}/src` }, // redundant with tsconfig.json's own "@/*" path (kept for parity)
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
      plugins,
    },
    {},
  );
});

// DELIBERATELY OMITTED, and why:
//   - @tanstack/devtools-vite (dev-only devtools panel) — a nice-to-have,
//     not build-critical; add back with `import { devtools } from
//     "@tanstack/devtools-vite"` inside an `if (mode === "development")`
//     block if wanted, same as the original package does.
//   - devServerFnErrorLogger / devSsrErrorLogger — Lovable-internal dev-
//     time console loggers; this app already has its own SSR error
//     handling in src/server.ts (the h3-swallowed-error normalizer),
//     which is unrelated and unaffected either way.
//   - lovableAssetsProxyPlugin (registered on `command === "serve"`, i.e.
//     `npm run dev`) — verify local dev serving still works with this
//     config; if any asset fails to load only in `npm run dev`, this is
//     the first thing to look at.
//   - hmrGatePlugin, devServerBridgePlugin, lovableBuildErrorDiagnostics,
//     prerenderPreviewShim(+Cleanup), stripRedundantNodejsCompatFlag,
//     bundledDevCssUrlShim — every one of these is explicitly gated on
//     `isSandbox` in the real source (confirmed by reading it) and never
//     ran outside Lovable's own build/dev environment even before this
//     change — omitting them changes nothing about the Netlify/local build.
