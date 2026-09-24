import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { getAccessToken, useResolvedAdminSession, can } from "@/lib/admin/use-admin-session";
import {
  adminGetHealthSnapshot,
  adminRecoverRetryJob,
  adminRecoverResumeJob,
  adminMarkErrorResolved,
} from "@/lib/admin/health.functions";
import { AdminQueryError } from "@/components/admin/AdminQueryError";

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

  async function retryJob(jobId: string) {
    setBusyId(jobId);
    try {
      await adminRecoverRetryJob({ data: { accessToken: await getAccessToken(), jobId } });
      toast.success("Failed sections queued for retry");
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
      <h1 className="font-display text-2xl font-semibold text-foreground">Health</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Recovery actions here are a fixed allowlist (retry, resume, mark resolved) — no arbitrary
        SQL or table editing.
      </p>

      <section className="mt-6">
        <h2 className="font-display text-base font-semibold text-foreground">
          Stalled translation jobs (processing &gt;30min)
        </h2>
        <div className="mt-2 space-y-2">
          {h.stalledJobs.map((j) => (
            <div
              key={j.id}
              className="flex items-center justify-between rounded-xl border border-border bg-card p-3 text-sm"
            >
              <span>
                {j.language} · last updated {new Date(j.updatedAt).toLocaleString()}
              </span>
              {canRecover && (
                <button
                  disabled={busyId === j.id}
                  onClick={() => resumeJob(j.id)}
                  className="rounded-lg border border-border px-2 py-1 text-xs hover:bg-secondary disabled:opacity-60"
                >
                  Resume
                </button>
              )}
            </div>
          ))}
          {h.stalledJobs.length === 0 && <p className="text-sm text-muted-foreground">None.</p>}
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
              className="flex items-center justify-between rounded-xl border border-border bg-card p-3 text-sm"
            >
              <span>
                {j.language} · {j.failedSections} failed section(s)
              </span>
              {canRecover && (
                <button
                  disabled={busyId === j.id}
                  onClick={() => retryJob(j.id)}
                  className="rounded-lg border border-border px-2 py-1 text-xs hover:bg-secondary disabled:opacity-60"
                >
                  Retry
                </button>
              )}
            </div>
          ))}
          {h.failedJobs.length === 0 && <p className="text-sm text-muted-foreground">None.</p>}
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
            <p className="text-sm text-muted-foreground">None.</p>
          )}
        </div>
      </section>

      <section className="mt-6 rounded-2xl border border-dashed border-border p-4 text-sm text-muted-foreground">
        <p className="font-semibold text-foreground">
          Not covered by any button here (needs engineering or provider-console action):
        </p>
        <ul className="mt-1 list-disc pl-5">
          <li>Database/storage outages — check the Supabase project dashboard directly.</li>
          <li>Gemini provider outages/rate limits — check Google AI Studio / Vertex status.</li>
          <li>
            OAuth/redirect misconfiguration — check the Supabase Auth provider settings and Google
            Cloud Console OAuth client.
          </li>
        </ul>
      </section>
    </div>
  );
}
