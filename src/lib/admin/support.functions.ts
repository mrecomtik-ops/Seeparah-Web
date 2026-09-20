import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { createHash } from "node:crypto";
import { z } from "zod";
import { requireUserId, tryResolveUserId } from "@/lib/require-user.server";
import { requireAdmin } from "@/lib/admin/require-admin.server";
import { recordAudit } from "@/lib/admin/audit.server";
import {
  hashClientIpForSupportForms,
  isHoneypotTripped,
  isSameOriginRequest,
} from "@/lib/support-request-guard.server";
import { generateReferenceCode } from "@/lib/reference-code.server";
import { sendSupportNotificationEmail } from "@/lib/support-notification.server";
import { SUPPORT_REQUEST_SCHEMA, COPYRIGHT_REQUEST_SCHEMA } from "@/lib/support-request-schemas";

const withToken = <T extends z.ZodRawShape>(shape: T) =>
  z.object({ accessToken: z.string(), ...shape });

const CATEGORY = z.enum(["account", "book", "upload", "translation_job", "sign_in", "other"]);

function hashIp(ip: string): string {
  const pepper = process.env["SUPPORT_RATE_LIMIT_PEPPER"] ?? "";
  return createHash("sha256").update(`${pepper}:${ip}`).digest("hex");
}

function clientIpHash(): string {
  const request = getRequest();
  const forwardedFor = request?.headers.get("x-forwarded-for");
  const ip = forwardedFor?.split(",")[0]?.trim() || request?.headers.get("x-real-ip") || "unknown";
  return hashIp(ip);
}

/** Signed-in user creates a ticket linked to their account. */
export const createMyTicket = createServerFn({ method: "POST" })
  .inputValidator((data) =>
    withToken({
      subject: z.string().min(3).max(200),
      description: z.string().min(1).max(5000),
      category: CATEGORY,
      relatedBookId: z.string().optional(),
      relatedJobId: z.string().optional(),
    }).parse(data),
  )
  .handler(async ({ data }) => {
    const userId = await requireUserId(data.accessToken);
    const { createTicket } = await import("@/lib/admin/support.server");
    return createTicket({
      userId,
      subject: data.subject,
      description: data.description,
      category: data.category,
      relatedBookId: data.relatedBookId,
      relatedJobId: data.relatedJobId,
    });
  });

/**
 * Public "I can't sign in" report path — no account, no access token.
 * Rate-limited per (hashed) IP to blunt spam/enumeration; still records a
 * contact email only if the reporter gives one (never required).
 */
export const createPublicReport = createServerFn({ method: "POST" })
  .inputValidator((data) =>
    z
      .object({
        subject: z.string().min(3).max(200),
        description: z.string().min(1).max(5000),
        contactEmail: z.string().email().optional(),
        // Deliberately NOT length-constrained: a bot filling this hidden
        // field must pass validation and reach the handler below, which
        // silently accepts-and-drops it, rather than getting a validation
        // error back that would reveal the field is being checked.
        honeypot: z.string().optional(),
      })
      .parse(data),
  )
  .handler(async ({ data }) => {
    if (data.honeypot) {
      // Silently accept-and-drop rather than telling a bot its submission
      // was rejected — no ticket is created.
      return { ok: true as const };
    }
    const { checkAnonymousReportRateLimit, createTicket } =
      await import("@/lib/admin/support.server");
    await checkAnonymousReportRateLimit(clientIpHash());
    await createTicket({
      contactEmail: data.contactEmail ?? null,
      subject: data.subject,
      description: data.description,
      category: "sign_in",
    });
    return { ok: true as const };
  });

/**
 * The public "General support and complaint" form (/legal#support). Guest
 * submissions are allowed; when an access token IS provided and verifies,
 * the real signed-in user id is attached — never a client-supplied one.
 */
export const submitSupportRequest = createServerFn({ method: "POST" })
  .inputValidator((data) => SUPPORT_REQUEST_SCHEMA.parse(data))
  .handler(async ({ data }) => {
    if (isHoneypotTripped(data.honeypot) || !isSameOriginRequest()) {
      // Same accept-and-drop pattern as createPublicReport — see its
      // comment. No ticket is created; the response is indistinguishable
      // from a real success.
      return { ok: true as const, referenceCode: generateReferenceCode() };
    }
    const { checkAnonymousReportRateLimit, submitTicketAndNotify } =
      await import("@/lib/admin/support.server");
    await checkAnonymousReportRateLimit(hashClientIpForSupportForms());

    const userId = await tryResolveUserId(data.accessToken);

    const { referenceCode } = await submitTicketAndNotify({
      userId,
      contactEmail: data.replyEmail,
      subject: data.subject,
      description: data.message,
      category: data.requestType,
      requestKind: "ticket",
      structuredData: { fullName: data.fullName, pageUrl: data.pageUrl ?? null },
      notify: (ref) =>
        sendSupportNotificationEmail({
          referenceCode: ref,
          requestKind: "ticket",
          category: data.requestType,
          subject: data.subject,
          replyEmail: data.replyEmail,
        }),
    });

    return { ok: true as const, referenceCode };
  });

/**
 * The public copyright infringement-notice / counter-notice form
 * (/legal#copyright). Same guest-allowed, never-trust-client-id pattern as
 * submitSupportRequest. All fields beyond subject/description/contact_email
 * are structured data (structuredData), never appended into free text.
 */
export const submitCopyrightRequest = createServerFn({ method: "POST" })
  .inputValidator((data) => COPYRIGHT_REQUEST_SCHEMA.parse(data))
  .handler(async ({ data }) => {
    if (isHoneypotTripped(data.honeypot) || !isSameOriginRequest()) {
      return { ok: true as const, referenceCode: generateReferenceCode() };
    }
    const { checkAnonymousReportRateLimit, submitTicketAndNotify } =
      await import("@/lib/admin/support.server");
    await checkAnonymousReportRateLimit(hashClientIpForSupportForms());

    const userId = await tryResolveUserId(data.accessToken);
    const requestKind =
      data.submissionType === "infringement" ? "copyright_notice" : "copyright_counter_notice";
    const subject =
      data.submissionType === "infringement"
        ? `Copyright infringement notice: ${data.workDescription}`.slice(0, 200)
        : `Copyright counter-notice: ${data.workDescription}`.slice(0, 200);

    const { referenceCode } = await submitTicketAndNotify({
      userId,
      contactEmail: data.replyEmail,
      subject,
      description: data.detailedRequest,
      category: "other",
      requestKind,
      structuredData: {
        claimantName: data.claimantName,
        organization: data.organization ?? null,
        workDescription: data.workDescription,
        contentUrl: data.contentUrl,
        ownershipExplanation: data.ownershipExplanation,
        goodFaithStatement: data.goodFaithStatement,
        accuracyDeclaration: data.accuracyDeclaration,
        signature: data.signature,
      },
      notify: (ref) =>
        sendSupportNotificationEmail({
          referenceCode: ref,
          requestKind,
          category: "other",
          subject,
          replyEmail: data.replyEmail,
        }),
    });

    return { ok: true as const, referenceCode };
  });

export const listMyTickets = createServerFn({ method: "POST" })
  .inputValidator((data) => withToken({}).parse(data))
  .handler(async ({ data }) => {
    const userId = await requireUserId(data.accessToken);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: tickets, error } = await supabaseAdmin
      .from("support_tickets")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    const { data: publicNotes } = await supabaseAdmin
      .from("support_ticket_notes")
      .select("*")
      .in(
        "ticket_id",
        (tickets ?? []).map((t) => t.id),
      )
      .eq("visibility", "public")
      .order("created_at", { ascending: true });
    return { tickets: tickets ?? [], publicNotes: publicNotes ?? [] };
  });

export const adminListTickets = createServerFn({ method: "POST" })
  .inputValidator((data) =>
    withToken({
      status: z.string().optional(),
      assignedTo: z.string().optional(),
      page: z.number().int().min(1).default(1),
      perPage: z.number().int().min(1).max(100).default(25),
    }).parse(data),
  )
  .handler(async ({ data }) => {
    await requireAdmin(data.accessToken, "support.tickets.read_all");
    const { listTickets } = await import("@/lib/admin/support.server");
    return listTickets({
      status: data.status,
      assignedTo: data.assignedTo,
      page: data.page,
      perPage: data.perPage,
    });
  });

export const adminGetTicket = createServerFn({ method: "POST" })
  .inputValidator((data) => withToken({ ticketId: z.string() }).parse(data))
  .handler(async ({ data }) => {
    await requireAdmin(data.accessToken, "support.tickets.read_all");
    const { getTicket } = await import("@/lib/admin/support.server");
    return getTicket(data.ticketId);
  });

export const adminAssignTicket = createServerFn({ method: "POST" })
  .inputValidator((data) =>
    withToken({ ticketId: z.string(), assignedTo: z.string().nullable() }).parse(data),
  )
  .handler(async ({ data }) => {
    const { userId, role } = await requireAdmin(data.accessToken, "support.tickets.manage");
    const { assignTicket } = await import("@/lib/admin/support.server");
    await assignTicket(data.ticketId, data.assignedTo);
    await recordAudit({
      actorId: userId,
      actorRole: role,
      action: "ticket.assign",
      entityType: "support_ticket",
      entityId: data.ticketId,
      after: { assignedTo: data.assignedTo },
    });
    return { ok: true as const };
  });

export const adminSetTicketStatus = createServerFn({ method: "POST" })
  .inputValidator((data) =>
    withToken({
      ticketId: z.string(),
      status: z.enum(["open", "pending", "resolved", "closed"]),
      resolution: z.string().optional(),
    }).parse(data),
  )
  .handler(async ({ data }) => {
    const { userId, role } = await requireAdmin(data.accessToken, "support.tickets.manage");
    const { setTicketStatus } = await import("@/lib/admin/support.server");
    await setTicketStatus({
      ticketId: data.ticketId,
      status: data.status,
      resolution: data.resolution,
    });
    await recordAudit({
      actorId: userId,
      actorRole: role,
      action: "ticket.set_status",
      entityType: "support_ticket",
      entityId: data.ticketId,
      reason: data.resolution,
      after: { status: data.status },
    });
    return { ok: true as const };
  });

export const adminAddTicketNote = createServerFn({ method: "POST" })
  .inputValidator((data) =>
    withToken({
      ticketId: z.string(),
      body: z.string().min(1).max(5000),
      visibility: z.enum(["internal", "public"]),
    }).parse(data),
  )
  .handler(async ({ data }) => {
    const requiredCapability =
      data.visibility === "public" ? "support.tickets.public_reply" : "support.tickets.manage";
    const { userId, role } = await requireAdmin(data.accessToken, requiredCapability);
    const { addTicketNote } = await import("@/lib/admin/support.server");
    const note = await addTicketNote({
      ticketId: data.ticketId,
      authorId: userId,
      body: data.body,
      visibility: data.visibility,
    });
    await recordAudit({
      actorId: userId,
      actorRole: role,
      action: `ticket.note_${data.visibility}`,
      entityType: "support_ticket",
      entityId: data.ticketId,
    });
    return note;
  });
