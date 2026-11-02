import { toast } from "sonner";
import { friendlyTranslationError } from "@/lib/translation-error";
import { getAccessToken } from "@/lib/admin/use-admin-session";
import {
  adminProcessTranslationJobBatch,
  adminReviewAndPublishTranslationEdition,
} from "@/lib/admin/catalog.functions";

type Job = {
  id: string;
  language: string;
  status: string;
  completed_sections: number;
  total_sections: number;
  failed_sections: number;
  human_reviewed: boolean | null;
  last_error: string | null;
};

/** Preserve the existing admin capability-gated buttons and error feedback.
 * All writes continue to use server-side requireAdmin permission/MFA gates.
 */
export function AdminTranslationJobsPanel({
  jobs, canManageTranslations, busy, withBusy,
}: {
  jobs: Job[];
  canManageTranslations: boolean;
  busy: boolean;
  withBusy: (callback: () => Promise<void>) => Promise<void>;
}) {
  return (
      <section className="mt-6 rounded-2xl border border-border bg-card p-5 card-shadow">
        <h2 className="font-display text-base font-semibold text-foreground">
          Translation editions
        </h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Approved jobs are processed automatically by the translation worker. “Process next batch”
          is a manual fallback. Before publishing an awaiting-review edition, inspect every
          translated section below in Edit page content.
        </p>
        <ul className="mt-3 space-y-2">
          {jobs.map((j) => (
            <li
              key={j.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-background px-4 py-2 text-sm"
            >
              <div className="min-w-0">
                <span>
                  {j.language} — {j.status} ({j.completed_sections}/{j.total_sections},{" "}
                  {j.human_reviewed ? "reviewed" : "not yet reviewed"})
                </span>
                {j.failed_sections > 0 && (
                  <p className="mt-1 text-xs font-semibold text-destructive">
                    {j.failed_sections} section{j.failed_sections === 1 ? "" : "s"} currently failed
                  </p>
                )}
                {j.last_error && (
                  <p className="mt-1 max-w-2xl break-words rounded-lg bg-destructive/10 px-2.5 py-2 text-xs text-destructive">
                    {friendlyTranslationError(j.last_error)}
                  </p>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {canManageTranslations && ["pending", "processing"].includes(j.status) && (
                  <button
                    disabled={busy}
                    onClick={() =>
                      withBusy(async () => {
                        const result = await adminProcessTranslationJobBatch({
                          data: { accessToken: await getAccessToken(), jobId: j.id },
                        });
                        if (result.failed > 0) {
                          toast.error(
                            result.errors[0] ?? `${result.failed} translation section(s) failed`,
                            { duration: 9000 },
                          );
                        } else {
                          toast.success(
                            result.jobStatus === "awaiting_review"
                              ? `${j.language} translation is ready for review`
                              : `Processed ${result.processed} section(s); status: ${result.jobStatus}`,
                          );
                        }
                      })
                    }
                    className="min-h-10 rounded-lg border border-border px-3 py-2 text-xs font-semibold text-foreground hover:bg-secondary disabled:opacity-60"
                  >
                    Process next batch
                  </button>
                )}
                {canManageTranslations && j.status === "failed" && (
                  <button
                    disabled={busy}
                    onClick={() =>
                      withBusy(async () => {
                        if (
                          !window.confirm(
                            `Retry only the failed ${j.language} sections? Do this only after the provider/configuration problem shown above has been fixed.`,
                          )
                        ) {
                          return;
                        }
                        const result = await adminProcessTranslationJobBatch({
                          data: { accessToken: await getAccessToken(), jobId: j.id },
                        });
                        if (result.failed > 0) {
                          toast.error(
                            result.errors[0] ??
                              `${result.failed} translation section(s) are still failing`,
                            { duration: 9000 },
                          );
                        } else {
                          toast.success(
                            result.jobStatus === "awaiting_review"
                              ? `${j.language} translation is ready for review`
                              : `Retry processed ${result.processed} section(s)`,
                          );
                        }
                      })
                    }
                    className="min-h-11 rounded-lg border border-destructive/30 px-3 py-2 text-xs font-semibold text-destructive hover:bg-destructive/10 disabled:opacity-60"
                  >
                    Retry failed sections…
                  </button>
                )}
                {canManageTranslations && j.status === "awaiting_review" && (
                  <button
                    disabled={busy}
                    onClick={() =>
                      withBusy(async () => {
                        if (
                          !window.confirm(
                            `Publish the ${j.language} edition? Confirm only after reviewing every translated section in “Edit page content”.`,
                          )
                        ) {
                          return;
                        }
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
              </div>
            </li>
          ))}
          {jobs.length === 0 && (
            <p className="text-sm text-muted-foreground">No translation jobs yet.</p>
          )}
        </ul>
      </section>
  );
}
