import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { canCompareByCanonicalReference } from "@/lib/sacred-bible-alignment";

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
 * It never assumes published English/Greek source indexes align.
 */
export const getBibleReferenceMatchedSection = createServerFn({ method: "GET" })
  .validator((data) => z.object({
    bookId: z.string().uuid(),
    fromLanguage: z.enum(["Greek", "English"]),
    toLanguage: z.enum(["Greek", "English"]),
    chunkIndices: z.array(z.number().int().min(0)).min(1).max(32),
  }).refine((value) => canCompareByCanonicalReference(value.bookId, value.fromLanguage, value.toLanguage),
    { message: "No verified source-reference comparison for this edition pair" }).parse(data))
  .handler(async ({ data }) => {
    const { getBibleReferenceMatchedSection: run } = await import("@/lib/scripture.server");
    return run(data);
  });
