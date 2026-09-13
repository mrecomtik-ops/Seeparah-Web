import { describe, expect, it } from "vitest";
import { resolveReaderAccess } from "@/lib/reader.server";

const BASE = {
  language: "English",
  chunkIndex: 1,
  userId: "reader-1",
  isOwner: false,
  monetizationEnabled: false,
  hasActiveSubscription: false,
  hasGrantedTranslationAccess: false,
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

describe("resolveReaderAccess — subscription gate", () => {
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

describe("resolveReaderAccess — reader-requested translation gate (Hindi/Arabic)", () => {
  const book = { status: "published", accessType: "free", sourceLanguage: "English" };

  it("gates a Hindi translated edition behind a granted request", () => {
    const result = resolveReaderAccess({
      ...BASE,
      language: "Hindi",
      book,
      hasGrantedTranslationAccess: false,
    });
    expect(result).toEqual({ locked: true, reason: "translation_access_required" });
  });

  it("tells an anonymous reader to sign in rather than 'request', for a gated language", () => {
    const result = resolveReaderAccess({
      ...BASE,
      language: "Arabic",
      userId: null,
      book,
      hasGrantedTranslationAccess: false,
    });
    expect(result).toEqual({ locked: true, reason: "sign_in_required" });
  });

  it("lets a reader with a granted request through", () => {
    const result = resolveReaderAccess({
      ...BASE,
      language: "Hindi",
      book,
      hasGrantedTranslationAccess: true,
    });
    expect(result.locked).toBe(false);
  });

  it("never gates English or Urdu behind a translation request", () => {
    for (const language of ["English", "Urdu"]) {
      const result = resolveReaderAccess({
        ...BASE,
        language,
        book: { ...book, sourceLanguage: "French" },
        hasGrantedTranslationAccess: false,
      });
      expect(result.locked).toBe(false);
    }
  });

  it("never gates the book's own source language even if it happens to be Hindi", () => {
    const result = resolveReaderAccess({
      ...BASE,
      language: "Hindi",
      book: { ...book, sourceLanguage: "Hindi" },
      hasGrantedTranslationAccess: false,
    });
    expect(result.locked).toBe(false);
  });

  it("never gates the book's own author out of a Hindi/Arabic edition", () => {
    const result = resolveReaderAccess({
      ...BASE,
      language: "Arabic",
      isOwner: true,
      book,
      hasGrantedTranslationAccess: false,
    });
    expect(result.locked).toBe(false);
  });
});
