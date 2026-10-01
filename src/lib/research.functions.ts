import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireUserId } from "@/lib/require-user.server";

const withToken = <T extends z.ZodRawShape>(shape: T) =>
  z.object({ accessToken: z.string(), ...shape });

// Match the conservative app-level cap used for EPUB uploads. Research
// PDFs use the same base64-over-server-function path; larger files should
// move to a dedicated object-storage upload path rather than increasing
// request memory and encoding overhead.
export const MAX_PAPER_PDF_RAW_BYTES = 3 * 1024 * 1024;
const MAX_PAPER_PDF_BASE64_CHARS = Math.ceil(MAX_PAPER_PDF_RAW_BYTES / 3) * 4;

/** Author-facing: attach (or replace) the PDF on the caller's own paper,
 * while it's still in a self-editable status. Never touches any other
 * field. */
export const uploadPaperPdf = createServerFn({ method: "POST" })
  .validator((data) =>
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
  .validator((data) => withToken({ paperId: z.string() }).parse(data))
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
  .validator((data) => z.object({ paperId: z.string() }).parse(data))
  .handler(async ({ data }) => {
    const { downloadPublishedPaperPdf } = await import("@/lib/research.server");
    return downloadPublishedPaperPdf(data.paperId);
  });

/** Public-facing "report a problem with this paper" — requires sign-in
 * (same as reportTranslationIssue for books), lands in the real
 * support_tickets admin queue via createTicket. */
export const reportResearchPaperProblem = createServerFn({ method: "POST" })
  .validator((data) =>
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
