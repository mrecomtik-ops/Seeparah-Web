import { Link } from "@tanstack/react-router";
import { BookOpen, Crown } from "lucide-react";
import type { Book } from "@/lib/data";
import { coverFor } from "@/lib/covers";
import { ShelfButtons } from "@/components/ShelfButtons";

export function BookCard({
  book,
  progress,
  withShelves = true,
}: {
  book: Book;
  progress?: number | null;
  withShelves?: boolean;
}) {
  const cover = coverFor(book.id, book.cover_url);
  const pct =
    progress != null && book.total_chunks > 0
      ? Math.min(100, Math.round(((progress + 1) / book.total_chunks) * 100))
      : null;

  return (
    <div className="group relative flex flex-col overflow-hidden rounded-2xl border border-border bg-card card-shadow transition-transform duration-200 hover:-translate-y-1 hover:card-shadow-lg">
      {withShelves && (
        <div className="absolute right-3 top-3 z-10 opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100">
          <ShelfButtons bookId={book.id} />
        </div>
      )}
      <Link
        to="/read/$bookId"
        params={{ bookId: book.id }}
        search={{ lang: book.source_language }}
        className="flex flex-1 flex-col"
      >
        <div className="relative aspect-[2/3] w-full overflow-hidden bg-secondary">
          {cover ? (
            <img
              src={cover}
              alt={`Cover of ${book.title}`}
              loading="lazy"
              className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
            />
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-2 paper-texture p-4 text-center">
              <BookOpen className="h-8 w-8 text-primary/50" />
              <span className="font-display text-lg font-semibold text-foreground">
                {book.title}
              </span>
              <span className="text-xs text-muted-foreground">{book.author}</span>
            </div>
          )}
          {book.access_type === "paid" && (
            <span className="absolute left-3 top-3 inline-flex items-center gap-1 rounded-full bg-gold px-2.5 py-1 text-[11px] font-semibold text-gold-foreground">
              <Crown className="h-3 w-3" /> Premium · ${book.subscription_price_usd}/mo
            </span>
          )}
        </div>
        <div className="flex flex-1 flex-col gap-2 p-4">
          <div>
            <h3 className="font-display text-base font-semibold leading-snug text-foreground">
              {book.title}
            </h3>
            <p className="text-sm text-muted-foreground">{book.author}</p>
          </div>
          {book.genre && (
            <span className="w-fit rounded-full bg-secondary px-2 py-0.5 text-[11px] font-semibold text-secondary-foreground">
              {book.genre}
            </span>
          )}
          <p className="line-clamp-2 text-sm text-muted-foreground">
            {book.description}
          </p>
          <div className="mt-auto flex flex-wrap gap-1 pt-1">
            {book.available_languages.slice(0, 4).map((lang) => (
              <span
                key={lang}
                className="rounded-full bg-accent px-2 py-0.5 text-[11px] font-medium text-accent-foreground"
              >
                {lang}
              </span>
            ))}
            {book.available_languages.length > 4 && (
              <span className="rounded-full bg-secondary px-2 py-0.5 text-[11px] font-medium text-secondary-foreground">
                +{book.available_languages.length - 4}
              </span>
            )}
          </div>
          {pct != null && (
            <div className="pt-1">
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-secondary">
                <div
                  className="h-full rounded-full bg-primary transition-all"
                  style={{ width: `${pct}%` }}
                />
              </div>
              <p className="mt-1 text-[11px] font-medium text-muted-foreground">
                {pct}% read — continue
              </p>
            </div>
          )}
        </div>
      </Link>
    </div>
  );
}
