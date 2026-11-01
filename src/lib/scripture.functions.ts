import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export const getSacredTextReferenceIndex = createServerFn({ method: "GET" })
  .validator((data) =>
    z
      .object({
        bookId: z.string().uuid(),
        language: z.string().trim().min(1).max(80),
      })
      .parse(data),
  )
  .handler(async ({ data }) => {
    const { getSacredTextReferenceIndex: run } = await import("@/lib/scripture.server");
    return run(data);
  });


export const getSacredReaderSection = createServerFn({ method: "GET" })
  .validator((data) =>
    z
      .object({
        bookId: z.string().uuid(),
        language: z.string().trim().min(1).max(80),
        chunkIndex: z.number().int().min(0),
        windowSize: z.literal(32).optional(),
      })
      .parse(data),
  )
  .handler(async ({ data }) => {
    const { getSacredReaderSection: run } = await import("@/lib/scripture.server");
    return run(data);
  });

/** Server matches the exact published canonical reference and source node.
 * It never assumes Matthew's differently sized English/Greek arrays align.
 */
export const getMatthewReferenceMatchedSection = createServerFn({ method: "GET" })
  .validator((data) => z.object({
    bookId: z.literal("7bc812fd-6a4d-544e-903f-b2e333a5cc4f"),
    fromLanguage: z.enum(["Greek", "English"]),
    toLanguage: z.enum(["Greek", "English"]),
    chunkIndices: z.array(z.number().int().min(0)).min(1).max(32),
  }).refine((value) => value.fromLanguage !== value.toLanguage,
    { message: "Choose the opposite verified language" }).parse(data))
  .handler(async ({ data }) => {
    const { getMatthewReferenceMatchedSection: run } = await import("@/lib/scripture.server");
    return run(data);
  });
