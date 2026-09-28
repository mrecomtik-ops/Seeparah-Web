import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export const getSacredTextReferenceIndex = createServerFn({ method: "GET" })
  .inputValidator((data) =>
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
