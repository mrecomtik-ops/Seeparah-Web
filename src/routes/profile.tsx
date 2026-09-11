import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  BookOpen,
  Crown,
  Highlighter,
  LogOut,
  Mail,
  User as UserIcon,
} from "lucide-react";
import { toast } from "sonner";
import { listBooks, listHighlights, listProgress, listSubscriptions } from "@/lib/library";
import { signOut, useAuth } from "@/lib/use-auth";

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

  const books = booksQuery.data ?? [];
  const bookTitle = (id: string) => books.find((b) => b.id === id)?.title ?? "a book";
  const pagesRead = (progressQuery.data ?? []).reduce((s, p) => s + p.last_chunk_index + 1, 0);
  const subs = subsQuery.data ?? [];

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
          <button
            onClick={handleSignOut}
            className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-card px-4 py-2 text-sm font-semibold text-foreground hover:bg-secondary"
          >
            <LogOut className="h-4 w-4" />
            {isDemo ? "Clear session" : "Sign out"}
          </button>
        </section>

        <div className="mt-6 grid gap-4 sm:grid-cols-3">
          {[
            { label: "Pages read", value: pagesRead, icon: BookOpen },
            { label: "Highlights saved", value: highlightsQuery.data?.length ?? 0, icon: Highlighter },
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
          <h2 className="font-display text-lg font-semibold text-foreground">
            Subscription
          </h2>
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
                      {s.expires_at
                        ? new Date(s.expires_at).toLocaleDateString()
                        : "monthly"}
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

        <section className="mt-8 rounded-2xl border border-border bg-card p-6 card-shadow">
          <h2 className="font-display text-lg font-semibold text-foreground">
            Saved highlights
          </h2>
          {(highlightsQuery.data ?? []).length === 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">
              Select any passage while reading and tap Highlight — your
              favourite lines will live here.
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
