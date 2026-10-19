import { Fragment, createElement, type CSSProperties, type ReactNode } from "react";
import { renderSacredInline } from "@/lib/sacred-inline-markup";
import { sacredSourceFingerprint } from "@/lib/sacred-reader-prefs";

export interface DhammapadaLineMetadata {
  length: number;
  ends: number[];
  fnv: number;
  db_verified: boolean;
  source: string;
}
export interface DhammapadaLayoutData {
  revision: string;
  lines: Record<string, Record<string, DhammapadaLineMetadata>>;
}
export interface DiscourseLayoutData {
  revision: string;
  markers: Record<string, string[]>;
}
export type BilaraSegment = [key: string, start: number, end: number];

/** Return source-backed stanza lines only for records independently proved
 * exactly equal to the pinned Bilara source text in Supabase.
 */
export function verifiedDhammapadaLines(
  content: string,
  language: string,
  verseNumber: number,
  data: DhammapadaLayoutData | null,
): string[] | null {
  if (!data || data.revision !== "06ab1b50b259a19a380adc7b8ec4f1fbba4f6f21") return null;
  const rec = data.lines[language]?.[String(verseNumber)];
  if (
    !rec?.db_verified ||
    rec.length !== content.length ||
    rec.fnv !== sacredSourceFingerprint(content)
  )
    return null;
  if (!rec.ends.length || rec.ends[rec.ends.length - 1] !== content.length) return null;
  const lines: string[] = [];
  let start = 0;
  for (let i = 0; i < rec.ends.length; i++) {
    const end = rec.ends[i]!;
    if (end <= start || end > content.length) return null;
    const line = content.slice(start, end);
    if (!line) return null;
    lines.push(line);
    start = end + 1; // a single source-derived joined space, validated below
  }
  if (lines.join(" ") !== content) return null;
  return lines;
}
export function DhammapadaStanza({
  content,
  language,
  verseNumber,
  data,
  style,
}: {
  content: string;
  language: string;
  verseNumber: number;
  data: DhammapadaLayoutData | null;
  style: CSSProperties;
}) {
  const lines = verifiedDhammapadaLines(content, language, verseNumber, data);
  if (!lines)
    return (
      <p className="whitespace-pre-wrap break-words" style={style}>
        {renderSacredInline(content)}
      </p>
    );
  return (
    <blockquote
      className="sacred-stanza my-3 space-y-0.5 border-0 p-0"
      aria-label={"Dhammapada stanza " + verseNumber}
    >
      {lines.map((line, i) => (
        <span className="block break-words" key={i} style={style}>
          {renderSacredInline(line)}
        </span>
      ))}
    </blockquote>
  );
}
/** Existing SuttaCentral segment keys/offsets are already pinned in each
 * discourse's structure node. The second, independently sourced HTML
 * metadata establishes which segments open/close real paragraphs/headings.
 * No reconstructed or editorial string ever replaces book_chunks.content.
 */
export function prepareDiscourseBlocks(
  content: string,
  ranges: BilaraSegment[] | undefined,
  data: DiscourseLayoutData | null,
) {
  if (!data || data.revision !== "06ab1b50b259a19a380adc7b8ec4f1fbba4f6f21" || !ranges?.length)
    return null;
  const chars = Array.from(content);
  let prev = 0;
  const blocks: Array<{
    type: "p" | "h2" | "h3" | "blockquote" | "li";
    text: Array<{ key: string; text: string }>;
  }> = [];
  let parts: Array<{ key: string; text: string }> = [];
  let current: "p" | "h2" | "h3" | "blockquote" | "li" = "p";
  const flush = () => {
    if (parts.length) {
      blocks.push({ type: current, text: parts });
      parts = [];
    }
  };
  for (const [key, start, end] of ranges) {
    if (
      !/^dn\d+:[\d.]+$/.test(key) ||
      !Number.isInteger(start) ||
      !Number.isInteger(end) ||
      start < prev ||
      end < start ||
      end > chars.length
    )
      return null;
    const gap = chars.slice(prev, start).join("");
    if (gap.trim().length) return null;
    const value = chars.slice(start, end).join("");
    const marks = data.markers[key] ?? [];
    if (marks.some((x) => x.startsWith("heading-"))) {
      flush();
      current = marks.includes("heading-1") ? "h2" : "h3";
      parts = [{ key, text: value }];
      flush();
      current = "p";
    } else {
      if (
        marks.includes("p-open") ||
        marks.includes("quote-open") ||
        marks.includes("list-open") ||
        marks.includes("item-open")
      ) {
        flush();
        current = marks.includes("item-open")
          ? "li"
          : marks.includes("quote-open")
            ? "blockquote"
            : "p";
      }
      if (gap && !gap.includes("\n") && parts.length) {
        parts.push({ key: key + "-source-space", text: gap });
      }
      parts.push({ key, text: value });
      if (
        marks.includes("p-close") ||
        marks.includes("quote-close") ||
        marks.includes("list-close") ||
        marks.includes("item-close")
      ) {
        flush();
        current = "p";
      }
    }
    prev = end;
  }
  if (chars.slice(prev).join("").trim().length) return null;
  flush();
  if (!blocks.length) return null;
  return blocks;
}
/** Fail closed if recognized inline tags span multiple source HTML blocks.
 * A full chunk must be parsed as one unit if source styling spans boundaries.
 */
export function inlineMarkupBalancedByBlock(
  blocks: NonNullable<ReturnType<typeof prepareDiscourseBlocks>>,
) {
  for (const block of blocks) {
    const stack: string[] = [];
    const text = block.text.map((item) => item.text).join("");
    const tags = /<(\/?)(b|i|em|a|j)\b[^>]*>/gi;
    let m: RegExpExecArray | null;
    while ((m = tags.exec(text)) !== null) {
      const tag = m[2]!.toLowerCase();
      if (tag === "j") continue;
      if (m[1] === "/") {
        if (stack.pop() !== tag) return false;
      } else stack.push(tag);
    }
    if (stack.length) return false;
  }
  return true;
}
export function BilaraDiscourse({
  content,
  ranges,
  data,
  style,
  language,
}: {
  content: string;
  ranges: BilaraSegment[] | undefined;
  data: DiscourseLayoutData | null;
  style: CSSProperties;
  language: string;
}) {
  const blocks = prepareDiscourseBlocks(content, ranges, data);
  if (!blocks || !inlineMarkupBalancedByBlock(blocks))
    return (
      <p className="whitespace-pre-wrap break-words" style={style}>
        {renderSacredInline(content)}
      </p>
    );
  return (
    <div className="sacred-bilara-discourse space-y-3">
      {blocks.map((block, i) => {
        if (block.type === "li" && i > 0 && blocks[i - 1]?.type === "li") return null;
        if (block.type === "li") {
          const items = blocks.slice(i);
          const count = items.findIndex((item) => item.type !== "li");
          return (
            <ul key={i} className="my-3 list-disc space-y-1 ps-6">
              {items.slice(0, count === -1 ? undefined : count).map((entry, j) => (
                <li key={i + j} style={style}>
                  {entry.text.map((seg) => (
                    <span
                      key={seg.key}
                      id={
                        "bilara-" +
                        language.toLowerCase() +
                        "-" +
                        seg.key.replace(/[^a-z0-9.:-]/g, "")
                      }
                    />
                  ))}
                  {renderSacredInline(entry.text.map((seg) => seg.text).join(""))}
                </li>
              ))}
            </ul>
          );
        }
        return createElement(
          block.type,
          {
            key: i,
            className:
              block.type === "p"
                ? "my-3 break-words"
                : block.type === "blockquote"
                  ? "my-5 border-s-2 border-border ps-4"
                  : "my-5 font-semibold",
            style: style,
          },
          ...block.text.map((seg) => (
            <span
              key={seg.key}
              id={"bilara-" + language.toLowerCase() + "-" + seg.key.replace(/[^a-z0-9.:-]/g, "")}
            />
          )),
          renderSacredInline(block.text.map((seg) => seg.text).join("")),
        );
      })}
    </div>
  );
}
export function DaoWithWangBi({ content, style }: { content: string; style: CSSProperties }) {
  const notes = /(〈[^〉]*〉)/g;
  const pieces = content.split(notes);
  if (pieces.length === 1)
    return (
      <p className="whitespace-pre-line" style={style}>
        {renderSacredInline(content)}
      </p>
    );
  // Include punctuation and original brackets inside their unchanged source span.
  return (
    <div style={style} className="space-y-2">
      {pieces.map((part, i) =>
        !part ? null : part.startsWith("〈") && part.endsWith("〉") ? (
          <aside
            key={i}
            className="my-2 border-s-2 border-border/80 ps-4 text-[0.91em] opacity-85"
            aria-label="Wang Bi commentary"
          >
            {renderSacredInline(part)}
          </aside>
        ) : (
          <p key={i} className="whitespace-pre-line">
            {renderSacredInline(part)}
          </p>
        ),
      )}
    </div>
  );
}
export function bilingualAnalectsKind(
  text: string,
): "chinese-heading" | "english-heading" | "chinese" | "english" {
  if (/^BOOK\s+[IVX]|^Chapter\s+[IVX]/i.test(text)) return "english-heading";
  if (/^[\u3400-\u9fff]{2,8}第[一二三四五六七八九十]/u.test(text) && !text.includes("【"))
    return "chinese-heading";
  if (/^【第/u.test(text) || /[\u3400-\u9fff]/u.test(text.slice(0, 30))) return "chinese";
  return "english";
}
