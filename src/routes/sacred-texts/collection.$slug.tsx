import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { BookOpen, ArrowLeft, ArrowRight } from "lucide-react";
import { listBooks } from "@/lib/library";
import { isReligiousBook, type Book } from "@/lib/data";
import { NT_ORDER, TORAH, PROPHETS_ORDER, WRITINGS_ORDER } from "@/lib/sacred-collection-order";
import { sacredCoverAlt, sacredCoverSrc } from "@/lib/sacred-cover-artwork";

type CollectionSlug = "new-testament" | "tanakh";
const COLLECTIONS: Record<CollectionSlug, {
  title: string; tradition: string; scope: string; order: string[];
}> = {
  "new-testament": {
    title: "The New Testament",
    tradition: "Christianity",
    scope: "27 published book units from the SBL Greek New Testament, with separately sourced World English Bible Classic editions where available.",
    order: NT_ORDER,
  },
  "tanakh": {
    title: "Tanakh — Hebrew Scriptures",
    tradition: "Judaism",
    scope: "39 published source-export units organized into Torah, Prophets and Writings, with separately attributed JPS 1917 English editions.",
    order: [...TORAH, ...PROPHETS_ORDER, ...WRITINGS_ORDER],
  },
};

export const Route = createFileRoute("/sacred-texts/collection/$slug")({
  loader: async ({ params }) => {
    if (!(params.slug in COLLECTIONS)) throw notFound();
    const meta = COLLECTIONS[params.slug as CollectionSlug];
    const all = await listBooks();
    const published = all.filter(
      (book) => isReligiousBook(book) &&
        (book.categories ?? []).includes(meta.tradition) &&
        meta.order.includes(book.title),
    );
    const sorted = published.sort(
      (left, right) => meta.order.indexOf(left.title) - meta.order.indexOf(right.title),
    );
    return { meta, books: sorted };
  },
  head: ({ params }) => {
    const meta = COLLECTIONS[params.slug as CollectionSlug];
    const title = meta ? `${meta.title} — Seeparah` : "Sacred Text Collections — Seeparah";
    return {
      meta: [
        { title },
        { name: "description", content: meta?.scope ?? "Explore source-aware sacred-text editions on Seeparah." },
      ],
      links: [{ rel: "canonical", href: `https://seeparah.com/sacred-texts/collection/${params.slug}` }],
    };
  },
  component: SacredCollectionPage,
});

function CollectionList({ books, order, heading }: { books: Book[]; order: string[]; heading: string }) {
  const members = books.filter((book) => order.includes(book.title));
  if (!members.length) return null;
  return (
    <section className="mt-7" aria-label={heading}>
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-display text-xl font-semibold text-foreground">{heading}</h2>
        <span className="text-xs text-muted-foreground">{members.length} published works</span>
      </div>
      <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
        {members.map((book) => {
          const languages = [...new Set([book.source_language, ...book.available_languages])];
          return (
            <li key={book.id} className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex min-w-0 flex-1 items-start gap-3">
                <span className="min-w-7 shrink-0 pt-0.5 text-right text-xs font-semibold text-muted-foreground">
                  {order.indexOf(book.title) + 1}
                </span>
                <div className="min-w-0">
                  <Link to="/sacred-texts/$bookId" params={{ bookId: book.id }}
                    className="font-display text-base font-semibold text-foreground hover:text-primary hover:underline" dir="auto">
                    {book.title}
                  </Link>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Original: {book.source_language} · {languages.length} {languages.length === 1 ? "language" : "languages"} available
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                {languages.map((language) => (
                  <Link key={language} to="/read/$bookId" params={{ bookId: book.id }}
                    search={{ lang: language, page: 1 }}
                    className="inline-flex min-h-11 items-center justify-center gap-1 rounded-lg border border-primary/30 bg-background px-3 py-2 text-xs font-semibold text-primary hover:bg-secondary">
                    Read {language} <ArrowRight className="h-3 w-3" aria-hidden="true" />
                  </Link>
                ))}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function SacredCollectionPage() {
  const { meta, books } = Route.useLoaderData();
  const collectionCover = books[0] ? sacredCoverSrc(books[0], books[0].source_language) : null;
  const groups = meta.tradition === "Judaism"
    ? [
        { heading: "Torah", order: TORAH },
        { heading: "Prophets", order: PROPHETS_ORDER },
        { heading: "Writings", order: WRITINGS_ORDER },
      ]
    : [{ heading: "The New Testament · canonical book order", order: NT_ORDER }];
  return (
    <main className="mx-auto max-w-6xl px-4 pb-24 pt-8 sm:px-6">
      <Link to="/sacred-texts" className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-primary hover:underline">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" /> All Sacred Texts
      </Link>
      <header className="mt-6 grid gap-6 rounded-2xl border border-border bg-card p-5 sm:grid-cols-[140px_minmax(0,1fr)] sm:p-7">
        <div className="mx-auto w-[112px] sm:mx-0 sm:w-[140px]">
          {collectionCover && books[0] ? (
            <img src={collectionCover} alt={sacredCoverAlt(books[0], books[0].source_language)}
              width={280} height={420} decoding="async" className="aspect-[2/3] w-full rounded-lg bg-secondary object-contain" />
          ) : (
            <div className="flex aspect-[2/3] items-center justify-center rounded-lg bg-secondary">
              <BookOpen className="h-9 w-9 text-primary/50" aria-hidden="true" />
            </div>
          )}
          <p className="mt-2 text-center text-xs text-muted-foreground">Collection artwork</p>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-primary">{meta.tradition} · source editions</p>
          <h1 className="mt-2 font-display text-3xl font-semibold text-foreground sm:text-4xl">{meta.title}</h1>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground">{meta.scope}</p>
          <p className="mt-3 text-sm font-semibold text-foreground">
            {books.length} of {meta.order.length} expected canonical units currently published
          </p>
          <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
            Original and translated editions are independently identified; no unverified verse alignment or AI-generated scripture text is presented.
          </p>
        </div>
      </header>
      {groups.map((group) => (
        <CollectionList key={group.heading} books={books} heading={group.heading} order={group.order} />
      ))}
    </main>
  );
}
