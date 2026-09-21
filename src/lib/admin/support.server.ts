// Server-only. Support tickets: signed-in users, and a public "I can't sign
// in" report path for people who can't reach the normal in-app flow. Public
// replies are recorded separately from internal notes so a support agent's
// internal reasoning never leaks to the reporter, and vice versa.
import { generateReferenceCode } from "@/lib/reference-code.server";
import type { Json } from "@/integrations/supabase/types";

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

/** Guarantees the value is actually jsonb-safe (drops undefined/function/
 * symbol values rather than letting an insert fail on them) — same
 * round-trip technique as audit.server.ts's redact(), but without
 * redaction: structured_data is the primary record of a copyright notice's
 * claims and must be stored complete, not truncated or secret-stripped. */
function toJsonSafe(value: Record<string, unknown> | null | undefined): Json | null {
  if (!value) return null;
  return JSON.parse(JSON.stringify(value)) as Json;
}

export type SupportCategory =
  | "account"
  | "book"
  | "upload"
  | "translation_job"
  | "sign_in"
  | "other"
  | "general_support"
  | "reading_progress"
  | "manuscript_publication"
  | "translation_request"
  | "complaint"
  | "safety_abuse"
  | "privacy_request"
  | "accessibility";

export type RequestKind = "ticket" | "copyright_notice" | "copyright_counter_notice";

export interface CreateTicketParams {
  userId?: string | null | undefined;
  contactEmail?: string | null | undefined;
  subject: string;
  description: string;
  category: SupportCategory;
  relatedBookId?: string | null | undefined;
  relatedJobId?: string | null | undefined;
  relatedPaperId?: string | null | undefined;
  requestKind?: RequestKind | undefined;
  referenceCode?: string | undefined;
  structuredData?: Record<string, unknown> | undefined;
}

export async function createTicket(params: CreateTicketParams) {
  const db = await admin();
  const isAnonymous = !params.userId;
  const { data, error } = await db
    .from("support_tickets")
    .insert({
      user_id: params.userId ?? null,
      contact_email: params.contactEmail ?? null,
      is_anonymous: isAnonymous,
      subject: params.subject.slice(0, 200),
      description: params.description.slice(0, 5000),
      category: params.category,
      related_book_id: params.relatedBookId ?? null,
      related_job_id: params.relatedJobId ?? null,
      related_paper_id: params.relatedPaperId ?? null,
      request_kind: params.requestKind ?? "ticket",
      reference_code: params.referenceCode ?? null,
      structured_data: toJsonSafe(params.structuredData),
    })
    .select()
    .single();
  if (error || !data) throw new Error(error?.message ?? "Could not create the ticket");
  return data;
}

/** Records whether the post-creation notification email actually went out,
 * for the admin support view's "notification failed, follow up" signal.
 * Never throws — a failure to record this is logged, not surfaced to the
 * request that's already been safely stored. */
export async function setNotificationStatus(
  ticketId: string,
  status: "sent" | "failed",
): Promise<void> {
  const db = await admin();
  const { error } = await db
    .from("support_tickets")
    .update({ notification_status: status })
    .eq("id", ticketId);
  if (error) {
    console.error(`[support] failed to record notification_status for ${ticketId}`);
  }
}

export interface SubmitTicketAndNotifyParams {
  userId: string | null;
  contactEmail: string;
  subject: string;
  description: string;
  category: SupportCategory;
  requestKind: RequestKind;
  structuredData?: Record<string, unknown> | undefined;
  /** Injected rather than called directly, so this function is testable
   * without a real Resend API call — see support.functions.ts for the real
   * caller (sendSupportNotificationEmail) and support.submitTicketAndNotify.test.ts
   * for a fake notifier that returns false, proving storage doesn't depend
   * on notification succeeding. */
  notify: (referenceCode: string) => Promise<boolean>;
}

/**
 * The shared "store the request, then best-effort notify, then record the
 * outcome" sequence both public forms use. Storage happens first and
 * unconditionally; if `notify` throws or returns false, the already-stored
 * ticket is kept exactly as-is and only notification_status changes to
 * 'failed' — a delivery problem never loses or blocks the underlying
 * request, and the caller still gets a real reference code back.
 */
export async function submitTicketAndNotify(
  params: SubmitTicketAndNotifyParams,
): Promise<{ referenceCode: string; ticketId: string }> {
  const referenceCode = generateReferenceCode();
  const ticket = await createTicket({
    userId: params.userId,
    contactEmail: params.contactEmail,
    subject: params.subject,
    description: params.description,
    category: params.category,
    requestKind: params.requestKind,
    referenceCode,
    structuredData: params.structuredData,
  });

  let sent = false;
  try {
    sent = await params.notify(referenceCode);
  } catch {
    sent = false;
  }
  await setNotificationStatus(ticket.id, sent ? "sent" : "failed");

  return { referenceCode, ticketId: ticket.id };
}

/** Very small day-bucketed counter keyed by a hash of the reporter's IP —
 * never the raw IP. Refuses beyond `limit` anonymous reports per day from
 * the same hash. This is a basic spam/enumeration guard, not a full
 * anti-abuse system. */
export async function checkAnonymousReportRateLimit(ipHash: string, limit = 5): Promise<void> {
  const db = await admin();
  const day = new Date().toISOString().slice(0, 10);
  const { data: existing } = await db
    .from("support_report_rate_limit")
    .select("count")
    .eq("ip_hash", ipHash)
    .eq("day", day)
    .maybeSingle();
  if (existing && existing.count >= limit) {
    throw new Error(
      "Too many reports from this network today — please try again tomorrow, or use in-app support if you can sign in.",
    );
  }
  await db
    .from("support_report_rate_limit")
    .upsert(
      { ip_hash: ipHash, day, count: (existing?.count ?? 0) + 1 },
      { onConflict: "ip_hash,day" },
    );
}

export interface TicketListFilters {
  status?: string | undefined;
  assignedTo?: string | undefined;
  page: number;
  perPage: number;
}

export async function listTickets(filters: TicketListFilters) {
  const db = await admin();
  let q = db
    .from("support_tickets")
    .select("*", { count: "exact" })
    .order("created_at", { ascending: false });
  if (filters.status) q = q.eq("status", filters.status);
  if (filters.assignedTo) q = q.eq("assigned_to", filters.assignedTo);
  const from = (filters.page - 1) * filters.perPage;
  const { data, error, count } = await q.range(from, from + filters.perPage - 1);
  if (error) throw new Error(error.message);
  return { tickets: data ?? [], total: count ?? 0 };
}

export async function getTicket(ticketId: string) {
  const db = await admin();
  const { data: ticket, error } = await db
    .from("support_tickets")
    .select("*")
    .eq("id", ticketId)
    .single();
  if (error || !ticket) throw new Error("Ticket not found");
  const { data: notes } = await db
    .from("support_ticket_notes")
    .select("*")
    .eq("ticket_id", ticketId)
    .order("created_at", { ascending: true });
  return { ticket, notes: notes ?? [] };
}

export async function assignTicket(ticketId: string, assignedTo: string | null) {
  const db = await admin();
  const { error } = await db
    .from("support_tickets")
    .update({ assigned_to: assignedTo, updated_at: new Date().toISOString() })
    .eq("id", ticketId);
  if (error) throw new Error(error.message);
}

export async function setTicketStatus(params: {
  ticketId: string;
  status: "open" | "pending" | "resolved" | "closed";
  resolution?: string | undefined;
}) {
  const db = await admin();
  const { error } = await db
    .from("support_tickets")
    .update({
      status: params.status,
      resolution: params.resolution ?? null,
      resolved_at:
        params.status === "resolved" || params.status === "closed"
          ? new Date().toISOString()
          : null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", params.ticketId);
  if (error) throw new Error(error.message);
}

export async function addTicketNote(params: {
  ticketId: string;
  authorId: string;
  body: string;
  visibility: "internal" | "public";
  deliveryStatus?: "sent" | "failed" | "not_applicable" | undefined;
}) {
  const db = await admin();
  const { data, error } = await db
    .from("support_ticket_notes")
    .insert({
      ticket_id: params.ticketId,
      author_id: params.authorId,
      body: params.body.slice(0, 5000),
      visibility: params.visibility,
      delivery_status: params.deliveryStatus ?? "not_applicable",
    })
    .select()
    .single();
  if (error || !data) throw new Error(error?.message ?? "Could not add the note");
  await db
    .from("support_tickets")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", params.ticketId);
  return data;
}

/** Just enough of a ticket to send a reply to it, without also pulling
 * every note (getTicket does that; not needed here). The reply-email
 * address returned here — contact_email — is the ONLY source a reply can
 * ever be sent to: it's the value the requester themselves submitted and
 * that Zod validated at submission time (see support-request-schemas.ts),
 * read straight from the stored row, never accepted as a parameter from
 * whoever is sending the reply. */
export async function getTicketContactInfo(
  ticketId: string,
): Promise<{ id: string; contactEmail: string | null; referenceCode: string | null; subject: string }> {
  const db = await admin();
  const { data, error } = await db
    .from("support_tickets")
    .select("id, contact_email, reference_code, subject")
    .eq("id", ticketId)
    .single();
  if (error || !data) throw new Error("Ticket not found");
  return {
    id: data.id,
    contactEmail: data.contact_email,
    referenceCode: data.reference_code,
    subject: data.subject,
  };
}

/**
 * The full "reply to requester" sequence: look up the ticket's own stored,
 * validated contact email (never anything the caller supplies), send via
 * the injected notifier, then record the attempt as a public note with its
 * real delivery outcome. Mirrors submitTicketAndNotify's own "store first,
 * notify best-effort, record the outcome" shape, adapted for a reply: here
 * the note itself IS the thing being recorded, so on a notifier failure
 * the note is still written (delivery_status='failed') rather than
 * skipped — the admin's reply text is never lost even if delivery fails.
 */
export async function replyToTicket(params: {
  ticketId: string;
  authorId: string;
  body: string;
  notify: (contactEmail: string, referenceCode: string, subject: string) => Promise<boolean>;
}): Promise<{ delivered: boolean }> {
  const ticket = await getTicketContactInfo(params.ticketId);
  if (!ticket.contactEmail) {
    throw new Error("This ticket has no reply email on file");
  }

  let delivered = false;
  try {
    delivered = await params.notify(
      ticket.contactEmail,
      ticket.referenceCode ?? ticket.id,
      ticket.subject,
    );
  } catch {
    delivered = false;
  }

  await addTicketNote({
    ticketId: params.ticketId,
    authorId: params.authorId,
    body: params.body,
    visibility: "public",
    deliveryStatus: delivered ? "sent" : "failed",
  });

  return { delivered };
}
