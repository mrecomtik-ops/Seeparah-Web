import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAdmin } from "@/lib/admin/require-admin.server";
import { recordAudit } from "@/lib/admin/audit.server";

const MAX_IMAGE_BYTES = 3 * 1024 * 1024;
const MAX_BASE64_CHARS = Math.ceil(MAX_IMAGE_BYTES / 3) * 4;
const types = ["image/png", "image/jpeg", "image/webp"] as const;

function validSignature(bytes: Uint8Array, mime: (typeof types)[number]): boolean {
  if (mime === "image/png")
    return bytes.length >= 8 &&
      [137, 80, 78, 71, 13, 10, 26, 10].every((value, index) => bytes[index] === value);
  if (mime === "image/jpeg")
    return bytes.length >= 3 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  return bytes.length >= 12 &&
    String.fromCharCode(...bytes.subarray(0, 4)) === "RIFF" &&
    String.fromCharCode(...bytes.subarray(8, 12)) === "WEBP";
}

/**
 * Stage one cover for an authenticated MFA-verified catalog editor.
 * Upload never publishes or changes a book; the editor must review the
 * image and explicitly save its URL through adminUpdateBookMetadata.
 * No storage.objects INSERT policy is granted to browser/anon roles.
 */
export const adminUploadBookCover = createServerFn({ method: "POST" })
  .validator((value) => z.object({
    accessToken: z.string().min(1),
    bookId: z.string().uuid(),
    fileBase64: z.string().min(1).max(MAX_BASE64_CHARS),
    mimeType: z.enum(types),
    attribution: z.string().trim().min(3).max(500),
    sharedArtwork: z.boolean().default(false),
  }).parse(value))
  .handler(async ({ data }) => {
    const { userId, role } = await requireAdmin(data.accessToken, "catalog.publish");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: book, error: bookError } = await supabaseAdmin
      .from("books")
      .select("id,source_edition_id,source_scan_id,edition_title,source_language")
      .eq("id", data.bookId)
      .maybeSingle();
    if (bookError) throw new Error(bookError.message);
    if (!book) throw new Error("Book not found.");

    const bytes = new Uint8Array(Buffer.from(data.fileBase64, "base64"));
    if (bytes.length === 0 || bytes.length > MAX_IMAGE_BYTES || !validSignature(bytes, data.mimeType))
      throw new Error("Upload must be a valid PNG, JPEG or WebP image of at most 3 MB.");

    const extension = data.mimeType === "image/png" ? "png" :
      data.mimeType === "image/webp" ? "webp" : "jpg";
    const path = `editorial/${data.bookId}/${crypto.randomUUID()}.${extension}`;
    const sourceEditionId = book.source_edition_id || book.source_scan_id || "unrecorded";
    const { error } = await supabaseAdmin.storage.from("book-covers").upload(path, bytes, {
      contentType: data.mimeType,
      upsert: false,
      cacheControl: "86400",
      metadata: {
        source_edition_id: sourceEditionId,
        edition_title: book.edition_title || "",
        source_language: book.source_language,
        attribution: data.attribution,
        shared_artwork: String(data.sharedArtwork),
        uploaded_by: userId,
      },
    });
    if (error) throw new Error(error.message);

    const { data: publicAsset } = supabaseAdmin.storage.from("book-covers").getPublicUrl(path);
    await recordAudit({
      actorId: userId,
      actorRole: role,
      action: "catalog.stage_cover_artwork",
      entityType: "book",
      entityId: data.bookId,
      after: {
        path,
        sourceEditionId,
        attribution: data.attribution,
        sharedArtwork: data.sharedArtwork,
        sizeBytes: bytes.length,
      },
    });
    return { url: publicAsset.publicUrl, path, sourceEditionId };
  });
