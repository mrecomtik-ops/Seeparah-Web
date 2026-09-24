import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { getAccessToken, useResolvedAdminSession, can } from "@/lib/admin/use-admin-session";
import {
  adminGetSetting,
  adminPublishSetting,
  adminListSettingHistory,
  adminRollbackSetting,
  adminGetSecretsStatus,
} from "@/lib/admin/settings.functions";
import {
  adminListCategorySuggestions,
  adminDecideCategorySuggestion,
} from "@/lib/admin/catalog.functions";
import { AdminQueryError } from "@/components/admin/AdminQueryError";

export const Route = createFileRoute("/admin/settings")({
  component: AdminSettingsPage,
});

const KEYS = [
  "monetization_enabled",
  "monthly_plan_price_usd",
  "maintenance_message",
  "support_contact",
  "announcements",
  "featured_books",
  "categories",
  "language_availability",
  "home_collections",
  "translation_budget",
] as const;

const DEFAULT_MONTHLY_PLAN_PRICE_USD = 2;

function AdminSettingsPage() {
  const [key, setKey] = useState<(typeof KEYS)[number]>("monetization_enabled");
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [priceDraft, setPriceDraft] = useState("");
  const [priceBusy, setPriceBusy] = useState(false);
  const [suggestionBusy, setSuggestionBusy] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const session = useResolvedAdminSession();
  const canManageCategories = can(session, "catalog.categories.manage");

  const suggestionsQuery = useQuery({
    queryKey: ["category-suggestions", "pending"],
    queryFn: async () =>
      adminListCategorySuggestions({ data: { accessToken: await getAccessToken(), status: "pending" } }),
    enabled: canManageCategories,
  });

  async function decideSuggestion(suggestionId: string, decision: "approved" | "declined") {
    setSuggestionBusy(suggestionId);
    try {
      await adminDecideCategorySuggestion({
        data: { accessToken: await getAccessToken(), suggestionId, decision },
      });
      toast.success(
        decision === "approved"
          ? "Marked approved — add it to the categories list above if you want it live."
          : "Declined",
      );
      await queryClient.invalidateQueries({ queryKey: ["category-suggestions", "pending"] });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't record this decision");
    } finally {
      setSuggestionBusy(null);
    }
  }

  const planPriceQuery = useQuery({
    queryKey: ["admin-setting", "monthly_plan_price_usd"],
    queryFn: async () =>
      adminGetSetting({
        data: { accessToken: await getAccessToken(), key: "monthly_plan_price_usd" },
      }),
  });
  const effectivePlanPrice =
    typeof planPriceQuery.data?.value === "number"
      ? planPriceQuery.data.value
      : DEFAULT_MONTHLY_PLAN_PRICE_USD;

  useEffect(() => {
    setPriceDraft(String(effectivePlanPrice));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [planPriceQuery.data]);

  async function publishPlanPrice() {
    const parsed = Number(priceDraft);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      toast.error("Enter a price greater than $0");
      return;
    }
    if (
      !window.confirm(
        `Set the monthly plan price to $${parsed.toFixed(2)}? This does not change what a payment ` +
          "provider actually charges — see the note below.",
      )
    ) {
      return;
    }
    setPriceBusy(true);
    try {
      await adminPublishSetting({
        data: {
          accessToken: await getAccessToken(),
          key: "monthly_plan_price_usd",
          value: parsed,
        },
      });
      toast.success(`Monthly plan price set to $${parsed.toFixed(2)}`);
      await queryClient.invalidateQueries({
        queryKey: ["admin-setting", "monthly_plan_price_usd"],
      });
      if (key === "monthly_plan_price_usd") {
        await queryClient.invalidateQueries({ queryKey: ["admin-setting-history", key] });
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't update the price");
    } finally {
      setPriceBusy(false);
    }
  }

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

      <section className="mt-6 rounded-2xl border border-border bg-card p-5 card-shadow">
        <h2 className="font-display text-base font-semibold text-foreground">Monthly plan price</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Effective price right now:{" "}
          <span className="font-semibold text-foreground">
            ${effectivePlanPrice.toFixed(2)}/month
          </span>
          {planPriceQuery.data?.value === undefined && " (proposed default — not yet published)"}
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="text-sm text-muted-foreground">$</span>
          <input
            value={priceDraft}
            onChange={(e) => setPriceDraft(e.target.value)}
            inputMode="decimal"
            className="w-24 rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
          />
          <span className="text-sm text-muted-foreground">/month</span>
          <button
            onClick={publishPlanPrice}
            disabled={priceBusy}
            className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-60"
          >
            {priceBusy ? "Saving…" : "Save price"}
          </button>
        </div>
        <p className="mt-3 rounded-lg bg-secondary px-3 py-2 text-xs text-secondary-foreground">
          This is the database record of the intended price, versioned and audited like every
          other setting — it is <strong>not</strong> a completed billing change. When a payment
          provider is connected, its actual recurring price must be synchronized separately, with
          an explicit decision on whether a change here affects existing subscribers or only new
          ones. Nothing here ever changes what an existing subscriber is currently charged.
        </p>
      </section>

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
      ) : settingQuery.isError ? (
        <AdminQueryError
          message={
            settingQuery.error instanceof Error
              ? settingQuery.error.message
              : "Couldn't load this setting."
          }
          onRetry={() => settingQuery.refetch()}
        />
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

      {canManageCategories && (suggestionsQuery.data?.length ?? 0) > 0 && (
        <section className="mt-6">
          <h2 className="font-display text-base font-semibold text-foreground">
            Category suggestions
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            From authors, for their own submissions. Approving here only records your decision —
            add the category to the list above yourself if you want it live; nothing here changes
            the categories setting or any book automatically.
          </p>
          <ul className="mt-2 space-y-1.5">
            {(suggestionsQuery.data ?? []).map((s) => (
              <li
                key={s.id as string}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-card px-3 py-2 text-xs"
              >
                <span>
                  <strong>{s.suggested_category as string}</strong> — for {s.content_type as string}{" "}
                  {(s.content_id as string).slice(0, 8)}…
                </span>
                <div className="flex gap-2">
                  <button
                    disabled={suggestionBusy === s.id}
                    onClick={() => decideSuggestion(s.id as string, "approved")}
                    className="rounded-lg bg-primary px-3 py-1 font-semibold text-primary-foreground disabled:opacity-60"
                  >
                    Approve
                  </button>
                  <button
                    disabled={suggestionBusy === s.id}
                    onClick={() => decideSuggestion(s.id as string, "declined")}
                    className="rounded-lg border border-border px-3 py-1 font-semibold hover:bg-secondary disabled:opacity-60"
                  >
                    Decline
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
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
