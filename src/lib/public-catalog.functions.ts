import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

/** Lightweight published facet/search index; no full source/edition payloads. */
export const listPublicLibraryIndex = createServerFn({ method: "GET" }).handler(async () => {
  const { listPublicLibraryIndex: run } = await import("@/lib/public-catalog.server");
  return run();
});

/** Only the currently visible 24 books receive full public card metadata. */
export const getPublicLibraryPage = createServerFn({ method: "GET" })
  .validator((data) => z.object({
    ids: z.array(z.string().uuid()).min(1).max(24),
  }).parse(data))
  .handler(async ({ data }) => {
    const { getPublicLibraryPage: run } = await import("@/lib/public-catalog.server");
    return run(data.ids);
  });

export const listPublicBooks = createServerFn({ method: "GET" }).handler(async () => {
  const { listPublicBooks: run } = await import("@/lib/public-catalog.server");
  return run();
});

export const getPublicBook = createServerFn({ method: "GET" })
  .validator((data) => z.object({ bookId: z.string().uuid() }).parse(data))
  .handler(async ({ data }) => {
    const { getPublicBook: run } = await import("@/lib/public-catalog.server");
    return run(data.bookId);
  });

export const searchPublicBooks = createServerFn({ method: "GET" })
  .validator((data) => z.object({ query: z.string().min(1).max(200) }).parse(data))
  .handler(async ({ data }) => {
    const { searchPublicBooks: run } = await import("@/lib/public-catalog.server");
    return run(data.query);
  });

export const listPublicBooksByAuthorId = createServerFn({ method: "GET" })
  .validator((data) => z.object({ authorId: z.string().uuid() }).parse(data))
  .handler(async ({ data }) => {
    const { listPublicBooksByAuthorId: run } = await import("@/lib/public-catalog.server");
    return run(data.authorId);
  });
