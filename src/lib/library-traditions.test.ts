import { describe, expect, it } from "vitest";
import type { Book } from "@/lib/data";
import { matchesPublishedTradition, publishedTraditions } from "./library-traditions";

const work = (categories: string[], classification: "general" | "religious" = "religious") =>
  ({ categories, content_classification: classification }) as Book;

describe("Library tradition taxonomy", () => {
  it("uses only verified tradition labels present in religious works", () => {
    expect(publishedTraditions([
      work(["Religious", "Judaism", "Tanakh", "Torah"]),
      work(["Religious", "Buddhism", "SuttaCentral"]),
      work(["Christianity"], "general"),
    ])).toEqual(["Judaism", "Buddhism"]);
  });
  it("does not misclassify collections as traditions", () => {
    expect(matchesPublishedTradition(work(["Religious", "Judaism", "Tanakh"]), "Tanakh")).toBe(false);
    expect(matchesPublishedTradition(work(["Religious", "Judaism"]), "Judaism")).toBe(true);
  });
  it("accepts the default no-tradition filter for literature too", () => {
    expect(matchesPublishedTradition(work(["Philosophy"], "general"), null)).toBe(true);
  });
});
