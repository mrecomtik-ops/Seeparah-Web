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
} from "@/lib/admin/support.functions";

export const Route = createFileRoute("/admin/support/$ticketId")({
  component: AdminTicketDetail,
});

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
      toast.success(visibility === "public" ? "Public reply sent" : "Internal note added");
      await refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't add the note");
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
      <h1 className="mt-3 font-display text-2xl font-semibold text-foreground">{ticket.subject}</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        {ticket.category} · {ticket.severity} ·{" "}
        {ticket.is_anonymous
          ? `anonymous (${ticket.contact_email ?? "no email given"})`
          : "signed-in user"}
      </p>
      <div className="mt-3 rounded-xl border border-border bg-card p-4 text-sm">
        {ticket.description}
      </div>

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
              <p className="text-xs font-semibold text-muted-foreground">
                {n.visibility === "public" ? "Public reply" : "Internal note"}
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
          <div className="flex items-center gap-3">
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
                Public reply
                {ticket.is_anonymous
                  ? " (visible only if this becomes a signed-in ticket)"
                  : " (visible to the user)"}
              </label>
            )}
            <button
              onClick={addNote}
              disabled={busy || !note.trim()}
              className="ml-auto rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground disabled:opacity-60"
            >
              Add
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
