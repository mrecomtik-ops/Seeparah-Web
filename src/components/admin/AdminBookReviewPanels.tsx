import { Pencil } from "lucide-react";
import { toast } from "sonner";
import { getAccessToken } from "@/lib/admin/use-admin-session";
import {
  adminAcknowledgeBookRightsSignals, adminReviewBookRights,
  adminReviewBookEdition, adminReviewBookReaderQuality,
} from "@/lib/admin/catalog.functions";
import type { adminGetCatalogBook } from "@/lib/admin/catalog.functions";
import { Row, formatPublicationYear } from "@/components/admin/AdminBookPresentation";

type CatalogDetail = Awaited<ReturnType<typeof adminGetCatalogBook>>;

/** Exact rights evidence, human legal/edition decisions and reader quality
 * review in one independently testable module. Every mutation is still
 * checked server-side through requireAdmin and AAL2, and the parent owns
 * the refresh/busy orchestration. No automatic scripture corrections. */
export function AdminBookReviewPanels({
  book, bookId, rightsSignals, rightsRiskReviewed,
  readerV2SchemaAvailable, canReview, busy, notes, openRightsEdit, withBusy,
}: {
  book: CatalogDetail["book"];
  bookId: string;
  rightsSignals: CatalogDetail["rightsSignals"];
  rightsRiskReviewed: boolean;
  readerV2SchemaAvailable: boolean;
  canReview: boolean;
  busy: boolean;
  notes: string;
  openRightsEdit: () => void;
  withBusy: (action: () => Promise<void>) => Promise<void>;
}) {
  return (
      <section className="mt-6 grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-border bg-card p-5 card-shadow">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-display text-base font-semibold text-foreground">
              Rights & provenance
            </h2>
            {canReview && (
              <button
                type="button"
                disabled={busy || book.status === "published"}
                title={
                  book.status === "published"
                    ? "Unpublish the book before changing rights information."
                    : "Edit rights and provenance"
                }
                onClick={openRightsEdit}
                className="inline-flex items-center gap-1.5 min-h-10 rounded-lg border border-border px-3 py-2 text-xs font-semibold text-foreground hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Pencil className="h-3.5 w-3.5" /> Edit rights
              </button>
            )}
          </div>
          {book.status === "published" && canReview && (
            <p className="mt-2 text-xs text-muted-foreground">
              Unpublish this book before changing its rights record; any rights change must be
              reviewed again before republishing.
            </p>
          )}
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
          {rightsSignals.length > 0 && (
            <div className="mt-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-3">
              <p className="text-xs font-semibold text-amber-800 dark:text-amber-200">
                Edition text contains rights-review clues
              </p>
              <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                These are automated text signals, not a legal conclusion. Compare them with the
                exact edition/source evidence before approving rights.
              </p>
              <ul className="mt-2 space-y-2">
                {rightsSignals.map((signal, i) => (
                  <li
                    key={`${signal.chunkIndex}:${signal.label}:${i}`}
                    className="rounded-lg bg-background/70 px-2.5 py-2 text-xs"
                  >
                    <span className="font-semibold text-foreground">
                      {signal.label} · section {signal.chunkIndex + 1}
                    </span>
                    <p className="mt-1 leading-relaxed text-muted-foreground">{signal.snippet}</p>
                  </li>
                ))}
              </ul>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                {book.rights_risk_acknowledged_at ? (
                  <span className="rounded-full bg-emerald-500/10 px-2.5 py-1 text-[11px] font-semibold text-emerald-700 dark:text-emerald-300">
                    ✓ Reviewed {new Date(book.rights_risk_acknowledged_at).toLocaleString()}
                  </span>
                ) : canReview ? (
                  <button
                    disabled={busy}
                    onClick={() =>
                      withBusy(async () => {
                        await adminAcknowledgeBookRightsSignals({
                          data: { accessToken: await getAccessToken(), bookId },
                        });
                        toast.success("Rights-risk clues acknowledged");
                      })
                    }
                    className="rounded-lg border border-amber-500/40 bg-background px-3 py-1.5 text-xs font-semibold text-amber-800 hover:bg-amber-500/10 disabled:opacity-60 dark:text-amber-200"
                  >
                    I reviewed these clues
                  </button>
                ) : null}
              </div>
            </div>
          )}
          {canReview && book.rights_status !== "approved" && (
            <p className="mt-3 rounded-lg bg-secondary/60 px-3 py-2 text-xs text-muted-foreground">
              Approval requires a substantive rights basis and a real http(s) evidence URL for this
              exact edition. Placeholder or unresolved text such as “hh”, “test”, “unknown”,
              “PENDING”, or “do not approve” is rejected.
            </p>
          )}
          {canReview && ["pending", "unverified", "rejected"].includes(book.rights_status) && (
            <div className="mt-4 flex gap-2">
              <button
                disabled={busy || !rightsRiskReviewed}
                title={
                  !rightsRiskReviewed
                    ? "Review and acknowledge the manuscript rights clues first."
                    : "Approve rights"
                }
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
                className="min-h-10 rounded-lg border border-destructive/40 px-3 py-2 text-xs font-semibold text-destructive disabled:opacity-60"
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
            {readerV2SchemaAvailable && (
              <>
                <Row label="Edition" value={book.edition_title ?? "—"} />
                <Row
                  label="Edition year"
                  value={book.edition_year ? String(book.edition_year) : "—"}
                />
                <Row label="Publisher" value={book.publisher ?? "—"} />
                <Row label="ISBN / source ID" value={book.isbn ?? book.source_scan_id ?? "—"} />
                <Row
                  label="Original publication"
                  value={
                    book.original_publication_year
                      ? formatPublicationYear(book.original_publication_year)
                      : "—"
                  }
                />
                <Row
                  label="Word count"
                  value={book.word_count ? book.word_count.toLocaleString() : "—"}
                />
                <Row
                  label="Estimated reading time"
                  value={
                    book.estimated_reading_minutes ? `${book.estimated_reading_minutes} min` : "—"
                  }
                />
                <Row label="Structure review" value={book.structure_review_status ?? "—"} />
                <Row label="Text cleanup review" value={book.cleanup_review_status ?? "—"} />
              </>
            )}
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
                className="min-h-10 rounded-lg border border-border px-3 py-2 text-xs font-semibold text-foreground hover:bg-secondary disabled:opacity-60"
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
                className="min-h-10 rounded-lg border border-destructive/40 px-3 py-2 text-xs font-semibold text-destructive disabled:opacity-60"
              >
                Reject
              </button>
            </div>
          )}

          {readerV2SchemaAvailable && canReview && (
            <div className="mt-5 space-y-3 border-t border-border pt-4">
              {(["structure", "cleanup"] as const).map((target) => {
                const status =
                  target === "structure"
                    ? book.structure_review_status
                    : book.cleanup_review_status;
                const label = target === "structure" ? "Structure review" : "Text cleanup review";
                return (
                  <div key={target} className="rounded-xl border border-border bg-background p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-xs font-semibold text-foreground">{label}</span>
                      <span className="text-xs text-muted-foreground">{status ?? "pending"}</span>
                    </div>
                    {status !== "approved" && (
                      <div className="mt-2 flex flex-wrap gap-2">
                        <button
                          disabled={busy}
                          onClick={() =>
                            withBusy(async () => {
                              await adminReviewBookReaderQuality({
                                data: {
                                  accessToken: await getAccessToken(),
                                  bookId,
                                  target,
                                  decision: "approved",
                                  notes,
                                },
                              });
                              toast.success(`${label} approved`);
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
                              await adminReviewBookReaderQuality({
                                data: {
                                  accessToken: await getAccessToken(),
                                  bookId,
                                  target,
                                  decision: "changes_requested",
                                  notes,
                                },
                              });
                              toast.success(`${label}: changes requested`);
                            })
                          }
                          className="min-h-10 rounded-lg border border-border px-3 py-2 text-xs font-semibold text-foreground hover:bg-secondary disabled:opacity-60"
                        >
                          Request changes
                        </button>
                        <button
                          disabled={busy}
                          onClick={() =>
                            withBusy(async () => {
                              await adminReviewBookReaderQuality({
                                data: {
                                  accessToken: await getAccessToken(),
                                  bookId,
                                  target,
                                  decision: "rejected",
                                  notes,
                                },
                              });
                              toast.success(`${label} rejected`);
                            })
                          }
                          className="min-h-10 rounded-lg border border-destructive/40 px-3 py-2 text-xs font-semibold text-destructive disabled:opacity-60"
                        >
                          Reject
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </section>
  );
}
