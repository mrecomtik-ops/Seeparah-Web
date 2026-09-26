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

const NAMED_ENTITIES: Record<string, string> = {
  nbsp: " ",
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  ndash: "–",
  mdash: "—",
  hellip: "…",
  laquo: "«",
  raquo: "»",
  lsquo: "‘",
  rsquo: "’",
  ldquo: "“",
  rdquo: "”",
  bull: "•",
};

function decodeHtmlEntities(text: string): string {
  return text.replace(
    /&(#x[0-9a-f]+|#\d+|[a-z][a-z0-9]+);/gi,
    (full, body: string) => {
      if (body[0] === "#") {
        const hex = body[1]?.toLowerCase() === "x";
        const raw = body.slice(hex ? 2 : 1);
        const codePoint = Number.parseInt(raw, hex ? 16 : 10);
        if (
          Number.isFinite(codePoint) &&
          codePoint >= 0 &&
          codePoint <= 0x10ffff &&
          !(codePoint >= 0xd800 && codePoint <= 0xdfff)
        ) {
          return String.fromCodePoint(codePoint);
        }
        return full;
      }
      return NAMED_ENTITIES[body.toLowerCase()] ?? full;
    },
  );
}

function stripTagsToText(xhtml: string): string {
  return decodeHtmlEntities(
    xhtml
      // Drop entire script/style elements including their content — never
      // execute or retain script text.
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      // Preserve explicit line breaks and common EPUB verse/line spans.
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(
        /<span\b[^>]*(?:class\s*=\s*["'][^"']*(?:verse|line|stanza|poetry)[^"']*["']|epub:type\s*=\s*["'][^"']*(?:verse|poem)[^"']*["'])[^>]*>/gi,
        "\n",
      )
      .replace(
        /<\/span>/gi,
        (match, offset, whole) => {
          const before = whole.slice(Math.max(0, offset - 220), offset);
          return /<span\b[^>]*(?:verse|line|stanza|poetry|epub:type)/i.test(before)
            ? "\n"
            : "";
        },
      )
      // Headings and structural blocks must remain separate paragraphs.
      .replace(/<\/(h1|h2|h3|h4|h5|h6|p|div|section|article|blockquote|pre)>/gi, "\n\n")
      .replace(/<\/li>/gi, "\n")
      .replace(/<[^>]+>/g, "")
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim(),
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
    // Bound the WORST CASE using the zip's own compressed-size metadata —
    // available from the central directory without inflating anything —
    // before ever calling .async() on this entry. Checking the ratio only
    // after inflation (as this used to) is too late: JSZip has already
    // materialized the full decompressed string in memory by then, so a
    // single spine entry with an extreme ratio (a classic zip-bomb
    // technique — a few KB compressing to hundreds of MB) could exhaust
    // the function's memory before any check runs at all.
    const compressedSize = (chapterFile as unknown as { _data?: { compressedSize?: number } })._data
      ?.compressedSize;
    if (compressedSize) {
      const worstCaseBytes = compressedSize * MAX_COMPRESSION_RATIO;
      const remainingBudget = MAX_UNCOMPRESSED_BYTES - totalUncompressed;
      if (worstCaseBytes > remainingBudget) {
        throw new EpubValidationError(
          `EPUB entry ${resolvedPath}'s declared size makes a decompression bomb possible — refusing before decompressing`,
        );
      }
    }
    const xhtml = await chapterFile.async("string");
    totalUncompressed += xhtml.length;
    if (totalUncompressed > MAX_UNCOMPRESSED_BYTES) {
      throw new EpubValidationError(
        `EPUB expands past ${Math.floor(MAX_UNCOMPRESSED_BYTES / 1024 / 1024)}MB of text — refusing (possible zip bomb)`,
      );
    }
    // Retained as defense-in-depth for the rare case compressedSize metadata
    // was unavailable above (so the pre-check above couldn't run).
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
