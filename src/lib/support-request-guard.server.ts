// Server-only. Shared abuse-protection primitives for the public support
// and copyright forms — kept separate from src/lib/admin/support.server.ts
// (which is about ticket storage/admin actions) since these are specifically
// about defending the public submission path.
import { createHash } from "node:crypto";
import { getRequest } from "@tanstack/react-start/server";

/** Hashes the caller's IP with SUPPORT_RATE_LIMIT_SALT — a value distinct
 * from the legacy SUPPORT_RATE_LIMIT_PEPPER already used by the older
 * "can't sign in" anonymous report path (src/lib/admin/support.functions.ts),
 * kept separate deliberately so introducing this doesn't change that
 * existing, already-working flow's behavior at all. Never returns or logs
 * the raw IP. */
export function hashClientIpForSupportForms(): string {
  const request = getRequest();
  const forwardedFor = request?.headers.get("x-forwarded-for");
  const ip = forwardedFor?.split(",")[0]?.trim() || request?.headers.get("x-real-ip") || "unknown";
  const salt = process.env["SUPPORT_RATE_LIMIT_SALT"] ?? "";
  return createHash("sha256").update(`${salt}:${ip}`).digest("hex");
}

/** True if the request's Origin header (when present) matches this
 * deployment's own host. A fetch-based POST from a real browser always
 * sends Origin; a request with a PRESENT but mismatched Origin is rejected.
 * A request with no Origin header at all is allowed through — Zod
 * validation, the honeypot, and rate limiting are the primary defenses;
 * this is one additional layer, not the only one, and rejecting on absence
 * risks false positives from legitimate older clients. */
export function isSameOriginRequest(): boolean {
  const request = getRequest();
  if (!request) return true;
  const origin = request.headers.get("origin");
  if (!origin) return true;
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  if (!host) return true;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

/** A honeypot field a bot fills and a human never sees. Callers must accept
 * a submission with a filled honeypot WITHOUT a validation error (so a bot
 * can't learn the field is being checked) and simply drop it — see
 * createPublicReport in support.functions.ts for the established pattern
 * this follows. */
export function isHoneypotTripped(honeypot: string | undefined): boolean {
  return !!honeypot && honeypot.trim().length > 0;
}
