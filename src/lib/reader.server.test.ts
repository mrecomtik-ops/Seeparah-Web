import { describe, expect, it } from "vitest";
import { resolveReaderAccess } from "@/lib/reader.server";

const BASE = {
  language: "English",
  chunkIndex: 1,
  userId: "reader-1",
  isOwner: false,
  monetizationEnabled: false,
  hasActiveSubscription: false,
  editionAccessType: undefined as "free" | "paid" | undefined,
};

describe("resolveReaderAccess — the catalog gate", () => {
  it("blocks every non-owner from reading a book that isn't published", () => {
    for (const status of [
      "draft",
      "in_review",
      "changes_requested",
      "approved",
      "rejected",
      "unpublished",
      "archived",
    ]) {
      const result = resolveReaderAccess({
        ...BASE,
        book: { status, accessType: "free", sourceLanguage: "English" },
      });
      expect(result).toEqual({ locked: true, reason: "not_available" });
    }
  });

  it("never lets an anonymous visitor through the catalog gate either", () => {
    const result = resolveReaderAccess({
      ...BASE,
      userId: null,
      book: { status: "in_review", accessType: "free", sourceLanguage: "English" },
    });
    expect(result).toEqual({ locked: true, reason: "not_available" });
  });

  it("lets the book's own author read their unpublished draft", () => {
    const result = resolveReaderAccess({
      ...BASE,
      isOwner: true,
      book: { status: "draft", accessType: "free", sourceLanguage: "English" },
    });
    expect(result.locked).toBe(false);
  });

  it("allows a published free book through the catalog gate", () => {
    const result = resolveReaderAccess({
      ...BASE,
      book: { status: "published", accessType: "free", sourceLanguage: "English" },
    });
    expect(result.locked).toBe(false);
  });
});

describe("resolveReaderAccess — free-at-launch (rule 1): originals and published translations are free with no per-reader approval", () => {
  const publishedFreeBook = { status: "published", accessType: "free", sourceLanguage: "French" };

  it("a published translated edition (book_editions row exists, free) is readable with no individual grant at all", () => {
    const result = resolveReaderAccess({
      ...BASE,
      language: "Hindi",
      book: publishedFreeBook,
      editionAccessType: "free",
    });
    expect(result.locked).toBe(false);
  });

  it("this is true even for a signed-out, anonymous reader — no sign-in, no request, no grant needed", () => {
    const result = resolveReaderAccess({
      ...BASE,
      userId: null,
      language: "Arabic",
      book: publishedFreeBook,
      editionAccessType: "free",
    });
    expect(result.locked).toBe(false);
  });

  it("the original edition never needs editionAccessType at all — book.accessType governs it directly", () => {
    const result = resolveReaderAccess({
      ...BASE,
      language: "French",
      book: publishedFreeBook,
      editionAccessType: undefined,
    });
    expect(result.locked).toBe(false);
  });
});

describe("resolveReaderAccess — an edition that has never been published (no book_editions row)", () => {
  const book = { status: "published", accessType: "free", sourceLanguage: "English" };

  it("is locked with translation_access_required — not a premium lock, a 'go request it' case", () => {
    const result = resolveReaderAccess({
      ...BASE,
      language: "Hindi",
      book,
      editionAccessType: undefined,
    });
    expect(result).toEqual({ locked: true, reason: "translation_access_required" });
  });

  it("applies the same way to an anonymous reader (no special sign-in requirement just to see the request prompt)", () => {
    const result = resolveReaderAccess({
      ...BASE,
      userId: null,
      language: "Arabic",
      book,
      editionAccessType: undefined,
    });
    expect(result).toEqual({ locked: true, reason: "translation_access_required" });
  });

  it("still shows the request state to the book owner because the edition does not exist yet", () => {
    const result = resolveReaderAccess({
      ...BASE,
      language: "Arabic",
      isOwner: true,
      book,
      editionAccessType: undefined,
    });
    expect(result).toEqual({ locked: true, reason: "translation_access_required" });
  });

  it("shows the request state even on chunkIndex 0 because a missing edition has no preview text", () => {
    const result = resolveReaderAccess({
      ...BASE,
      chunkIndex: 0,
      language: "Hindi",
      book,
      editionAccessType: undefined,
    });
    expect(result).toEqual({ locked: true, reason: "translation_access_required" });
  });
});

describe("resolveReaderAccess — subscription gate (original edition)", () => {
  const paidBook = { status: "published", accessType: "paid", sourceLanguage: "English" };

  it("never gates when monetization is disabled, even for a paid book past page 1", () => {
    const result = resolveReaderAccess({ ...BASE, book: paidBook, monetizationEnabled: false });
    expect(result.locked).toBe(false);
  });

  it("always allows the free preview page (index 0) regardless of subscription", () => {
    const result = resolveReaderAccess({
      ...BASE,
      chunkIndex: 0,
      book: paidBook,
      monetizationEnabled: true,
    });
    expect(result.locked).toBe(false);
  });

  it("requires sign-in before requiring a subscription", () => {
    const result = resolveReaderAccess({
      ...BASE,
      userId: null,
      book: paidBook,
      monetizationEnabled: true,
    });
    expect(result).toEqual({ locked: true, reason: "sign_in_required" });
  });

  it("blocks a signed-in reader with no active subscription", () => {
    const result = resolveReaderAccess({
      ...BASE,
      book: paidBook,
      monetizationEnabled: true,
      hasActiveSubscription: false,
    });
    expect(result).toEqual({ locked: true, reason: "subscription_required" });
  });

  it("lets a reader with an active subscription through", () => {
    const result = resolveReaderAccess({
      ...BASE,
      book: paidBook,
      monetizationEnabled: true,
      hasActiveSubscription: true,
    });
    expect(result.locked).toBe(false);
  });

  it("never subscription-gates the book's own owner", () => {
    const result = resolveReaderAccess({
      ...BASE,
      isOwner: true,
      book: paidBook,
      monetizationEnabled: true,
      hasActiveSubscription: false,
    });
    expect(result.locked).toBe(false);
  });
});

describe("resolveReaderAccess — subscription gate (translated edition, independently Free/Premium)", () => {
  const book = { status: "published", accessType: "free", sourceLanguage: "English" };

  it("a Premium translated edition subscription-gates even though the original itself is Free", () => {
    const result = resolveReaderAccess({
      ...BASE,
      language: "Hindi",
      book,
      editionAccessType: "paid",
      monetizationEnabled: true,
      hasActiveSubscription: false,
    });
    expect(result).toEqual({ locked: true, reason: "subscription_required" });
  });

  it("the SAME active subscription that unlocks a Premium original also unlocks a Premium translation — one plan, not per-edition", () => {
    const result = resolveReaderAccess({
      ...BASE,
      language: "Hindi",
      book,
      editionAccessType: "paid",
      monetizationEnabled: true,
      hasActiveSubscription: true,
    });
    expect(result.locked).toBe(false);
  });

  it("a Free translated edition is never subscription-gated, monetization on or off", () => {
    for (const monetizationEnabled of [true, false]) {
      const result = resolveReaderAccess({
        ...BASE,
        language: "Hindi",
        book,
        editionAccessType: "free",
        monetizationEnabled,
        hasActiveSubscription: false,
      });
      expect(result.locked).toBe(false);
    }
  });

  it("a Premium translated edition never gates while monetization itself is disabled", () => {
    const result = resolveReaderAccess({
      ...BASE,
      language: "Hindi",
      book,
      editionAccessType: "paid",
      monetizationEnabled: false,
      hasActiveSubscription: false,
    });
    expect(result.locked).toBe(false);
  });
});
