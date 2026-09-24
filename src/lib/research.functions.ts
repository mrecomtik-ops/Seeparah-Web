import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireUserId } from "@/lib/require-user.server";

const withToken = <T extends z.ZodRawShape>(shape: T) =>
  z.object({ accessToken: z.string(), ...shape });

// Same 6MB Netlify Functions payload ceiling as book EPUB uploads (see
// MAX_UPLOAD_RAW_BYTES in src/lib/admin/catalog.functions.ts) — a research
// paper PDF goes through this same base64-over-server-function path since
// sending raw bytea through the direct client REST call is unreliable, not
// because papers need a different limit. Most real papers (a
// double-spaced humanities essay, even at 30+ pages) comfortably fit well
// under this; a larger PDF needs a dedicated object-storage upload path,
// which this project does not have yet — flagged as a known follow-up,
// not silently worked around here.
export const MAX_PAPER_PDF_RAW_BYTES = 3 * 1024 * 1024;
const MAX_PAPER_PDF_BASE64_CHARS = Math.ceil(MAX_PAPER_PDF_RAW_BYTES / 3) * 4;

/** Author-facing: attach (or replace) the PDF on the caller's own paper,
 * while it's still in a self-editable status. Never touches any other
 * field. */
export const uploadPaperPdf = createServerFn({ method: "POST" })
  .inputValidator((data) =>
    withToken({
      paperId: z.string(),
      filename: z.string().min(1).max(200),
      fileBase64: z.string().min(1).max(MAX_PAPER_PDF_BASE64_CHARS),
    }).parse(data),
  )
  .handler(async ({ data }) => {
    const userId = await requireUserId(data.accessToken);
    if (!data.filename.toLowerCase().endsWith(".pdf")) {
      throw new Error("Only PDF files are accepted here.");
    }
    const { uploadPaperPdf: run } = await import("@/lib/research.server");
    return run({
      paperId: data.paperId,
      authorId: userId,
      filename: data.filename,
      fileBase64: data.fileBase64,
    });
  });

export const removePaperPdf = createServerFn({ method: "POST" })
  .inputValidator((data) => withToken({ paperId: z.string() }).parse(data))
  .handler(async ({ data }) => {
    const userId = await requireUserId(data.accessToken);
    const { removePaperPdf: run } = await import("@/lib/research.server");
    return run({ paperId: data.paperId, authorId: userId });
  });

/** Public: reads back the currently-published version's PDF bytes (base64)
 * so the reader-facing paper page can offer a real download — never a
 * draft/pending version, enforced in downloadPublishedPaperPdf itself. No
 * auth required, matching the paper's own public readability. */
export const downloadPaperPdf = createServerFn({ method: "POST" })
  .inputValidator((data) => z.object({ paperId: z.string() }).parse(data))
  .handler(async ({ data }) => {
    const { downloadPublishedPaperPdf } = await import("@/lib/research.server");
    return downloadPublishedPaperPdf(data.paperId);
  });

/** Public-facing "report a problem with this paper" — requires sign-in
 * (same as reportTranslationIssue for books), lands in the real
 * support_tickets admin queue via createTicket. */
export const reportResearchPaperProblem = createServerFn({ method: "POST" })
  .inputValidator((data) =>
    withToken({
      paperId: z.string(),
      paperTitle: z.string().min(1),
      reason: z.string().min(1).max(2000),
    }).parse(data),
  )
  .handler(async ({ data }) => {
    const userId = await requireUserId(data.accessToken);
    const { reportResearchPaperProblem: run } = await import("@/lib/research.server");
    return run({
      paperId: data.paperId,
      paperTitle: data.paperTitle,
      reporterId: userId,
      reason: data.reason,
    });
  });
