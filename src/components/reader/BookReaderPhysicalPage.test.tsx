// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { createRef } from "react";
import type { Book } from "@/lib/data";
import { BookReaderPhysicalPage, type PhysicalPageModel } from "./BookReaderPhysicalPage";

const book = { title: "Verified Original", author: "Verified Source Author" } as Book;
function model(language = "Arabic"): PhysicalPageModel {
  return {
    book,
    frontPages: [{ kind: "title" }],
    logicalPages: [{ rawPage: 0 }, { rawPage: null }],
    chapters: [{
      key: "chapter-1", title: "Chapter 1", kind: "chapter",
      chapterNumber: 1, startChunkIndex: 0, blocks: [], textLength: 0,
    }],
    highlights: [],
    chapterStartPages: [0],
    chapterIndexForLogicalPage: () => 0,
    onChapterJump: () => {},
    spreadMode: false,
    displayBookTitle: "Verified Original",
    turning: null,
    pageSize: { width: 360, height: 540 },
    pagePadding: "12px 16px",
    language,
    viewportRef: createRef<HTMLDivElement>(),
    flowRef: createRef<HTMLDivElement>(),
    bodyGridHeight: 400,
    contentSize: { width: 280, height: 400 },
    physicalPageGutter: 10,
    pageStride: 290,
    readerFontSize: 18,
    lineHeightPx: 27,
    selectedFontStack: "serif",
    runningHeadHeight: 12,
    runningHeadGap: 18,
    folioHeight: 35,
  };
}
afterEach(cleanup);
describe("SP-36 external page geometry keeps source/language and book mode intact", () => {
  it("renders a real title page with its own front-matter number", () => {
    render(<BookReaderPhysicalPage model={model()}
      options={{ frontPageIndex: 0, side: "single", master: true }} />);
    expect(screen.getByRole("heading", { level: 1, name: "Verified Original" })).toBeTruthy();
    expect(screen.getByText("Verified Source Author")).toBeTruthy();
    // Book-mode intentionally omits the printed folio on its title page;
    // the logical front-page identity is retained for navigation.
    expect(document.querySelector(".reader-v3-front-overlay")).toBeTruthy();
    expect(document.querySelector('[data-front-page="1"]')).toBeTruthy();
  });
  it("keeps original Arabic language and RTL on chapter body, never inferring Mushaf pagination", () => {
    render(<BookReaderPhysicalPage model={model()}
      options={{ logicalIndex: 0, side: "single", master: true }} />);
    const page = document.querySelector("article.reader-v3-page") as HTMLElement;
    expect(page.getAttribute("lang")).toBe("ar");
    expect(page.getAttribute("dir")).toBe("rtl");
    expect(page.dataset["bookPage"]).toBe("1");
    expect(page.querySelector('[data-reader-master="true"]')).toBeTruthy();
    expect(page.querySelector('[data-reader-visible-raw-page="0"]')).toBeTruthy();
  });
  it("keeps chapter-alignment blank leaves truly hidden from screen readers", () => {
    render(<BookReaderPhysicalPage model={model("English")}
      options={{ logicalIndex: 1, side: "left" }} />);
    const page = document.querySelector("article.reader-v3-page-blank") as HTMLElement;
    expect(page).toBeTruthy();
    expect(page.getAttribute("aria-hidden")).toBe("true");
    expect(page.querySelector('[data-reader-master="true"]')).toBeNull();
  });
});
