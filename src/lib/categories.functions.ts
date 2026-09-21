import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireUserId } from "@/lib/require-user.server";

const withToken = <T extends z.ZodRawShape>(shape: T) =>
  z.object({ accessToken: z.string(), ...shape });

/** Author-facing: suggest a category for the caller's own book or research
 * paper. Never writes books.categories or the master category list itself
 * — see suggestCategory in src/lib/admin/catalog.server.ts for why an
 * admin's own separate, later action is always required either way. */
export const suggestBookCategory = createServerFn({ method: "POST" })
  .inputValidator((data) =>
    withToken({
      contentType: z.enum(["book", "research_paper"]),
      contentId: z.string(),
      category: z.string().min(1).max(60),
    }).parse(data),
  )
  .handler(async ({ data }) => {
    const userId = await requireUserId(data.accessToken);
    const { suggestCategory } = await import("@/lib/admin/catalog.server");
    return suggestCategory({
      contentType: data.contentType,
      contentId: data.contentId,
      suggestedBy: userId,
      category: data.category,
    });
  });
