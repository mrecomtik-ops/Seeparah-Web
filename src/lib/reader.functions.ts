import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

/** accessToken is optional: guests can read free previews. Anything gated
 * resolves the real user id from the token server-side — never trust a
 * client-supplied userId for the access decision. */
export const getReaderChunk = createServerFn({ method: "POST" })
  .inputValidator((data) =>
    z
      .object({
        bookId: z.string(),
        language: z.string(),
        chunkIndex: z.number().int().min(0),
        accessToken: z.string().nullable().optional(),
      })
      .parse(data),
  )
  .handler(async ({ data }) => {
    let userId: string | null = null;
    if (data.accessToken) {
      try {
        const { requireUserId } = await import("@/lib/require-user.server");
        userId = await requireUserId(data.accessToken);
      } catch {
        userId = null;
      }
    }
    const { getReaderChunk: run } = await import("@/lib/reader.server");
    return run({
      bookId: data.bookId,
      language: data.language,
      chunkIndex: data.chunkIndex,
      userId,
    });
  });

export const getReaderNavigation = createServerFn({ method: "POST" })
  .inputValidator((data) =>
    z
      .object({
        bookId: z.string(),
        language: z.string(),
        accessToken: z.string().nullable().optional(),
      })
      .parse(data),
  )
  .handler(async ({ data }) => {
    let userId: string | null = null;
    if (data.accessToken) {
      try {
        const { requireUserId } = await import("@/lib/require-user.server");
        userId = await requireUserId(data.accessToken);
      } catch {
        userId = null;
      }
    }
    const { getReaderNavigation: run } = await import("@/lib/reader.server");
    return run({ bookId: data.bookId, language: data.language, userId });
  });

export const activateSubscription = createServerFn({ method: "POST" })
  .inputValidator((data) => z.object({ bookId: z.string(), accessToken: z.string() }).parse(data))
  .handler(async ({ data }) => {
    const { requireUserId } = await import("@/lib/require-user.server");
    const userId = await requireUserId(data.accessToken);
    const { activateTestModeSubscription } = await import("@/lib/reader.server");
    return activateTestModeSubscription({ bookId: data.bookId, userId });
  });
