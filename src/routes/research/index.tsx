import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { BookOpen, FileText, Search, X } from "lucide-react";
import { listPublishedPapers, matchesPaperSearch, PAPER_TYPES } from "@/lib/research";

const searchSchema = z.object({ q: z.string().optional() });

export const Route = createFileRoute("/research/")({
  validateSearch: searchSchema,
  head: () => ({
    meta: [
      { title: "Literature Research — Seeparah" },
      {
        name: "description",
        content:
          "Student and teacher literature research: original research, literary analysis, review essays, and textual studies, reviewed by an editor before publication.",
      },
    ],
  }),
  component: ResearchIndexPage,
});

const PAPER_TYPE_LABEL: Record<string, string> = Object.fromEntries(
  PAPER_TYPES.map((t) => [t.value, t.label]),
);

function ResearchIndexPage() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const query = search.q ?? "";

  const papersQuery = useQuery({ queryKey: ["research-papers"], queryFn: listPublishedPapers });
  const papers = papersQuery.data ?? [];

  const filtered = useMemo(
    () => papers.filter((p) => matchesPaperSearch(p, query)),
    [papers, query],
  );

  return (
    <div className="min-h-screen bg-background">
      <main className="mx-auto max-w-5xl px-4 pb-24 pt-8 sm:px-6">
        <div className="flex items-center gap-2">
          <FileText className="h-6 w-6 text-primary" />
          <p className="text-sm font-medium text-muted-foreground">Literature Research</p>
        </div>
        <h1 className="mt-1 font-display text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
          Student and teacher research
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
          Original research, literary analysis, review essays, and textual studies — reviewed by an
          editor for rights and readiness before publication.{" "}
          <strong className="text-foreground">
            Editorial approval is not peer review, and none of these papers carry a journal
            affiliation, DOI, or indexed status unless explicitly shown on the paper itself.
          </strong>
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Link
            to="/research/submit"
            className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:-translate-y-0.5 transition-transform"
          >
            Submit a paper
          </Link>
          <Link
            to="/research/mine"
            className="inline-flex items-center gap-2 rounded-xl border border-border bg-card px-4 py-2.5 text-sm font-semibold text-foreground hover:bg-secondary"
          >
            My submissions
          </Link>
        </div>

        <div className="relative mt-6">
          <Search className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) =>
              navigate({ search: (prev) => ({ ...prev, q: e.target.value || undefined }), replace: true })
            }
            placeholder="Search by title, author, abstract, or keyword…"
            aria-label="Search literature research papers"
            className="w-full rounded-2xl border-2 border-primary/25 bg-card py-4 pl-12 pr-12 text-base text-foreground card-shadow-lg outline-none placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-ring"
          />
          {query && (
            <button
              onClick={() => navigate({ search: (prev) => ({ ...prev, q: undefined }), replace: true })}
              aria-label="Clear search"
              className="absolute right-4 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground hover:bg-secondary hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        <section className="mt-8">
          {papersQuery.isLoading ? (
            <div className="grid gap-4 sm:grid-cols-2">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="h-32 animate-pulse rounded-2xl bg-secondary" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border bg-card p-12 text-center card-shadow">
              <BookOpen className="mx-auto h-10 w-10 text-muted-foreground/50" />
              <p className="mt-3 font-display text-lg font-semibold text-foreground">
                {query.trim() ? `No results for "${query.trim()}"` : "No published papers yet"}
              </p>
              <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
                {query.trim()
                  ? "Try a different search term."
                  : "Be the first to submit a literature research paper."}
              </p>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              {filtered.map((p) => (
                <Link
                  key={p.paper_id}
                  to="/research/$paperId"
                  params={{ paperId: p.paper_id }}
                  className="flex flex-col rounded-2xl border border-border bg-card p-5 card-shadow transition-transform hover:-translate-y-1 hover:card-shadow-lg"
                >
                  <span className="w-fit rounded-full bg-accent px-2.5 py-0.5 text-[11px] font-semibold text-accent-foreground">
                    {PAPER_TYPE_LABEL[p.paper_type] ?? p.paper_type}
                  </span>
                  <h2 className="mt-2 font-display text-lg font-semibold leading-snug text-foreground">
                    {p.title}
                  </h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {p.author_name}
                    {p.coauthor_names.length > 0 ? ` · with ${p.coauthor_names.join(", ")}` : ""}
                  </p>
                  <p className="mt-2 line-clamp-3 text-sm text-muted-foreground">{p.abstract}</p>
                  <div className="mt-auto flex flex-wrap gap-1 pt-3">
                    <span className="rounded-full bg-secondary px-2 py-0.5 text-[11px] font-medium text-secondary-foreground">
                      {p.language}
                    </span>
                    {p.keywords.slice(0, 3).map((k) => (
                      <span
                        key={k}
                        className="rounded-full bg-secondary px-2 py-0.5 text-[11px] font-medium text-secondary-foreground"
                      >
                        {k}
                      </span>
                    ))}
                  </div>
                </Link>
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
