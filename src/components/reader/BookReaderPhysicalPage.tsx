import type { RefObject } from "react";
import { ReaderPageInk, type PageInkCommand } from "@/components/reader/ReaderPageInk";
import { makeInkPageKey, type InkTool } from "@/lib/reader-ink";

import type { Book, Highlight } from "@/lib/data";
import { RTL_LANGUAGES } from "@/lib/data";
import { languageToBcp47 } from "@/lib/languages";
import { BookReaderChapterContent } from "@/components/reader/BookReaderChapterContent";
import { FrontMatterPage } from "@/components/reader/BookReaderFrontMatterPage";
import type { ReaderChapter } from "@/lib/reader-book-layout";
import { scriptureFontFamily, toRoman, type FrontPage, type LogicalBookPage } from "@/lib/reader-v3-helpers";

export interface PhysicalPageOptions {
  logicalIndex?: number;
  frontPageIndex?: number;
  side: "left" | "right" | "single";
  master?: boolean;
}

export interface PhysicalPageModel {
  book: Book;
  frontPages: FrontPage[];
  logicalPages: LogicalBookPage[];
  chapterStartPages: number[];
  chapters: ReaderChapter[];
  highlights: Highlight[];
  chapterIndexForLogicalPage: (pageIndex: number) => number;
  onChapterJump: (chapterIndex: number) => void;
  spreadMode: boolean;
  displayBookTitle: string;
  turning: "next" | "prev" | null;
  pageSize: { width: number; height: number };
  pagePadding: string;
  language: string;
  viewportRef: RefObject<HTMLDivElement | null>;
  flowRef: RefObject<HTMLDivElement | null>;
  bodyGridHeight: number;
  contentSize: { width: number; height: number };
  physicalPageGutter: number;
  pageStride: number;
  readerFontSize: number;
  lineHeightPx: number;
  selectedFontStack: string;
  runningHeadHeight: number;
  runningHeadGap: number;
  folioHeight: number;
  ink?: {
    userId:string; enabled:boolean; tool:InkTool; color:string; width:number;
    typeface:string; textMeasure:string; lineSpacing:number;
    command:PageInkCommand|null;
    onActivate:(pageKey:string)=>void;
  };
}

/** Read-only page geometry and exact-language markup. The parent owns
 * viewport measurement, progress, source anchoring and preference changes.
 * No scripture/source edition text is generated or transformed here. */
export function BookReaderPhysicalPage({
  options, model,
}: {
  options: PhysicalPageOptions;
  model: PhysicalPageModel;
}) {
  const {
    book, frontPages, logicalPages, chapterStartPages, chapters, highlights,
    chapterIndexForLogicalPage, onChapterJump, spreadMode, displayBookTitle,
    turning, pageSize, pagePadding, language, viewportRef, flowRef,
    bodyGridHeight, contentSize, physicalPageGutter, pageStride,
    readerFontSize, lineHeightPx, selectedFontStack, runningHeadHeight,
    runningHeadGap, folioHeight, ink,
  } = model;
    const frontPageIndex = options.frontPageIndex;
    const frontPage =
      frontPageIndex != null && frontPageIndex >= 0 && frontPageIndex < frontPages.length
        ? frontPages[frontPageIndex]
        : null;
    const logicalIndex = options.logicalIndex;
    const logicalPage =
      logicalIndex != null && logicalIndex >= 0 && logicalIndex < logicalPages.length
        ? logicalPages[logicalIndex]
        : null;
    const rawPage = frontPage ? 0 : (logicalPage?.rawPage ?? null);
    const blank = !frontPage && rawPage == null;
    const chapterIndex =
      logicalIndex != null && !blank ? chapterIndexForLogicalPage(logicalIndex) : 0;
    const chapter = chapters[chapterIndex];
    const chapterOpening =
      logicalIndex != null && !blank && chapterStartPages[chapterIndex] === logicalIndex;
    const runningHeadText =
      options.side === "left" && spreadMode
        ? displayBookTitle
        : (chapter?.title ?? displayBookTitle);
    const pageClass =
      "reader-v3-page reader-v3-page-" +
      options.side +
      " reader-v3-page-turn-" +
      (turning ?? "idle") +
      (blank ? " reader-v3-page-blank" : "");

    if (blank) {
      return (
        <article
          className={pageClass}
          style={{ width: pageSize.width, height: pageSize.height, padding: pagePadding }}
          aria-hidden="true"
        />
      );
    }

    return (
      <article
        className={pageClass}
        style={{
          width: pageSize.width,
          height: pageSize.height,
          padding: pagePadding,
          fontFamily: scriptureFontFamily(language),
        }}
        lang={languageToBcp47(language)}
        dir={RTL_LANGUAGES.has(language) ? "rtl" : "ltr"}
        data-book-page={logicalIndex != null ? logicalIndex + 1 : undefined}
        data-front-page={frontPageIndex != null ? frontPageIndex + 1 : undefined}
      >
        <div
          className={"reader-v3-body-layer " + (frontPage ? "reader-v3-body-layer-hidden" : "")}
          aria-hidden={frontPage ? true : undefined}
        >
          <div
            className={
              "reader-v3-running-head " +
              (chapterOpening ? "reader-v3-running-head-hidden " : "") +
              (spreadMode
                ? "reader-v3-running-head-" + options.side
                : "reader-v3-running-head-single")
            }
            style={{ height: runningHeadHeight, marginBottom: runningHeadGap }}
          >
            <span>{runningHeadText}</span>
          </div>
          <div
            ref={options.master ? viewportRef : undefined}
            className="reader-v3-content-viewport"
            style={{ height: bodyGridHeight, flex: "0 0 auto" }}
          >
            <div
              ref={options.master ? flowRef : undefined}
              data-reader-master={options.master ? "true" : undefined}
              data-reader-visible-raw-page={rawPage ?? undefined}
              className="reader-v3-flow"
              style={{
                width: contentSize.width,
                height: bodyGridHeight,
                columnWidth: contentSize.width,
                columnGap: physicalPageGutter,
                columnFill: "auto",
                transform: "translate3d(" + String(-(rawPage ?? 0) * pageStride) + "px,0,0)",
                fontSize: readerFontSize + "px",
                lineHeight: lineHeightPx + "px",
                fontFamily: selectedFontStack,
              }}
            >
              {chapters.map((readerChapter, chapterNumber) => (
                <BookReaderChapterContent
                  key={readerChapter.key}
                  chapter={readerChapter}
                  chapterIndex={chapterNumber}
                  highlights={highlights}
                />
              ))}
            </div>
          </div>
          <div
            className={
              "reader-v3-page-number " + (chapterOpening ? "reader-v3-page-number-hidden" : "")
            }
            style={{ height: folioHeight, minHeight: folioHeight }}
          >
            {logicalIndex != null ? logicalIndex + 1 : ""}
          </div>
        </div>
        {frontPage && (
          <div className="reader-v3-front-overlay" style={{ padding: pagePadding }}>
            <FrontMatterPage
              page={frontPage}
              frontNumber={toRoman((frontPageIndex ?? 0) + 1)}
              book={book}
              displayBookTitle={displayBookTitle}
              onChapter={onChapterJump}
            />
          </div>
        )}
        {ink && (
          <ReaderPageInk
            userId={ink.userId}
            bookId={book.id}
            language={language}
            pageKey={makeInkPageKey(
              frontPage?"front":"body",
              frontPage?(frontPageIndex??0):(rawPage??0),
              pageSize.width,pageSize.height,
              ink.typeface,ink.textMeasure,ink.lineSpacing,
            )}
            enabled={ink.enabled}
            tool={ink.tool}
            color={ink.color}
            width={ink.width}
            command={ink.command}
            onActivate={ink.onActivate}
          />
        )}
      </article>
    );

}
