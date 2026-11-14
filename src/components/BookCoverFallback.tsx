import { BookOpen } from "lucide-react";
import { languageToBcp47 } from "@/lib/languages";
import { RTL_LANGUAGES } from "@/lib/data";

/** Title-based editorial artwork for books without a verified cover image.
 * Clearly Seeparah-branded; NEVER impersonate a Gutenberg original.
 * Stable palette needs no image asset, storage write or publishing metadata. */
export function BookCoverFallback({
  bookId,title,author,language,
}: {bookId:string;title:string;author:string;language:string}) {
  const palettes=[
    ["#122744","#d8b97b","#f8f4e9"],
    ["#3d2137","#d6a87b","#fff4e8"],
    ["#163a35","#d5b878","#f5f2df"],
    ["#3d3428","#d7b58e","#f9f4ed"],
    ["#26335e","#bdc9e6","#f7f8fb"],
  ] as const;
  const seed=[...bookId].reduce((total,ch)=>total+ch.charCodeAt(0),0);
  const [background,accent,foreground]=palettes[seed%palettes.length]!;
  const rtl=RTL_LANGUAGES.has(language);
  return (
    <div
      role="img"
      aria-label={"Seeparah typographic reading-edition cover for "+title+" by "+author+". Source cover art unavailable."}
      data-editorial-cover-fallback
      className="absolute inset-0 isolate flex h-full w-full select-none flex-col justify-between overflow-hidden px-[9%] py-[10%] text-center shadow-inner"
      style={{backgroundColor:background,color:foreground}}
      lang={languageToBcp47(language)}
      dir={rtl?"rtl":"ltr"}
    >
      <div className="pointer-events-none absolute -right-[38%] top-[17%] h-[60%] w-[100%] rounded-full border-[0.7rem] opacity-15" style={{borderColor:accent}} aria-hidden="true"/>
      <div className="pointer-events-none absolute -left-[38%] top-[22%] h-[60%] w-[100%] rounded-full border opacity-20" style={{borderColor:accent}} aria-hidden="true"/>
      <div className="relative flex flex-col items-center gap-2">
        <span className="font-sans text-[0.5rem] font-bold uppercase tracking-[0.27em] sm:text-[0.6rem]" style={{color:accent}}>Seeparah</span>
        <div className="h-px w-16" style={{backgroundColor:accent}} aria-hidden="true" />
      </div>
      <div className="relative flex flex-col items-center justify-center gap-4 py-3">
        <BookOpen size={23} strokeWidth={1.1} style={{color:accent}} aria-hidden="true"/>
        <span className="line-clamp-6 break-words font-display text-base font-semibold leading-snug sm:text-lg">
          {title}
        </span>
        <div className="h-px w-12" style={{backgroundColor:accent}} aria-hidden="true" />
        <span className="line-clamp-3 break-words text-[0.72rem] leading-relaxed opacity-90 sm:text-xs">{author}</span>
      </div>
      <div className="relative flex flex-col items-center gap-2">
        <div className="h-px w-14 opacity-60" style={{backgroundColor:accent}} aria-hidden="true"/>
        <span className="text-[0.52rem] font-medium uppercase tracking-[0.16em]" style={{color:accent}}>Reading edition</span>
      </div>
    </div>
  );
}
