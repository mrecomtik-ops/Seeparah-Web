import { BookOpenText } from "lucide-react";
import { sacredCollectionCaption } from "@/lib/sacred-cover-artwork";

type BookIdentity = {
  title: string;
  source_edition_id?: string | null;
};

/**
 * A truthful, title-specific identification panel for books whose saved cover_url
 * refers to an entire sacred collection, not to the individual work.
 *
 * This is intentionally typography, NOT a generated or inherited book cover.
 * The original collection artwork remains on /sacred-texts.
 */
export function SacredWorkIdentity({
  book,
  language,
  className = "",
}: {
  book: BookIdentity;
  language?: string | null | undefined;
  className?: string | undefined;
}) {
  const id = book.source_edition_id ?? "";
  const tone = id === "SBLGNT-v1.2"
    ? "bg-[#172c40] text-[#f8f1e5]"
    : id === "sefaria-tanach-taamei-hamikra"
      ? "bg-[#384337] text-[#fff5dc]"
      : "bg-[#694d31] text-[#fff5df]";
  const tradition = id === "SBLGNT-v1.2"
    ? "Christianity"
    : id === "sefaria-tanach-taamei-hamikra"
      ? "Judaism"
      : "Buddhism";
  return (
    <div
      role="img"
      aria-label={`${book.title} — individual-work title panel, not a dedicated illustrated cover. Source: ${sacredCollectionCaption(book, language)}.`}
      className={`relative flex h-full w-full min-h-0 flex-col justify-between overflow-hidden ${tone} ${className}`}
    >
      <div className="absolute inset-2 rounded-sm border border-current/20 pointer-events-none" aria-hidden="true" />
      <div className="relative px-5 pt-7 sm:px-6 sm:pt-8">
        <div className="flex items-center justify-between gap-2 border-b border-current/25 pb-3">
          <span className="text-[10px] font-semibold uppercase tracking-[0.16em] opacity-85">{tradition}</span>
          <BookOpenText className="h-4 w-4 shrink-0 opacity-65" aria-hidden="true" />
        </div>
      </div>
      <div className="relative flex min-h-0 flex-1 flex-col items-center justify-center px-5 py-4 text-center sm:px-6">
        <span className="mb-3 text-[10px] font-semibold uppercase tracking-[0.16em] opacity-70">Individual work</span>
        <span dir="auto" className="max-w-full break-words font-display text-[clamp(1.05rem,2.1vw,1.9rem)] font-semibold leading-snug [overflow-wrap:anywhere]">
          {book.title}
        </span>
        <span className="mt-4 h-px w-12 bg-current opacity-45" aria-hidden="true" />
      </div>
      <div className="relative border-t border-current/25 px-5 pb-7 pt-3 text-center sm:px-6">
        <span className="block text-[10px] font-semibold leading-relaxed opacity-90 sm:text-xs">
          {sacredCollectionCaption(book, language)}
        </span>
        <span className="mt-1 block text-[9px] leading-relaxed opacity-65">
          Title panel · collection cover shown in Sacred Texts
        </span>
      </div>
    </div>
  );
}
