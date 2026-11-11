import { describe, expect, it } from "vitest";
import { canonicalBookUrl } from "./seo";

describe("QA-029 canonical book detail URLs", () => {
  const id = "f7e3a9f0-931a-5207-9859-a27210cc2ca8";
  it("links sacred and religious-categorized works to the source reference page", () => {
    expect(canonicalBookUrl({ id, content_classification: "religious", categories: [] }))
      .toBe("https://seeparah.com/sacred-texts/" + id);
    expect(canonicalBookUrl({ id, content_classification: "general", categories: ["Religious"] }))
      .toBe("https://seeparah.com/sacred-texts/" + id);
  });
  it("preserves ordinary library book links without duplicate canonicals", () => {
    expect(canonicalBookUrl({ id, content_classification: "general", categories: ["Literature"] }))
      .toBe("https://seeparah.com/book/" + id);
  });
});
