import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { ArrowLeft, ArrowRight, BookOpen, ExternalLink, Search } from "lucide-react";

type GutenbergRow = {
  id: number;
  title: string;
  author: string;
  languages: string[];
  issued: string | null;
  subjects: string | null;
  seeparahBookId: string | null;
};
type CatalogPage = {
  page: number;
  pageSize: number;
  total: number;
  hasMore: boolean;
  items: GutenbergRow[];
};

export const Route = createFileRoute("/gutenberg")({
  head: () => ({
    meta: [
      { title: "Project Gutenberg Catalogue — Seeparah" },
      {
        name: "description",
        content:
          "Browse Project Gutenberg's multilingual catalogue. Read verified, published books on Seeparah or open the original Gutenberg edition.",
      },
    ],
  }),
  component: GutenbergCatalogPage,
});

async function fetchCatalog(
  page: number,
  query: string,
  language: string,
): Promise<CatalogPage> {
  const params = new URLSearchParams({ page: String(page) });
  if (query.trim()) params.set("q", query.trim());
  if (language) params.set("lang", language);
  const response = await fetch("/api/gutenberg-catalog.json?" + params, {
    headers: { Accept: "application/json" },
  });
  if (!response.ok) throw new Error("The Gutenberg catalogue could not be loaded.");
  return (await response.json()) as CatalogPage;
}

function GutenbergCatalogPage() {
  const [draft, setDraft] = useState("");
  const [query, setQuery] = useState("");
  const [language, setLanguage] = useState("");
  const [page, setPage] = useState(1);
  const catalog = useQuery({
    queryKey: ["gutenberg-catalog", page, query, language],
    queryFn: () => fetchCatalog(page, query, language),
  });
  const data = catalog.data;
  return (
    <main className="min-h-screen bg-background px-4 py-7 text-foreground sm:px-6 md:py-12">
      <div className="mx-auto max-w-6xl space-y-7">
        <Link to="/library"
          className="inline-flex min-h-11 items-center gap-2 rounded-xl px-3 text-sm font-medium text-primary transition-colors hover:bg-secondary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Back to Seeparah library
        </Link>
        <header className="space-y-3">
          <p className="text-sm font-semibold uppercase tracking-widest text-primary">
            Source catalogue
          </p>
          <h1 className="font-display text-3xl font-semibold sm:text-5xl">
            Explore Project Gutenberg
          </h1>
          <p className="max-w-3xl text-base text-muted-foreground">
            Explore the full Gutenberg catalogue, including languages and editions
            not yet available in the Seeparah reader. A catalogue entry is not
            a claim that the manuscript has been imported or approved. When an
            edition is not hosted here, you can read it at Project Gutenberg.
          </p>
        </header>
        <form
          className="grid gap-3 rounded-2xl border border-border bg-card p-4 sm:grid-cols-[minmax(0,1fr)_180px_auto]"
          onSubmit={(event) => {
            event.preventDefault();
            setQuery(draft);
            setPage(1);
          }}>
          <label className="flex min-w-0 items-center gap-2 rounded-xl border border-border bg-background px-3 focus-within:ring-2 focus-within:ring-ring">
            <Search className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden="true" />
            <span className="sr-only">Search Gutenberg book title or author</span>
            <input
              aria-label="Search Gutenberg book title or author"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              maxLength={80}
              placeholder="Book title or author"
              className="h-12 min-w-0 w-full bg-transparent text-foreground outline-none"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            <span className="sr-only">Gutenberg language</span>
            <select
              aria-label="Gutenberg language"
              value={language}
              onChange={(event) => {setLanguage(event.target.value);setPage(1);}}
              className="h-12 rounded-xl border border-border bg-background px-3 text-sm text-foreground">
              <option value="">All languages</option>
              <option value="en">English</option>
              <option value="ur">Urdu</option>
              <option value="ar">Arabic</option>
              <option value="fr">French</option>
              <option value="de">German</option>
              <option value="es">Spanish</option>
              <option value="zh">Chinese</option>
              <option value="hi">Hindi</option>
              <option value="it">Italian</option>
              <option value="pt">Portuguese</option>
              <option value="ru">Russian</option>
            </select>
          </label>
          <button type="submit"
            className="min-h-12 rounded-xl bg-primary px-6 font-semibold text-primary-foreground transition-colors hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
            Find books
          </button>
        </form>
        <section aria-live="polite" aria-busy={catalog.isPending}>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-semibold">
              {data ? data.total.toLocaleString() + " catalogue records" : "Gutenberg records"}
            </h2>
            {data && <span className="text-sm text-muted-foreground">Page {data.page}</span>}
          </div>
          {catalog.isPending ? (
            <p className="rounded-xl border border-border p-7 text-muted-foreground">Loading catalogue…</p>
          ) : catalog.isError ? (
            <div role="alert" className="rounded-xl border border-border bg-card p-6">
              <p className="font-medium">Catalogue is temporarily unavailable.</p>
              <button className="mt-3 rounded-lg border border-border px-4 py-2 hover:bg-secondary"
                onClick={() => catalog.refetch()}>Retry</button>
            </div>
          ) : data?.items.length === 0 ? (
            <p className="rounded-xl border border-border p-7">
              No matching records. Try another title, author or language.
            </p>
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              {(data?.items ?? []).map((book) => (
                <article key={book.id}
                  className="flex min-w-0 flex-col gap-3 rounded-2xl border border-border bg-card p-5 transition-shadow hover:shadow-md">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xs text-muted-foreground">Gutenberg #{book.id}</span>
                    <span className="rounded-full bg-secondary px-3 py-1 text-xs text-secondary-foreground">
                      {book.seeparahBookId ? "Read on Seeparah" : "Source catalogue"}
                    </span>
                  </div>
                  <h3 className="font-display text-xl font-semibold break-words">{book.title}</h3>
                  <p className="text-sm text-muted-foreground break-words">{book.author}</p>
                  {book.languages.length > 0 && (
                    <p className="text-xs text-muted-foreground">
                      Languages: {book.languages.join(", ")}
                    </p>
                  )}
                  <div className="mt-auto flex flex-wrap gap-2 pt-2">
                    {book.seeparahBookId && (
                      <a href={"/read/" + encodeURIComponent(book.seeparahBookId)}
                        className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground transition-colors hover:opacity-90">
                        <BookOpen className="h-4 w-4" aria-hidden="true" /> Read here
                      </a>
                    )}
                    <a href={"https://www.gutenberg.org/ebooks/" + book.id}
                      target="_blank" rel="noopener noreferrer"
                      className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-border px-4 text-sm font-semibold text-primary transition-colors hover:bg-secondary">
                      Read at Gutenberg <ExternalLink className="h-4 w-4" aria-hidden="true" />
                    </a>
                  </div>
                </article>
              ))}
            </div>
          )}
          {data && data.total > data.pageSize && (
            <nav aria-label="Gutenberg catalogue pages"
              className="mt-7 flex items-center justify-center gap-4">
              <button type="button" disabled={page<=1}
                onClick={() => setPage(p => Math.max(1,p-1))}
                className="min-h-11 rounded-xl border border-border px-5 font-medium transition-colors hover:bg-secondary disabled:opacity-40">
                Previous
              </button>
              <span className="text-sm text-muted-foreground">{page} / {Math.ceil(data.total / data.pageSize)}</span>
              <button type="button" disabled={!data.hasMore}
                onClick={() => setPage(p => p+1)}
                className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-border px-5 font-medium transition-colors hover:bg-secondary disabled:opacity-40">
                Next <ArrowRight className="h-4 w-4" aria-hidden="true"/>
              </button>
            </nav>
          )}
        </section>
      </div>
    </main>
  );
}
