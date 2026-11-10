import { describe, expect, it } from "vitest";
import { COLLECTION_TOPICS, BOOK_TOPIC_LITERATURE_FALLBACK } from "./collection-topics";

describe("Seeparah editorial collection vocabulary", () => {
  it("contains the broad literature, nonfiction and personal-development topics", () => {
    expect(COLLECTION_TOPICS).toContain("Personal Development & Self-Improvement");
    expect(COLLECTION_TOPICS).toContain("Business & Economics");
    expect(COLLECTION_TOPICS).toContain("Personal Finance & Investing");
    expect(COLLECTION_TOPICS).toContain("Psychology");
    expect(COLLECTION_TOPICS).toContain("Science Fiction");
    expect(COLLECTION_TOPICS).toContain("Children & Young Readers");
    expect(COLLECTION_TOPICS).toContain("Religious");
  });
  it("uses distinct, nonblank and reasonably short labels", () => {
    expect(COLLECTION_TOPICS.length).toBeGreaterThan(40);
    expect(new Set(COLLECTION_TOPICS).size).toBe(COLLECTION_TOPICS.length);
    expect(COLLECTION_TOPICS.every((value) => value.trim()===value && value.length<80)).toBe(true);
    expect(BOOK_TOPIC_LITERATURE_FALLBACK).toBe("Literature");
  });
});
