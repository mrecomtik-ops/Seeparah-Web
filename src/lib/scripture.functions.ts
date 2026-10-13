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
      })
      .parse(data),
  )
  .handler(async ({ data }) => {
    const { getSacredReaderSection: run } = await import("@/lib/scripture.server");
    return run(data);
  });
