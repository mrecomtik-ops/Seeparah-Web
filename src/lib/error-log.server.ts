// Server-only. Structured, redacted error events for the admin health page.
// This is deliberately narrow: a fixed set of fields, a short message, and a
// bounded context blob — never a raw stack trace with secrets in it, never
// a full manuscript, never a token.
import type { Json } from "@/integrations/supabase/types";

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

const SECRET_PATTERN = /(key|token|secret|password|credential|authorization)/i;

function redactContext(context: Record<string, unknown> | undefined): Record<string, unknown> {
  if (!context) return {};
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(context)) {
    if (SECRET_PATTERN.test(k)) {
      out[k] = "[redacted]";
    } else if (typeof v === "string") {
      out[k] = v.slice(0, 300);
    } else {
      out[k] = v;
    }
  }
  // JSON round-trip guarantees this is actually jsonb-safe.
  return JSON.parse(JSON.stringify(out)) as Record<string, unknown>;
}

export interface LogErrorEventParams {
  severity: "info" | "warning" | "error" | "critical";
  code: string;
  message: string;
  requestId?: string;
  userId?: string;
  jobId?: string;
  bookId?: string;
  clientVersion?: string;
  retryable?: boolean;
  context?: Record<string, unknown>;
}

export async function logErrorEvent(params: LogErrorEventParams): Promise<void> {
  try {
    const db = await admin();
    await db.from("error_events").insert({
      severity: params.severity,
      code: params.code,
      message: params.message.slice(0, 1000),
      request_id: params.requestId ?? null,
      user_id: params.userId ?? null,
      job_id: params.jobId ?? null,
      book_id: params.bookId ?? null,
      client_version: params.clientVersion ?? null,
      retryable: params.retryable ?? false,
      context: redactContext(params.context) as Json,
    });
  } catch (error) {
    // The error pipeline itself must never throw into the caller's flow.
    console.error("[error-log] failed to record error event", error);
  }
}
