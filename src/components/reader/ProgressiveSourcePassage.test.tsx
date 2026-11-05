// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
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
  it("fetches the exact entire published text only on explicit expand", async () => {
    const full = "First source line.\\n" + "ث".repeat(15000);
    const preview = full.slice(0, 6000);
    const load = vi.fn(async () => full);
    render(<ProgressiveSourcePassage
      content={preview} fullContentLength={full.length} label="DN2"
      loadFullContent={load} renderFullContent={(text) => <p>{text}</p>}>
      <p>DO NOT DISPLAY A PREFIX AS COMPLETE TEXT</p>
    </ProgressiveSourcePassage>);
    expect(load).not.toHaveBeenCalled();
    expect(screen.getByText(/Showing the beginning of DN2/).textContent).toContain("of 15,");
    expect(screen.queryByText(full)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Read complete source passage" }));
    await waitFor(() => expect(screen.getByText(full)).toBeTruthy());
    expect(load).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Collapse to beginning" }));
    expect(screen.queryByText(full)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Read complete source passage" }));
    expect(screen.getByText(full)).toBeTruthy();
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("refuses a changed or mismatched full source without pretending success", async () => {
    const full = "Exact source.\\n" + "x".repeat(15000);
    const load = vi.fn(async () => "Corrupted" + full);
    render(<ProgressiveSourcePassage
      content={full.slice(0, 6000)} fullContentLength={full.length} label="DN2"
      loadFullContent={load} renderFullContent={(text) => <p>{text}</p>}>
      <p>incomplete source placeholder</p>
    </ProgressiveSourcePassage>);
    fireEvent.click(screen.getByRole("button", { name: "Read complete source passage" }));
    await waitFor(() => expect(screen.getByRole("alert")).toBeTruthy());
    expect(screen.getByRole("button", { name: "Read complete source passage" }).getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByText("Corrupted" + full)).toBeNull();
  });

  it("marks English preview notices and actions correctly inside non-English scripture", () => {
    const content = "ن".repeat(LARGE_SOURCE_LIMIT + 10);
    render(<section lang="ar"><ProgressiveSourcePassage content={content} label="1:1">
      <p>{content}</p>
    </ProgressiveSourcePassage></section>);
    const read = screen.getByRole("button", { name: "Read complete source passage" });
    expect(read.closest("[lang]")?.getAttribute("lang")).toBe("en");
    expect(screen.getByRole("status").closest("[lang]")?.getAttribute("lang")).toBe("en");
    expect(screen.getByText(content.slice(0, sourcePreviewEnd(content))).closest("[lang]")?.getAttribute("lang")).toBe("ar");
  });

});
