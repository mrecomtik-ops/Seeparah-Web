import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, BookOpen, ChevronDown, ExternalLink, Search, ShieldCheck, X } from "lucide-react";
import { useMemo, useState } from "react";
import { listBooks, matchesBookSearch, normalizeCatalogQuery } from "@/lib/library";
import { isReligiousBook, type Book } from "@/lib/data";
import { safeJsonLd } from "@/lib/seo";
import { sacredCoverAlt, sacredCoverSrc } from "@/lib/sacred-cover-artwork";
import sourceHoldings from "@/lib/sacred-unpublished-holdings.json";
import { sacredTraditionId, sourceTraditionCounts } from "@/lib/sacred-holdings-discovery";
import { GOSPELS, TORAH, NT_ORDER, PROPHETS_ORDER, WRITINGS_ORDER, SUTTA_CORE } from "@/lib/sacred-collection-order";

export const Route = createFileRoute("/sacred-texts/")({
  loader: async () => {
    const books = await listBooks();
    return { books: books.filter(isReligiousBook) };
  },
  head: () => ({
    meta: [
      { title: "Sacred Texts — Verified Sources & Translations | Seeparah" },
      {
        name: "description",
        content:
          "Explore published sacred texts by tradition and source collection, with individual book identities, canonical references and verified editions.",
      },
      { property: "og:title", content: "Sacred Texts on Seeparah" },
      {
        property: "og:description",
        content: "A source-aware, partial library of published original-language texts and existing translations.",
      },
    ],
    links: [{ rel: "canonical", href: "https://seeparah.com/sacred-texts" }],
  }),
  component: SacredTextsPage,
});

const TRADITION_ORDER = ["Islam", "Christianity", "Judaism", "Buddhism"];
const TRADITION_INTROS: Record<string, string> = {
  Islam: "The Qur’an, with independently identified original text and published translation editions.",
  Christianity: "All 27 New Testament books: SBLGNT critical Greek originals and separately sourced public-domain World English Bible Classic translations.",
  Judaism: "The Hebrew Tanakh and its separately attributed JPS 1917 English edition, grouped by Torah, Prophets and Writings.",
  Buddhism: "Dhammapada and a selected SuttaCentral Pali–English collection. This is not the full Buddhist canon.",
};
const TRADITION_TONES: Record<string, string> = {
  Islam: "border-emerald-700/20 bg-emerald-900/[0.045]",
  Christianity: "border-sky-700/20 bg-sky-900/[0.045]",
  Judaism: "border-amber-700/20 bg-amber-900/[0.045]",
  Buddhism: "border-stone-700/20 bg-stone-900/[0.045]",
};
function traditionFor(book: Book): string {
  return (book.categories ?? []).find((category) =>
    ["Islam", "Christianity", "Judaism", "Buddhism", "Hinduism"].includes(category)
  ) ?? (book.categories ?? []).find((category) => category !== "Religious") ?? "Other traditions";
}
function ordered(books: Book[], preferred: string[]): Book[] {
  return [...books].sort((a, b) => {
    const ai = preferred.indexOf(a.title);
    const bi = preferred.indexOf(b.title);
    if (ai < 0 && bi < 0) return a.title.localeCompare(b.title);
    if (ai < 0) return 1;
    if (bi < 0) return -1;
    return ai - bi;
  });
}

function BookTile({ book, language }: { book: Book; language?: string | undefined }) {
  const readLanguage = language && book.available_languages.includes(language)
    ? language : book.source_language;
  return (
    <article className="group flex min-w-0 flex-col justify-between gap-3 rounded-xl border border-border/80 bg-background/80 p-4 transition-colors hover:border-primary/40 hover:bg-card sm:p-4">
      <div className="flex items-start gap-3">
        <span aria-hidden="true" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-secondary text-primary">
          <BookOpen className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <h5 className="font-display text-base font-semibold leading-snug text-foreground sm:text-lg" dir="auto">
            <Link to="/sacred-texts/$bookId" params={{ bookId: book.id }} className="hover:text-primary hover:underline">
              {book.title}
            </Link>
          </h5>
          <p className="mt-1 text-xs text-muted-foreground">
            {readLanguage} {readLanguage === book.source_language ? "source text" : "verified edition"}
          </p>
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/60 pt-3 text-xs">
        <Link to="/sacred-texts/$bookId" params={{ bookId: book.id }} className="font-medium text-muted-foreground hover:text-primary">
          Sources & editions
        </Link>
        <div className="flex flex-wrap items-center gap-3">
          <Link to="/read/$bookId" params={{ bookId: book.id }} search={{ lang: readLanguage, page: 1 }}
            className="inline-flex items-center gap-1 font-semibold text-primary hover:underline">
            Read {readLanguage} <ArrowRight className="h-3.5 w-3.5" />
          </Link>
          {readLanguage === "Greek" && book.available_languages.includes("English") && (
            <Link to="/read/$bookId" params={{ bookId: book.id }} search={{ lang: "English", page: 1 }}
              className="inline-flex items-center gap-1 font-semibold text-primary hover:underline">
              Read English <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          )}
        </div>
      </div>
    </article>
  );
}

function BookGroup({ title, books, language, order }: {
  title: string; books: Book[]; language?: string; order?: string[];
}) {
  if (!books.length) return null;
  return (
    <section aria-label={title} className="mt-6 first:mt-0">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h5 className="font-display text-lg font-semibold text-foreground">{title}</h5>
        <span className="text-xs text-muted-foreground">{books.length} {books.length === 1 ? "work" : "works"}</span>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {ordered(books, order ?? []).map((book) => <BookTile key={book.id} book={book} language={language} />)}
      </div>
    </section>
  );
}

function CollectionFrame({
  book, title, kicker, description, language, children, collectionSlug,
}: {
  book: Book; title: string; kicker: string; description: string;
  language?: string; children: React.ReactNode;
  collectionSlug?: "new-testament" | "tanakh";
}) {
  const cover = sacredCoverSrc(book, language);
  return (
    <div className="overflow-hidden rounded-3xl border border-border bg-card card-shadow">
      <div className="grid lg:grid-cols-[210px_minmax(0,1fr)] xl:grid-cols-[236px_minmax(0,1fr)]">
        <aside className="flex flex-col items-center justify-start gap-3 border-b border-border bg-secondary/30 p-6 text-center lg:border-b-0 lg:border-r">
          {cover ? (
            <img src={cover} alt={sacredCoverAlt(book, language)}
              width={1024} height={1536} loading="lazy" decoding="async"
              className="aspect-[2/3] w-[124px] rounded-lg border border-border/70 bg-card object-contain shadow-md sm:w-[145px] lg:w-full lg:max-w-[168px]" />
          ) : (
            <div className="flex aspect-[2/3] w-[124px] items-center justify-center rounded-xl border border-dashed border-border bg-card sm:w-[145px] lg:w-full lg:max-w-[168px]">
              <BookOpen className="h-10 w-10 text-muted-foreground/50" aria-hidden="true" />
            </div>
          )}
          <p className="max-w-[185px] text-xs leading-relaxed text-muted-foreground">
            Collection artwork · individual works are listed by title
          </p>
        </aside>
        <div className="min-w-0 p-5 sm:p-7">
          <p className="text-xs font-semibold uppercase tracking-widest text-primary">{kicker}</p>
          <h4 className="mt-2 font-display text-2xl font-semibold text-foreground">{title}</h4>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">{description}</p>
          {collectionSlug && (
            <Link to="/sacred-texts/collection/$slug" params={{ slug: collectionSlug }}
              className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-xl border border-primary/30 bg-background px-4 py-2 text-sm font-semibold text-primary hover:bg-secondary">
              View complete canonical book list <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          )}
          <div className="mt-6">{children}</div>
        </div>
      </div>
    </div>
  );
}

function StandaloneBook({ book }: { book: Book }) {
  const cover = sacredCoverSrc(book);
  const langs = [book.source_language, ...book.available_languages.filter((lang) => lang !== book.source_language)];
  return (
    <div className="grid gap-6 rounded-3xl border border-border bg-card p-5 card-shadow sm:grid-cols-[152px_minmax(0,1fr)] sm:p-7">
      <div className="flex items-start justify-center">
        {cover ? (
          <img src={cover} alt={sacredCoverAlt(book)} width={1024} height={1536} decoding="async"
            className="aspect-[2/3] w-[132px] rounded-lg border border-border/70 bg-card object-contain shadow-md sm:w-full" />
        ) : (
          <div className="flex aspect-[2/3] w-[132px] flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border bg-secondary/50 text-muted-foreground sm:w-full">
            <BookOpen className="h-8 w-8" />
            <span className="text-xs">No dedicated cover</span>
          </div>
        )}
      </div>
      <div className="min-w-0 self-center">
        <p className="text-xs font-semibold uppercase tracking-widest text-primary">Individually sourced text</p>
        <h4 className="mt-2 font-display text-3xl font-semibold text-foreground">{book.title}</h4>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground" dir="auto">
          {book.edition_title || book.attribution || book.publisher || "Verified source edition"}
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          {langs.map((lang) => <span key={lang} className="rounded-full border border-border bg-background px-3 py-1 text-xs font-medium text-foreground">{lang}</span>)}
        </div>
        {book.title === "The Qur’an" && (
          <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
            The cover represents the multilingual collection, not one translator. Source and translator details appear with each selected edition.
          </p>
        )}
        <div className="mt-6 flex flex-wrap gap-3">
          <Link to="/sacred-texts/$bookId" params={{ bookId: book.id }}
            className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90">
            Explore editions <ArrowRight className="h-4 w-4" />
          </Link>
          <Link to="/read/$bookId" params={{ bookId: book.id }} search={{ lang: book.source_language, page: 1 }}
            className="inline-flex items-center gap-2 rounded-xl border border-border px-4 py-2.5 text-sm font-semibold text-foreground hover:bg-secondary">
            Read source
          </Link>
        </div>
      </div>
    </div>
  );
}

function TraditionContent({ tradition, books }: { tradition: string; books: Book[] }) {
  const [tanakhLanguage, setTanakhLanguage] = useState<"Hebrew" | "English">("Hebrew");
  const base = books[0];
  if (!base) return null;

  if (tradition === "Islam" || !["Christianity", "Judaism", "Buddhism"].includes(tradition)) {
    return <div className="space-y-4">{books.map((book) => <StandaloneBook key={book.id} book={book} />)}</div>;
  }
  if (tradition === "Christianity") {
    return (
      <CollectionFrame book={base} kicker="SBLGNT Greek original · World English Bible Classic English"
        title="The New Testament — Greek and English"
        description="Each of the 27 books has two independently sourced editions: the critically edited SBL Greek New Testament and the public-domain World English Bible Classic English text from eBible.org. Read either language separately. They are not claimed to be verse-for-verse translations of the same Greek textual edition, and the English verse-only export omits editorial footnotes and layout."
        language="Greek" collectionSlug="new-testament">
        <BookGroup title="The four Gospels" books={books.filter((book) => GOSPELS.includes(book.title))} order={GOSPELS} />
        <BookGroup title="Acts of the Apostles" books={books.filter((book) => book.title === "Acts")} />
        <BookGroup title="Letters and epistles" books={books.filter((book) => !GOSPELS.includes(book.title) && book.title !== "Acts" && book.title !== "Revelation")} order={NT_ORDER} />
        <BookGroup title="Revelation" books={books.filter((book) => book.title === "Revelation")} />
      </CollectionFrame>
    );
  }
  if (tradition === "Judaism") {
    return (
      <CollectionFrame book={base} kicker="Tanakh · Hebrew source and JPS 1917 English"
        title="The Hebrew Scriptures"
        description="The source is arranged as Torah, Prophets and Writings. The Hebrew Tanakh and JPS 1917 English are distinct editions, each with its own collection artwork."
        language={tanakhLanguage} collectionSlug="tanakh">
        <fieldset className="mb-6 rounded-2xl border border-border bg-background/70 p-3">
          <legend className="px-2 text-xs font-semibold text-muted-foreground">Choose an edition</legend>
          <div className="flex flex-wrap gap-2">
            {(["Hebrew", "English"] as const).map((lang) => (
              <button key={lang} type="button" onClick={() => setTanakhLanguage(lang)}
                aria-pressed={tanakhLanguage === lang}
                className={tanakhLanguage === lang
                  ? "rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground"
                  : "rounded-lg border border-border px-3 py-2 text-xs font-medium text-foreground hover:bg-secondary"}>
                {lang === "Hebrew" ? "Hebrew Tanakh" : "JPS 1917 · English"}
              </button>
            ))}
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            {tanakhLanguage === "Hebrew"
              ? "Hebrew source text · Tanach with Ta’amei Hamikra"
              : "Published English translation · Jewish Publication Society, 1917"}
          </p>
        </fieldset>
        <BookGroup title="Torah" books={books.filter((book) => (book.categories ?? []).includes("Torah"))} order={TORAH} language={tanakhLanguage} />
        <BookGroup title="Prophets" books={books.filter((book) => (book.categories ?? []).includes("Prophets"))} order={PROPHETS_ORDER} language={tanakhLanguage} />
        <BookGroup title="Writings" books={books.filter((book) => (book.categories ?? []).includes("Writings"))} order={WRITINGS_ORDER} language={tanakhLanguage} />
      </CollectionFrame>
    );
  }
  const dhammapada = books.filter((book) => book.title === "Dhammapada");
  const suttas = books.filter((book) => book.title !== "Dhammapada");
  return (
    <div className="space-y-5">
      {suttas.length > 0 && (
        <CollectionFrame book={suttas[0]!} kicker="SuttaCentral · selected Pali and English editions"
          title="Selected Sutta collections"
          description="The collection artwork appears once. The books below are individually identified selections from SuttaCentral, not a complete Tipiṭaka and not dedicated Dhammapada artwork."
          language="Pali">
          <BookGroup title="Nikāya collections" books={suttas.filter((book) => SUTTA_CORE.includes(book.title))} order={SUTTA_CORE} />
          <BookGroup title="Other selected collections" books={suttas.filter((book) => !SUTTA_CORE.includes(book.title))} />
        </CollectionFrame>
      )}
      {dhammapada.map((book) => <StandaloneBook key={book.id} book={book} />)}
    </div>
  );
}

function SacredTextsPage() {
  const { books } = Route.useLoaderData();
  const [query, setQuery] = useState("");
  const [activeTradition, setActiveTradition] = useState("All");
  const [expandedTraditions, setExpandedTraditions] = useState<string[]>(["Islam"]);
  const counts = useMemo(() => {
    const result = new Map<string, number>();
    for (const book of books) {
      const group = traditionFor(book);
      result.set(group, (result.get(group) ?? 0) + 1);
    }
    return result;
  }, [books]);

  const filtered = useMemo(() => {
    const q = normalizeCatalogQuery(query);
    return books.filter((book) => {
      if (activeTradition !== "All" && traditionFor(book) !== activeTradition) return false;
      if (!q) return true;
      if (matchesBookSearch(book, query)) return true;
      return [
        book.edition_title, book.publisher, traditionFor(book),
        book.source_language, ...(book.available_languages ?? []), ...(book.categories ?? []),
      ].filter(Boolean).some((value) => normalizeCatalogQuery(String(value)).includes(q));
    });
  }, [books, query, activeTradition]);

  const grouped = useMemo(() => {
    const map = new Map<string, Book[]>();
    for (const book of filtered) {
      const tradition = traditionFor(book);
      map.set(tradition, [...(map.get(tradition) ?? []), book]);
    }
    return [...map.entries()].sort(([a], [b]) => {
      const ai = TRADITION_ORDER.indexOf(a);
      const bi = TRADITION_ORDER.indexOf(b);
      return (ai < 0 ? 999 : ai) - (bi < 0 ? 999 : bi) || a.localeCompare(b);
    });
  }, [filtered]);

  const traditions = [...TRADITION_ORDER.filter((t) => counts.has(t)), ...[...counts.keys()].filter((t) => !TRADITION_ORDER.includes(t))];
  const acquiredTraditionCounts = sourceTraditionCounts(sourceHoldings);
  const sourceOnlyTraditions = Object.keys(acquiredTraditionCounts)
    .filter((tradition) => !counts.has(tradition))
    .sort((a, b) => a.localeCompare(b));
  const schema = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: "Sacred Texts on Seeparah",
    url: "https://seeparah.com/sacred-texts",
    description: "A partial, source-aware collection of published sacred-text editions and verified existing translations.",
  };

  return (
    <div className="min-h-screen bg-background">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: safeJsonLd(schema) }} />
      <main className="mx-auto max-w-7xl px-4 pb-24 pt-7 sm:px-6 lg:pt-10">
        <header className="overflow-hidden rounded-3xl border border-primary/20 bg-primary text-primary-foreground card-shadow-lg">
          <div className="grid gap-5 px-6 py-7 sm:px-9 sm:py-9 lg:grid-cols-[1.4fr_0.6fr] lg:items-center">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-accent">Seeparah · Sacred texts</p>
              <h1 className="mt-3 font-display text-3xl font-semibold leading-tight sm:text-5xl">Read the text. See the source.</h1>
              <p className="mt-3 max-w-2xl text-sm leading-relaxed opacity-90 sm:text-base">
                Explore verified editions by tradition and collection. Each work retains its own title,
                language and references—even when several works share one collection cover.
              </p>
            </div>
            <div className="rounded-2xl border border-primary-foreground/15 bg-primary-foreground/10 p-5">
              <ShieldCheck className="h-5 w-5 text-accent" />
              <p className="mt-2 font-display text-lg font-semibold">Source-first reading</p>
              <p className="mt-1 text-xs leading-relaxed opacity-90 sm:text-sm">
                Published source editions and existing reviewed translations only. No AI-generated scripture translations.
              </p>
              <Link to="/insights/$slug" params={{ slug: "why-source-provenance-matters-for-sacred-texts" }}
                className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-accent hover:underline">
                About provenance <ExternalLink className="h-3 w-3" />
              </Link>
            </div>
          </div>
        </header>

        <section className="mt-8" aria-label="Find sacred texts">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div>
              <h2 className="font-display text-2xl font-semibold text-foreground">Browse by tradition</h2>
              <p className="mt-1 text-sm text-muted-foreground">One verified source collection, many individually named works.</p>
            </div>
            <span className="text-sm font-medium text-muted-foreground">{books.length} published reader titles · {traditions.length} traditions</span>
          </div>
          <div className="mt-4 flex flex-wrap gap-2" role="group" aria-label="Filter by tradition">
            {["All", ...traditions].map((tradition) => (
              <button key={tradition} type="button" aria-pressed={activeTradition === tradition}
                onClick={() => setActiveTradition(tradition)}
                className={activeTradition === tradition
                  ? "rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
                  : "rounded-full border border-border bg-card px-4 py-2 text-sm font-medium text-foreground hover:border-primary/40 hover:bg-secondary"}>
                {tradition === "All" ? "All traditions" : tradition}
                <span className="ml-2 opacity-70">{tradition === "All" ? books.length : counts.get(tradition)}</span>
              </button>
            ))}
          </div>
          <label className="relative mt-4 block max-w-2xl">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <span className="sr-only">Search published sacred-text titles and editions</span>
            <input value={query} onChange={(event) => setQuery(event.target.value)}
              placeholder="Find a book, tradition, language or edition"
              className="w-full rounded-xl border border-border bg-card py-3 pl-10 pr-10 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring" />
            {query && <button type="button" aria-label="Clear search" onClick={() => setQuery("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>}
          </label>
        </section>

        <div className="mt-8 space-y-12">
          {grouped.length === 0 && (
            <div className="rounded-2xl border border-dashed border-border bg-card px-5 py-12 text-center text-muted-foreground">
              <BookOpen className="mx-auto h-8 w-8" />
              <p className="mt-3 text-sm">No published text matches those filters.</p>
            </div>
          )}
          {grouped.map(([tradition, traditionBooks]) => {
            const expanded = Boolean(query.trim()) || activeTradition !== "All" || expandedTraditions.includes(tradition);
            const panelId = "works-" + tradition.toLowerCase().replace(/\s+/g, "-");
            return (
            <section key={tradition} id={"tradition-" + tradition.toLowerCase().replace(/\s+/g, "-")}
              aria-labelledby={"heading-" + tradition.toLowerCase().replace(/\s+/g, "-")} className="scroll-mt-8">
              <div className={"mb-5 rounded-2xl border px-5 py-5 sm:px-7 " + (TRADITION_TONES[tradition] || "border-border bg-secondary/30")}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-primary">Sacred-text tradition</p>
                    <h3 id={"heading-" + tradition.toLowerCase().replace(/\s+/g, "-")}
                      className="mt-1 font-display text-2xl font-semibold text-foreground sm:text-3xl">{tradition}</h3>
                  </div>
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="rounded-full border border-border bg-background/70 px-3 py-1 text-xs font-semibold text-foreground">
                      {traditionBooks.length} {traditionBooks.length === 1 ? "published title" : "published titles"}
                    </span>
                    {!query.trim() && activeTradition === "All" && (
                    <button
                      type="button"
                      aria-expanded={expanded}
                      aria-controls={panelId}
                      onClick={() => {
                        setExpandedTraditions((current) =>
                          current.includes(tradition) ? current.filter((item) => item !== tradition) : [...current, tradition],
                        );
                      }}
                      className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-border bg-card px-4 text-sm font-semibold text-primary hover:bg-secondary"
                    >
                      {expanded ? "Hide works" : "Browse works"}
                      <ChevronDown aria-hidden="true" className={"h-4 w-4 transition-transform " + (expanded ? "rotate-180" : "")} />
                    </button>
                    )}
                  </div>
                </div>
                <p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted-foreground">
                  {TRADITION_INTROS[tradition] || "Published titles from identified source editions."}
                </p>
              </div>
              {expanded && (
                <div id={panelId}>
                  <TraditionContent tradition={tradition} books={traditionBooks} />
                </div>
              )}
            </section>
          );
          })}
        </div>

        {!query && activeTradition === "All" && sourceOnlyTraditions.length > 0 && (
          <section className="mt-12" aria-labelledby="source-only-traditions">
            <div className="mb-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-primary">Acquired and identified sources</p>
              <h2 id="source-only-traditions" className="mt-1 font-display text-2xl font-semibold text-foreground">
                Additional traditions — sources and access
              </h2>
              <p className="mt-2 max-w-4xl text-sm leading-relaxed text-muted-foreground">
                These traditions have source records but no approved full-text reader titles yet.
                Explore named original sources, publisher links, existing translations and exact publication blockers.
                The links below do not imply that the source files can be republished or that any canon is complete.
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {sourceOnlyTraditions.map((tradition) => (
                <a key={tradition} href={"/sacred-texts/sources#" + sacredTraditionId(tradition)}
                  className="flex flex-col justify-between rounded-2xl border border-border bg-card p-5 transition-colors hover:border-primary/40 hover:bg-secondary/40">
                  <span className="font-display text-lg font-semibold">{tradition}</span>
                  <span className="mt-2 text-xs text-muted-foreground">
                    {acquiredTraditionCounts[tradition]} source {acquiredTraditionCounts[tradition] === 1 ? "record" : "records"} · 0 approved reader titles
                  </span>
                  <span className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-primary">
                    View verified source information <ArrowRight className="h-4 w-4" />
                  </span>
                </a>
              ))}
            </div>
          </section>
        )}

        {!query && activeTradition === "All" && (
          <aside className="mt-12 rounded-2xl border border-dashed border-border bg-card p-6">
            <h3 className="font-display text-lg font-semibold text-foreground">A growing, carefully sourced library</h3>
            <p className="mt-2 max-w-4xl text-sm leading-relaxed text-muted-foreground">
              Other traditions and additional editions—including Hindu scriptures and further Buddhist and Christian collections—
              will appear only when their source material, permissions and text structure meet publication requirements.
              An available cover image alone does not mean a text is available to read.
            </p>
            <a href="/sacred-texts/sources" className="mt-4 inline-flex items-center gap-2 rounded-xl border border-border bg-background px-4 py-2.5 text-sm font-semibold text-primary hover:border-primary/40 hover:bg-secondary">
              Explore acquired source holdings and Tibetan source volumes <ArrowRight className="h-4 w-4" />
            </a>
          </aside>
        )}
      </main>
    </div>
  );
}
