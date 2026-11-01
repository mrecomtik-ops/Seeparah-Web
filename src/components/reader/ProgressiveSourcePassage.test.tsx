// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { ProgressiveSourcePassage, sourcePreviewEnd, LARGE_SOURCE_LIMIT } from "./ProgressiveSourcePassage";

afterEach(cleanup);

describe("very long canonical source passages", () => {
  it("never separates a Unicode surrogate pair when choosing a preview", () => {
    const source = "a".repeat(5999) + "😀" + "b".repeat(7000);
    const end = sourcePreviewEnd(source);
    expect(end).toBe(5999);
    expect(source.slice(0, end) + source.slice(end)).toBe(source);
  });
  it("preserves an existing newline as the end of the exact preview prefix", () => {
    const source = "a".repeat(5000) + "\n" + "b".repeat(8000);
    expect(sourcePreviewEnd(source)).toBe(5001);
    expect(source.slice(0, 5001) + source.slice(5001)).toBe(source);
  });
  it("renders the full source immediately for ordinary-size chunks", () => {
    const source = "A short original Sanskrit verse.";
    render(<ProgressiveSourcePassage content={source} label="1:1"><p>{source}</p></ProgressiveSourcePassage>);
    expect(screen.getByText(source)).toBeTruthy();
    expect(screen.queryByText("Read complete source passage")).toBeNull();
  });
  it("clearly discloses any source preview and makes unaltered full content available", () => {
    const content = "First line of exact original.\n" + "B".repeat(LARGE_SOURCE_LIMIT + 3);
    render(<ProgressiveSourcePassage content={content} label="Dīgha Nikāya 1">
      <p>FULL ORIGINAL SOURCE VERIFIED IN RENDERER</p>
    </ProgressiveSourcePassage>);
    expect(screen.queryByText("FULL ORIGINAL SOURCE VERIFIED IN RENDERER")).toBeNull();
    const action = screen.getByRole("button", { name: "Read complete source passage" });
    expect(action.getAttribute("aria-expanded")).toBe("false");
    expect(screen.getByText(/Showing the beginning of Dīgha Nikāya 1/)).toBeTruthy();
    fireEvent.click(action);
    expect(screen.getByText("FULL ORIGINAL SOURCE VERIFIED IN RENDERER")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Collapse to beginning" }).getAttribute("aria-expanded")).toBe("true");
  });
});
