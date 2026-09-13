import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, Loader2 } from "lucide-react";
import { getAccessToken, useAdminSession, can } from "@/lib/admin/use-admin-session";
import {
  adminGetCatalogBook,
  adminReviewBookRights,
  adminReviewBookEdition,
  adminPublishCatalogBook,
  adminSetBookLifecycle,
  adminReviewAndPublishTranslationEdition,
  adminQueueTranslationJob,
} from "@/lib/admin/catalog.functions";

export const Route = createFileRoute("/admin/books/$bookId")({
  component: AdminBookDetail,
});

function AdminBookDetail() {
  const { bookId } = Route.useParams();
  const sessionQuery = useAdminSession();
  const queryClient = useQueryClient();
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);

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

  const { book, jobs, gate } = detailQuery.data;
  const session = sessionQuery.data;
  const canReview = can(session, "catalog.review");
  const canPublish = can(session, "catalog.publish");
  const canManageTranslations = can(session, "translation.jobs.manage");

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
