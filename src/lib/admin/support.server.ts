// Server-only. Support tickets: signed-in users, and a public "I can't sign
// in" report path for people who can't reach the normal in-app flow. Public
// replies are recorded separately from internal notes so a support agent's
// internal reasoning never leaks to the reporter, and vice versa.
async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

export interface CreateTicketParams {
  userId?: string | null | undefined;
  contactEmail?: string | null | undefined;
  subject: string;
  description: string;
  category: "account" | "book" | "upload" | "translation_job" | "sign_in" | "other";
  relatedBookId?: string | null | undefined;
  relatedJobId?: string | null | undefined;
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
    })
    .select()
    .single();
  if (error || !data) throw new Error(error?.message ?? "Could not create the ticket");
  return data;
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
}) {
  const db = await admin();
  const { data, error } = await db
    .from("support_ticket_notes")
    .insert({
      ticket_id: params.ticketId,
      author_id: params.authorId,
      body: params.body.slice(0, 5000),
      visibility: params.visibility,
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
