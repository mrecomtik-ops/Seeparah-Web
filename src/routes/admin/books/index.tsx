import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Loader2, Plus } from "lucide-react";
import { getAccessToken } from "@/lib/admin/use-admin-session";
import { adminListCatalog } from "@/lib/admin/catalog.functions";

export const Route = createFileRoute("/admin/books/")({
  component: AdminBooksList,
});

const STATUSES = [
  "",
  "draft",
  "in_review",
  "changes_requested",
  "approved",
  "published",
  "rejected",
  "unpublished",
  "archived",
];

function AdminBooksList() {
  const [status, setStatus] = useState("");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);

  const booksQuery = useQuery({
    queryKey: ["admin-books", status, query, page],
    queryFn: async () =>
      adminListCatalog({
        data: {
          accessToken: await getAccessToken(),
          status: status || undefined,
          query: query || undefined,
          page,
          perPage: 20,
        },
      }),
  });

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-2xl font-semibold text-foreground">Catalog</h1>
        <Link
          to="/admin/books/new"
          className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
        >
          <Plus className="h-4 w-4" /> Upload a book
        </Link>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {STATUSES.map((s) => (
          <button
            key={s || "all"}
            onClick={() => {
              setStatus(s);
              setPage(1);
            }}
            className={`rounded-full px-3 py-1 text-xs font-semibold ${status === s ? "bg-primary text-primary-foreground" : "border border-border bg-card text-foreground hover:bg-secondary"}`}
          >
            {s || "All"}
          </button>
        ))}
        <input
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setPage(1);
          }}
          placeholder="Title or author…"
          className="ml-auto rounded-xl border border-border bg-card px-3 py-1.5 text-xs outline-none focus:ring-2 focus:ring-ring"
        />
      </div>

      {booksQuery.isLoading ? (
        <div className="mt-8 flex justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      ) : (
        <div className="mt-4 overflow-x-auto rounded-2xl border border-border bg-card card-shadow">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted-foreground">
                <th className="px-4 py-2">Title</th>
                <th className="px-4 py-2">Author</th>
                <th className="px-4 py-2">Status</th>
                <th className="px-4 py-2">Rights</th>
                <th className="px-4 py-2">Edition review</th>
              </tr>
            </thead>
            <tbody>
              {(booksQuery.data?.books ?? []).map((b) => (
                <tr
                  key={b.id}
                  className="border-b border-border last:border-0 hover:bg-secondary/40"
                >
                  <td className="px-4 py-2">
                    <Link
                      to="/admin/books/$bookId"
                      params={{ bookId: b.id }}
                      className="font-semibold text-primary hover:underline"
                    >
                      {b.title}
                    </Link>
                  </td>
                  <td className="px-4 py-2 text-xs">{b.author}</td>
                  <td className="px-4 py-2 text-xs">{b.status}</td>
                  <td className="px-4 py-2 text-xs">{b.rights_status}</td>
                  <td className="px-4 py-2 text-xs">{b.edition_review_status}</td>
                </tr>
              ))}
              {(booksQuery.data?.books.length ?? 0) === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-sm text-muted-foreground">
                    No books match.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
      <div className="mt-3 flex gap-2">
        <button
          disabled={page <= 1}
          onClick={() => setPage((p) => Math.max(1, p - 1))}
          className="rounded-lg border border-border px-3 py-1.5 text-xs disabled:opacity-40"
        >
          Previous
        </button>
        <button
          disabled={(booksQuery.data?.books.length ?? 0) < 20}
          onClick={() => setPage((p) => p + 1)}
          className="rounded-lg border border-border px-3 py-1.5 text-xs disabled:opacity-40"
        >
          Next
        </button>
      </div>
    </div>
  );
}
