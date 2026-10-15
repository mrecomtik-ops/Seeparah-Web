import { Fragment, type ReactNode } from "react";

type InlineTag = "b" | "i" | "em" | "a";
type Frame = { tag: InlineTag; opening: string; href?: string | undefined; children: ReactNode[] };

/**
 * The acquired SuttaCentral text stays byte-for-byte intact in book_chunks.
 * Render only recognized inline Bilara markup as React elements. No HTML injection.
 *
 * Unknown or malformed markup is rendered literally rather than silently removed.
 * Bilara's <j> is a source join marker, not a textual word or an HTML element.
 */
export function renderSacredInline(source: string): ReactNode {
  if (!source.includes("<")) return source;
  const tokens = /<\/?(?:b|i|em|a|j)\b[^>]*>/gi;
  const stack: Frame[] = [{ tag: "b", opening: "", children: [] }];
  let cursor = 0;
  let match: RegExpExecArray | null;
  let key = 0;

  const current = () => stack[stack.length - 1]!;
  const add = (node: ReactNode) => current().children.push(node);
  const open = (tag: InlineTag, raw: string, href?: string) =>
    stack.push({ tag, opening: raw, href, children: [] });
  const close = (tag: InlineTag, raw: string) => {
    if (stack.length === 1 || current().tag !== tag) {
      add(raw);
      return;
    }
    const frame = stack.pop()!;
    const childKey = key++;
    if (tag === "b") add(<strong key={childKey}>{frame.children}</strong>);
    else if (tag === "em") add(<em key={childKey}>{frame.children}</em>);
    else if (tag === "i") add(<i key={childKey} lang="pi">{frame.children}</i>);
    else add(
      <a key={childKey} href={frame.href} target="_blank" rel="noreferrer noopener"
        className="text-primary underline decoration-primary/50 underline-offset-2">
        {frame.children}
      </a>,
    );
  };

  while ((match = tokens.exec(source)) !== null) {
    add(source.slice(cursor, match.index));
    const raw = match[0];
    cursor = match.index + raw.length;
    const name = /^<\/?([a-z]+)/i.exec(raw)?.[1]?.toLowerCase();
    if (!name) { add(raw); continue; }
    if (name === "j") {
      // Bilara non-textual join marker. Preserve in source storage, not UI prose.
      if (raw.toLowerCase() !== "<j>") add(raw);
      continue;
    }
    const tag = name as InlineTag;
    if (/^<\//.test(raw)) {
      if (raw !== `</${tag}>`) add(raw);
      else close(tag, raw);
      continue;
    }
    if (tag === "a") {
      const hrefMatch = /^<a\s+href=(['"])(.*?)\1\s*>$/i.exec(raw);
      if (!hrefMatch) { add(raw); continue; }
      const href = hrefMatch[2]!;
      let url: URL;
      try {
        url = new URL(href, "https://suttacentral.net");
      } catch { add(raw); continue; }
      // Reject arbitrary URLs and non-HTTPS schemes, including javascript:.
      if (url.protocol !== "https:" || !["suttacentral.net", "www.suttacentral.net"].includes(url.hostname)) {
        add(raw);
        continue;
      }
      open(tag, raw, url.toString());
    } else if (raw === `<${tag}>`) {
      open(tag, raw);
    } else {
      add(raw);
    }
  }
  add(source.slice(cursor));

  // An unbalanced opening tag must be visible verbatim; do not discard content.
  while (stack.length > 1) {
    const frame = stack.pop()!;
    add(frame.opening);
    for (const child of frame.children) add(child);
  }
  return <Fragment>{stack[0]!.children}</Fragment>;
}
