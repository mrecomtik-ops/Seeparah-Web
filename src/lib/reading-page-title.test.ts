import { describe, expect, it } from "vitest";
import { readingPageTitle } from "@/lib/reading-page-title";

describe("reading tab titles", () => {
  it("identifies the exact visible sacred section and language", () => {
    expect(readingPageTitle("The Qur’an", "Surah 2", "Arabic"))
      .toBe("The Qur’an — Surah 2 — Arabic | Seeparah");
  });
  it("describes a literature chapter without requiring a language", () => {
    expect(readingPageTitle("Jekyll and Hyde", "Story of the Door"))
      .toBe("Jekyll and Hyde — Story of the Door | Seeparah");
  });
});
