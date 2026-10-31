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
    language: z.string().trim().min(1).max(80),
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
    const { data: edition, error: editionError } = await supabaseAdmin
      .from("book_editions")
      .select("language,source_edition_id,edition_title")
      .eq("book_id", data.bookId)
      .eq("language", data.language)
      .maybeSingle();
    if (editionError) throw new Error(editionError.message);
    if (!edition) throw new Error("No verified source-edition record exists in that language.");

    const bytes = new Uint8Array(Buffer.from(data.fileBase64, "base64"));
    if (bytes.length === 0 || bytes.length > MAX_IMAGE_BYTES || !validSignature(bytes, data.mimeType))
      throw new Error("Upload must be a valid PNG, JPEG or WebP image of at most 3 MB.");

    const extension = data.mimeType === "image/png" ? "png" :
      data.mimeType === "image/webp" ? "webp" : "jpg";
    const path = `editorial/${data.bookId}/${encodeURIComponent(data.language)}/${crypto.randomUUID()}.${extension}`;
    const sourceEditionId = edition.source_edition_id || "unrecorded";
    const { error } = await supabaseAdmin.storage.from("book-covers").upload(path, bytes, {
      contentType: data.mimeType,
      upsert: false,
      cacheControl: "86400",
      metadata: {
        source_edition_id: sourceEditionId,
        edition_title: edition.edition_title || "",
        edition_language: edition.language,
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
        language: data.language,
        attribution: data.attribution,
        sharedArtwork: data.sharedArtwork,
        sizeBytes: bytes.length,
      },
    });
    return { url: publicAsset.publicUrl, path, sourceEditionId, language: data.language };
  });


/** Assign previously staged artwork to one existing verified edition.
 * This deliberately never overwrites books.cover_url or another language.
 */
export const adminAssignBookEditionCover = createServerFn({ method: "POST" })
  .validator((value) => z.object({
    accessToken: z.string().min(1),
    bookId: z.string().uuid(),
    language: z.string().trim().min(1).max(80),
    path: z.string().min(30).max(700),
    attribution: z.string().trim().min(3).max(500),
    sharedArtwork: z.boolean(),
  }).parse(value))
  .handler(async ({ data }) => {
    const { userId, role } = await requireAdmin(data.accessToken, "catalog.publish");
    // A staged asset for the same book and language must be used; no
    // external image URL and no cross-edition cover assignment allowed.
    const prefix = `editorial/${data.bookId}/${encodeURIComponent(data.language)}/`;
    if (!data.path.startsWith(prefix) ||
      !/^[0-9a-f-]{36}\.(?:png|webp|jpg)$/i.test(data.path.slice(prefix.length))) {
      throw new Error("Choose a staged cover uploaded for the exact source edition.");
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: edition, error: editionError } = await supabaseAdmin
      .from("book_editions")
      .select("cover_url,cover_attribution,cover_shared_artwork,source_edition_id")
      .eq("book_id", data.bookId)
      .eq("language", data.language)
      .maybeSingle();
    if (editionError) throw new Error(editionError.message);
    if (!edition) throw new Error("That language does not have a verified edition.");

    const { data: objectInfo, error: objectError } = await supabaseAdmin.storage
      .from("book-covers").info(data.path);
    if (objectError || !objectInfo) throw new Error("Staged cover could not be verified in storage.");
    const { data: publicAsset } = supabaseAdmin.storage.from("book-covers").getPublicUrl(data.path);
    const update = {
      cover_url: publicAsset.publicUrl,
      cover_attribution: data.attribution,
      cover_shared_artwork: data.sharedArtwork,
    };
    const { error } = await supabaseAdmin.from("book_editions").update(update)
      .eq("book_id", data.bookId).eq("language", data.language);
    if (error) throw new Error(error.message);
    await recordAudit({
      actorId: userId,
      actorRole: role,
      action: "catalog.assign_edition_cover",
      entityType: "book",
      entityId: data.bookId,
      before: { ...edition, language: data.language },
      after: { ...update, language: data.language, sourceEditionId: edition.source_edition_id },
    });
    return { url: publicAsset.publicUrl, language: data.language };
  });
