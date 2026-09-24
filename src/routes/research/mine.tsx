import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, FileText, Loader2, Plus } from "lucide-react";
import { listMyPapers, type ResearchPaperStatus } from "@/lib/research";
import { useAuth } from "@/lib/use-auth";

export const Route = createFileRoute("/research/mine")({
  head: () => ({ meta: [{ title: "My submissions — Literature Research — Seeparah" }] }),
  component: MyPapersPage,
});

const STATUS_LABEL: Record<ResearchPaperStatus, string> = {
  draft: "Draft (private)",
  submitted: "Submitted — awaiting review",
  changes_requested: "Changes requested",
  approved: "Approved — awaiting publish",
  rejected: "Rejected",
  published: "Published",
  unpublished: "Unpublished",
};

const STATUS_CLASS: Record<ResearchPaperStatus, string> = {
  draft: "bg-secondary text-secondary-foreground",
  submitted: "bg-gold/20 text-gold",
  changes_requested: "bg-gold/20 text-gold",
  approved: "bg-accent text-accent-foreground",
  rejected: "bg-destructive/10 text-destructive",
  published: "bg-accent text-accent-foreground",
  unpublished: "bg-destructive/10 text-destructive",
};

function MyPapersPage() {
  const { userId, isDemo } = useAuth();
  const papersQuery = useQuery({
    queryKey: ["my-papers", userId],
    queryFn: () => listMyPapers(userId),
    enabled: !isDemo,
  });
  const papers = papersQuery.data ?? [];

  return (
    <div className="min-h-screen bg-background">
      <main className="mx-auto max-w-3xl px-4 pb-24 pt-8 sm:px-6">
        <Link
          to="/research"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Literature Research
        </Link>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <h1 className="font-display text-3xl font-semibold tracking-tight text-foreground">
            My submissions
          </h1>
          <Link
            to="/research/submit"
            className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground"
          >
            <Plus className="h-4 w-4" /> New submission
          </Link>
        </div>

        {isDemo ? (
          <p className="mt-6 rounded-xl bg-secondary px-4 py-3 text-sm text-secondary-foreground">
            Sign in to submit and track research papers — this needs a real account.
          </p>
        ) : papersQuery.isLoading ? (
          <div className="mt-8 flex justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : papers.length === 0 ? (
          <div className="mt-6 rounded-2xl border border-dashed border-border bg-card p-12 text-center card-shadow">
            <FileText className="mx-auto h-10 w-10 text-muted-foreground/50" />
            <p className="mt-3 font-display text-lg font-semibold text-foreground">
              No submissions yet
            </p>
            <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
              Submit a research paper — original research, literary analysis, review essay, or
              textual study.
            </p>
          </div>
        ) : (
          <ul className="mt-6 space-y-2">
            {papers.map((p) => (
              <li key={p.id}>
                <Link
                  to="/research/submit"
                  search={{ paperId: p.id }}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-card px-4 py-3 hover:bg-secondary/40"
                >
                  <div className="min-w-0">
                    <p className="truncate font-display text-base font-semibold text-foreground">
                      {p.title || "Untitled draft"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Updated {new Date(p.updated_at).toLocaleDateString()}
                    </p>
                  </div>
                  <span
                    className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold ${STATUS_CLASS[p.status]}`}
                  >
                    {STATUS_LABEL[p.status]}
                  </span>
                </Link>
                {p.status === "changes_requested" && p.review_notes && (
                  <p className="mt-1 rounded-lg bg-secondary px-3 py-2 text-xs text-secondary-foreground">
                    Editor feedback: {p.review_notes}
                  </p>
                )}
                {p.status === "rejected" && p.rejection_reason && (
                  <p className="mt-1 rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive">
                    {p.rejection_reason}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}
