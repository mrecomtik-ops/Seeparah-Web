import type { Book } from "@/lib/data";
import { formatAuthorName } from "@/lib/author-name";
import type { FrontPage } from "@/lib/reader-v3-helpers";

/** Exact front-page copy, numbering and navigation for Book mode.
 * Deliberately receives already-built pages and never edits source text. */
export function FrontMatterPage(props: {
  page: FrontPage;
  frontNumber: string;
  book: Book;
  displayBookTitle: string;
  onChapter: (index: number) => void;
}) {
  if (props.page.kind === "title") {
    return (
      <div className="reader-v3-front reader-v3-title-page">
        <div className="reader-v3-title-block">
          <h1>{props.displayBookTitle}</h1>
          <div>{formatAuthorName(props.book.author)}</div>
        </div>
      </div>
    );
  }
  if (props.page.kind === "contents") {
    return (
      <div className="reader-v3-front">
        <h2>{props.page.continued ? "Contents (cont.)" : "Contents"}</h2>
        <div className="reader-v3-toc">
          {props.page.entries.map((entry) => (
            <button
              key={entry.chapterIndex}
              onClick={() => props.onChapter(entry.chapterIndex)}
              className="reader-v3-toc-row"
            >
              <span className="reader-v3-toc-title">{entry.title}</span>
              <span className="reader-v3-toc-leader" aria-hidden="true" />
              <span className="reader-v3-toc-page">{entry.page}</span>
            </button>
          ))}
        </div>
        <div className="reader-v3-page-number">{props.frontNumber}</div>
      </div>
    );
  }
  return (
    <div className="reader-v3-front">
      <h2>{props.page.continued ? "About this book (cont.)" : "About this book"}</h2>
      <div className="reader-v3-summary">{props.page.text}</div>
      <div className="reader-v3-page-number">{props.frontNumber}</div>
    </div>
  );
}
