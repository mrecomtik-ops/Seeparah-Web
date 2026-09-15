import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import {
  BookOpen,
  Crown,
  Feather,
  Highlighter,
  LogIn,
  LogOut,
  Mail,
  User as UserIcon,
} from "lucide-react";
import { toast } from "sonner";
import {
  getAuthorProfile,
  listBooks,
  listHighlights,
  listProgress,
  listSubscriptions,
  saveAuthorProfile,
} from "@/lib/library";
import { signOut, useAuth } from "@/lib/use-auth";
import { LANGUAGES } from "@/lib/data";
import { getPrefs, setPrefs } from "@/lib/prefs";
import { useShelves } from "@/components/ShelfButtons";
import { SHELF_LABELS, type ShelfKind } from "@/lib/shelves";

export const Route = createFileRoute("/profile")({
  head: () => ({
    meta: [
      { title: "Your profile — Seeparah" },
      {
        name: "description",
        content: "Your reading stats, saved highlights and subscriptions on Seeparah.",
      },
      { property: "og:title", content: "Your profile — Seeparah" },
      { property: "og:description", content: "Your reading stats and highlights." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ProfilePage,
});

function ProfilePage() {
  const { user, userId, displayName, isDemo } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [language, setLanguage] = useState("English");
  const [goal, setGoal] = useState(40);
  const [penName, setPenName] = useState("");
  const [bio, setBio] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [savingAuthorProfile, setSavingAuthorProfile] = useState(false);
  const shelvesQuery = useShelves();

  useEffect(() => {
    const p = getPrefs();
    setLanguage(p.language);
    setGoal(p.weeklyGoalPages);
  }, []);

  const booksQuery = useQuery({ queryKey: ["books"], queryFn: listBooks });
  const progressQuery = useQuery({
    queryKey: ["progress", userId],
    queryFn: () => listProgress(userId),
  });
  const highlightsQuery = useQuery({
    queryKey: ["highlights", userId],
    queryFn: () => listHighlights(userId),
  });
  const subsQuery = useQuery({
    queryKey: ["subscriptions", userId],
    queryFn: () => listSubscriptions(userId),
  });
  const authorProfileQuery = useQuery({
    queryKey: ["author-profile", userId],
    queryFn: () => getAuthorProfile(userId),
    enabled: !isDemo,
  });

  useEffect(() => {
    if (!authorProfileQuery.data) return;
    setPenName(authorProfileQuery.data.pen_name ?? "");
    setBio(authorProfileQuery.data.bio ?? "");
    setAvatarUrl(authorProfileQuery.data.avatar_url ?? "");
  }, [authorProfileQuery.data]);

  const books = booksQuery.data ?? [];
  const bookTitle = (id: string) => books.find((b) => b.id === id)?.title ?? "a book";
  const pagesRead = (progressQuery.data ?? []).reduce((s, p) => s + p.last_chunk_index + 1, 0);
  const subs = subsQuery.data ?? [];

  async function handleSaveAuthorProfile() {
    setSavingAuthorProfile(true);
    try {
      const result = await saveAuthorProfile(userId, {
        pen_name: penName.trim() || null,
        bio: bio.trim() || null,
        avatar_url: avatarUrl.trim() || null,
      });
      if (result.ok) {
        toast.success("Author profile saved");
        queryClient.invalidateQueries({ queryKey: ["author-profile", userId] });
      } else {
        toast.error(result.message ?? "Couldn't save your author profile");
      }
    } finally {
      setSavingAuthorProfile(false);
    }
  }

  async function handleSignOut() {
    await signOut();
    toast.success("Signed out — see you between the pages.");
    navigate({ to: "/" });
  }

  return (
    <div className="min-h-screen bg-background">
      <main className="mx-auto max-w-3xl px-4 pb-20 pt-8 sm:px-6">
        <section className="flex items-center gap-4 rounded-2xl border border-border bg-card p-6 card-shadow">
          <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-full bg-accent">
            {user?.user_metadata?.["avatar_url"] ? (
              <img
                src={user.user_metadata["avatar_url"] as string}
                alt={`${displayName}'s avatar`}
                className="h-full w-full object-cover"
              />
            ) : (
              <UserIcon className="h-7 w-7 text-accent-foreground" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="truncate font-display text-2xl font-semibold text-foreground">
              {displayName}
            </h1>
            <p className="flex items-center gap-1.5 truncate text-sm text-muted-foreground">
              <Mail className="h-3.5 w-3.5" />
              {user?.email ?? "demo reader — progress stays on this device"}
            </p>
          </div>
          <div className="flex flex-col items-end gap-2">
            {isDemo && (
              <Link
                to="/auth"
                search={{ redirect: "/profile" }}
                className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90"
              >
                <LogIn className="h-4 w-4" /> Sign in
              </Link>
            )}
            <button
              onClick={handleSignOut}
              className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-card px-4 py-2 text-sm font-semibold text-foreground hover:bg-secondary"
            >
              <LogOut className="h-4 w-4" />
              {isDemo ? "Clear session" : "Sign out"}
            </button>
          </div>
        </section>

        <div className="mt-6 grid gap-4 sm:grid-cols-3">
          {[
            { label: "Pages read", value: pagesRead, icon: BookOpen },
            {
              label: "Highlights saved",
              value: highlightsQuery.data?.length ?? 0,
              icon: Highlighter,
            },
            { label: "Active subscriptions", value: subs.length, icon: Crown },
          ].map(({ label, value, icon: Icon }) => (
            <div key={label} className="rounded-2xl border border-border bg-card p-5 card-shadow">
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">{label}</p>
                <Icon className="h-4 w-4 text-primary" />
              </div>
              <p className="mt-2 font-display text-3xl font-semibold text-foreground">{value}</p>
            </div>
          ))}
        </div>

        <section className="mt-8 rounded-2xl border border-border bg-card p-6 card-shadow">
          <h2 className="font-display text-lg font-semibold text-foreground">Subscription</h2>
          {subs.length === 0 ? (
            <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-muted-foreground">
                You're on the free plan — every free book, in every language.
              </p>
              <Link
                to="/subscribe"
                search={{ book: undefined }}
                className="rounded-xl bg-gold px-4 py-2 text-sm font-semibold text-gold-foreground"
              >
                See plans
              </Link>
            </div>
          ) : (
            <ul className="mt-4 space-y-3">
              {subs.map((s) => (
                <li
                  key={s.id}
                  className="flex items-center justify-between rounded-xl border border-border bg-background px-4 py-3"
                >
                  <div>
                    <p className="font-display text-sm font-semibold text-foreground">
                      {bookTitle(s.book_id)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      ${s.monthly_price_usd}/month · renews{" "}
                      {s.expires_at ? new Date(s.expires_at).toLocaleDateString() : "monthly"}
                    </p>
                  </div>
                  <span className="rounded-full bg-accent px-2.5 py-1 text-[11px] font-semibold text-accent-foreground">
                    {s.status}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        {isDemo ? (
          <section className="mt-8 rounded-2xl border border-dashed border-border bg-card p-6 text-center card-shadow">
            <Feather className="mx-auto h-8 w-8 text-muted-foreground/60" />
            <h2 className="mt-2 font-display text-lg font-semibold text-foreground">
              Author profile
            </h2>
            <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
              Sign in to set a pen name, bio and photo for your public author page.
            </p>
            <Link
              to="/auth"
              search={{ redirect: "/profile" }}
              className="mt-4 inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
            >
              <LogIn className="h-4 w-4" /> Sign in
            </Link>
          </section>
        ) : (
          <section className="mt-8 rounded-2xl border border-border bg-card p-6 card-shadow">
            <h2 className="font-display text-lg font-semibold text-foreground">Author profile</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Shown on your public author page and next to your published books.
            </p>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <label className="flex flex-col gap-1">
                <span className="text-xs font-medium text-muted-foreground">Pen name</span>
                <input
                  value={penName}
                  onChange={(e) => setPenName(e.target.value)}
                  placeholder="How readers will see your name"
                  className="rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring"
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs font-medium text-muted-foreground">Avatar URL</span>
                <input
                  value={avatarUrl}
                  onChange={(e) => setAvatarUrl(e.target.value)}
                  placeholder="https://…"
                  className="rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring"
                />
              </label>
            </div>
            <label className="mt-4 flex flex-col gap-1">
              <span className="text-xs font-medium text-muted-foreground">Biography</span>
              <textarea
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                rows={3}
                placeholder="A few sentences about you and what you write…"
                className="rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring"
              />
            </label>
            <button
              onClick={handleSaveAuthorProfile}
              disabled={savingAuthorProfile}
              className="mt-4 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-60"
            >
              {savingAuthorProfile ? "Saving…" : "Save author profile"}
            </button>
          </section>
        )}

        <section className="mt-8 rounded-2xl border border-border bg-card p-6 card-shadow">
          <h2 className="font-display text-lg font-semibold text-foreground">
            Language & reading preferences
          </h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium text-muted-foreground">
                Preferred reading language
              </span>
              <select
                value={language}
                onChange={(e) => {
                  setLanguage(e.target.value);
                  setPrefs({ language: e.target.value });
                  toast.success(`Reading language set to ${e.target.value}`);
                }}
                className="rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring"
              >
                {LANGUAGES.map((l) => (
                  <option key={l} value={l}>
                    {l}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium text-muted-foreground">
                Weekly reading goal (pages)
              </span>
              <input
                type="number"
                min={5}
                max={500}
                value={goal}
                onChange={(e) => {
                  const v = Number(e.target.value) || 0;
                  setGoal(v);
                  setPrefs({ weeklyGoalPages: v });
                }}
                className="rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring"
              />
            </label>
          </div>
        </section>

        <section className="mt-8 rounded-2xl border border-border bg-card p-6 card-shadow">
          <h2 className="font-display text-lg font-semibold text-foreground">Saved titles</h2>
          {(shelvesQuery.data ?? []).length === 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">
              Tap the heart, bookmark or plus on any book to keep it here.
            </p>
          ) : (
            <ul className="mt-4 space-y-2.5">
              {(shelvesQuery.data ?? []).map((row) => (
                <li
                  key={row.id}
                  className="flex items-center justify-between gap-3 rounded-xl border border-border bg-background px-4 py-3"
                >
                  <Link
                    to="/read/$bookId"
                    params={{ bookId: row.book_id }}
                    search={{ lang: language }}
                    className="truncate font-display text-sm font-semibold text-foreground hover:underline"
                  >
                    {bookTitle(row.book_id)}
                  </Link>
                  <span className="shrink-0 rounded-full bg-accent px-2.5 py-1 text-[11px] font-semibold text-accent-foreground">
                    {SHELF_LABELS[row.shelf as ShelfKind]}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="mt-8 rounded-2xl border border-border bg-card p-6 card-shadow">
          <h2 className="font-display text-lg font-semibold text-foreground">Saved highlights</h2>
          {(highlightsQuery.data ?? []).length === 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">
              Select any passage while reading and tap Highlight — your favourite lines will live
              here.
            </p>
          ) : (
            <ul className="mt-4 space-y-3">
              {(highlightsQuery.data ?? []).map((h) => (
                <li
                  key={h.id}
                  className="rounded-xl border-l-4 border-gold bg-background px-4 py-3"
                >
                  <p className="font-display text-sm italic leading-relaxed text-foreground">
                    “{h.highlight_text}”
                  </p>
                  <p className="mt-1.5 text-xs text-muted-foreground">
                    {bookTitle(h.book_id)} · {h.language} · page {h.chunk_index + 1}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
    </div>
  );
}
