import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { adminGetSetting, adminPublishSetting } from "@/lib/admin/settings.functions";
import { getAccessToken } from "@/lib/admin/use-admin-session";
import { AdminQueryError } from "@/components/admin/AdminQueryError";

type StructuredKey = "announcements" | "featured_books" | "home_collections" |
  "language_availability" | "translation_budget";
type Announcement = { id: string; message: string; active: boolean };
type Collection = { id: string; title: string; bookIds: string[] };
type Budget = { dailyUsd: number | null; monthlyUsd: number | null;
  maxConcurrentJobs: number | null; maxRequestsPerUserPerDay: number | null };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const REQUIRED_LANGUAGES = ["English", "Urdu"] as const;

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown> : {};
}
function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((x): x is string => typeof x === "string") : [];
}
function listOfIds(text: string): string[] {
  return [...new Set(text.split(/[\s,;]+/).map((id) => id.trim()).filter(Boolean))];
}
function normalizeLanguageList(values: string[]): string[] {
  return [...new Set([...REQUIRED_LANGUAGES, ...values.map((x) => x.trim()).filter(Boolean)])];
}
function parseBudget(value: unknown): Budget {
  const src = object(value);
  const read = (key: keyof Budget): number | null =>
    typeof src[key] === "number" && Number.isFinite(src[key]) ? src[key] as number : null;
  return {
    dailyUsd: read("dailyUsd"),
    monthlyUsd: read("monthlyUsd"),
    maxConcurrentJobs: read("maxConcurrentJobs"),
    maxRequestsPerUserPerDay: read("maxRequestsPerUserPerDay"),
  };
}
const keyLabels: Record<StructuredKey, string> = {
  announcements: "Announcements",
  featured_books: "Featured books",
  home_collections: "Homepage collections",
  language_availability: "Available languages",
  translation_budget: "Translation safety budget",
};

export function AdminStructuredSettings() {
  const [key, setKey] = useState<StructuredKey>("announcements");
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [featuredText, setFeaturedText] = useState("");
  const [collections, setCollections] = useState<Collection[]>([]);
  const [languages, setLanguages] = useState<string[]>([...REQUIRED_LANGUAGES]);
  const [newLanguage, setNewLanguage] = useState("");
  const [budget, setBudget] = useState<Budget>({
    dailyUsd: null, monthlyUsd: null, maxConcurrentJobs: null, maxRequestsPerUserPerDay: null,
  });
  const [busy, setBusy] = useState(false);
  const queryClient = useQueryClient();
  const setting = useQuery({
    queryKey: ["admin-setting", key],
    queryFn: () => getAccessToken().then((accessToken) =>
      adminGetSetting({ data: { accessToken, key } })),
  });
  useEffect(() => {
    const value: unknown = setting.data?.value;
    if (key === "announcements") {
      setAnnouncements(Array.isArray(value) ? value.map((entry) => {
        const v = object(entry);
        return {
          id: String(v.id ?? ""),
          message: String(v.message ?? ""),
          active: v.active === true,
        };
      }) : []);
    } else if (key === "featured_books") {
      setFeaturedText(strings(value).join("\n"));
    } else if (key === "home_collections") {
      setCollections(Array.isArray(value) ? value.map((entry) => {
        const v = object(entry);
        return { id: String(v.id ?? ""), title: String(v.title ?? ""),
          bookIds: strings(v.bookIds) };
      }) : []);
    } else if (key === "language_availability") {
      setLanguages(normalizeLanguageList(strings(value)));
    } else if (key === "translation_budget") {
      setBudget(parseBudget(value));
    }
  }, [key, setting.data]);

  const fieldClass = "min-h-11 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground";
  const buttonClass = "min-h-11 rounded-lg border border-border bg-background px-3 py-2 text-sm font-semibold text-foreground hover:bg-secondary";

  async function publish() {
    if (setting.isLoading || setting.isError || busy) return;
    let value: unknown;
    if (key === "announcements") {
      if (announcements.some((item) => !item.id || !item.message.trim()) ||
        new Set(announcements.map((item) => item.id)).size !== announcements.length) {
        toast.error("Each announcement needs a unique ID and a message."); return;
      }
      value = announcements.map((x) => ({ ...x, message: x.message.trim() }));
    } else if (key === "featured_books") {
      const ids = listOfIds(featuredText);
      if (ids.some((id) => !UUID.test(id))) {
        toast.error("Use published book UUIDs, one per line."); return;
      }
      value = ids;
    } else if (key === "home_collections") {
      if (collections.some((col) => !col.id.trim() || !col.title.trim() ||
        col.bookIds.filter((id) => id.trim()).some((id) => !UUID.test(id.trim()))) ||
        new Set(collections.map((x) => x.id)).size !== collections.length) {
        toast.error("Collections need unique IDs, titles and valid book UUIDs."); return;
      }
      value = collections.map((x) => ({ ...x, id: x.id.trim(), title: x.title.trim(),
        bookIds: [...new Set(x.bookIds.map((id) => id.trim()).filter(Boolean))] }));
    } else if (key === "language_availability") {
      value = normalizeLanguageList(languages);
    } else {
      const numbers = Object.values(budget);
      if (numbers.some((x) => x === null || !Number.isFinite(x)) ||
        (budget.dailyUsd ?? 0) < 0 || (budget.monthlyUsd ?? 0) < 0 ||
        (budget.maxConcurrentJobs ?? 0) <= 0 || (budget.maxRequestsPerUserPerDay ?? 0) <= 0 ||
        !Number.isInteger(budget.maxConcurrentJobs) ||
        !Number.isInteger(budget.maxRequestsPerUserPerDay)) {
        toast.error("Enter valid nonnegative limits and positive whole-number job/request caps.");
        return;
      }
      value = budget;
    }

    if (!window.confirm("Publish the versioned " + keyLabels[key] + " configuration?")) return;
    setBusy(true);
    try {
      await adminPublishSetting({ data: { accessToken: await getAccessToken(), key, value } });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["admin-setting", key] }),
        queryClient.invalidateQueries({ queryKey: ["admin-setting-history", key] }),
        queryClient.invalidateQueries({ queryKey: ["public-content-settings"] }),
      ]);
      toast.success(keyLabels[key] + " published and recorded in history");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not publish settings.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="mt-6 rounded-2xl border border-border bg-card p-5 card-shadow"
      aria-label="Structured content settings">
      <h2 className="font-display text-lg font-semibold text-foreground">Content and operations</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Edit these settings without raw JSON. Publishing is versioned, audited and subject to existing admin permissions.
      </p>
      <label className="mt-4 block text-xs font-semibold">
        Setting
        <select value={key} onChange={(event) => setKey(event.target.value as StructuredKey)}
          className={fieldClass + " mt-2"}>
          {(Object.keys(keyLabels) as StructuredKey[]).map((option) =>
            <option key={option} value={option}>{keyLabels[option]}</option>)}
        </select>
      </label>
      {setting.isError ? (
        <AdminQueryError message="Couldn't load the selected setting." onRetry={() => setting.refetch()} />
      ) : setting.isLoading ? (
        <p className="mt-5 text-sm text-muted-foreground" role="status">Loading current settings…</p>
      ) : (
        <>
          <p className="mt-2 text-xs text-muted-foreground">Published version: {setting.data?.version ?? "Not configured"}</p>
          {key === "announcements" && <div className="mt-4 space-y-3">
            {announcements.map((entry, index) =>
              <div className="rounded-lg border border-border p-3" key={entry.id || index}>
                <label className="block text-xs font-semibold">Announcement text
                  <textarea value={entry.message} maxLength={1500} rows={2}
                    className={fieldClass + " mt-2"}
                    onChange={(event) => setAnnouncements((rows) =>
                      rows.map((x, i) => i === index ? { ...x, message: event.target.value } : x))} />
                </label>
                <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                  <label className="flex min-h-11 items-center gap-2 text-xs font-semibold">
                    <input type="checkbox" checked={entry.active}
                      onChange={(event) => setAnnouncements((rows) =>
                        rows.map((x, i) => i === index ? { ...x, active: event.target.checked } : x))} />
                    Active
                  </label>
                  <button type="button" className={buttonClass}
                    onClick={() => setAnnouncements((rows) => rows.filter((_, i) => i !== index))}>
                    Remove
                  </button>
                </div>
              </div>)}
            <button className={buttonClass} type="button" onClick={() =>
              setAnnouncements((rows) => [...rows, { id: crypto.randomUUID(), message: "", active: false }])}>
              Add announcement
            </button>
          </div>}
          {key === "featured_books" && <label className="mt-4 block text-xs font-semibold">
            Featured published book IDs (one UUID per line)
            <textarea rows={6} value={featuredText} className={fieldClass + " mt-2 font-mono"}
              onChange={(event) => setFeaturedText(event.target.value)} />
            <span className="mt-2 block font-normal text-muted-foreground">
              Existing titles are not modified. IDs must match books already in the public catalog.
            </span>
          </label>}
          {key === "home_collections" && <div className="mt-4 space-y-3">
            {collections.map((item, index) =>
              <div className="space-y-3 rounded-lg border border-border p-3" key={item.id || index}>
                <label className="block text-xs font-semibold">Collection title
                  <input value={item.title} className={fieldClass + " mt-1"} onChange={(event) =>
                    setCollections((rows) => rows.map((x, i) =>
                      i === index ? { ...x, title: event.target.value } : x))} />
                </label>
                <label className="block text-xs font-semibold">Book UUIDs (one per line)
                  <textarea rows={3} value={item.bookIds.join("\n")} className={fieldClass + " mt-1 font-mono"}
                    onChange={(event) => setCollections((rows) => rows.map((x, i) =>
                      i === index ? { ...x, bookIds: event.target.value.split("\\n") } : x))} />
                </label>
                <button className={buttonClass} type="button"
                  onClick={() => setCollections((rows) => rows.filter((_, i) => i !== index))}>Remove collection</button>
              </div>)}
            <button className={buttonClass} type="button" onClick={() =>
              setCollections((rows) => [...rows, { id: crypto.randomUUID(), title: "", bookIds: [] }])}>
              Add collection
            </button>
          </div>}
          {key === "language_availability" && <div className="mt-4">
            <p className="text-xs text-muted-foreground">English and Urdu must always remain. Other languages are permitted.</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {languages.map((item) =>
                <span key={item} className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-1 text-sm">
                  {item}
                  {(!REQUIRED_LANGUAGES.some((required) => required === item)) &&
                    <button className="min-h-11 min-w-11 rounded-lg font-semibold text-primary" type="button"
                      aria-label={"Remove " + item} onClick={() =>
                        setLanguages((values) => values.filter((language) => language !== item))}>×</button>}
                </span>)}
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <input className={fieldClass + " flex-1"} value={newLanguage} placeholder="Add a language"
                onChange={(event) => setNewLanguage(event.target.value)} />
              <button className={buttonClass} type="button" disabled={!newLanguage.trim()}
                onClick={() => { setLanguages((values) => normalizeLanguageList([...values, newLanguage]));
                  setNewLanguage(""); }}>Add language</button>
            </div>
          </div>}
          {key === "translation_budget" && <div className="mt-4 grid gap-4 sm:grid-cols-2">
            {([
              ["dailyUsd", "Daily limit (USD)", "0.01"],
              ["monthlyUsd", "Monthly limit (USD)", "0.01"],
              ["maxConcurrentJobs", "Maximum concurrent jobs", "1"],
              ["maxRequestsPerUserPerDay", "Requests per user per day", "1"],
            ] as const).map(([field, title, step]) =>
              <label key={field} className="block text-xs font-semibold">{title}
                <input type="number" min={0} step={step}
                  value={budget[field] ?? ""} className={fieldClass + " mt-2"} onChange={(event) =>
                    setBudget((old) => ({ ...old, [field]: event.target.value === ""
                      ? null : Number(event.target.value) }))} />
              </label>)}
            <p className="sm:col-span-2 text-xs text-muted-foreground">
              Limits are intentionally blank if never configured. They are not guessed from production traffic.
            </p>
          </div>}
          <div className="mt-5 flex flex-wrap items-center gap-3">
            <button className="min-h-11 rounded-lg bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50"
              disabled={busy} type="button" onClick={() => void publish()}>
              {busy ? "Publishing…" : "Review and publish " + keyLabels[key]}
            </button>
            <span className="text-xs text-muted-foreground">Publishing never edits book content or source editions.</span>
          </div>
        </>
      )}
    </section>
  );
}
