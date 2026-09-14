// Author-facing manuscript import. Reuses the SAME EPUB parser already
// built for the admin upload flow (src/lib/admin/catalog.server.ts's
// extractEpubToManuscriptText -> src/lib/admin/epub.server.ts's parseEpub
// — zip-bomb/path-traversal guarded, no script execution, no image-only/
// scanned-content pass-through). This function does not create a book —
// it only extracts plain text server-side (EPUB parsing needs Node, not
// the browser) and hands it back to the client, which then goes through
// the exact same publishBook() path a pasted-text manuscript already
// uses. Any signed-in user may call this; it is not an admin-only action.
//
// DOCX is NOT handled here or anywhere else in this codebase — there is
// no existing DOCX parser to reuse, and building one from scratch is a
// separate, larger piece of work, not a wiring exercise like this file.
// Do not describe DOCX as supported; the upload UI's own copy must keep
// saying so.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireUserId } from "@/lib/require-user.server";

// This request travels over Netlify's synchronous Functions transport
// (AWS Lambda), which has a hard 6MB request payload limit that Netlify
// cannot raise. A larger ceiling here would be silently unreachable in
// production: Netlify's edge rejects the request before this function
// (or its own Zod validator) ever runs. See src/lib/admin/catalog.functions.ts
// for the matching limit on the admin upload path.
export const MAX_EPUB_RAW_BYTES = 3 * 1024 * 1024;
const MAX_EPUB_BASE64_CHARS = Math.ceil(MAX_EPUB_RAW_BYTES / 3) * 4;

export const importEpubManuscript = createServerFn({ method: "POST" })
  .inputValidator((data) =>
    z
      .object({
        accessToken: z.string(),
        fileBase64: z.string().min(1).max(MAX_EPUB_BASE64_CHARS),
      })
      .parse(data),
  )
  .handler(async ({ data }) => {
    await requireUserId(data.accessToken); // any signed-in user — no admin capability required
    const { extractEpubToManuscriptText } = await import("@/lib/admin/catalog.server");
    const bytes = Buffer.from(data.fileBase64, "base64");
    const { text, warnings } = await extractEpubToManuscriptText(new Uint8Array(bytes));
    return { text, warnings };
  });
