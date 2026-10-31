import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAdmin } from "@/lib/admin/require-admin.server";

const withToken = <T extends z.ZodRawShape>(shape: T) =>
  z.object({ accessToken: z.string(), ...shape });

export const adminListAuditLog = createServerFn({ method: "POST" })
  .validator((data) =>
    withToken({
      entityType: z.string().optional(),
      entityId: z.string().optional(),
      page: z.number().int().min(1).default(1),
      perPage: z.number().int().min(1).max(100).default(50),
    }).parse(data),
  )
  .handler(async ({ data }) => {
    await requireAdmin(data.accessToken, "audit.read");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let q = supabaseAdmin
      .from("audit_log")
      .select("*", { count: "exact" })
      .order("created_at", { ascending: false });
    if (data.entityType) q = q.eq("entity_type", data.entityType);
    if (data.entityId) q = q.eq("entity_id", data.entityId);
    const from = (data.page - 1) * data.perPage;
    const { data: rows, error, count } = await q.range(from, from + data.perPage - 1);
    if (error) throw new Error(error.message);
    // Resolve only entity IDs in this authorized page. Never expose
    // unpublished titles through any public API; this endpoint requires audit.read + MFA.
    const bookIds = [...new Set((rows ?? [])
      .filter((entry) => entry.entity_type === "book" && entry.entity_id)
      .map((entry) => entry.entity_id as string))];
    const titles = new Map<string, string>();
    if (bookIds.length) {
      const { data: books, error: bookError } = await supabaseAdmin
        .from("books").select("id,title").in("id", bookIds);
      if (bookError) throw new Error(bookError.message);
      for (const book of books ?? []) titles.set(book.id, book.title);
    }
    const displayNames = new Map<string, string>();
    for (const [id, title] of titles) displayNames.set("book:" + id, title);

    // Resolve only referenced entity identifiers from this authorized page.
    // Queries do not expose other private manuscript or support records.
    const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const idsFor = (type: string) => [...new Set((rows ?? [])
      .filter((row) => row.entity_type === type && row.entity_id && UUID.test(row.entity_id))
      .map((row) => row.entity_id as string))];
    const ticketIds = idsFor("support_ticket");
    if (ticketIds.length) {
      const { data: tickets, error: ticketError } = await supabaseAdmin.from("support_tickets")
        .select("id,subject").in("id", ticketIds);
      if (ticketError) throw new Error(ticketError.message);
      for (const ticket of tickets ?? []) displayNames.set("support_ticket:" + ticket.id, ticket.subject);
    }
    const paperIds = idsFor("research_paper");
    if (paperIds.length) {
      const { data: papers, error: paperError } = await supabaseAdmin.from("research_papers")
        .select("id,title").in("id", paperIds);
      if (paperError) throw new Error(paperError.message);
      for (const paper of papers ?? []) displayNames.set("research_paper:" + paper.id, paper.title);
    }
    const requestIds = idsFor("translation_request");
    if (requestIds.length) {
      const { data: requests, error: requestError } = await supabaseAdmin.from("translation_requests")
        .select("id,book_id,language").in("id", requestIds);
      if (requestError) throw new Error(requestError.message);
      for (const request of requests ?? []) {
        const title = request.book_id ? titles.get(request.book_id) : null;
        displayNames.set("translation_request:" + request.id,
          (title ? title + " · " : "") + request.language + " translation request");
      }
    }
    // Only owner/administrator sessions with an MFA challenge and audit.read
    // can reach here. The actor's label is display-only, never authorization.
    // Bound the per-page auth lookups to 20 unique IDs; raw IDs remain visible
    // when lookup is unavailable. Never expose this in public catalog endpoints.
    const actorIds = [...new Set((rows ?? [])
      .map((entry) => entry.actor_id).filter((id): id is string => !!id && UUID.test(id)))].slice(0, 20);
    const actorNames = new Map<string, string>();
    await Promise.all(actorIds.map(async (id) => {
      try {
        const { data, error: actorError } = await supabaseAdmin.auth.admin.getUserById(id);
        if (!actorError && data.user) {
          const metadata = data.user.user_metadata;
          const name = typeof metadata?.["full_name"] === "string" ? metadata["full_name"].trim() : "";
          const email = data.user.email?.trim() ?? "";
          const label = name && email ? name + " · " + email : name || email;
          if (label) actorNames.set(id, label.slice(0, 200));
        }
      } catch {
        // The immutable actor UUID remains visible when an account is deleted.
      }
    }));

    const entries = (rows ?? []).map((entry) => ({
      ...entry,
      entity_display_name: entry.entity_id
        ? displayNames.get(entry.entity_type + ":" + entry.entity_id) ??
          (entry.entity_type === "content_setting" ? entry.entity_id : null)
        : null,
      actor_display_name: entry.actor_id ? actorNames.get(entry.actor_id) ?? null : null,
    }));
    return { entries, total: count ?? 0 };
  });
