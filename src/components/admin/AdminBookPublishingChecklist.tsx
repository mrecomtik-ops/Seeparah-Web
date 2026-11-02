import { toast } from "sonner";
import { getAccessToken } from "@/lib/admin/use-admin-session";
import {
  adminQueueTranslationJob,
  adminPublishCatalogBook,
  adminSetBookLifecycle,
} from "@/lib/admin/catalog.functions";

type PublicationBook = {
  status: string;
  rights_status: string | null;
  edition_review_status: string | null;
  structure_review_status: string | null;
  cleanup_review_status: string | null;
};
type PublicationGate = {
  canPublish: boolean;
  reasons: string[];
  pendingTranslations: string[];
};

/** Publishing/rights gate presentation only: every mutation still invokes
 * protected server functions and the parent's error/refresh handler. */
export function AdminBookPublishingChecklist({
  bookId, book, gate, jobs, busy, withBusy, canPublish,
  canManageTranslations, editionMetadataComplete, rightsRiskReviewed,
}: {
  bookId: string;
  book: PublicationBook;
  gate: PublicationGate;
  jobs: { language: string }[];
  busy: boolean;
  withBusy: (fn: () => Promise<void>) => Promise<void>;
  canPublish: boolean;
  canManageTranslations: boolean;
  editionMetadataComplete: boolean;
  rightsRiskReviewed: boolean;
}) {
  return (
      <section className="mt-6 rounded-2xl border border-border bg-card p-5 card-shadow">
        <h2 className="font-display text-base font-semibold text-foreground">
          Publishing checklist
        </h2>
        <div className="mt-3 space-y-2 text-sm">
          <div className="flex items-center justify-between gap-3 rounded-xl border border-border bg-background px-3 py-2">
            <span className="text-foreground">Rights review</span>
            <span
              className={
                book.rights_status === "approved"
                  ? "font-semibold text-emerald-600"
                  : "font-semibold text-amber-600"
              }
            >
              {book.rights_status === "approved" ? "✓ Approved" : "○ Approval required"}
            </span>
          </div>
          <div className="flex items-center justify-between gap-3 rounded-xl border border-border bg-background px-3 py-2">
            <span className="text-foreground">Edition quality review</span>
            <span
              className={
                book.edition_review_status === "approved"
                  ? "font-semibold text-emerald-600"
                  : "font-semibold text-amber-600"
              }
            >
              {book.edition_review_status === "approved" ? "✓ Approved" : "○ Approval required"}
            </span>
          </div>
          <div className="flex items-center justify-between gap-3 rounded-xl border border-border bg-background px-3 py-2">
            <span className="text-foreground">Structure review</span>
            <span
              className={
                book.structure_review_status === "approved"
                  ? "font-semibold text-emerald-600"
                  : "font-semibold text-amber-600"
              }
            >
              {book.structure_review_status === "approved" ? "✓ Approved" : "○ Approval required"}
            </span>
          </div>
          <div className="flex items-center justify-between gap-3 rounded-xl border border-border bg-background px-3 py-2">
            <span className="text-foreground">Text cleanup review</span>
            <span
              className={
                book.cleanup_review_status === "approved"
                  ? "font-semibold text-emerald-600"
                  : "font-semibold text-amber-600"
              }
            >
              {book.cleanup_review_status === "approved" ? "✓ Approved" : "○ Approval required"}
            </span>
          </div>
          <div className="flex items-center justify-between gap-3 rounded-xl border border-border bg-background px-3 py-2">
            <span className="text-foreground">Exact-edition metadata</span>
            <span
              className={
                editionMetadataComplete
                  ? "font-semibold text-emerald-600"
                  : "font-semibold text-amber-600"
              }
            >
              {editionMetadataComplete ? "✓ Complete" : "○ Complete metadata required"}
            </span>
          </div>
          <div className="flex items-center justify-between gap-3 rounded-xl border border-border bg-background px-3 py-2">
            <span className="text-foreground">Rights-risk clues</span>
            <span
              className={
                rightsRiskReviewed
                  ? "font-semibold text-emerald-600"
                  : "font-semibold text-amber-600"
              }
            >
              {rightsRiskReviewed
                ? "✓ Reviewed / none detected"
                : "○ Review acknowledgment required"}
            </span>
          </div>
        </div>
        {gate.canPublish ? (
          <p className="mt-3 text-sm font-medium text-emerald-600">
            Ready to publish — all required checks are complete.
          </p>
        ) : (
          <div className="mt-3 rounded-xl bg-amber-500/10 px-3 py-2">
            <p className="text-xs font-semibold text-amber-700 dark:text-amber-300">
              Complete the required reviews above to unlock publishing.
            </p>
            <ul className="mt-1 list-disc pl-5 text-xs text-muted-foreground">
              {gate.reasons.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
          </div>
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
                      className="min-h-10 rounded-lg border border-border px-3 py-2 text-xs font-semibold text-foreground hover:bg-secondary disabled:opacity-60"
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
          {canPublish && book.status !== "published" && (
            <button
              disabled={busy || !gate.canPublish}
              title={
                !gate.canPublish
                  ? gate.reasons.join(" • ")
                  : "Publish this book to the public catalog"
              }
              onClick={() =>
                withBusy(async () => {
                  await adminPublishCatalogBook({
                    data: { accessToken: await getAccessToken(), bookId },
                  });
                  toast.success("Published");
                })
              }
              className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50"
            >
              {gate.canPublish ? "Publish book" : "Publish book — complete checklist first"}
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
  );
}
