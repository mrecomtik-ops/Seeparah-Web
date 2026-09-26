import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export const listPublicBooks = createServerFn({ method: "GET" }).handler(async () => {
  const { listPublicBooks: run } = await import("@/lib/public-catalog.server");
  return run();
});

export const getPublicBook = createServerFn({ method: "GET" })
  .inputValidator((data) => z.object({ bookId: z.string().uuid() }).parse(data))
  .handler(async ({ data }) => {
    const { getPublicBook: run } = await import("@/lib/public-catalog.server");
    return run(data.bookId);
  });

export const searchPublicBooks = createServerFn({ method: "GET" })
  .inputValidator((data) => z.object({ query: z.string().min(1).max(200) }).parse(data))
  .handler(async ({ data }) => {
    const { searchPublicBooks: run } = await import("@/lib/public-catalog.server");
    return run(data.query);
  });


export const listPublicBooksByAuthorId = createServerFn({ method: "GET" })
  .inputValidator((data) => z.object({ authorId: z.string().uuid() }).parse(data))
  .handler(async ({ data }) => {
    const { listPublicBooksByAuthorId: run } = await import("@/lib/public-catalog.server");
    return run(data.authorId);
  });
