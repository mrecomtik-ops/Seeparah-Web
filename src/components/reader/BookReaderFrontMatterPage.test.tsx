// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { Book } from "@/lib/data";
import { FrontMatterPage } from "./BookReaderFrontMatterPage";
const book = { author: "Robert Louis Stevenson" } as Book;
afterEach(cleanup);
describe("SP-36 extracted book-mode front matter", () => {
  it("keeps a dedicated title page and exact byline", () => {
    render(<FrontMatterPage book={book} page={{ kind: "title" }}
      displayBookTitle="The Strange Case of Dr Jekyll and Mr Hyde"
      frontNumber="i" onChapter={() => {}} />);
    expect(screen.getByRole("heading", { level: 1 })).toBeTruthy();
    expect(screen.getByText(/Robert Louis Stevenson/i)).toBeTruthy();
  });
  it("lists complete TOC entries with chapter navigation, including continuations", () => {
    const onChapter = vi.fn();
    render(<FrontMatterPage book={book} displayBookTitle="Jekyll & Hyde"
      page={{ kind: "contents", continued: true, entries: [
        { title: "Chapter 14", chapterIndex: 13, page: 106 },
        { title: "Chapter 15", chapterIndex: 14, page: 113 },
      ]}}
      frontNumber="ii" onChapter={onChapter} />);
    expect(screen.getByRole("heading", { name: "Contents (cont.)" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Chapter 15/ }));
    expect(onChapter).toHaveBeenCalledWith(14);
    expect(screen.getByText("113")).toBeTruthy();
  });
  it("keeps the summary on its own page, without changing source content", () => {
    render(<FrontMatterPage book={book} displayBookTitle="A Book"
      page={{ kind: "summary", text: "Verified human-provided summary.", continued: false }}
      frontNumber="iii" onChapter={() => {}} />);
    expect(screen.getByRole("heading", { name: "About this book" })).toBeTruthy();
    expect(screen.getByText("Verified human-provided summary.")).toBeTruthy();
  });
});
