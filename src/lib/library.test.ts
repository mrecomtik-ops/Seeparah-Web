import { describe, expect, it } from "vitest";
import { isMissingColumnError, ManuscriptSaveError } from "@/lib/library";

describe("isMissingColumnError — the schema-tolerant retry's trigger condition", () => {
  it("matches the real PGRST204 shape PostgREST returns for an unrecognized insert column", () => {
    const err = {
      code: "PGRST204",
      message: "Could not find the 'status' column of 'book_chunks' in the schema cache",
    };
    expect(isMissingColumnError(err, "status", "book_chunks")).toBe(true);
  });

  it("is case-insensitive about the column/table name match", () => {
    const err = { code: "PGRST204", message: "Could not find the 'Status' column of 'Book_Chunks'..." };
    expect(isMissingColumnError(err, "status", "book_chunks")).toBe(true);
  });

  it("does not match a PGRST204 for a DIFFERENT column — never retry blind", () => {
    const err = {
      code: "PGRST204",
      message: "Could not find the 'job_id' column of 'book_chunks' in the schema cache",
    };
    expect(isMissingColumnError(err, "status", "book_chunks")).toBe(false);
  });

  it("does not match a PGRST204 naming the right column on a DIFFERENT table", () => {
    const err = {
      code: "PGRST204",
      message: "Could not find the 'status' column of 'books' in the schema cache",
    };
    expect(isMissingColumnError(err, "status", "book_chunks")).toBe(false);
  });

  it("never matches an authorization/RLS rejection, even with a similar-looking message", () => {
    const err = { code: "42501", message: "new row violates row-level security policy for table book_chunks" };
    expect(isMissingColumnError(err, "status", "book_chunks")).toBe(false);
  });

  it("never matches a check-constraint violation", () => {
    const err = { code: "23514", message: "new row for relation \"book_chunks\" violates check constraint" };
    expect(isMissingColumnError(err, "status", "book_chunks")).toBe(false);
  });

  it("never matches a missing-table error (PGRST205) — a different, unrelated failure", () => {
    const err = { code: "PGRST205", message: "Could not find the table 'public.book_chunks' in the schema cache" };
    expect(isMissingColumnError(err, "status", "book_chunks")).toBe(false);
  });

  it("handles null/undefined safely", () => {
    expect(isMissingColumnError(null, "status", "book_chunks")).toBe(false);
    expect(isMissingColumnError(undefined, "status", "book_chunks")).toBe(false);
    expect(isMissingColumnError({ code: "PGRST204" }, "status", "book_chunks")).toBe(false);
  });
});

describe("ManuscriptSaveError", () => {
  it("carries the orphaned book's id and an accurate, non-misleading message", () => {
    const err = new ManuscriptSaveError("book-123", "column not found");
    expect(err.bookId).toBe("book-123");
    expect(err.message).toContain("saved as a private draft");
    expect(err.message).not.toMatch(/text is safe/i);
    expect(err).toBeInstanceOf(Error);
  });
});
