import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";

import { BookOpen, Check, Crown, Feather, ShieldCheck } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { TRANSLATION_EXPLAINER_SHORT } from "@/lib/data";

import { getPublicContentSettings } from "@/lib/admin/settings.functions";

export const Route = createFileRoute("/subscribe")({
  head: () => ({
    meta: [
      { title: "Plans & subscriptions — Seeparah" },
      {
        name: "description",
        content: "Original-language books are always free. A monthly Seeparah plan will unlock reviewed translated editions, while Religious books and their verified translations remain free.",
      },
      { property: "og:title", content: "Plans & subscriptions — Seeparah" },
      { property: "og:description", content: "Original editions are free; reviewed translations use one monthly plan." },
    ],
  }),
  component: SubscribePage,
});

function SubscribePage() {
  const navigate = useNavigate();

  const settingsQuery = useQuery({
    queryKey: ["public-content-settings"],
    queryFn: () => getPublicContentSettings(),
  });
  // Defaults to free (monetization off) even before the settings row exists —
  // see src/lib/reader.server.ts isMonetizationEnabled for the same default.
  const monetizationEnabled = settingsQuery.data?.["monetization_enabled"] === true;

  // ONE plan price, not a per-book price — "there are no per-book or
  // per-translation charges." Same $2.99 default as
  // settings.server.ts's DEFAULT_MONTHLY_PLAN_PRICE_USD for as long as no
  // admin has published a real value yet.
  const price =
    typeof settingsQuery.data?.["monthly_plan_price_usd"] === "number"
      ? (settingsQuery.data["monthly_plan_price_usd"] as number)
      : 2.99;
  return (
    <div className="min-h-screen bg-background">
      <main className="mx-auto max-w-4xl px-4 pb-20 pt-10 sm:px-6">
        <div className="text-center">
          <p className="text-sm font-medium text-muted-foreground">Plans</p>
          <h1 className="mt-1 font-display text-4xl font-semibold tracking-tight text-foreground">
            {monetizationEnabled
              ? "Original books free. Translations with one monthly plan."
              : "Original books stay free — paid translations are being prepared"}
          </h1>
          <p className="mx-auto mt-3 max-w-xl text-sm leading-relaxed text-muted-foreground">
            {monetizationEnabled
              ? `Every book's original-language edition stays free. One subscription — ${price.toFixed(2)}/month — unlocks all reviewed paid translated editions. Religious books and their verified sourced translations remain free.`
              : "Billing is not live yet. Original-language editions are permanently free, and translated editions remain accessible during this pre-billing phase. Religious books and verified Religious translations will always be free."}
          </p>
        </div>

        {!monetizationEnabled && (
          <div className="mx-auto mt-8 max-w-xl rounded-2xl border border-border bg-card p-6 text-center card-shadow">
            <BookOpen className="mx-auto h-6 w-6 text-primary" />
            <p className="mt-2 font-display text-lg font-semibold text-foreground">
              Nothing to subscribe to yet
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              No payment provider is live yet, so there is nothing to buy today. The product rule
              is already set: original-language editions stay free forever; reviewed general
              translations become monthly-plan content when billing is activated; Religious books
              and verified Religious translations always stay free.
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
                  "Every original-language edition, in full",
                  "Every Religious book and verified Religious translation",
                  "Highlights and reading progress saved",
                  "Opening preview of paid translated editions",
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
                  Seeparah Premium
                </h2>
              </div>
              <p className="mt-1 font-display text-3xl font-semibold text-foreground">
                ${price.toFixed(2)}
                <span className="text-base font-normal text-muted-foreground">/month</span>
              </p>
              <ul className="mt-5 space-y-2.5 text-sm text-foreground">
                {[
                  "All reviewed general translated editions",
                  "One account-wide monthly plan — no separate charge for each translated book",
                  "New translation requests remain review-gated; translated once and saved",
                  "Religious books are excluded from paid translation and remain free",
                ].map((f) => (
                  <li key={f} className="flex items-start gap-2">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-gold" />
                    {f}
                  </li>
                ))}
              </ul>

              <button
                type="button"
                disabled
                className="mt-6 w-full rounded-xl bg-gold py-3 text-sm font-semibold text-gold-foreground opacity-60"
              >
                Billing connection required before activation
              </button>

              <p className="mt-4 flex items-start gap-1.5 rounded-lg bg-secondary px-3 py-2 text-xs text-secondary-foreground">
                <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                This is the intended entitlement model, not a live checkout. A real recurring
                payment provider must be connected and verified before monetization can be enabled.
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
              · originals stay free
            </span>
          </p>
          <ul className="mt-5 grid gap-2.5 text-sm text-foreground sm:grid-cols-2">
            {[
              "Publish a manuscript in minutes",
              "An administrator reviews rights and quality before publishing",
              "Reader analytics",
              "Unpublish anytime",
            ].map((f) => (
              <li key={f} className="flex items-start gap-2">
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                {f}
              </li>
            ))}
          </ul>
          <p className="mt-4 max-w-2xl text-xs leading-relaxed text-muted-foreground">
            {TRANSLATION_EXPLAINER_SHORT}
          </p>
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

      </main>
    </div>
  );
}
