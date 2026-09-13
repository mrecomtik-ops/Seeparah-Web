// Server-only. Minimal, defensive EPUB (OCF/OPF) reader: enough to pull
// ordered chapter text out of a well-formed EPUB safely. This is
// deliberately not a general-purpose EPUB library — it never executes
// anything in the archive, never writes extracted files to disk (JSZip
// works entirely in memory), and refuses anything that looks like a zip
// bomb or a path-traversal attempt before it reads content.
import JSZip from "jszip";

const MAX_UNCOMPRESSED_BYTES = 60 * 1024 * 1024; // 60MB of extracted text is already an enormous book
const MAX_ENTRIES = 5000;
const MAX_COMPRESSION_RATIO = 200; // a genuine text-heavy epub rarely exceeds ~20x; 200x is a bomb signature

export interface ParsedEpub {
  chapters: { title: string | null; text: string }[];
  warnings: string[];
}

export class EpubValidationError extends Error {}

function stripTagsToText(xhtml: string): string {
  return (
    xhtml
      // Drop entire script/style elements including their content — never
      // execute or even retain script text, whether or not anything renders it.
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/p>/gi, "\n\n")
      .replace(/<\/(h1|h2|h3|h4|h5|h6|div|li)>/gi, "\n")
      .replace(/<[^>]+>/g, "")
      .replace(/&nbsp;/gi, " ")
      .replace(/&amp;/gi, "&")
      .replace(/&lt;/gi, "<")
      .replace(/&gt;/gi, ">")
      .replace(/&quot;/gi, '"')
      .replace(/&#39;/gi, "'")
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim()
  );
}

function resolveRelativePath(basePath: string, relative: string): string {
  const baseDir = basePath.includes("/") ? basePath.slice(0, basePath.lastIndexOf("/") + 1) : "";
  const combined = (baseDir + relative).split("/");
  const resolved: string[] = [];
  for (const segment of combined) {
    if (segment === "" || segment === ".") continue;
    if (segment === "..") {
      if (resolved.length === 0) {
        throw new EpubValidationError("EPUB references a path outside the archive");
      }
      resolved.pop();
      continue;
    }
    resolved.push(segment);
  }
  return resolved.join("/");
}

export async function parseEpub(fileBytes: Uint8Array): Promise<ParsedEpub> {
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(fileBytes);
  } catch {
    throw new EpubValidationError("This file isn't a valid EPUB/zip archive");
  }

  const entries = Object.values(zip.files).filter((f) => !f.dir);
  if (entries.length > MAX_ENTRIES) {
    throw new EpubValidationError(
      `EPUB has too many entries (${entries.length}, max ${MAX_ENTRIES})`,
    );
  }
  for (const entry of entries) {
    if (entry.name.includes("..") || entry.name.startsWith("/")) {
      throw new EpubValidationError(`EPUB contains an unsafe path: ${entry.name}`);
    }
  }

  // JSZip exposes the on-disk compressed size via _data; the true
  // uncompressed size is only known after inflate, so total size is bounded
  // incrementally below (per file, as each is read) rather than up front.
  let totalUncompressed = 0;

  const containerFile = zip.file("META-INF/container.xml");
  if (!containerFile)
    throw new EpubValidationError("Not a valid EPUB: missing META-INF/container.xml");
  const containerXml = await containerFile.async("string");
  const opfMatch = containerXml.match(/full-path="([^"]+)"/);
  const opfPath = opfMatch?.[1];
  if (!opfPath)
    throw new EpubValidationError("Not a valid EPUB: container.xml has no OPF reference");

  const opfFile = zip.file(opfPath);
  if (!opfFile) throw new EpubValidationError(`Not a valid EPUB: OPF file ${opfPath} is missing`);
  const opfXml = await opfFile.async("string");
  totalUncompressed += opfXml.length;

  const manifest = new Map<string, string>(); // id -> href
  const manifestRegex = /<item\b[^>]*\bid="([^"]+)"[^>]*\bhref="([^"]+)"[^>]*\/?>/gi;
  let m: RegExpExecArray | null;
  while ((m = manifestRegex.exec(opfXml))) {
    const id = m[1];
    const href = m[2];
    if (id && href) manifest.set(id, href);
  }
  // href/id attribute order can be swapped; retry any unmatched <item> tags
  // with attributes in the other order.
  const manifestRegexAlt = /<item\b[^>]*\bhref="([^"]+)"[^>]*\bid="([^"]+)"[^>]*\/?>/gi;
  while ((m = manifestRegexAlt.exec(opfXml))) {
    const href = m[1];
    const id = m[2];
    if (id && href && !manifest.has(id)) manifest.set(id, href);
  }

  const spineIds: string[] = [];
  const spineRegex = /<itemref\b[^>]*\bidref="([^"]+)"[^>]*\/?>/gi;
  while ((m = spineRegex.exec(opfXml))) {
    const idref = m[1];
    if (idref) spineIds.push(idref);
  }

  if (spineIds.length === 0)
    throw new EpubValidationError("EPUB has no reading order (empty spine)");

  const warnings: string[] = [];
  const chapters: { title: string | null; text: string }[] = [];

  for (const id of spineIds) {
    const href = manifest.get(id);
    if (!href) {
      warnings.push(`Spine item "${id}" has no matching manifest entry — skipped`);
      continue;
    }
    const resolvedPath = resolveRelativePath(opfPath, href);
    const chapterFile = zip.file(resolvedPath);
    if (!chapterFile) {
      warnings.push(`Spine item "${id}" points to a missing file (${resolvedPath}) — skipped`);
      continue;
    }
    const xhtml = await chapterFile.async("string");
    totalUncompressed += xhtml.length;
    if (totalUncompressed > MAX_UNCOMPRESSED_BYTES) {
      throw new EpubValidationError(
        `EPUB expands past ${Math.floor(MAX_UNCOMPRESSED_BYTES / 1024 / 1024)}MB of text — refusing (possible zip bomb)`,
      );
    }
    const compressedSize = (chapterFile as unknown as { _data?: { compressedSize?: number } })._data
      ?.compressedSize;
    if (compressedSize && xhtml.length / Math.max(compressedSize, 1) > MAX_COMPRESSION_RATIO) {
      throw new EpubValidationError(
        `EPUB entry ${resolvedPath} has a suspicious compression ratio — refusing`,
      );
    }

    const titleMatch =
      xhtml.match(/<h[1-3][^>]*>([\s\S]*?)<\/h[1-3]>/i) ??
      xhtml.match(/<title>([\s\S]*?)<\/title>/i);
    const titleCapture = titleMatch?.[1];
    const title = titleCapture ? stripTagsToText(titleCapture).slice(0, 200) || null : null;
    const text = stripTagsToText(xhtml);
    if (!text) {
      warnings.push(`Chapter "${title ?? id}" is empty after extraction — flagged for review`);
    }
    chapters.push({ title, text });
  }

  if (chapters.every((c) => !c.text)) {
    throw new EpubValidationError(
      "No readable text could be extracted from this EPUB — it may be image-only/scanned content, which needs OCR (not supported yet)",
    );
  }

  return { chapters, warnings };
}
