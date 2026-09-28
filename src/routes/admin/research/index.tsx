import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Loader2 } from "lucide-react";
import { getAccessToken } from "@/lib/admin/use-admin-session";
import { adminListResearchPapers } from "@/lib/admin/research.functions";

export const Route = createFileRoute("/admin/research/")({
  component: AdminResearchList,
});

const STATUSES = ["", "submitted", "changes_requested", "approved", "rejected", "published", "unpublished", "draft"];

function statusLabel(value: string) {
  return value ? value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase()) : "All";
}

function AdminResearchList() {
  const [status, setStatus] = useState("submitted");
  const papersQuery = useQuery({
    queryKey: ["admin-research-papers", status],
    queryFn: async () =>
      adminListResearchPapers({
        data: { accessToken: await getAccessToken(), status: status || undefined },
      }),
  });
  const papers = papersQuery.data ?? [];

  return (
    <div>
      <h1 className="font-display text-2xl font-semibold text-foreground">Literature Research</h1>
      <p className="mt-2 max-w-2xl text-xs text-muted-foreground">
        Editorial review queue for submitted papers. Approval here is editorial review, not peer
        review — publish decisions are a separate step from the approve decision.
      </p>

      <div className="mt-4 flex flex-wrap gap-2">
        {STATUSES.map((s) => (
          <button
            key={s || "all"}
            onClick={() => setStatus(s)}
            className={`rounded-full px-3 py-1 text-xs font-semibold ${status === s ? "bg-primary text-primary-foreground" : "border border-border bg-card text-foreground hover:bg-secondary"}`}
          >
            {statusLabel(s)}
          </button>
        ))}
      </div>

      {papersQuery.isLoading ? (
        <div className="mt-8 flex justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      ) : papers.length === 0 ? (
        <div className="mt-4 rounded-2xl border border-dashed border-border bg-card p-10 text-center card-shadow">
          <p className="font-display text-lg font-semibold text-foreground">
            No {status ? statusLabel(status).toLowerCase() : ""} papers
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            Papers will appear here when they enter this editorial state.
          </p>
        </div>
      ) : (
        <div className="mt-4 overflow-x-auto rounded-2xl border border-border bg-card card-shadow">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted-foreground">
                <th className="px-4 py-2">Title</th>
                <th className="px-4 py-2">Author</th>
                <th className="px-4 py-2">Type</th>
                <th className="px-4 py-2">Language</th>
                <th className="px-4 py-2">Status</th>
                <th className="px-4 py-2">Updated</th>
              </tr>
            </thead>
            <tbody>
              {papers.map((p) => (
                <tr key={p.id as string} className="border-b border-border last:border-0 hover:bg-secondary/40">
                  <td className="px-4 py-2">
                    <Link
                      to="/admin/research/$paperId"
                      params={{ paperId: p.id as string }}
                      className="font-semibold text-primary hover:underline"
                    >
                      {p.title as string}
                    </Link>
                  </td>
                  <td className="px-4 py-2 text-xs">{p.author_name as string}</td>
                  <td className="px-4 py-2 text-xs">{p.paper_type as string}</td>
                  <td className="px-4 py-2 text-xs">{p.language as string}</td>
                  <td className="px-4 py-2 text-xs">
                    <span className="rounded-full bg-secondary px-2.5 py-1 font-semibold text-secondary-foreground">
                      {statusLabel(p.status as string)}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-xs">
                    {new Date(p.updated_at as string).toLocaleDateString()}
                  </td>
                </tr>
              ))}

            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
