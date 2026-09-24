import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, Loader2, Pencil, Trash2 } from "lucide-react";
import { GENRES } from "@/lib/data";
import { getAccessToken, useResolvedAdminSession, can } from "@/lib/admin/use-admin-session";
import { getPublicContentSettings } from "@/lib/admin/settings.functions";
import {
  adminGetCatalogBook,
  adminReviewBookRights,
  adminReviewBookEdition,
  adminPublishCatalogBook,
  adminSetBookLifecycle,
  adminReviewAndPublishTranslationEdition,
  adminQueueTranslationJob,
  adminSetBookAccessType,
  adminSetEditionAccessType,
  adminUpdateBookMetadata,
  adminGetBookDeletionImpact,
  adminDeleteBookPermanently,
  adminGetChunkForEdit,
  adminStageChunkContentEdit,
  adminPublishChunkContentEdit,
  adminDiscardChunkContentEdit,
  adminSetBookCategories,
} from "@/lib/admin/catalog.functions";
import type { BookDeletionImpact } from "@/lib/admin/catalog.server";

export const Route = createFileRoute("/admin/books/$bookId")({
  component: AdminBookDetail,
});

function AdminBookDetail() {
  const { bookId } = Route.useParams();
  const navigate = useNavigate();
  const session = useResolvedAdminSession();
  const queryClient = useQueryClient();
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);

  const [editOpen, setEditOpen] = useState(false);
  const [editDraft, setEditDraft] = useState({
    title: "",
    author: "",
    description: "",
    genre: "",
    coverUrl: "",
  });
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [permDeleteOpen, setPermDeleteOpen] = useState(false);
  const [permDeleteImpact, setPermDeleteImpact] = useState<BookDeletionImpact | null>(null);
  const [permDeleteConfirmText, setPermDeleteConfirmText] = useState("");

  const [editorLanguage, setEditorLanguage] = useState("");
  const [editorChunkIndex, setEditorChunkIndex] = useState(0);
  const [editorContent, setEditorContent] = useState<string | null>(null);
  const [editorPending, setEditorPending] = useState<{
    content: string;
    by: string | null;
    at: string | null;
  } | null>(null);
  const [editorDraft, setEditorDraft] = useState("");
  const [editorLoading, setEditorLoading] = useState(false);

  const [categoriesBusy, setCategoriesBusy] = useState(false);
  const masterCategoriesQuery = useQuery({
    queryKey: ["public-content-settings"],
    queryFn: () => getPublicContentSettings(),
  });
  const masterCategories = (masterCategoriesQuery.data?.["categories"] as string[] | undefined) ?? [];

  const detailQuery = useQuery({
    queryKey: ["admin-book", bookId],
    queryFn: async () =>
      adminGetCatalogBook({ data: { accessToken: await getAccessToken(), bookId } }),
  });

  async function refresh() {
    await queryClient.invalidateQueries({ queryKey: ["admin-book", bookId] });
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
    return <p className="text-sm text-destructive">Couldn't load this book.</p>;
  }

  const { book, jobs, gate, editions } = detailQuery.data;
  const canReview = can(session, "catalog.review");
  const canPublish = can(session, "catalog.publish");
  const canManageTranslations = can(session, "translation.jobs.manage");
  const canDeletePermanently = can(session, "catalog.delete_permanent");

  const allLanguages = [book.source_language, ...book.available_languages.filter((l) => l !== book.source_language)];

  function openEdit() {
    setEditDraft({
      title: book.title,
      author: book.author,
      description: book.description,
      genre: book.genre ?? "",
      coverUrl: book.cover_url ?? "",
    });
    setEditOpen(true);
  }

  async function saveEdit() {
    if (!editDraft.title.trim() || !editDraft.description.trim()) {
      toast.error("Title and description can't be empty.");
      return;
    }
    await withBusy(async () => {
      await adminUpdateBookMetadata({
        data: {
          accessToken: await getAccessToken(),
          bookId,
          title: editDraft.title.trim(),
          author: editDraft.author.trim(),
          description: editDraft.description.trim(),
          genre: editDraft.genre.trim() || null,
          coverUrl: editDraft.coverUrl.trim() || null,
        },
      });
      toast.success("Saved");
      setEditOpen(false);
    });
  }

  async function confirmDelete() {
    await withBusy(async () => {
      await adminSetBookLifecycle({
        data: {
          accessToken: await getAccessToken(),
          bookId,
          status: "archived",
          reason: "Deleted (reversible) from the admin book detail view",
        },
      });
      toast.success("Archived — reversible from here anytime.");
      setDeleteOpen(false);
    });
  }

  async function openPermDelete() {
    setPermDeleteConfirmText("");
    setPermDeleteImpact(null);
    setPermDeleteOpen(true);
    try {
      const impact = await adminGetBookDeletionImpact({
        data: { accessToken: await getAccessToken(), bookId },
      });
      setPermDeleteImpact(impact);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't load deletion impact");
      setPermDeleteOpen(false);
    }
  }

  async function confirmPermDelete() {
    await withBusy(async () => {
      await adminDeleteBookPermanently({
        data: { accessToken: await getAccessToken(), bookId, confirmTitle: permDeleteConfirmText },
      });
      toast.success("Permanently deleted");
      setPermDeleteOpen(false);
      navigate({ to: "/admin/books" });
    });
  }

  async function loadChunkForEdit() {
    setEditorLoading(true);
    setEditorContent(null);
    setEditorPending(null);
    try {
      const chunk = await adminGetChunkForEdit({
        data: {
          accessToken: await getAccessToken(),
          bookId,
          language: editorLanguage,
          chunkIndex: editorChunkIndex,
        },
      });
      if (!chunk) {
        toast.error("No page at that language/index.");
        return;
      }
      setEditorContent(chunk.content);
      setEditorDraft(chunk.pending_content ?? chunk.content);
      if (chunk.pending_content) {
        setEditorPending({
          content: chunk.pending_content,
          by: chunk.pending_content_by,
          at: chunk.pending_content_at,
        });
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't load this page");
    } finally {
      setEditorLoading(false);
    }
  }

  async function stageEdit() {
    await withBusy(async () => {
      await adminStageChunkContentEdit({
        data: {
          accessToken: await getAccessToken(),
          bookId,
          language: editorLanguage,
          chunkIndex: editorChunkIndex,
          newContent: editorDraft,
        },
      });
      toast.success("Staged — publish this edit once you're satisfied it reads correctly.");
    });
    await loadChunkForEdit();
  }

  async function publishEdit() {
    await withBusy(async () => {
      await adminPublishChunkContentEdit({
        data: {
          accessToken: await getAccessToken(),
          bookId,
          language: editorLanguage,
          chunkIndex: editorChunkIndex,
        },
      });
      toast.success("Published — this page now shows the edited text to readers.");
    });
    await loadChunkForEdit();
  }

  async function discardEdit() {
    await withBusy(async () => {
      await adminDiscardChunkContentEdit({
        data: {
          accessToken: await getAccessToken(),
          bookId,
          language: editorLanguage,
          chunkIndex: editorChunkIndex,
        },
      });
      toast.success("Pending edit discarded");
    });
    await loadChunkForEdit();
  }

  async function toggleCategory(category: string, current: string[]) {
    setCategoriesBusy(true);
    try {
      const next = current.includes(category)
        ? current.filter((c) => c !== category)
        : [...current, category];
      await adminSetBookCategories({
        data: { accessToken: await getAccessToken(), bookId, categories: next },
      });
      await refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't update categories");
    } finally {
      setCategoriesBusy(false);
    }
  }

  return (
    <div>
      <Link
        to="/admin/books"
        className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Catalog
      </Link>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold text-foreground">{book.title}</h1>
          <p className="text-sm text-muted-foreground">
            by {book.author} · {book.source_language} · status: {book.status}
          </p>
        </div>
        {canPublish && (
          <div className="flex flex-wrap gap-2">
            <button
              onClick={openEdit}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-secondary"
            >
              <Pencil className="h-3.5 w-3.5" /> Edit
            </button>
            {book.status !== "archived" && (
              <button
                onClick={() => setDeleteOpen(true)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-destructive/40 px-3 py-1.5 text-xs font-semibold text-destructive hover:bg-destructive/10"
              >
                <Trash2 className="h-3.5 w-3.5" /> Delete
              </button>
            )}
            {canDeletePermanently && (
              <button
                onClick={() => void openPermDelete()}
                className="inline-flex items-center gap-1.5 rounded-lg bg-destructive px-3 py-1.5 text-xs font-semibold text-destructive-foreground hover:opacity-90"
              >
                <Trash2 className="h-3.5 w-3.5" /> Delete permanently
              </button>
            )}
          </div>
        )}
      </div>

      <section className="mt-6 grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-border bg-card p-5 card-shadow">
          <h2 className="font-display text-base font-semibold text-foreground">
            Rights & provenance
          </h2>
          <dl className="mt-3 space-y-1.5 text-sm">
            <Row label="Rights status" value={book.rights_status} />
            <Row label="Rights basis" value={book.rights_basis ?? "—"} />
            <Row label="Rights evidence" value={book.rights_evidence_url ?? "—"} />
            <Row label="Attribution" value={book.attribution ?? "—"} />
            <Row label="Source URL" value={book.source_url ?? "—"} />
            <Row
              label="Translation permission"
              value={book.translation_permission ? "Yes" : "No"}
            />
            <Row
              label="Permitted territories"
              value={
                book.permitted_territories?.length
                  ? book.permitted_territories.join(", ")
                  : "Unrestricted"
              }
            />
          </dl>
          {canReview && book.rights_status === "pending" && (
            <div className="mt-4 flex gap-2">
              <button
                disabled={busy}
                onClick={() =>
                  withBusy(async () => {
                    await adminReviewBookRights({
                      data: {
                        accessToken: await getAccessToken(),
                        bookId,
                        decision: "approved",
                        notes,
                      },
                    });
                    toast.success("Rights approved");
                  })
                }
                className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground disabled:opacity-60"
              >
                Approve rights
              </button>
              <button
                disabled={busy}
                onClick={() =>
                  withBusy(async () => {
                    await adminReviewBookRights({
                      data: {
                        accessToken: await getAccessToken(),
                        bookId,
                        decision: "rejected",
                        notes,
                      },
                    });
                    toast.success("Rights rejected");
                  })
                }
                className="rounded-lg border border-destructive/40 px-3 py-1.5 text-xs font-semibold text-destructive disabled:opacity-60"
              >
                Reject rights
              </button>
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-border bg-card p-5 card-shadow">
          <h2 className="font-display text-base font-semibold text-foreground">
            Edition quality review
          </h2>
          <dl className="mt-3 space-y-1.5 text-sm">
            <Row label="Edition review status" value={book.edition_review_status} />
            <Row label="Total chunks" value={String(book.total_chunks)} />
            <Row label="Available languages" value={book.available_languages.join(", ")} />
            <Row label="Review notes" value={book.review_notes ?? "—"} />
          </dl>
          {canReview && book.edition_review_status !== "approved" && (
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                disabled={busy}
                onClick={() =>
                  withBusy(async () => {
                    await adminReviewBookEdition({
                      data: {
                        accessToken: await getAccessToken(),
                        bookId,
                        decision: "approved",
                        notes,
                      },
                    });
                    toast.success("Edition approved");
                  })
                }
                className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground disabled:opacity-60"
              >
                Approve edition
              </button>
              <button
                disabled={busy}
                onClick={() =>
                  withBusy(async () => {
                    await adminReviewBookEdition({
                      data: {
                        accessToken: await getAccessToken(),
                        bookId,
                        decision: "changes_requested",
                        notes,
                      },
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
                    await adminReviewBookEdition({
                      data: {
                        accessToken: await getAccessToken(),
                        bookId,
                        decision: "rejected",
                        notes,
                      },
                    });
                    toast.success("Edition rejected");
                  })
                }
                className="rounded-lg border border-destructive/40 px-3 py-1.5 text-xs font-semibold text-destructive disabled:opacity-60"
              >
                Reject
              </button>
            </div>
          )}
        </div>
      </section>

      {canReview && (
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Notes for this decision (shown to the author, recorded in the audit log)…"
          className="mt-4 w-full rounded-xl border border-border bg-card px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
        />
      )}

      <section className="mt-6 rounded-2xl border border-border bg-card p-5 card-shadow">
        <h2 className="font-display text-base font-semibold text-foreground">Publish</h2>
        {gate.canPublish ? (
          <p className="mt-2 text-sm text-emerald-600">
            Ready to publish — rights and edition quality are both approved.
          </p>
        ) : (
          <ul className="mt-2 list-disc pl-5 text-sm text-muted-foreground">
            {gate.reasons.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        )}
        {gate.pendingTranslations.length > 0 && (
          <div className="mt-3 rounded-xl bg-secondary/60 px-3 py-2">
            <p className="text-xs text-muted-foreground">
              Standard-language editions still pending — this does <strong>not</strong> block
              publishing the original: {gate.pendingTranslations.join(", ")}.
            </p>
            {canManageTranslations && (
              <div className="mt-2 flex flex-wrap gap-2">
                {gate.pendingTranslations.map((lang) => {
                  const hasJob = jobs.some((j) => j.language === lang);
                  return hasJob ? null : (
                    <button
                      key={lang}
                      disabled={busy}
                      onClick={() =>
                        withBusy(async () => {
                          await adminQueueTranslationJob({
                            data: { accessToken: await getAccessToken(), bookId, language: lang },
                          });
                          toast.success(`${lang} translation queued`);
                        })
                      }
                      className="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-secondary disabled:opacity-60"
                    >
                      Start {lang} translation
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}
        <div className="mt-4 flex flex-wrap gap-2">
          {canPublish && gate.canPublish && book.status !== "published" && (
            <button
              disabled={busy}
              onClick={() =>
                withBusy(async () => {
                  await adminPublishCatalogBook({
                    data: { accessToken: await getAccessToken(), bookId },
                  });
                  toast.success("Published");
                })
              }
              className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-60"
            >
              Publish
            </button>
          )}
          {canPublish && book.status === "published" && (
            <button
              disabled={busy}
              onClick={() => {
                const r = window.prompt("Reason for unpublishing (required):");
                if (!r) return;
                void withBusy(async () => {
                  await adminSetBookLifecycle({
                    data: {
                      accessToken: await getAccessToken(),
                      bookId,
                      status: "unpublished",
                      reason: r,
                    },
                  });
                  toast.success("Unpublished");
                });
              }}
              className="rounded-lg border border-border px-4 py-2 text-sm font-semibold text-foreground hover:bg-secondary disabled:opacity-60"
            >
              Unpublish
            </button>
          )}
          {canPublish && book.status !== "archived" && (
            <button
              disabled={busy}
              onClick={() => {
                const r = window.prompt("Reason for archiving (required):");
                if (!r) return;
                void withBusy(async () => {
                  await adminSetBookLifecycle({
                    data: {
                      accessToken: await getAccessToken(),
                      bookId,
                      status: "archived",
                      reason: r,
                    },
                  });
                  toast.success("Archived");
                });
              }}
              className="rounded-lg border border-border px-4 py-2 text-sm font-semibold text-foreground hover:bg-secondary disabled:opacity-60"
            >
              Archive
            </button>
          )}
        </div>
      </section>

      <section className="mt-6 rounded-2xl border border-border bg-card p-5 card-shadow">
        <h2 className="font-display text-base font-semibold text-foreground">Access</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Free/Premium is set independently per edition. While monetization is off (Admin
          Settings), every edition stays free to read regardless of this setting — switching it
          now cannot lock a reader out at launch.
        </p>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-background px-4 py-2.5 text-sm">
          <span className="font-medium text-foreground">
            Original edition ({book.source_language})
          </span>
          <div className="flex items-center gap-2">
            <span
              className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${book.access_type === "paid" ? "bg-gold/20 text-gold-foreground" : "bg-accent text-accent-foreground"}`}
            >
              {book.access_type === "paid" ? "Premium" : "Free"}
            </span>
            {canPublish && (
              <button
                disabled={busy}
                onClick={() =>
                  withBusy(async () => {
                    const next = book.access_type === "paid" ? "free" : "paid";
                    await adminSetBookAccessType({
                      data: { accessToken: await getAccessToken(), bookId, accessType: next },
                    });
                    toast.success(`Original edition set to ${next === "paid" ? "Premium" : "Free"}`);
                  })
                }
                className="rounded-lg border border-border px-3 py-1 text-xs font-semibold text-foreground hover:bg-secondary disabled:opacity-60"
              >
                Switch to {book.access_type === "paid" ? "Free" : "Premium"}
              </button>
            )}
          </div>
        </div>

        {editions.length > 0 && (
          <ul className="mt-2 space-y-2">
            {editions.map((ed) => (
              <li
                key={ed.language}
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-background px-4 py-2.5 text-sm"
              >
                <span className="font-medium text-foreground">{ed.language} translation</span>
                <div className="flex items-center gap-2">
                  <span
                    className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${ed.access_type === "paid" ? "bg-gold/20 text-gold-foreground" : "bg-accent text-accent-foreground"}`}
                  >
                    {ed.access_type === "paid" ? "Premium" : "Free"}
                  </span>
                  {canPublish && (
                    <button
                      disabled={busy}
                      onClick={() =>
                        withBusy(async () => {
                          const next = ed.access_type === "paid" ? "free" : "paid";
                          await adminSetEditionAccessType({
                            data: {
                              accessToken: await getAccessToken(),
                              bookId,
                              language: ed.language,
                              accessType: next,
                            },
                          });
                          toast.success(
                            `${ed.language} edition set to ${next === "paid" ? "Premium" : "Free"}`,
                          );
                        })
                      }
                      className="rounded-lg border border-border px-3 py-1 text-xs font-semibold text-foreground hover:bg-secondary disabled:opacity-60"
                    >
                      Switch to {ed.access_type === "paid" ? "Free" : "Premium"}
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
        {editions.length === 0 && (
          <p className="mt-2 text-xs text-muted-foreground">
            No published translated editions yet — access settings appear here once one is
            reviewed and published below.
          </p>
        )}
      </section>

      {canPublish && (
        <section className="mt-6 rounded-2xl border border-border bg-card p-5 card-shadow">
          <h2 className="font-display text-base font-semibold text-foreground">Categories</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            A book may belong to more than one category. Only categories already in the master
            list (Admin Settings → categories) can be assigned here.
          </p>
          {masterCategories.length === 0 ? (
            <p className="mt-3 text-xs text-muted-foreground">
              No categories defined yet — add some to the "categories" setting in Admin Settings
              first.
            </p>
          ) : (
            <div className="mt-3 flex flex-wrap gap-2">
              {masterCategories.map((c) => {
                const active = (book.categories ?? []).includes(c);
                return (
                  <button
                    key={c}
                    disabled={categoriesBusy}
                    onClick={() => toggleCategory(c, book.categories ?? [])}
                    className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors disabled:opacity-60 ${
                      active
                        ? "bg-primary text-primary-foreground"
                        : "border border-border bg-background text-foreground hover:bg-secondary"
                    }`}
                  >
                    {c}
                  </button>
                );
              })}
            </div>
          )}
        </section>
      )}

      <section className="mt-6 rounded-2xl border border-border bg-card p-5 card-shadow">
        <h2 className="font-display text-base font-semibold text-foreground">
          Translation editions
        </h2>
        <ul className="mt-3 space-y-2">
          {jobs.map((j) => (
            <li
              key={j.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-background px-4 py-2 text-sm"
            >
              <span>
                {j.language} — {j.status} ({j.completed_sections}/{j.total_sections},{" "}
                {j.human_reviewed ? "reviewed" : "not yet reviewed"})
              </span>
              {canManageTranslations && j.status === "awaiting_review" && (
                <button
                  disabled={busy}
                  onClick={() =>
                    withBusy(async () => {
                      await adminReviewAndPublishTranslationEdition({
                        data: { accessToken: await getAccessToken(), jobId: j.id },
                      });
                      toast.success(`${j.language} edition published`);
                    })
                  }
                  className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground disabled:opacity-60"
                >
                  Review & publish
                </button>
              )}
            </li>
          ))}
          {jobs.length === 0 && (
            <p className="text-sm text-muted-foreground">No translation jobs yet.</p>
          )}
        </ul>
      </section>

      {canReview && (
        <section className="mt-6 rounded-2xl border border-border bg-card p-5 card-shadow">
          <h2 className="font-display text-base font-semibold text-foreground">
            Edit page content
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Works on any language, original or translated. An edit is staged, not published
            immediately — readers keep seeing the current text until you explicitly publish it.
          </p>
          <div className="mt-3 flex flex-wrap items-end gap-2">
            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium text-muted-foreground">Language</span>
              <select
                value={editorLanguage}
                onChange={(e) => setEditorLanguage(e.target.value)}
                className="rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <option value="">Choose…</option>
                {allLanguages.map((l) => (
                  <option key={l} value={l}>
                    {l}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium text-muted-foreground">
                Page (0–{book.total_chunks - 1})
              </span>
              <input
                type="number"
                min={0}
                max={book.total_chunks - 1}
                value={editorChunkIndex}
                onChange={(e) => setEditorChunkIndex(Number(e.target.value))}
                className="w-28 rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </label>
            <button
              disabled={!editorLanguage || editorLoading}
              onClick={() => void loadChunkForEdit()}
              className="rounded-lg border border-border px-3 py-2 text-sm font-semibold text-foreground hover:bg-secondary disabled:opacity-60"
            >
              {editorLoading ? "Loading…" : "Load"}
            </button>
          </div>

          {editorContent !== null && (
            <div className="mt-4">
              {editorPending && (
                <p className="mb-2 rounded-lg bg-gold/10 px-3 py-2 text-xs text-gold-foreground">
                  Pending edit staged
                  {editorPending.at ? ` ${new Date(editorPending.at).toLocaleString()}` : ""} —
                  not yet visible to readers.
                </p>
              )}
              <textarea
                value={editorDraft}
                onChange={(e) => setEditorDraft(e.target.value)}
                rows={10}
                className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
              <div className="mt-2 flex flex-wrap gap-2">
                <button
                  disabled={busy || editorDraft === editorContent}
                  onClick={() => void stageEdit()}
                  className="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-secondary disabled:opacity-60"
                >
                  Stage edit
                </button>
                {editorPending && (
                  <>
                    <button
                      disabled={busy}
                      onClick={() => void publishEdit()}
                      className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground disabled:opacity-60"
                    >
                      Publish staged edit
                    </button>
                    <button
                      disabled={busy}
                      onClick={() => void discardEdit()}
                      className="rounded-lg border border-destructive/40 px-3 py-1.5 text-xs font-semibold text-destructive disabled:opacity-60"
                    >
                      Discard staged edit
                    </button>
                  </>
                )}
              </div>
            </div>
          )}
        </section>
      )}

      {editOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 card-shadow-lg">
            <h2 className="font-display text-lg font-semibold text-foreground">Edit metadata</h2>
            <div className="mt-3 space-y-2.5">
              <input
                value={editDraft.title}
                onChange={(e) => setEditDraft((d) => ({ ...d, title: e.target.value }))}
                placeholder="Title"
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
              <input
                value={editDraft.author}
                onChange={(e) => setEditDraft((d) => ({ ...d, author: e.target.value }))}
                placeholder="Author byline"
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
              <textarea
                value={editDraft.description}
                onChange={(e) => setEditDraft((d) => ({ ...d, description: e.target.value }))}
                placeholder="Description"
                rows={4}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
              <select
                value={editDraft.genre}
                onChange={(e) => setEditDraft((d) => ({ ...d, genre: e.target.value }))}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <option value="">No genre</option>
                {GENRES.map((g) => (
                  <option key={g} value={g}>
                    {g}
                  </option>
                ))}
              </select>
              <input
                value={editDraft.coverUrl}
                onChange={(e) => setEditDraft((d) => ({ ...d, coverUrl: e.target.value }))}
                placeholder="Cover image URL (optional)"
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </div>
            <p className="mt-2 text-[11px] text-muted-foreground">
              Rights, access, and pricing fields aren't edited here — this stays admin-published
              immediately, no re-review required (you are the reviewer).
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => setEditOpen(false)}
                disabled={busy}
                className="rounded-lg border border-border px-4 py-2 text-sm font-semibold hover:bg-secondary disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                onClick={() => void saveEdit()}
                disabled={busy}
                className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-60"
              >
                {busy ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}

      {deleteOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 card-shadow-lg">
            <h2 className="font-display text-lg font-semibold text-foreground">
              Delete “{book.title}”?
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              This archives the book — it stops being published and disappears from the catalog,
              but nothing is erased. Chunks, translations, editions, reader highlights and
              progress, requests, and audit history all stay intact, and this can be reversed from
              here anytime. For irreversible deletion, use "Delete permanently" instead (owner/
              administrator only).
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => setDeleteOpen(false)}
                disabled={busy}
                className="rounded-lg border border-border px-4 py-2 text-sm font-semibold hover:bg-secondary disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                onClick={() => void confirmDelete()}
                disabled={busy}
                className="rounded-lg bg-destructive px-4 py-2 text-sm font-semibold text-destructive-foreground disabled:opacity-60"
              >
                {busy ? "Archiving…" : "Delete (archive)"}
              </button>
            </div>
          </div>
        </div>
      )}

      {permDeleteOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-lg rounded-2xl border border-destructive/40 bg-card p-6 card-shadow-lg">
            <h2 className="font-display text-lg font-semibold text-destructive">
              Permanently delete “{book.title}”?
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              This cannot be undone. Everything below is deleted along with the book:
            </p>
            {!permDeleteImpact ? (
              <div className="mt-3 flex justify-center py-4">
                <Loader2 className="h-5 w-5 animate-spin text-primary" />
              </div>
            ) : (
              <ul className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 rounded-xl border border-border bg-background p-3 text-xs">
                <li>Pages (chunks): {permDeleteImpact.chunkCount}</li>
                <li>Translated editions: {permDeleteImpact.editionCount}</li>
                <li>Translation jobs: {permDeleteImpact.translationJobCount}</li>
                <li>Reading progress rows: {permDeleteImpact.progressCount}</li>
                <li>Reader highlights: {permDeleteImpact.highlightCount}</li>
                <li>Shelf entries: {permDeleteImpact.shelfCount}</li>
                <li>Subscriptions: {permDeleteImpact.subscriptionCount}</li>
                <li>Translation requests: {permDeleteImpact.translationRequestCount}</li>
                <li>Issue reports: {permDeleteImpact.translationReportCount}</li>
                <li>
                  Support tickets referencing it: {permDeleteImpact.relatedSupportTicketCount}{" "}
                  {permDeleteImpact.relatedSupportTicketCount > 0 ? "(kept, unlinked)" : ""}
                </li>
              </ul>
            )}
            <p className="mt-3 text-xs text-muted-foreground">
              Moderation and audit history for this book cannot be erased and is not affected by
              this action.
            </p>
            {permDeleteImpact && permDeleteImpact.status !== "archived" && permDeleteImpact.status !== "unpublished" && (
              <p className="mt-2 rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive">
                This book is still {permDeleteImpact.status} — take it down (Delete/archive) first,
                then permanently delete it as a separate step.
              </p>
            )}
            <label className="mt-3 block">
              <span className="text-xs font-medium text-muted-foreground">
                Type the exact title to confirm: <strong>{book.title}</strong>
              </span>
              <input
                value={permDeleteConfirmText}
                onChange={(e) => setPermDeleteConfirmText(e.target.value)}
                className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </label>
            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => setPermDeleteOpen(false)}
                disabled={busy}
                className="rounded-lg border border-border px-4 py-2 text-sm font-semibold hover:bg-secondary disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                disabled={
                  busy ||
                  !permDeleteImpact ||
                  permDeleteConfirmText !== book.title ||
                  (permDeleteImpact.status !== "archived" && permDeleteImpact.status !== "unpublished")
                }
                onClick={() => void confirmPermDelete()}
                className="rounded-lg bg-destructive px-4 py-2 text-sm font-semibold text-destructive-foreground disabled:opacity-60"
              >
                {busy ? "Deleting…" : "Permanently delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="shrink-0 text-muted-foreground">{label}</dt>
      <dd className="truncate text-right font-medium text-foreground">{value}</dd>
    </div>
  );
}
