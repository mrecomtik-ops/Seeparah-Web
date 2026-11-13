import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, BookOpenText, Clock3, Search } from "lucide-react";
import { INSIGHT_ARTICLES, INSIGHT_CATEGORIES } from "@/lib/insights";
import { safeJsonLd } from "@/lib/seo";

export const Route = createFileRoute("/insights/")({
  head: () => ({
    meta: [
      { title: "Insights — Reading, Translation & Literature | Seeparah" },
      {
        name: "description",
        content:
          "Practical reading guides, translation advice, literature research help, edition provenance, and multilingual reading insights from Seeparah.",
      },
      { property: "og:title", content: "Seeparah Insights — Reading, Translation & Literature" },
      {
        property: "og:description",
        content:
          "Useful guides for readers, authors and literature researchers — with a focus on editions, translations, provenance and multilingual reading.",
      },
      { property: "og:type", content: "website" },
    ],
    links: [{ rel: "canonical", href: "https://seeparah.com/insights" }],
  }),
  component: InsightsPage,
});

function InsightsPage() {
  const schema = {
    "@context": "https://schema.org",
    "@type": "Blog",
    name: "Seeparah Insights",
    url: "https://seeparah.com/insights",
    description:
      "Reading guides, translation advice, literature research help, edition provenance and multilingual reading insights.",
    publisher: { "@type": "Organization", name: "Seeparah", url: "https://seeparah.com" },
  };

  return (
    <div className="min-h-screen bg-background">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: safeJsonLd(schema) }} />
      <main className="mx-auto max-w-6xl px-4 pb-24 pt-10 sm:px-6">
        <div className="max-w-3xl">
          <p className="inline-flex items-center gap-2 text-sm font-semibold text-primary">
            <BookOpenText className="h-4 w-4" /> Seeparah Insights
          </p>
          <h1 className="mt-2 font-display text-4xl font-semibold tracking-tight text-foreground sm:text-5xl">
            Read with more context
          </h1>
          <p className="mt-4 text-lg leading-relaxed text-muted-foreground">
            Practical guides for reading, comparing editions, understanding translations,
            researching literature and evaluating the provenance of the text in front of you.
          </p>
        </div>

        <div className="mt-8 flex flex-wrap gap-2" aria-label="Insight topics">
          {INSIGHT_CATEGORIES.map((category) => (
            <span
              key={category}
              className="rounded-full border border-border bg-card px-3 py-1.5 text-xs font-semibold text-foreground"
            >
              {category}
            </span>
          ))}
        </div>

        <section className="mt-10 grid gap-5 md:grid-cols-2">
          {INSIGHT_ARTICLES.map((article, index) => (
            <article
              key={article.slug}
              className={
                index === 0
                  ? "rounded-3xl border border-primary/20 bg-primary p-7 text-primary-foreground card-shadow-lg transition-[border-color,box-shadow] hover:border-accent focus-within:ring-2 focus-within:ring-accent/70 md:col-span-2"
                  : "rounded-2xl border border-border bg-card p-6 card-shadow transition-[border-color,box-shadow] hover:border-primary/50 hover:shadow-md focus-within:ring-2 focus-within:ring-ring/40"
              }
            >
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span
                  className={
                    index === 0
                      ? "rounded-full bg-accent px-2.5 py-1 font-semibold text-accent-foreground"
                      : "rounded-full bg-secondary px-2.5 py-1 font-semibold text-secondary-foreground"
                  }
                >
                  {article.category}
                </span>
                <span className={index === 0 ? "opacity-75" : "text-muted-foreground"}>
                  <Clock3 className="mr-1 inline h-3.5 w-3.5" />
                  {article.readingMinutes} min read
                </span>
              </div>
              <h2
                className={
                  index === 0
                    ? "mt-4 max-w-3xl font-display text-3xl font-semibold"
                    : "mt-4 font-display text-2xl font-semibold text-foreground"
                }
              >
                {article.title}
              </h2>
              <p
                className={
                  index === 0
                    ? "mt-3 max-w-3xl leading-relaxed opacity-90"
                    : "mt-3 leading-relaxed text-muted-foreground"
                }
              >
                {article.excerpt}
              </p>
              <Link
                to="/insights/$slug"
                params={{ slug: article.slug }}
                className={
                  index === 0
                    ? "mt-6 inline-flex min-h-11 items-center gap-2 rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-accent-foreground transition-[background-color,transform] hover:bg-accent/85 active:scale-[0.98]"
                     : "mt-6 inline-flex min-h-11 items-center gap-1.5 rounded-lg text-sm font-semibold text-primary transition-colors hover:text-primary/80 hover:underline"
                }
              >
                Read article <ArrowRight className="h-4 w-4" />
              </Link>
            </article>
          ))}
        </section>

        <section className="mt-12 rounded-2xl border border-border bg-card p-6 card-shadow">
          <div className="flex items-start gap-3">
            <Search className="mt-0.5 h-5 w-5 text-primary" />
            <div>
              <h2 className="font-display text-xl font-semibold text-foreground">
                Looking for a book or source?
              </h2>
              <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                Insights explains how to evaluate editions. The Library is where you browse
                published books, while Sacred Texts gives Religious books a dedicated
                source-and-reference experience.
              </p>
              <div className="mt-4 flex flex-wrap gap-3">
                <Link
                  to="/library"
                  className="inline-flex min-h-11 items-center rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-[background-color,transform] hover:bg-primary/90 active:scale-[0.98]"
                >
                  Browse Library
                </Link>
                <Link
                  to="/sacred-texts"
                  className="inline-flex min-h-11 items-center rounded-xl border border-border px-4 py-2 text-sm font-semibold text-foreground transition-colors hover:bg-secondary active:bg-accent"
                >
                  Explore Sacred Texts
                </Link>
              </div>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
