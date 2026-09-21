import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, Loader2 } from "lucide-react";
import { getAccessToken, useAdminSession, can } from "@/lib/admin/use-admin-session";
import {
  adminGetTicket,
  adminSetTicketStatus,
  adminAddTicketNote,
  adminReplyToTicket,
} from "@/lib/admin/support.functions";

export const Route = createFileRoute("/admin/support/$ticketId")({
  component: AdminTicketDetail,
});

const REQUEST_KIND_LABEL: Record<string, string> = {
  ticket: "General request",
  copyright_notice: "Copyright infringement notice",
  copyright_counter_notice: "Copyright counter-notice",
};

/** Structured fields are stored as plain JSON (see migration 0009) with no
 * fixed shape enforced beyond "the object the submitting form produced" —
 * rendered generically rather than assuming specific keys, so this stays
 * correct if the form's field set changes later. */
function StructuredDataView({ data }: { data: Record<string, unknown> }) {
  return (
    <dl className="grid grid-cols-1 gap-x-4 gap-y-2 text-sm sm:grid-cols-2">
      {Object.entries(data).map(([key, value]) => (
        <div key={key}>
          <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {key.replace(/([A-Z])/g, " $1").replace(/^./, (c) => c.toUpperCase())}
          </dt>
          <dd className="text-foreground">
            {value === null || value === undefined || value === "" ? (
              <span className="text-muted-foreground">—</span>
            ) : typeof value === "boolean" ? (
              value ? "Yes" : "No"
            ) : (
              String(value)
            )}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function AdminTicketDetail() {
  const { ticketId } = Route.useParams();
  const sessionQuery = useAdminSession();
  const queryClient = useQueryClient();
  const [note, setNote] = useState("");
  const [visibility, setVisibility] = useState<"internal" | "public">("internal");
  const [busy, setBusy] = useState(false);

  const ticketQuery = useQuery({
    queryKey: ["admin-ticket", ticketId],
    queryFn: async () =>
      adminGetTicket({ data: { accessToken: await getAccessToken(), ticketId } }),
  });

  async function refresh() {
    await queryClient.invalidateQueries({ queryKey: ["admin-ticket", ticketId] });
  }

  async function setStatus(status: "open" | "pending" | "resolved" | "closed") {
    setBusy(true);
    try {
      await adminSetTicketStatus({
        data: { accessToken: await getAccessToken(), ticketId, status },
      });
      toast.success(`Status set to ${status}`);
      await refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't update status");
    } finally {
      setBusy(false);
    }
  }

  async function addNote() {
    if (!note.trim()) return;
    setBusy(true);
    try {
      await adminAddTicketNote({
        data: { accessToken: await getAccessToken(), ticketId, body: note.trim(), visibility },
      });
      setNote("");
      toast.success(visibility === "public" ? "Public note added" : "Internal note added");
      await refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't add the note");
    } finally {
      setBusy(false);
    }
  }

  async function sendReply() {
    if (!note.trim()) return;
    setBusy(true);
    try {
      const result = await adminReplyToTicket({
        data: { accessToken: await getAccessToken(), ticketId, body: note.trim() },
      });
      setNote("");
      toast[result.delivered ? "success" : "error"](
        result.delivered
          ? "Reply sent to the requester"
          : "Reply saved, but delivery failed — the requester was not emailed. Follow up manually.",
      );
      await refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't send the reply");
    } finally {
      setBusy(false);
    }
  }

  if (ticketQuery.isLoading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }
  if (!ticketQuery.data)
    return <p className="text-sm text-destructive">Couldn't load this ticket.</p>;

  const { ticket, notes } = ticketQuery.data;
  const session = sessionQuery.data;
  const canReplyPublic = can(session, "support.tickets.public_reply");

  return (
    <div className="max-w-2xl">
      <Link
        to="/admin/support"
        className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Support
      </Link>
      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        {ticket.request_kind !== "ticket" && (
          <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary">
            {REQUEST_KIND_LABEL[ticket.request_kind] ?? ticket.request_kind}
          </span>
        )}
        {ticket.reference_code && (
          <span className="rounded-full bg-secondary px-2.5 py-0.5 font-mono text-xs font-semibold text-secondary-foreground">
            {ticket.reference_code}
          </span>
        )}
        {ticket.notification_status === "failed" && (
          <span className="rounded-full bg-destructive/10 px-2.5 py-0.5 text-xs font-semibold text-destructive">
            Notification failed — follow up manually
          </span>
        )}
      </div>
      <h1 className="mt-2 font-display text-2xl font-semibold text-foreground">{ticket.subject}</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        {ticket.category} · {ticket.severity} ·{" "}
        {ticket.is_anonymous
          ? `anonymous (${ticket.contact_email ?? "no reply email given"})`
          : `signed-in user${ticket.contact_email ? ` (${ticket.contact_email})` : ""}`}
      </p>
      <div className="mt-3 rounded-xl border border-border bg-card p-4 text-sm">
        {ticket.description}
      </div>
      {ticket.structured_data && typeof ticket.structured_data === "object" && (
        <div className="mt-3 rounded-xl border border-border bg-card p-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Structured request details
          </p>
          <StructuredDataView data={ticket.structured_data as Record<string, unknown>} />
        </div>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        {(["open", "pending", "resolved", "closed"] as const).map((s) => (
          <button
            key={s}
            disabled={busy || ticket.status === s}
            onClick={() => setStatus(s)}
            className={`rounded-full px-3 py-1 text-xs font-semibold disabled:opacity-40 ${ticket.status === s ? "bg-primary text-primary-foreground" : "border border-border hover:bg-secondary"}`}
          >
            {s}
          </button>
        ))}
      </div>

      <section className="mt-6">
        <h2 className="font-display text-base font-semibold text-foreground">Notes</h2>
        <div className="mt-2 space-y-2">
          {notes.map((n) => (
            <div
              key={n.id}
              className={`rounded-xl border p-3 text-sm ${n.visibility === "public" ? "border-primary/30 bg-primary/5" : "border-border bg-card"}`}
            >
              <p className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
                {n.visibility === "public" ? "Public note" : "Internal note"}
                {n.delivery_status === "sent" && (
                  <span className="rounded-full bg-accent px-2 py-0.5 text-[10px] font-semibold text-accent-foreground">
                    Emailed to requester
                  </span>
                )}
                {n.delivery_status === "failed" && (
                  <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-[10px] font-semibold text-destructive">
                    Email delivery failed
                  </span>
                )}
              </p>
              <p className="mt-1 text-foreground">{n.body}</p>
            </div>
          ))}
          {notes.length === 0 && <p className="text-sm text-muted-foreground">No notes yet.</p>}
        </div>

        <div className="mt-3 space-y-2">
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Write a note…"
            className="w-full rounded-xl border border-border bg-card px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
          />
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-1.5 text-xs">
              <input
                type="radio"
                checked={visibility === "internal"}
                onChange={() => setVisibility("internal")}
              />{" "}
              Internal
            </label>
            {canReplyPublic && (
              <label className="flex items-center gap-1.5 text-xs">
                <input
                  type="radio"
                  checked={visibility === "public"}
                  onChange={() => setVisibility("public")}
                />{" "}
                Public note (visible to the user, not emailed)
              </label>
            )}
            <button
              onClick={addNote}
              disabled={busy || !note.trim()}
              className="ml-auto rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-secondary disabled:opacity-60"
            >
              Add note
            </button>
            {canReplyPublic && (
              <button
                onClick={sendReply}
                disabled={busy || !note.trim() || !ticket.contact_email}
                title={
                  ticket.contact_email
                    ? "Sends an email to the requester's reply address and records it here"
                    : "This ticket has no reply email on file"
                }
                className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground disabled:opacity-60"
              >
                Reply to requester
              </button>
            )}
          </div>
          {canReplyPublic && !ticket.contact_email && (
            <p className="text-xs text-muted-foreground">
              No reply email on file for this ticket — "Reply to requester" is unavailable.
            </p>
          )}
        </div>
      </section>
    </div>
  );
}
