import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { getAccessToken } from "@/lib/admin/use-admin-session";
import {
  adminGetSetting,
  adminPublishSetting,
  adminListSettingHistory,
  adminRollbackSetting,
  adminGetSecretsStatus,
} from "@/lib/admin/settings.functions";

export const Route = createFileRoute("/admin/settings")({
  component: AdminSettingsPage,
});

const KEYS = [
  "monetization_enabled",
  "maintenance_message",
  "support_contact",
  "announcements",
  "featured_books",
  "categories",
  "language_availability",
  "home_collections",
  "translation_budget",
] as const;

function AdminSettingsPage() {
  const [key, setKey] = useState<(typeof KEYS)[number]>("monetization_enabled");
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const queryClient = useQueryClient();

  const settingQuery = useQuery({
    queryKey: ["admin-setting", key],
    queryFn: async () => adminGetSetting({ data: { accessToken: await getAccessToken(), key } }),
  });
  const historyQuery = useQuery({
    queryKey: ["admin-setting-history", key],
    queryFn: async () =>
      adminListSettingHistory({ data: { accessToken: await getAccessToken(), key } }),
  });
  const secretsQuery = useQuery({
    queryKey: ["admin-secrets-status"],
    queryFn: async () => adminGetSecretsStatus({ data: { accessToken: await getAccessToken() } }),
  });

  useEffect(() => {
    setDraft(settingQuery.data ? JSON.stringify(settingQuery.data.value, null, 2) : "");
  }, [settingQuery.data]);

  async function publish() {
    setBusy(true);
    try {
      const value = JSON.parse(draft);
      await adminPublishSetting({ data: { accessToken: await getAccessToken(), key, value } });
      toast.success("Published");
      await queryClient.invalidateQueries({ queryKey: ["admin-setting", key] });
      await queryClient.invalidateQueries({ queryKey: ["admin-setting-history", key] });
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Publish failed — check the JSON is valid and matches the expected shape",
      );
    } finally {
      setBusy(false);
    }
  }

  async function rollback(toVersion: number) {
    if (!window.confirm(`Roll back "${key}" to version ${toVersion}?`)) return;
    setBusy(true);
    try {
      await adminRollbackSetting({ data: { accessToken: await getAccessToken(), key, toVersion } });
      toast.success(`Rolled back to version ${toVersion}`);
      await queryClient.invalidateQueries({ queryKey: ["admin-setting", key] });
      await queryClient.invalidateQueries({ queryKey: ["admin-setting-history", key] });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Rollback failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="max-w-3xl">
      <h1 className="font-display text-2xl font-semibold text-foreground">Content settings</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Public config both the website and the app fetch. Every publish is versioned and can be
        rolled back.
      </p>

      {secretsQuery.data && (
        <div className="mt-3 flex gap-3 text-xs text-muted-foreground">
          <span>Gemini: {secretsQuery.data["gemini"] ? "configured" : "not configured"}</span>
          <span>
            Supabase service role:{" "}
            {secretsQuery.data["supabaseServiceRole"] ? "configured" : "not configured"}
          </span>
        </div>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        {KEYS.map((k) => (
          <button
            key={k}
            onClick={() => setKey(k)}
            className={`rounded-full px-3 py-1 text-xs font-semibold ${key === k ? "bg-primary text-primary-foreground" : "border border-border"}`}
          >
            {k}
          </button>
        ))}
      </div>

      {settingQuery.isLoading ? (
        <div className="mt-8 flex justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      ) : (
        <div className="mt-4 space-y-3">
          <p className="text-xs text-muted-foreground">
            Current version: {settingQuery.data?.version ?? "unset"}
          </p>
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={10}
            className="w-full rounded-xl border border-border bg-card px-3 py-2 font-mono text-xs outline-none focus:ring-2 focus:ring-ring"
            placeholder="JSON value…"
          />
          <button
            onClick={publish}
            disabled={busy}
            className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-60"
          >
            Publish
          </button>
        </div>
      )}

      {historyQuery.data && historyQuery.data.length > 0 && (
        <section className="mt-6">
          <h2 className="font-display text-base font-semibold text-foreground">History</h2>
          <ul className="mt-2 space-y-1.5">
            {historyQuery.data.map((h) => (
              <li
                key={h.id}
                className="flex items-center justify-between rounded-lg border border-border bg-card px-3 py-1.5 text-xs"
              >
                <span>
                  v{h.version} · {h.action} · {new Date(h.created_at).toLocaleString()}
                </span>
                <button
                  onClick={() => rollback(h.version)}
                  className="text-primary hover:underline"
                >
                  Roll back to this
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
