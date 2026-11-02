import { parseReadableBlocks } from "@/lib/reader-structure";

/** Presentation-only controls. Keep the privileged admin route focused on
 * authorization, lifecycle and data edits rather than generic rendering.
 */
export function formatPublicationYear(year: number): string {
  return year < 0 ? `${Math.abs(year)} BCE` : String(year);
}

export function AdminReadablePreview({ content }: { content: string }) {
  const blocks = parseReadableBlocks(content);
  if (blocks.length === 0) {
    return <p className="text-muted-foreground">No text on this page.</p>;
  }
  return (
    <div>
      {blocks.map((block, index) => {
        const spacing = index === 0 ? undefined : { marginTop: "1.25rem" };
        if (block.kind === "heading") {
          const cls =
            block.level === 1
              ? "font-display text-3xl font-semibold leading-tight"
              : block.level === 2
                ? "font-display text-2xl font-semibold leading-snug"
                : "font-display text-xl font-semibold leading-snug";
          const Tag = block.level === 1 ? "h2" : block.level === 2 ? "h3" : "h4";
          return (
            <Tag key={index} style={spacing} className={cls}>
              {block.text}
            </Tag>
          );
        }
        if (block.kind === "principle") {
          return (
            <aside
              key={index}
              style={spacing}
              className="rounded-xl border border-primary/20 bg-primary/5 px-5 py-4 font-semibold leading-relaxed"
            >
              {block.text}
            </aside>
          );
        }
        if (block.kind === "quote") {
          return (
            <blockquote
              key={index}
              style={spacing}
              className="whitespace-pre-line border-l-4 border-primary/40 pl-5 italic text-muted-foreground"
            >
              {block.text}
            </blockquote>
          );
        }
        if (block.kind === "list") {
          return (
            <ul key={index} style={spacing} className="list-disc space-y-2 pl-6">
              {(block.items ?? []).map((item, itemIndex) => (
                <li key={itemIndex}>{item}</li>
              ))}
            </ul>
          );
        }
        return (
          <p key={index} style={spacing} className="whitespace-pre-line">
            {block.text}
          </p>
        );
      })}
    </div>
  );
}

export function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid min-w-0 grid-cols-[minmax(7rem,auto)_minmax(0,1fr)] gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 break-words text-right font-medium text-foreground [overflow-wrap:anywhere]">
        {value}
      </dd>
    </div>
  );
}
