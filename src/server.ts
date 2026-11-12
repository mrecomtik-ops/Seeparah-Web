import "./lib/error-capture";

import { consumeLastCapturedError } from "./lib/error-capture";
import { renderErrorPage } from "./lib/error-page";

type ServerEntry = {
  fetch: (request: Request, env: unknown, ctx: unknown) => Promise<Response> | Response;
};

type ScheduledContext = {
  waitUntil(promise: Promise<unknown>): void;
};

async function runScheduledTranslationWork() {
  try {
    const { processDueJobs } = await import("./lib/translation.server");
    const results = await processDueJobs(3, 3);
    if (results.length > 0) {
      console.log("[translation-cron]", JSON.stringify(results));
    }
  } catch (error) {
    console.error("[translation-cron] scheduled processing failed", error);
  }
}

/** Cloudflare cron must avoid loading both large Gutenberg import modules
 * when editorial operations have paused the importer. This is a cheap,
 * fail-closed DB gate: it never re-enables acquisition or skips any content,
 * provenance or rights validation when the importer is later resumed. */
async function runScheduledGutenbergWork(): Promise<void> {
  try {
    const { supabaseAdmin } = await import("./integrations/supabase/client.server");
    // The importer settings table was added after the generated public
    // Supabase client types, so narrow this read explicitly (fail closed).
    type SettingsClient = { from(table: "gutenberg_autopilot_settings"): {
      select(columns: "enabled"): { eq(column: "id", value: number): {
        maybeSingle(): Promise<{
          data: { enabled: boolean } | null;
          error: { message: string } | null;
        }>;
      } };
    } };
    const settingsDb = supabaseAdmin as unknown as SettingsClient;
    const { data, error } = await settingsDb.from("gutenberg_autopilot_settings")
      .select("enabled").eq("id", 1).maybeSingle();
    if (error) throw new Error(error.message);
    if (data?.enabled !== true) return;
    const { runGutenbergAutopilotOnce } = await import("./lib/admin/gutenberg-autopilot.server");
    await runGutenbergAutopilotOnce();
    const { processGutenbergImportQueueOnce } = await import("./lib/admin/gutenberg-fast-import.server");
    await processGutenbergImportQueueOnce();
  } catch (error) {
    console.error("[gutenberg] scheduled acquisition error", error);
  }
}

/** Independent 75k+ Gutenberg metadata discovery. This NEVER changes a
 * book's publication, rights, edition, or reader source, and does not require
 * enabling the provenance-gated publication importer. */
async function runScheduledGutenbergDiscovery(): Promise<void> {
  try {
    const { supabaseAdmin } = await import("./integrations/supabase/client.server");
    const client = supabaseAdmin as any;
    const { data, error } = await client.from("gutenberg_discovery_state")
      .select("enabled").eq("id", 1).maybeSingle();
    if (error || data?.enabled !== true) return;
    const { runGutenbergFullDiscoveryOnce } =
      await import("./lib/admin/gutenberg-full-catalog.server");
    await runGutenbergFullDiscoveryOnce();
  } catch (error) {
    console.error("[gutenberg-discovery] scheduled metadata inventory error", error);
  }
}

let serverEntryPromise: Promise<ServerEntry> | undefined;

async function getServerEntry(): Promise<ServerEntry> {
  if (!serverEntryPromise) {
    serverEntryPromise = import("@tanstack/react-start/server-entry").then(
      (m) => (m.default ?? m) as ServerEntry,
    );
  }
  return serverEntryPromise;
}

const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "form-action 'self' https://accounts.google.com",
  "script-src 'self' 'unsafe-inline'",
  // CSP3: never permit HTML event-handler attributes even while the
  // TanStack SSR hydration stream still needs its inline bootstrapping.
  "script-src-attr 'none'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://accounts.google.com https://oauth2.googleapis.com https://raw.githubusercontent.com",
  "frame-src https://accounts.google.com",
  "worker-src 'self' blob:",
  "upgrade-insecure-requests",
].join("; ");

function withSecurityHeaders(response: Response): Response {
  const headers = new Headers(response.headers);
  headers.set("Content-Security-Policy", CONTENT_SECURITY_POLICY);
  headers.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("X-Frame-Options", "DENY");
  headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  headers.set("Cross-Origin-Opener-Policy", "same-origin-allow-popups");
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

// h3 swallows in-handler throws into a normal 500 Response with body
// {"unhandled":true,"message":"HTTPError"} — try/catch alone never fires for those.
async function normalizeCatastrophicSsrResponse(response: Response): Promise<Response> {
  if (response.status < 500) return response;
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return response;

  const body = await response.clone().text();
  if (!isH3SwallowedErrorBody(body)) return response;

  console.error(consumeLastCapturedError() ?? new Error(`h3 swallowed SSR error: ${body}`));
  return new Response(renderErrorPage(), {
    status: 500,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

function isH3SwallowedErrorBody(body: string): boolean {
  try {
    const payload = JSON.parse(body) as { unhandled?: unknown; message?: unknown };
    return payload.unhandled === true && payload.message === "HTTPError";
  } catch {
    return false;
  }
}

export default {
  async fetch(request: Request, env: unknown, ctx: unknown) {
    try {
      const url = new URL(request.url);
      // Preserve the established PNG favicon for clients requesting the
      // legacy favicon.ico route; never return a misleading HTML 404.
      if (url.pathname === "/favicon.ico") {
        return withSecurityHeaders(new Response(null, {
          status: 308, headers: { Location: "/favicon.png" },
        }));
      }
      if (url.pathname === "/api/catalog-qa-public.json") {
        const { servePublicCatalogQa } = await import("./lib/catalog-qa-public.server");
        return withSecurityHeaders(await servePublicCatalogQa(request));
      }
      if (url.pathname === "/api/platform-usage") {
        const { handlePlatformUsageRequest } = await import("./lib/platform-usage.server");
        return withSecurityHeaders(await handlePlatformUsageRequest(request, env));
      }
      if (url.pathname === "/sitemap.xml") {
        const { getSitemapIndex } = await import("./lib/sitemap-partitions.server");
        return withSecurityHeaders(await getSitemapIndex());
      }
      if (url.pathname === "/sitemaps/static.xml") {
        const { getStaticSitemap } = await import("./lib/sitemap-partitions.server");
        return withSecurityHeaders(getStaticSitemap());
      }
      const partition = /^\/sitemaps\/(books|research)-([1-9]\d{0,2})\.xml$/.exec(url.pathname);
      if (partition) {
        const { getSitemapPartition } = await import("./lib/sitemap-partitions.server");
        const kind = partition[1] === "books" ? "books" : "research";
        return withSecurityHeaders(await getSitemapPartition(kind, Number(partition[2])));
      }

      const handler = await getServerEntry();
      const response = await handler.fetch(request, env, ctx);
      return withSecurityHeaders(await normalizeCatastrophicSsrResponse(response));
    } catch (error) {
      console.error(error);
      return withSecurityHeaders(
        new Response(renderErrorPage(), {
          status: 500,
          headers: { "content-type": "text/html; charset=utf-8" },
        }),
      );
    }
  },

  scheduled(_event: unknown, env: unknown, ctx: ScheduledContext) {
    ctx.waitUntil(runScheduledTranslationWork());
    // Durable autopilot: refill bounded Gutenberg batches toward the
    // database-configured target, subject to strict rights and structure gates.
    // Never count reviews/errors as published and never modify existing titles.
    // Fetching one queued book is deliberately sequential to avoid overlapping
    // database writes or unbounded external mirror traffic.
    ctx.waitUntil(runScheduledGutenbergWork());
    ctx.waitUntil(runScheduledGutenbergDiscovery());
    const utcNow = new Date();
    // Execute data retention once per UTC day, never every minute.
    if (utcNow.getUTCHours() === 2 && utcNow.getUTCMinutes() === 30) {
      ctx.waitUntil(import("./lib/platform-usage.server")
        .then(({ prunePlatformUsage }) => prunePlatformUsage(env))
        .catch((error) => console.error("[usage] retention error", error)));
    }
  },
};
