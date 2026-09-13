import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { z } from "zod";
import { BookOpen, Check, Crown, Feather, Loader2, ShieldCheck } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { AUTHOR_PAYOUT, PLATFORM_COMMISSION } from "@/lib/data";
import { getBook, listSubscriptions, subscribeToBook } from "@/lib/library";
import { useAuth } from "@/lib/use-auth";
import { getPublicContentSettings } from "@/lib/admin/settings.functions";

const searchSchema = z.object({ book: z.string().optional() });

export const Route = createFileRoute("/subscribe")({
  validateSearch: searchSchema,
  head: () => ({
    meta: [
      { title: "Plans & subscriptions — Seeparah" },
      {
        name: "description",
        content:
          "Free reading for everyone, and premium subscriptions that pay authors 70% of every month.",
      },
      { property: "og:title", content: "Plans & subscriptions — Seeparah" },
      { property: "og:description", content: "Free reading, premium books, 70% to authors." },
    ],
  }),
  component: SubscribePage,
});

function SubscribePage() {
  const { book: bookId } = Route.useSearch();
  const { userId } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);

  const bookQuery = useQuery({
    queryKey: ["book", bookId],
    queryFn: () => getBook(bookId!),
    enabled: !!bookId,
  });
  const subsQuery = useQuery({
    queryKey: ["subscriptions", userId],
    queryFn: () => listSubscriptions(userId),
  });
  const settingsQuery = useQuery({
    queryKey: ["public-content-settings"],
    queryFn: () => getPublicContentSettings(),
  });
  // Defaults to free (monetization off) even before the settings row exists —
  // see src/lib/reader.server.ts isMonetizationEnabled for the same default.
  const monetizationEnabled = settingsQuery.data?.["monetization_enabled"] === true;

  const book = bookQuery.data;
  const price = book?.subscription_price_usd ?? 4.99;
  const alreadySubscribed = !!book && (subsQuery.data ?? []).some((s) => s.book_id === book.id);

  async function activate() {
    if (!book) return;
    setBusy(true);
    try {
      await subscribeToBook(userId, book);
      queryClient.invalidateQueries({ queryKey: ["subscriptions", userId] });
      toast.success(`Subscribed to “${book.title}” (test mode — no charge)`);
      navigate({
        to: "/read/$bookId",
        params: { bookId: book.id },
        search: { lang: book.source_language },
      });
    } catch {
      toast.error("Couldn't activate the subscription. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <main className="mx-auto max-w-4xl px-4 pb-20 pt-10 sm:px-6">
        <div className="text-center">
          <p className="text-sm font-medium text-muted-foreground">Plans</p>
          <h1 className="mt-1 font-display text-4xl font-semibold tracking-tight text-foreground">
            {monetizationEnabled
              ? "Reading for everyone, revenue for authors"
              : "Free for everyone, right now"}
          </h1>
          <p className="mx-auto mt-3 max-w-xl text-sm leading-relaxed text-muted-foreground">
            {monetizationEnabled
              ? `Every book on Seeparah starts with a free opening page. Premium books continue with a small monthly subscription — ${Math.round(AUTHOR_PAYOUT * 100)}% goes straight to the author.`
              : "Seeparah is completely free during launch — every book, every language, no checkout and no premium locks."}
          </p>
        </div>

        {!monetizationEnabled && (
          <div className="mx-auto mt-8 max-w-xl rounded-2xl border border-border bg-card p-6 text-center card-shadow">
            <BookOpen className="mx-auto h-6 w-6 text-primary" />
            <p className="mt-2 font-display text-lg font-semibold text-foreground">
              Nothing to subscribe to yet
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              All books are free to read in full while Seeparah is in launch. Subscriptions will
              return here when that changes — nothing to set up now.
            </p>
            <button
              onClick={() => navigate({ to: "/library" })}
              className="mt-5 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground"
            >
              Browse the library
            </button>
          </div>
        )}

        {monetizationEnabled && (
          <div className="mt-10 grid gap-5 md:grid-cols-2">
            <div className="rounded-2xl border border-border bg-card p-7 card-shadow">
              <div className="flex items-center gap-2">
                <BookOpen className="h-5 w-5 text-primary" />
                <h2 className="font-display text-xl font-semibold text-foreground">Free</h2>
              </div>
              <p className="mt-1 font-display text-3xl font-semibold text-foreground">
                $0<span className="text-base font-normal text-muted-foreground">/forever</span>
              </p>
              <ul className="mt-5 space-y-2.5 text-sm text-foreground">
                {[
                  "Every free book in the library",
                  "All ten languages with AI translation",
                  "Highlights and reading progress saved",
                  "Opening page of every premium book",
                ].map((f) => (
                  <li key={f} className="flex items-start gap-2">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                    {f}
                  </li>
                ))}
              </ul>
              <button
                onClick={() => navigate({ to: "/library" })}
                className="mt-6 w-full rounded-xl border border-border bg-card py-3 text-sm font-semibold text-foreground hover:bg-secondary"
              >
                Browse free books
              </button>
            </div>

            <div className="relative overflow-hidden rounded-2xl border-2 border-gold bg-card p-7 card-shadow-lg">
              <span className="absolute right-4 top-4 rounded-full bg-gold px-2.5 py-1 text-[11px] font-bold text-gold-foreground">
                PREMIUM
              </span>
              <div className="flex items-center gap-2">
                <Crown className="h-5 w-5 text-gold" />
                <h2 className="font-display text-xl font-semibold text-foreground">
                  {book ? book.title : "Premium book"}
                </h2>
              </div>
              <p className="mt-1 font-display text-3xl font-semibold text-foreground">
                ${price.toFixed(2)}
                <span className="text-base font-normal text-muted-foreground">/month</span>
              </p>
              <ul className="mt-5 space-y-2.5 text-sm text-foreground">
                {[
                  book
                    ? `The whole of “${book.title}”, page by page`
                    : "A full premium book of your choice",
                  "Translations in every available language",
                  `${Math.round(AUTHOR_PAYOUT * 100)}% paid directly to ${book?.author ?? "the author"}`,
                  "Cancel anytime — access runs to the end of the month",
                ].map((f) => (
                  <li key={f} className="flex items-start gap-2">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-gold" />
                    {f}
                  </li>
                ))}
              </ul>

              {book ? (
                alreadySubscribed ? (
                  <button
                    onClick={() =>
                      navigate({
                        to: "/read/$bookId",
                        params: { bookId: book.id },
                        search: { lang: book.source_language },
                      })
                    }
                    className="mt-6 w-full rounded-xl bg-primary py-3 text-sm font-semibold text-primary-foreground"
                  >
                    You're subscribed — keep reading
                  </button>
                ) : (
                  <button
                    onClick={activate}
                    disabled={busy}
                    className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-gold py-3 text-sm font-semibold text-gold-foreground disabled:opacity-60"
                  >
                    {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                    Activate subscription
                  </button>
                )
              ) : (
                <button
                  onClick={() => navigate({ to: "/library" })}
                  className="mt-6 w-full rounded-xl bg-gold py-3 text-sm font-semibold text-gold-foreground"
                >
                  Pick a premium book
                </button>
              )}

              <p className="mt-4 flex items-start gap-1.5 rounded-lg bg-secondary px-3 py-2 text-xs text-secondary-foreground">
                <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                Stripe runs in test mode — no card is charged. Of ${price.toFixed(2)}, the author
                receives ${(price * AUTHOR_PAYOUT).toFixed(2)} and Seeparah keeps $
                {(price * PLATFORM_COMMISSION).toFixed(2)} for translation and hosting.
              </p>
            </div>
          </div>
        )}

        <section className="mt-6 rounded-2xl border border-border bg-card p-7 card-shadow">
          <div className="flex items-center gap-2">
            <Feather className="h-5 w-5 text-primary" />
            <h2 className="font-display text-xl font-semibold text-foreground">Author plan</h2>
          </div>
          <p className="mt-1 font-display text-3xl font-semibold text-foreground">
            Free to publish
            <span className="text-base font-normal text-muted-foreground">
              {" "}
              {monetizationEnabled ? "· 70% of every subscription" : "· free to read during launch"}
            </span>
          </p>
          <ul className="mt-5 grid gap-2.5 text-sm text-foreground sm:grid-cols-2">
            {[
              "Publish a manuscript in minutes",
              "Automatic translation into ten languages",
              "Reader and translation analytics",
              monetizationEnabled
                ? "Monthly payouts, cancel or unpublish anytime"
                : "Unpublish anytime",
            ].map((f) => (
              <li key={f} className="flex items-start gap-2">
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                {f}
              </li>
            ))}
          </ul>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              to="/author/publish"
              className="rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground"
            >
              Publish a manuscript
            </Link>
            <Link
              to="/author"
              className="rounded-xl border border-border bg-card px-5 py-3 text-sm font-semibold text-foreground hover:bg-secondary"
            >
              Continue as Author
            </Link>
          </div>
        </section>

        {monetizationEnabled && (
          <section className="mt-6 rounded-2xl border border-border bg-secondary p-7">
            <h2 className="font-display text-xl font-semibold text-foreground">
              How the 70/30 split works
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
              Every subscription is split the same way, every month, with no hidden fees:{" "}
              {Math.round(AUTHOR_PAYOUT * 100)}% goes to the author who wrote the book, and{" "}
              {Math.round(PLATFORM_COMMISSION * 100)}% stays with Seeparah to pay for translation,
              hosting and payments.
            </p>
            <div className="mt-5 flex h-4 w-full overflow-hidden rounded-full">
              <div className="flex h-full w-[70%] items-center justify-center bg-primary text-[10px] font-bold text-primary-foreground">
                70% AUTHOR
              </div>
              <div className="flex h-full w-[30%] items-center justify-center bg-gold text-[10px] font-bold text-gold-foreground">
                30% PLATFORM
              </div>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
