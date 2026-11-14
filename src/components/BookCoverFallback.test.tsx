// @vitest-environment happy-dom
import {afterEach,describe,expect,it} from "vitest";
import {cleanup,render} from "@testing-library/react";
import {BookCoverFallback} from "./BookCoverFallback";
afterEach(cleanup);
describe("source-honest editorial fallback",()=>{
  it("shows genuine metadata but never calls itself the original cover",()=>{
    const {container}=render(<BookCoverFallback bookId="gutenberg:8883"
      title="A Love Story" author="Unknown author" language="English"/>);
    const cover=container.querySelector("[data-editorial-cover-fallback]")!;
    expect(cover.getAttribute("role")).toBe("img");
    expect(cover.getAttribute("aria-label")).toContain("Source cover art unavailable");
    expect(cover.textContent).toContain("A Love Story");
    expect(cover.textContent).toContain("Unknown author");
  });
  it("respects non-Latin and right-to-left source editions",()=>{
    const {container}=render(<BookCoverFallback bookId="gutenberg:5"
      title="كتاب صغير" author="مؤلف" language="Arabic"/>);
    const cover=container.querySelector("[data-editorial-cover-fallback]")!;
    expect(cover.getAttribute("lang")).toBe("ar");
    expect(cover.getAttribute("dir")).toBe("rtl");
  });
});
