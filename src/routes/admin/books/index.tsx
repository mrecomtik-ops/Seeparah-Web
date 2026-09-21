import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { getAccessToken, useAdminSession, can } from "@/lib/admin/use-admin-session";
import {
  adminListCatalog,
  adminBulkSetAccessType,
  adminSetBookLifecycle,
} from "@/lib/admin/catalog.functions";

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
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [showPreview, setShowPreview] = useState(false);
  const [pendingAccessType, setPendingAccessType] = useState<"free" | "paid">("free");
  const [applying, setApplying] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; title: string } | null>(null);
  const [deleting, setDeleting] = useState(false);
  const queryClient = useQueryClient();
  const sessionQuery = useAdminSession();
  const canPublish = can(sessionQuery.data, "catalog.publish");

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

  const books = booksQuery.data?.books ?? [];
  const selectedBooks = books.filter((b) => selected.has(b.id));

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setSelected((prev) => (prev.size === books.length ? new Set() : new Set(books.map((b) => b.id))));
  }

  function openBulkPreview(accessType: "free" | "paid") {
    if (selected.size === 0) return;
    setPendingAccessType(accessType);
    setShowPreview(true);
  }

  async function applyBulk() {
    setApplying(true);
    try {
      const results = await adminBulkSetAccessType({
        data: {
          accessToken: await getAccessToken(),
          targets: selectedBooks.map((b) => ({ bookId: b.id, language: null })),
          accessType: pendingAccessType,
        },
      });
      const failed = results.filter((r) => !r.ok);
      if (failed.length === 0) {
        toast.success(`Set ${results.length} book(s) to ${pendingAccessType}`);
      } else {
        toast.error(`${results.length - failed.length} succeeded, ${failed.length} failed`);
      }
      setSelected(new Set());
      setShowPreview(false);
      await queryClient.invalidateQueries({ queryKey: ["admin-books"] });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Bulk update failed");
    } finally {
      setApplying(false);
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await adminSetBookLifecycle({
        data: {
          accessToken: await getAccessToken(),
          bookId: deleteTarget.id,
          status: "archived",
          reason: "Deleted (reversible) from the admin catalog list",
        },
      });
      toast.success("Archived — reversible from the book's detail page anytime.");
      setDeleteTarget(null);
      await queryClient.invalidateQueries({ queryKey: ["admin-books"] });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't delete this book");
    } finally {
      setDeleting(false);
    }
  }

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

      <p className="mt-2 max-w-2xl text-xs text-muted-foreground">
        Free/Premium here sets the ORIGINAL edition's access. While monetization is off, every
        book stays free to read regardless of this setting — see Admin Settings.
      </p>

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

      {selected.size > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl border border-primary/30 bg-primary/5 px-4 py-2.5 text-sm">
          <span className="font-semibold text-foreground">{selected.size} selected</span>
          <button
            onClick={() => openBulkPreview("free")}
            className="rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-semibold hover:bg-secondary"
          >
            Set Free…
          </button>
          <button
            onClick={() => openBulkPreview("paid")}
            className="rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-semibold hover:bg-secondary"
          >
            Set Premium…
          </button>
          <button
            onClick={() => setSelected(new Set())}
            className="ml-auto text-xs text-muted-foreground hover:text-foreground"
          >
            Clear
          </button>
        </div>
      )}

      {booksQuery.isLoading ? (
        <div className="mt-8 flex justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      ) : (
        <div className="mt-4 overflow-x-auto rounded-2xl border border-border bg-card card-shadow">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted-foreground">
                <th className="w-8 px-4 py-2">
                  <input
                    type="checkbox"
                    checked={books.length > 0 && selected.size === books.length}
                    onChange={toggleAll}
                    aria-label="Select all"
                  />
                </th>
                <th className="px-4 py-2">Title</th>
                <th className="px-4 py-2">Author</th>
                <th className="px-4 py-2">Status</th>
                <th className="px-4 py-2">Access</th>
                <th className="px-4 py-2">Rights</th>
                <th className="px-4 py-2">Edition review</th>
                <th className="px-4 py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {books.map((b) => (
                <tr
                  key={b.id}
                  className="border-b border-border last:border-0 hover:bg-secondary/40"
                >
                  <td className="px-4 py-2">
                    <input
                      type="checkbox"
                      checked={selected.has(b.id)}
                      onChange={() => toggle(b.id)}
                      aria-label={`Select ${b.title}`}
                    />
                  </td>
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
                  <td className="px-4 py-2 text-xs">
                    <span
                      className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${b.access_type === "paid" ? "bg-gold/20 text-gold-foreground" : "bg-accent text-accent-foreground"}`}
                    >
                      {b.access_type === "paid" ? "Premium" : "Free"}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-xs">{b.rights_status}</td>
                  <td className="px-4 py-2 text-xs">{b.edition_review_status}</td>
                  <td className="px-4 py-2 text-xs">
                    <div className="flex items-center gap-2">
                      <Link
                        to="/admin/books/$bookId"
                        params={{ bookId: b.id }}
                        className="text-primary hover:underline"
                      >
                        Edit
                      </Link>
                      {canPublish && b.status !== "archived" && (
                        <button
                          onClick={() => setDeleteTarget({ id: b.id, title: b.title })}
                          className="inline-flex items-center gap-1 text-destructive hover:underline"
                        >
                          <Trash2 className="h-3 w-3" /> Delete
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {books.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-sm text-muted-foreground">
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
          disabled={books.length < 20}
          onClick={() => setPage((p) => p + 1)}
          className="rounded-lg border border-border px-3 py-1.5 text-xs disabled:opacity-40"
        >
          Next
        </button>
      </div>

      {showPreview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 card-shadow-lg">
            <h2 className="font-display text-lg font-semibold text-foreground">
              Set {selectedBooks.length} book(s) to {pendingAccessType === "paid" ? "Premium" : "Free"}?
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">
              This changes the ORIGINAL edition's access for exactly these books. Nothing else is
              affected.
            </p>
            <ul className="mt-3 max-h-56 space-y-1 overflow-y-auto rounded-xl border border-border bg-background p-3 text-sm">
              {selectedBooks.map((b) => (
                <li key={b.id} className="flex items-center justify-between gap-2">
                  <span className="truncate">{b.title}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {b.access_type === "paid" ? "Premium" : "Free"} → {pendingAccessType === "paid" ? "Premium" : "Free"}
                  </span>
                </li>
              ))}
            </ul>
            {pendingAccessType === "paid" && (
              <p className="mt-3 rounded-lg bg-secondary px-3 py-2 text-xs text-secondary-foreground">
                While monetization is off, these books stay free to read regardless — this only
                takes effect once an admin enables monetization.
              </p>
            )}
            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => setShowPreview(false)}
                disabled={applying}
                className="rounded-lg border border-border px-4 py-2 text-sm font-semibold hover:bg-secondary disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                onClick={applyBulk}
                disabled={applying}
                className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-60"
              >
                {applying ? "Applying…" : "Apply"}
              </button>
            </div>
          </div>
        </div>
      )}

      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 card-shadow-lg">
            <h2 className="font-display text-lg font-semibold text-foreground">
              Delete “{deleteTarget.title}”?
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              This archives the book — it stops being published and disappears from the catalog,
              but nothing is erased. Chunks, translations, editions, reader highlights and
              progress, requests, and audit history all stay intact, and this can be reversed from
              the book's detail page anytime. For irreversible deletion, open the book and use
              "Delete permanently" (owner/administrator only).
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => setDeleteTarget(null)}
                disabled={deleting}
                className="rounded-lg border border-border px-4 py-2 text-sm font-semibold hover:bg-secondary disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                onClick={confirmDelete}
                disabled={deleting}
                className="rounded-lg bg-destructive px-4 py-2 text-sm font-semibold text-destructive-foreground disabled:opacity-60"
              >
                {deleting ? "Archiving…" : "Delete (archive)"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
