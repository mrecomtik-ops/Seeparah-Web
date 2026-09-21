import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, Loader2 } from "lucide-react";
import { getAccessToken, useAdminSession, can } from "@/lib/admin/use-admin-session";
import {
  adminGetResearchPaper,
  adminReviewResearchPaper,
  adminPublishResearchPaper,
  adminWithdrawResearchPaper,
} from "@/lib/admin/research.functions";

export const Route = createFileRoute("/admin/research/$paperId")({
  component: AdminResearchDetail,
});

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="shrink-0 text-muted-foreground">{label}</dt>
      <dd className="max-w-[70%] text-right font-medium text-foreground">{value}</dd>
    </div>
  );
}

function AdminResearchDetail() {
  const { paperId } = Route.useParams();
  const sessionQuery = useAdminSession();
  const queryClient = useQueryClient();
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);

  const detailQuery = useQuery({
    queryKey: ["admin-research-paper", paperId],
    queryFn: async () =>
      adminGetResearchPaper({ data: { accessToken: await getAccessToken(), paperId } }),
  });

  async function refresh() {
    await queryClient.invalidateQueries({ queryKey: ["admin-research-paper", paperId] });
    await queryClient.invalidateQueries({ queryKey: ["admin-research-papers"] });
  }

  async function withBusy(fn: () => Promise<void>) {
    setBusy(true);
    try {
      await fn();
      await refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "That action failed");
    } finally {
      setBusy(false);
    }
  }

  if (detailQuery.isLoading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }
  if (detailQuery.isError || !detailQuery.data) {
    return <p className="text-sm text-destructive">Couldn't load this paper.</p>;
  }

  const paper = detailQuery.data;
  const session = sessionQuery.data;
  const canReview = can(session, "research.review");
  const canPublish = can(session, "research.publish");

  return (
    <div>
      <Link
        to="/admin/research"
        className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Literature Research
      </Link>

      <div className="mt-3">
        <h1 className="font-display text-2xl font-semibold text-foreground">{paper.title}</h1>
        <p className="text-sm text-muted-foreground">
          by {paper.author_name} · {paper.language} · status: {paper.status}
        </p>
      </div>

      <section className="mt-6 rounded-2xl border border-border bg-card p-5 card-shadow">
        <h2 className="font-display text-base font-semibold text-foreground">Submission</h2>
        <dl className="mt-3 space-y-1.5 text-sm">
          <Row label="Coauthors" value={paper.coauthor_names.join(", ") || "—"} />
          <Row label="Affiliation" value={paper.affiliation ?? "—"} />
          <Row label="ORCID" value={paper.orcid ?? "—"} />
          <Row label="Paper type" value={paper.paper_type} />
          <Row label="Topic" value={paper.topic ?? "—"} />
          <Row label="Citation style" value={paper.citation_style ?? "—"} />
          <Row label="Has PDF" value={paper.pdf_filename ?? "No"} />
          <Row label="Has main text" value={paper.body_text ? "Yes" : "No"} />
        </dl>
        <div className="mt-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Abstract</p>
          <p className="mt-1 text-sm text-foreground">{paper.abstract}</p>
        </div>
        <div className="mt-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Rights declaration
          </p>
          <p className="mt-1 text-sm text-foreground">{paper.rights_declaration}</p>
          {paper.third_party_rights_note && (
            <p className="mt-1 text-xs text-muted-foreground">
              Third-party notes: {paper.third_party_rights_note}
            </p>
          )}
        </div>
        {paper.body_text && (
          <div className="mt-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Main text
            </p>
            <p className="mt-1 max-h-80 overflow-y-auto whitespace-pre-wrap text-sm text-foreground">
              {paper.body_text}
            </p>
          </div>
        )}
        <div className="mt-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            References
          </p>
          <p className="mt-1 whitespace-pre-wrap text-sm text-foreground">{paper.references_text}</p>
        </div>
      </section>

      {(paper.review_notes || paper.rejection_reason) && (
        <div className="mt-4 rounded-xl bg-secondary px-3 py-2 text-xs text-secondary-foreground">
          {paper.review_notes && <p>Review notes: {paper.review_notes}</p>}
          {paper.rejection_reason && <p>Rejection reason: {paper.rejection_reason}</p>}
        </div>
      )}

      {canReview && paper.status === "submitted" && (
        <section className="mt-6 rounded-2xl border border-border bg-card p-5 card-shadow">
          <h2 className="font-display text-base font-semibold text-foreground">Review decision</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Editorial review — never labeled peer review anywhere in this product.
          </p>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Notes for this decision (shown to the author, recorded in the audit log)…"
            className="mt-3 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              disabled={busy}
              onClick={() =>
                withBusy(async () => {
                  await adminReviewResearchPaper({
                    data: { accessToken: await getAccessToken(), paperId, decision: "approved", notes },
                  });
                  toast.success("Approved — publish it separately when ready.");
                })
              }
              className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground disabled:opacity-60"
            >
              Approve
            </button>
            <button
              disabled={busy}
              onClick={() =>
                withBusy(async () => {
                  await adminReviewResearchPaper({
                    data: { accessToken: await getAccessToken(), paperId, decision: "changes_requested", notes },
                  });
                  toast.success("Changes requested");
                })
              }
              className="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-secondary disabled:opacity-60"
            >
              Request changes
            </button>
            <button
              disabled={busy}
              onClick={() =>
                withBusy(async () => {
                  await adminReviewResearchPaper({
                    data: { accessToken: await getAccessToken(), paperId, decision: "rejected", notes },
                  });
                  toast.success("Rejected");
                })
              }
              className="rounded-lg border border-destructive/40 px-3 py-1.5 text-xs font-semibold text-destructive disabled:opacity-60"
            >
              Reject
            </button>
          </div>
        </section>
      )}

      {canPublish && paper.status === "approved" && (
        <section className="mt-6 rounded-2xl border border-border bg-card p-5 card-shadow">
          <h2 className="font-display text-base font-semibold text-foreground">Publish</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Creates an immutable snapshot readers see — a later edit by the author will need to go
            through review again as a new version before it replaces this one.
          </p>
          <button
            disabled={busy}
            onClick={() =>
              withBusy(async () => {
                await adminPublishResearchPaper({ data: { accessToken: await getAccessToken(), paperId } });
                toast.success("Published");
              })
            }
            className="mt-3 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-60"
          >
            Publish
          </button>
        </section>
      )}

      {canPublish && paper.status === "published" && paper.published_version_id && (
        <section className="mt-6 rounded-2xl border border-border bg-card p-5 card-shadow">
          <h2 className="font-display text-base font-semibold text-foreground">Withdraw / correct</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Takes the published version down — nothing is deleted, the full version history stays
            as the audit trail, and this can be redone by publishing a revised version later.
          </p>
          <button
            disabled={busy}
            onClick={() => {
              const reason = window.prompt("Reason for withdrawing this paper (required):");
              if (!reason) return;
              void withBusy(async () => {
                await adminWithdrawResearchPaper({
                  data: { accessToken: await getAccessToken(), paperId, reason },
                });
                toast.success("Withdrawn");
              });
            }}
            className="mt-3 rounded-lg border border-destructive/40 px-4 py-2 text-sm font-semibold text-destructive disabled:opacity-60"
          >
            Withdraw
          </button>
        </section>
      )}
    </div>
  );
}
