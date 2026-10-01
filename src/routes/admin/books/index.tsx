import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Archive, CheckCheck, Globe2, Loader2, Plus } from "lucide-react";
import { toast } from "sonner";
import { getAccessToken, useResolvedAdminSession, can } from "@/lib/admin/use-admin-session";
import { getPublicContentSettings } from "@/lib/admin/settings.functions";
import { AdminQueryError } from "@/components/admin/AdminQueryError";
import {
  adminListCatalog,
  adminSetBookLifecycle,
  adminBulkPatchBookCategory,
  adminBulkApproveBookReviews,
  adminBulkPublishCatalogBooks,
  adminBulkRequestBookChanges,
} from "@/lib/admin/catalog.functions";
import {
  CATEGORY_ADMIN_WORKER_BATCH_SIZE,
  HEAVY_ADMIN_WORKER_BATCH_SIZE,
  splitIntoWorkerBatches,
} from "@/lib/admin/worker-batching";

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

function statusLabel(value: string) {
  return value
    ? value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase())
    : "All";
}

function catalogActionLabel(book: {
  status: string;
  rights_status: string | null;
  edition_review_status: string | null;
  structure_review_status: string | null;
  cleanup_review_status: string | null;
}) {
  if (book.status === "published") return "Manage";
  if (book.status === "archived") return "Review archive";
  if (
    book.rights_status !== "approved" ||
    book.edition_review_status !== "approved" ||
    book.structure_review_status !== "approved" ||
    book.cleanup_review_status !== "approved"
  ) {
    return "Review blockers";
  }
  if (book.status === "approved" || book.status === "unpublished") return "Review & publish";
  return "Continue review";
}

function AdminBooksList() {
  const [status, setStatus] = useState("");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; title: string } | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [bulkCategory, setBulkCategory] = useState("");
  const [categoryBusy, setCategoryBusy] = useState(false);
  const [reviewBusy, setReviewBusy] = useState(false);
  const [publishBusy, setPublishBusy] = useState(false);
  const [publishConfirmOpen, setPublishConfirmOpen] = useState(false);
  const [changeRequestBusy, setChangeRequestBusy] = useState(false);
  const [bulkChangeNote, setBulkChangeNote] = useState("");
  const queryClient = useQueryClient();
  const session = useResolvedAdminSession();
  const canPublish = can(session, "catalog.publish");
  const canReview = can(session, "catalog.review");
  const canManageCategories = can(session, "catalog.categories.manage");
  const masterCategoriesQuery = useQuery({
    queryKey: ["public-content-settings"],
    queryFn: () => getPublicContentSettings(),
  });
  const masterCategories =
    (masterCategoriesQuery.data?.["categories"] as string[] | undefined) ?? [];

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
  const total = booksQuery.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / 20));
  const selectedBooks = books.filter((b) => selected.has(b.id));
  const publishableSelected = selectedBooks.filter(
    (book) => book.status === "approved" || book.status === "unpublished",
  );
  const nonPublishableSelectedCount = selectedBooks.length - publishableSelected.length;

  useEffect(() => {
    setSelected(new Set());
  }, [status, query, page]);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setSelected((prev) => {
      const allCurrentPageSelected = books.length > 0 && books.every((book) => prev.has(book.id));
      if (allCurrentPageSelected) return new Set();
      return new Set(books.map((book) => book.id));
    });
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
          reason: "Archived from the admin catalog list",
        },
      });
      toast.success("Archived — reversible from the book's detail page anytime.");
      setDeleteTarget(null);
      await queryClient.invalidateQueries({ queryKey: ["admin-books"] });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't archive this book");
    } finally {
      setDeleting(false);
    }
  }

  async function publishSelected() {
    if (publishableSelected.length === 0) return;
    setPublishBusy(true);
    try {
      const accessToken = await getAccessToken();
      const results = [];
      for (const bookIds of splitIntoWorkerBatches(
        publishableSelected.map((book) => book.id),
        HEAVY_ADMIN_WORKER_BATCH_SIZE,
      )) {
        results.push(
          ...(await adminBulkPublishCatalogBooks({
            data: {
              accessToken,
              bookIds,
            },
          })),
        );
      }
      const failed = results.filter((result) => !result.ok);
      const published = results.length - failed.length;
      if (failed.length === 0) {
        toast.success(`Published ${published} book(s).`);
      } else {
        const details = failed
          .slice(0, 5)
          .map((result) => `${result.title}: ${result.error ?? "Publish gate blocked this book"}`)
          .join(" • ");
        toast.error(
          `${published} published; ${failed.length} blocked.${details ? ` ${details}` : ""}`,
          { duration: 14000 },
        );
      }
      setPublishConfirmOpen(false);
      setSelected(new Set());
      await queryClient.invalidateQueries({ queryKey: ["admin-books"] });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Bulk publish failed");
    } finally {
      setPublishBusy(false);
    }
  }

  async function approveSelectedReviews() {
    if (selected.size === 0) return;
    setReviewBusy(true);
    try {
      const accessToken = await getAccessToken();
      const results = [];
      for (const bookIds of splitIntoWorkerBatches([...selected], HEAVY_ADMIN_WORKER_BATCH_SIZE)) {
        results.push(
          ...(await adminBulkApproveBookReviews({
            data: {
              accessToken,
              bookIds,
              notes: "Bulk review approval from Admin Catalog",
            },
          })),
        );
      }
      const complete = results.filter((result) => result.ok).length;
      const needsAttention = results.length - complete;
      if (needsAttention === 0) {
        toast.success(`Review checks approved for ${complete} book(s).`);
      } else {
        const failures = results
          .filter((result) => !result.ok)
          .slice(0, 4)
          .map((result) => `${result.title}: ${result.blockers.join("; ")}`)
          .join(" • ");
        toast.error(
          `${complete} fully approved; ${needsAttention} still need individual attention.${
            failures ? ` ${failures}` : ""
          }`,
          { duration: 12000 },
        );
      }
      setSelected(new Set());
      await queryClient.invalidateQueries({ queryKey: ["admin-books"] });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Bulk review failed");
    } finally {
      setReviewBusy(false);
    }
  }

  async function requestSelectedChanges() {
    if (selected.size === 0) return;
    const notes = bulkChangeNote.trim();
    if (notes.length < 3) {
      toast.error("Add a short change-request note first.");
      return;
    }
    setChangeRequestBusy(true);
    try {
      const accessToken = await getAccessToken();
      const results = [];
      for (const bookIds of splitIntoWorkerBatches([...selected], HEAVY_ADMIN_WORKER_BATCH_SIZE)) {
        results.push(
          ...(await adminBulkRequestBookChanges({
            data: {
              accessToken,
              bookIds,
              notes,
            },
          })),
        );
      }
      const failed = results.filter((result) => !result.ok);
      if (failed.length === 0) {
        toast.success(`Changes requested for ${results.length} book(s).`);
        setBulkChangeNote("");
      } else {
        const details = failed
          .slice(0, 4)
          .map((result) => `${result.title}: ${result.error ?? "Unknown error"}`)
          .join(" • ");
        toast.error(
          `${results.length - failed.length} succeeded; ${failed.length} failed.${
            details ? ` ${details}` : ""
          }`,
          { duration: 12000 },
        );
      }
      setSelected(new Set());
      await queryClient.invalidateQueries({ queryKey: ["admin-books"] });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Bulk change request failed");
    } finally {
      setChangeRequestBusy(false);
    }
  }

  async function applyBulkCategory(action: "add" | "remove") {
    if (!bulkCategory || selected.size === 0) return;
    setCategoryBusy(true);
    try {
      const accessToken = await getAccessToken();
      const results = [];
      for (const bookIds of splitIntoWorkerBatches(
        [...selected],
        CATEGORY_ADMIN_WORKER_BATCH_SIZE,
      )) {
        results.push(
          ...(await adminBulkPatchBookCategory({
            data: {
              accessToken,
              bookIds,
              category: bulkCategory,
              action,
            },
          })),
        );
      }
      const failed = results.filter((r) => !r.ok);
      if (failed.length === 0) {
        toast.success(
          `${action === "add" ? "Added to" : "Removed from"} ${results.length} book(s)`,
        );
      } else {
        toast.error(`${results.length - failed.length} succeeded, ${failed.length} failed`);
      }
      await queryClient.invalidateQueries({ queryKey: ["admin-books"] });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Bulk category update failed");
    } finally {
      setCategoryBusy(false);
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
        Every original-language edition is permanently free. Paid access applies only to reviewed
        translated editions on a general book; Religious books and their verified translations are
        always free.
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
            {statusLabel(s)}
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

      {!booksQuery.isLoading && !booksQuery.isError && (
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
          <span>
            {total} matching {total === 1 ? "book" : "books"}
            {totalPages > 1 ? ` · Page ${page} of ${totalPages}` : ""}
          </span>
          <span>Select book checkboxes to reveal bulk review, publish, and category actions.</span>
        </div>
      )}

      {selected.size > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl border border-primary/30 bg-primary/5 px-4 py-2.5 text-sm">
          <span className="font-semibold text-foreground">{selected.size} selected</span>
          {canPublish && publishableSelected.length > 0 && (
            <button
              disabled={publishBusy}
              onClick={() => setPublishConfirmOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground disabled:opacity-60"
              title="Every selected book is rechecked against the complete publish gate before it becomes public."
            >
              <Globe2 className="h-3.5 w-3.5" />
              Publish selected ({publishableSelected.length})
            </button>
          )}
          {nonPublishableSelectedCount > 0 && (
            <span className="text-xs text-muted-foreground">
              {nonPublishableSelectedCount} selected not yet approved
            </span>
          )}
          {canReview && (
            <button
              disabled={reviewBusy}
              onClick={() => void approveSelectedReviews()}
              className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground disabled:opacity-60"
              title="Approves edition, structure and cleanup checks in bulk. Rights approval still stops on any unreviewed rights/copyright clues."
            >
              <CheckCheck className="h-3.5 w-3.5" />
              {reviewBusy ? "Approving…" : "Approve review checks"}
            </button>
          )}
          {canReview && (
            <>
              <input
                value={bulkChangeNote}
                onChange={(event) => setBulkChangeNote(event.target.value)}
                placeholder="Change-request note…"
                className="min-w-56 rounded-lg border border-border bg-card px-2 py-1.5 text-xs outline-none focus:ring-2 focus:ring-ring"
              />
              <button
                disabled={changeRequestBusy || bulkChangeNote.trim().length < 3}
                onClick={() => void requestSelectedChanges()}
                className="rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-semibold hover:bg-secondary disabled:opacity-60"
              >
                {changeRequestBusy ? "Requesting…" : "Request changes"}
              </button>
            </>
          )}
          {canManageCategories && masterCategories.length > 0 && (
            <>
              <select
                value={bulkCategory}
                onChange={(e) => setBulkCategory(e.target.value)}
                className="rounded-lg border border-border bg-card px-2 py-1.5 text-xs outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="">Category…</option>
                {masterCategories.map((c) => (
                  <option key={c} value={c} disabled={c === "Religious"}>
                    {c === "Religious" ? "Religious — use book content policy" : c}
                  </option>
                ))}
              </select>
              <button
                disabled={!bulkCategory || categoryBusy}
                onClick={() => applyBulkCategory("add")}
                className="rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-semibold hover:bg-secondary disabled:opacity-60"
              >
                Add category
              </button>
              <button
                disabled={!bulkCategory || bulkCategory === "Religious" || categoryBusy}
                title={
                  bulkCategory === "Religious"
                    ? "Religious is a protected category and cannot be removed in bulk."
                    : "Remove category"
                }
                onClick={() => applyBulkCategory("remove")}
                className="rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-semibold hover:bg-secondary disabled:opacity-60"
              >
                Remove category
              </button>
            </>
          )}
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
      ) : booksQuery.isError ? (
        <AdminQueryError
          message={
            booksQuery.error instanceof Error
              ? booksQuery.error.message
              : "Couldn't load the catalog."
          }
          onRetry={() => booksQuery.refetch()}
        />
      ) : (
        <div className="mt-4 overflow-x-auto rounded-2xl border border-border bg-card card-shadow">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted-foreground">
                <th className="w-8 px-4 py-2">
                  <input
                    type="checkbox"
                    checked={books.length > 0 && selectedBooks.length === books.length}
                    onChange={toggleAll}
                    aria-label="Select all"
                  />
                </th>
                <th className="px-4 py-2">Title</th>
                <th className="px-4 py-2">Author</th>
                <th className="px-4 py-2">Categories</th>
                <th className="px-4 py-2">Status</th>
                <th className="px-4 py-2">Original access</th>
                <th className="px-4 py-2">Rights</th>
                <th className="px-4 py-2">Edition</th>
                <th className="px-4 py-2">Structure</th>
                <th className="px-4 py-2">Cleanup</th>
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
                    {b.title === "Seeparah Reader V2 QA Book" && (
                      <span className="ml-2 rounded-full bg-secondary px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
                        QA fixture
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2 text-xs">{b.author}</td>
                  <td className="px-4 py-2 text-xs">
                    {(b.categories ?? []).length ? (
                      <div className="flex max-w-52 flex-wrap gap-1">
                        {(b.categories ?? []).map((category) => (
                          <span
                            key={category}
                            className="rounded-full bg-secondary px-2 py-0.5 text-[10px] font-semibold text-secondary-foreground"
                          >
                            {category}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <span className="text-muted-foreground">Uncategorized</span>
                    )}
                  </td>
                  <td className="px-4 py-2 text-xs">
                    <span className="rounded-full bg-secondary px-2.5 py-1 font-semibold text-secondary-foreground">
                      {statusLabel(b.status)}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-xs">
                    <span className="rounded-full bg-accent px-2 py-0.5 text-[11px] font-semibold text-accent-foreground">
                      Always free
                    </span>
                  </td>
                  <td className="px-4 py-2 text-xs">{b.rights_status}</td>
                  <td className="px-4 py-2 text-xs">
                    {statusLabel(b.edition_review_status ?? "")}
                  </td>
                  <td className="px-4 py-2 text-xs">
                    {statusLabel(b.structure_review_status ?? "")}
                  </td>
                  <td className="px-4 py-2 text-xs">
                    {statusLabel(b.cleanup_review_status ?? "")}
                  </td>
                  <td className="px-4 py-2 text-xs">
                    <div className="flex items-center gap-2">
                      <Link
                        to="/admin/books/$bookId"
                        params={{ bookId: b.id }}
                        className="text-primary hover:underline"
                      >
                        {catalogActionLabel(b)}
                      </Link>
                      {canPublish && b.status !== "archived" && (
                        <button
                          onClick={() => setDeleteTarget({ id: b.id, title: b.title })}
                          className="inline-flex items-center gap-1 text-destructive hover:underline"
                        >
                          <Archive className="h-3 w-3" /> Archive
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {books.length === 0 && (
                <tr>
                  <td colSpan={11} className="px-4 py-8 text-center text-sm text-muted-foreground">
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
          disabled={page >= totalPages}
          onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
          className="rounded-lg border border-border px-3 py-1.5 text-xs disabled:opacity-40"
        >
          Next
        </button>
        <span className="self-center text-xs text-muted-foreground">
          {total > 0 ? `Page ${page} of ${totalPages} · ${total} total` : "0 books"}
        </span>
      </div>

      {publishConfirmOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-lg rounded-2xl border border-border bg-card p-6 card-shadow-lg">
            <h2 className="font-display text-lg font-semibold text-foreground">
              Publish {publishableSelected.length} selected{" "}
              {publishableSelected.length === 1 ? "book" : "books"}?
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Each book will be rechecked for rights, edition quality, structure, cleanup, summary,
              exact-edition metadata, and any protected content requirements. A blocked book stays
              unpublished and will be reported; eligible books become public immediately.
            </p>
            {publishableSelected.length > 0 && (
              <div className="mt-3 max-h-40 overflow-y-auto rounded-xl bg-secondary/50 p-3 text-xs text-foreground">
                {publishableSelected.slice(0, 12).map((book) => (
                  <div key={book.id}>• {book.title}</div>
                ))}
                {publishableSelected.length > 12 && (
                  <div className="mt-1 text-muted-foreground">
                    + {publishableSelected.length - 12} more
                  </div>
                )}
              </div>
            )}
            {nonPublishableSelectedCount > 0 && (
              <p className="mt-2 text-xs text-muted-foreground">
                {nonPublishableSelectedCount} other selected book(s) are not Approved/Unpublished
                and will not be sent to the publish operation.
              </p>
            )}
            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => setPublishConfirmOpen(false)}
                disabled={publishBusy}
                className="rounded-lg border border-border px-4 py-2 text-sm font-semibold hover:bg-secondary disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                onClick={() => void publishSelected()}
                disabled={publishBusy || publishableSelected.length === 0}
                className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-60"
              >
                <Globe2 className="h-4 w-4" />
                {publishBusy ? "Publishing…" : "Publish eligible books"}
              </button>
            </div>
          </div>
        </div>
      )}

      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 card-shadow-lg">
            <h2 className="font-display text-lg font-semibold text-foreground">
              Archive “{deleteTarget.title}”?
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              This removes the book from public availability without erasing it. Chunks,
              translations, editions, reader highlights and progress, requests, and audit history
              all stay intact, and this can be reversed from the book's detail page anytime. For
              irreversible deletion, open the book and use "Delete permanently" (owner/administrator
              only).
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
                {deleting ? "Archiving…" : "Archive book"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
