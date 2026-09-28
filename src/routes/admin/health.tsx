import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle2, Loader2, RefreshCw } from "lucide-react";
import { getAccessToken, useResolvedAdminSession, can } from "@/lib/admin/use-admin-session";
import {
  adminGetHealthSnapshot,
  adminRecoverRetryJob,
  adminRecoverResumeJob,
  adminMarkErrorResolved,
} from "@/lib/admin/health.functions";
import { AdminQueryError } from "@/components/admin/AdminQueryError";
import { friendlyTranslationError } from "@/lib/translation-error";

export const Route = createFileRoute("/admin/health")({
  component: AdminHealthPage,
});

function AdminHealthPage() {
  const session = useResolvedAdminSession();
  const [busyId, setBusyId] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const healthQuery = useQuery({
    queryKey: ["admin-health-full"],
    queryFn: async () => adminGetHealthSnapshot({ data: { accessToken: await getAccessToken() } }),
    refetchInterval: 30_000,
  });

  const canRecover = can(session, "health.recover");

  async function refresh() {
    await queryClient.invalidateQueries({ queryKey: ["admin-health-full"] });
  }

  async function retryJob(jobId: string, lastError: string | null) {
    const friendly = friendlyTranslationError(lastError);
    if (
      !window.confirm(
        `Retry failed translation sections only after the underlying provider/configuration issue has been fixed.\n\nCurrent error: ${friendly ?? "Unknown"}\n\nContinue?`,
      )
    ) {
      return;
    }
    setBusyId(jobId);
    try {
      await adminRecoverRetryJob({ data: { accessToken: await getAccessToken(), jobId } });
      toast.success("Failed sections reset for retry");
      await refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Retry failed");
    } finally {
      setBusyId(null);
    }
  }

  async function resumeJob(jobId: string) {
    setBusyId(jobId);
    try {
      const result = await adminRecoverResumeJob({
        data: { accessToken: await getAccessToken(), jobId },
      });
      toast.success(`Processed ${result.processed} section(s)`);
      await refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't resume this job");
    } finally {
      setBusyId(null);
    }
  }

  async function resolveError(errorId: string) {
    setBusyId(errorId);
    try {
      await adminMarkErrorResolved({ data: { accessToken: await getAccessToken(), errorId } });
      await refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't resolve");
    } finally {
      setBusyId(null);
    }
  }

  if (healthQuery.isLoading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }
  if (healthQuery.isError) {
    return (
      <AdminQueryError
        message={
          healthQuery.error instanceof Error
            ? healthQuery.error.message
            : "Couldn't load the health snapshot."
        }
        onRetry={() => healthQuery.refetch()}
      />
    );
  }
  // healthQuery.data can only be undefined here if isLoading/isError are
  // both false yet the query somehow never populated data — shouldn't
  // happen given the two branches above, but "silently render nothing"
  // was exactly the previous bug (a genuine fetch error fell straight
  // through to `if (!h) return null`, a blank page with no error and no
  // way to retry). Surface it the same honest way rather than repeat that.
  const h = healthQuery.data;
  if (!h) {
    return (
      <AdminQueryError
        message="The health snapshot didn't load."
        onRetry={() => healthQuery.refetch()}
      />
    );
  }

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold text-foreground">Health</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Operational issues that need attention. Recovery controls are limited to safe,
            predefined actions.
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Last checked {new Date(healthQuery.dataUpdatedAt).toLocaleTimeString()} · refreshes every
            30 seconds
          </p>
        </div>
        <button
          type="button"
          onClick={() => void healthQuery.refetch()}
          className="inline-flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-2 text-xs font-semibold text-foreground hover:bg-secondary"
        >
          <RefreshCw className={`h-4 w-4 ${healthQuery.isFetching ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      <div className="mt-6 grid gap-3 sm:grid-cols-3">
        {[
          {
            label: "Stalled jobs",
            value: h.stalledJobs.length,
            healthy: h.stalledJobs.length === 0,
          },
          {
            label: "Failed jobs",
            value: h.failedJobs.length,
            healthy: h.failedJobs.length === 0,
          },
          {
            label: "Unresolved errors",
            value: h.unresolvedErrors.length,
            healthy: h.unresolvedErrors.length === 0,
          },
        ].map((item) => (
          <div
            key={item.label}
            className="rounded-2xl border border-border bg-card p-4 card-shadow"
          >
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-semibold text-foreground">{item.label}</p>
              {item.healthy ? (
                <CheckCircle2 className="h-5 w-5 text-primary" />
              ) : (
                <AlertTriangle className="h-5 w-5 text-gold" />
              )}
            </div>
            <p className="mt-2 font-display text-3xl font-semibold text-foreground">{item.value}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {item.healthy ? "Healthy" : "Needs attention"}
            </p>
          </div>
        ))}
      </div>

      <section className="mt-6">
        <h2 className="font-display text-base font-semibold text-foreground">
          Stalled translation jobs (processing &gt;30min)
        </h2>
        <div className="mt-2 space-y-2">
          {h.stalledJobs.map((j) => (
            <div
              key={j.id}
              className="flex flex-col gap-3 rounded-xl border border-border bg-card p-3 text-sm sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0">
                <p className="font-semibold text-foreground">{j.bookTitle}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {j.language} · last updated {new Date(j.updatedAt).toLocaleString()}
                </p>
              </div>
              {canRecover && (
                <button
                  disabled={busyId === j.id}
                  onClick={() => resumeJob(j.id)}
                  className="min-h-11 shrink-0 rounded-lg border border-border px-3 py-2 text-xs font-semibold hover:bg-secondary disabled:opacity-60"
                >
                  Resume
                </button>
              )}
            </div>
          ))}
          {h.stalledJobs.length === 0 && (
            <p className="text-sm text-muted-foreground">No stalled jobs.</p>
          )}
        </div>
      </section>

      <section className="mt-6">
        <h2 className="font-display text-base font-semibold text-foreground">
          Failed translation jobs
        </h2>
        <div className="mt-2 space-y-2">
          {h.failedJobs.map((j) => (
            <div
              key={j.id}
              className="flex flex-col gap-3 rounded-xl border border-border bg-card p-3 text-sm sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-foreground">{j.bookTitle}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {j.language} · {j.failedSections} failed section(s)
                </p>
                {j.lastError && (
                  <p className="mt-2 break-words rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive">
                    {friendlyTranslationError(j.lastError)}
                  </p>
                )}
              </div>
              {canRecover && (
                <button
                  disabled={busyId === j.id}
                  onClick={() => retryJob(j.id, j.lastError)}
                  className="min-h-11 shrink-0 rounded-lg border border-border px-3 py-2 text-xs font-semibold hover:bg-secondary disabled:opacity-60"
                >
                  Retry after fix…
                </button>
              )}
            </div>
          ))}
          {h.failedJobs.length === 0 && (
            <p className="text-sm text-muted-foreground">No unresolved failed jobs.</p>
          )}
        </div>
      </section>

      <section className="mt-6">
        <h2 className="font-display text-base font-semibold text-foreground">Unresolved errors</h2>
        <div className="mt-2 space-y-2">
          {h.unresolvedErrors.map((e) => (
            <div
              key={e.id}
              className="flex items-start justify-between gap-3 rounded-xl border border-border bg-card p-3 text-sm"
            >
              <div>
                <p>
                  <span className="mr-2 rounded-full bg-destructive/10 px-2 py-0.5 text-xs font-semibold text-destructive">
                    {e.severity}
                  </span>
                  <span className="font-mono text-xs text-muted-foreground">{e.code}</span>
                </p>
                <p className="mt-1">{e.message}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {new Date(e.occurredAt).toLocaleString()}
                </p>
              </div>
              {canRecover && (
                <button
                  disabled={busyId === e.id}
                  onClick={() => resolveError(e.id)}
                  className="shrink-0 rounded-lg border border-border px-2 py-1 text-xs hover:bg-secondary disabled:opacity-60"
                >
                  Mark resolved
                </button>
              )}
            </div>
          ))}
          {h.unresolvedErrors.length === 0 && (
            <p className="text-sm text-muted-foreground">No unresolved application errors.</p>
          )}
        </div>
      </section>

      <section className="mt-6 rounded-2xl border border-dashed border-border p-4 text-sm text-muted-foreground">
        <p className="font-semibold text-foreground">Provider and infrastructure checks</p>
        <ul className="mt-1 list-disc pl-5">
          <li>Database/storage outages require the Supabase project dashboard.</li>
          <li>Gemini provider outages or rate limits require the Google provider console.</li>
          <li>
            OAuth/redirect misconfiguration — check the Supabase Auth provider settings and Google
            Cloud Console OAuth client.
          </li>
        </ul>
      </section>
    </div>
  );
}
