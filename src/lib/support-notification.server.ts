// Server-only. Sends the internal "a new support/legal request arrived"
// notification email via the Resend HTTPS API — no SDK dependency, no
// browser code path. The recipient (SUPPORT_NOTIFICATION_TO) is read from
// process.env in exactly one place, in this file, and is never accepted as
// a parameter — nothing calling this module can override who it goes to,
// because the function signature has no such parameter to pass.
//
// LOGGING DISCIPLINE: every console.error/warn call in this file logs only
// the reference code and a coarse status string. Never the message body,
// never any email address (recipient, from, or reply-to), never the raw
// Resend response.

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export interface SupportNotificationInput {
  referenceCode: string;
  requestKind: "ticket" | "copyright_notice" | "copyright_counter_notice";
  category: string;
  subject: string;
  replyEmail?: string | null | undefined;
}

/** True on a successful send, false on any failure — never throws. Callers
 * must treat false as "record the failure, keep the stored request, do not
 * tell the visitor email failed" per the product requirement that a
 * notification-delivery problem never loses or blocks the underlying
 * request. */
export async function sendSupportNotificationEmail(
  input: SupportNotificationInput,
): Promise<boolean> {
  const apiKey = process.env["RESEND_API_KEY"];
  const to = process.env["SUPPORT_NOTIFICATION_TO"];
  const from = process.env["SUPPORT_NOTIFICATION_FROM"];
  if (!apiKey || !to || !from) {
    console.error(
      `[support-notification] not configured — skipping send for ${input.referenceCode}`,
    );
    return false;
  }

  const kindLabel =
    input.requestKind === "copyright_notice"
      ? "Copyright infringement notice"
      : input.requestKind === "copyright_counter_notice"
        ? "Copyright counter-notice"
        : "Support / complaint request";

  const safeSubject = escapeHtml(input.subject).slice(0, 500);
  const safeCategory = escapeHtml(input.category);
  const safeReference = escapeHtml(input.referenceCode);
  const safeKind = escapeHtml(kindLabel);

  const html = `<div>
<p><strong>${safeKind}</strong></p>
<p>Reference: ${safeReference}</p>
<p>Category: ${safeCategory}</p>
<p>Subject: ${safeSubject}</p>
<p>Open this request in the admin support area to see full details and reply.</p>
</div>`;

  const text = `${kindLabel}\nReference: ${input.referenceCode}\nCategory: ${input.category}\nSubject: ${input.subject}\n\nOpen this request in the admin support area to see full details and reply.`;

  const replyEmail = normalizeReplyEmail(input.replyEmail);

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [to],
        subject: `[Seeparah] ${kindLabel} — ${input.referenceCode}`,
        html,
        text,
        ...(replyEmail ? { reply_to: replyEmail } : {}),
      }),
    });
    if (!response.ok) {
      console.error(
        `[support-notification] send failed (status ${response.status}) for ${input.referenceCode}`,
      );
      return false;
    }
    return true;
  } catch {
    console.error(`[support-notification] send threw for ${input.referenceCode}`);
    return false;
  }
}

export interface TicketReplyInput {
  /** The ticket's own stored, validated reply address — the ONLY value
   * this ever sends to. There is no other field on this interface a
   * caller could use to redirect delivery; that's deliberate, not an
   * oversight — see replyToTicket() in support.server.ts, the only
   * intended caller, which reads this from the database row itself. */
  to: string;
  referenceCode: string;
  subject: string;
  body: string;
}

/**
 * The admin "Reply to requester" send. Distinct from
 * sendSupportNotificationEmail above (which goes to the private internal
 * inbox) — this one goes TO the requester and must never mention or leak
 * SUPPORT_NOTIFICATION_TO anywhere in it. No reply_to is set: replies from
 * the requester's side default to SUPPORT_NOTIFICATION_FROM (a monitored
 * sender address), never to the private inbox. Same logging discipline as
 * sendSupportNotificationEmail — never logs the message body, any
 * address, or the raw Resend response.
 */
export async function sendTicketReplyEmail(input: TicketReplyInput): Promise<boolean> {
  const apiKey = process.env["RESEND_API_KEY"];
  const from = process.env["SUPPORT_NOTIFICATION_FROM"];
  if (!apiKey || !from) {
    console.error(`[support-notification] reply not configured — skipping send for ${input.referenceCode}`);
    return false;
  }

  const to = normalizeReplyEmail(input.to);
  if (!to) {
    console.error(`[support-notification] reply has no valid recipient for ${input.referenceCode}`);
    return false;
  }

  const safeReference = escapeHtml(input.referenceCode);
  const safeSubject = escapeHtml(input.subject).slice(0, 500);
  const safeBody = escapeHtml(input.body).slice(0, 5000).replace(/\n/g, "<br>");

  const html = `<div>
<p>Re: ${safeSubject} (${safeReference})</p>
<p>${safeBody}</p>
</div>`;

  const text = `Re: ${input.subject} (${input.referenceCode})\n\n${input.body}`;

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [to],
        subject: `[Seeparah] Re: ${input.subject} (${input.referenceCode})`,
        html,
        text,
      }),
    });
    if (!response.ok) {
      console.error(`[support-notification] reply send failed (status ${response.status}) for ${input.referenceCode}`);
      return false;
    }
    return true;
  } catch {
    console.error(`[support-notification] reply send threw for ${input.referenceCode}`);
    return false;
  }
}

/** A strict, conservative email check — reply_to must never carry anything
 * that could smuggle extra headers or malformed data into the provider
 * call. Rejects (returns undefined) rather than best-effort-sanitizing. */
function normalizeReplyEmail(value: string | null | undefined): string | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed.length > 254) return undefined;
  if (/[\r\n]/.test(trimmed)) return undefined;
  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!EMAIL_RE.test(trimmed)) return undefined;
  return trimmed;
}
