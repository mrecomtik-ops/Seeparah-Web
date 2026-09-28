import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { ArrowLeft, ArrowRight, Clock3 } from "lucide-react";
import { getInsightArticle, INSIGHT_ARTICLES } from "@/lib/insights";

export const Route = createFileRoute("/insights/$slug")({
  loader: ({ params }) => {
    const article = getInsightArticle(params.slug);
    if (!article) throw notFound();
    return { article };
  },
  head: ({ loaderData }) => {
    const article = loaderData?.article;
    const title = article ? `${article.title} | Seeparah Insights` : "Seeparah Insights";
    const description =
      article?.description ??
      "Reading guides, translation advice, literature research and multilingual reading insights.";
    return {
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
        { property: "og:type", content: "article" },
        { name: "twitter:card", content: "summary_large_image" },
      ],
      links: article
        ? [{ rel: "canonical", href: `https://seeparah.com/insights/${article.slug}` }]
        : [],
    };
  },
  notFoundComponent: () => (
    <div className="flex min-h-[70vh] flex-col items-center justify-center px-4 text-center">
      <h1 className="font-display text-3xl font-semibold text-foreground">Insight not found</h1>
      <Link to="/insights" className="mt-4 text-sm font-semibold text-primary hover:underline">
        Back to Insights
      </Link>
    </div>
  ),
  component: InsightArticlePage,
});

function InsightArticlePage() {
  const { article } = Route.useLoaderData();
  const related = INSIGHT_ARTICLES.filter((item) => item.slug !== article.slug).slice(0, 3);
  const schema = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: article.title,
    description: article.description,
    datePublished: article.publishedAt,
    dateModified: article.updatedAt,
    mainEntityOfPage: `https://seeparah.com/insights/${article.slug}`,
    author: { "@type": "Organization", name: "Seeparah Editorial" },
    publisher: { "@type": "Organization", name: "Seeparah", url: "https://seeparah.com" },
    keywords: article.keywords.join(", "),
  };

  return (
    <div className="min-h-screen bg-background">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
      />
      <main className="mx-auto max-w-4xl px-4 pb-24 pt-10 sm:px-6">
        <Link
          to="/insights"
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Insights
        </Link>

        <header className="mt-6 border-b border-border pb-8">
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span className="rounded-full bg-accent px-2.5 py-1 font-semibold text-accent-foreground">
              {article.category}
            </span>
            <span>
              <Clock3 className="mr-1 inline h-3.5 w-3.5" />
              {article.readingMinutes} min read
            </span>
            <span>Published {new Date(article.publishedAt + "T00:00:00Z").toLocaleDateString()}</span>
          </div>
          <h1 className="mt-4 font-display text-4xl font-semibold leading-tight tracking-tight text-foreground sm:text-5xl">
            {article.title}
          </h1>
          <p className="mt-4 max-w-3xl text-lg leading-relaxed text-muted-foreground">
            {article.excerpt}
          </p>
        </header>

        <article className="mt-8 space-y-9">
          {article.sections.map((section) => (
            <section key={section.heading}>
              <h2 className="font-display text-2xl font-semibold text-foreground">
                {section.heading}
              </h2>
              <div className="mt-3 space-y-4 text-[1.03rem] leading-8 text-foreground/90">
                {section.paragraphs.map((paragraph) => (
                  <p key={paragraph}>{paragraph}</p>
                ))}
              </div>
              {section.bullets && (
                <ul className="mt-4 list-disc space-y-2 pl-6 text-base leading-7 text-foreground/90">
                  {section.bullets.map((bullet) => (
                    <li key={bullet}>{bullet}</li>
                  ))}
                </ul>
              )}
            </section>
          ))}
        </article>

        <aside className="mt-12 rounded-2xl border border-border bg-secondary/50 p-5 text-sm leading-relaxed text-secondary-foreground">
          <strong>Seeparah editorial note:</strong> Insights articles are general reading and
          research guidance. They do not replace the source and edition information shown on a
          specific published book or Sacred Text record.
        </aside>

        <section className="mt-12 border-t border-border pt-8">
          <h2 className="font-display text-2xl font-semibold text-foreground">Continue reading</h2>
          <div className="mt-4 grid gap-4 md:grid-cols-3">
            {related.map((item) => (
              <Link
                key={item.slug}
                to="/insights/$slug"
                params={{ slug: item.slug }}
                className="group rounded-2xl border border-border bg-card p-4 card-shadow"
              >
                <p className="text-xs font-semibold text-primary">{item.category}</p>
                <p className="mt-2 font-display text-base font-semibold text-foreground">
                  {item.title}
                </p>
                <span className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-primary">
                  Read <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
                </span>
              </Link>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}
