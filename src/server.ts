import "./lib/error-capture";

import { consumeLastCapturedError } from "./lib/error-capture";
import { renderErrorPage } from "./lib/error-page";

type ServerEntry = {
  fetch: (request: Request, env: unknown, ctx: unknown) => Promise<Response> | Response;
};

type ScheduledContext = {
  waitUntil(promise: Promise<unknown>): void;
};

type WorkerEnv = {
  COVER_UPLOAD_TOKEN?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
  SUPABASE_URL?: string;
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
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://accounts.google.com https://oauth2.googleapis.com",
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

async function handleTemporaryCoverUpload(request: Request, rawEnv: unknown) {
  const env = rawEnv as WorkerEnv;
  const expectedToken = env.COVER_UPLOAD_TOKEN;
  const suppliedToken = request.headers.get("x-cover-upload-token");
  if (!expectedToken || suppliedToken !== expectedToken) {
    return new Response("Unauthorized", { status: 401 });
  }

  const path = request.headers.get("x-cover-path") ?? "";
  if (!/^generated\/SP-CAND-\d{4}\/variant_\d{2}\.png$/.test(path)) {
    return new Response("Invalid path", { status: 400 });
  }

  if ((request.headers.get("content-type") ?? "") !== "image/png") {
    return new Response("PNG required", { status: 415 });
  }

  const body = await request.arrayBuffer();
  if (body.byteLength < 100 || body.byteLength > 5 * 1024 * 1024) {
    return new Response("Invalid file size", { status: 413 });
  }

  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
  const supabaseUrl = env.SUPABASE_URL ?? "https://wxldqxuxpjurttspbxok.supabase.co";
  if (!serviceKey) return new Response("Storage credential unavailable", { status: 503 });

  const storageResponse = await fetch(
    `${supabaseUrl}/storage/v1/object/book-covers/${path}`,
    {
      method: "POST",
      headers: {
        apikey: serviceKey,
        authorization: `Bearer ${serviceKey}`,
        "content-type": "image/png",
        "x-upsert": "true",
        "cache-control": "86400",
      },
      body,
    },
  );

  if (!storageResponse.ok) {
    const message = await storageResponse.text();
    console.error("[cover-upload] storage error", storageResponse.status, message);
    return new Response("Storage upload failed", { status: 502 });
  }

  return Response.json({ ok: true, path, bytes: body.byteLength });
}

export default {
  async fetch(request: Request, env: unknown, ctx: unknown) {
    try {
      const url = new URL(request.url);
      if (url.pathname === "/_internal/cover-upload" && request.method === "POST") {
        return await handleTemporaryCoverUpload(request, env);
      }
      if (url.pathname === "/sitemap.xml") {
        const { buildLiveSitemapResponse } = await import("./lib/sitemap.server");
        return withSecurityHeaders(await buildLiveSitemapResponse());
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

  scheduled(_event: unknown, _env: unknown, ctx: ScheduledContext) {
    ctx.waitUntil(runScheduledTranslationWork());
  },
};
