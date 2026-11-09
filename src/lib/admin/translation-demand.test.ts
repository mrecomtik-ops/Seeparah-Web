import { beforeEach, describe, expect, it, vi } from "vitest";

const dbState = vi.hoisted(() => ({
  book: {
    id: "book-general-1",
    status: "published",
    source_language: "English",
    rights_status: "approved",
    translation_permission: false,
    content_classification: "general",
    translation_generation_policy: "ai_allowed",
  },
  existing: null as Record<string, unknown> | null,
  inserted: [] as Array<Record<string, unknown>>,
}));

vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: {
    from: (table: string) => {
      if (table === "books") return {
        select: () => ({ eq: () => ({
          single: async () => ({ data: dbState.book, error: null }),
        }) }),
      };
      if (table === "translation_requests") return {
        select: () => ({
          eq: () => ({ eq: () => ({ eq: () => ({
            maybeSingle: async () => ({ data: dbState.existing }),
          }) }) }),
        }),
        insert: (row: Record<string, unknown>) => ({
          select: () => ({
            single: async () => {
              dbState.inserted.push(row);
              return { data: { ...row, id: "request-1" }, error: null };
            },
          }),
        }),
      };
      throw new Error("Unexpected table " + table);
    },
  },
}));

import { requestTranslationAccess } from "./translation-access.server";

describe("reader translation demand is independent of rights approval for production", () => {
  beforeEach(() => {
    dbState.book.status = "published";
    dbState.book.rights_status = "approved";
    dbState.book.translation_permission = false;
    dbState.book.content_classification = "general";
    dbState.book.translation_generation_policy = "ai_allowed";
    dbState.existing = null;
    dbState.inserted.length = 0;
  });

  it("records reader demand even when no translation has yet been rights-cleared", async () => {
    const request = await requestTranslationAccess({
      bookId: "book-general-1",
      language: "Urdu",
      requesterId: "user-1",
    });
    expect(request).toMatchObject({
      status: "requested", book_id: "book-general-1",
      language: "Urdu", requester_id: "user-1",
    });
    expect(dbState.inserted).toHaveLength(1);
    expect(dbState.book.translation_permission).toBe(false);
  });

  it("returns an existing request without creating another", async () => {
    dbState.existing = { id: "previous", status: "requested" };
    const request = await requestTranslationAccess({
      bookId: "book-general-1",
      language: "Urdu",
      requesterId: "user-1",
    });
    expect(request.id).toBe("previous");
    expect(dbState.inserted).toHaveLength(0);
  });

  it("still rejects religious and source-only books rather than generating scripture", async () => {
    dbState.book.content_classification = "religious";
    dbState.book.translation_generation_policy = "source_only";
    await expect(requestTranslationAccess({
      bookId: "book-general-1", language: "Urdu", requesterId: "user-1",
    })).rejects.toThrow(/does not machine-translate Religious\/source-only books/);
    expect(dbState.inserted).toHaveLength(0);
  });
});
