/** Exact original UTF-16 prefix for a large source unit.
 * The database text remains untouched; the full value is fetched on demand.
 * Neither normalization nor diacritic or newline transformation is allowed.
 */
export const LARGE_SOURCE_LIMIT = 10_000;
const PREVIEW_TARGET = 6_000;

export function sourcePreviewEnd(content: string, target = PREVIEW_TARGET): number {
  if (content.length <= target) return content.length;
  const newline = content.lastIndexOf("\n", target);
  let end = newline >= Math.floor(target * 0.6) ? newline + 1 : target;
  const last = content.charCodeAt(end - 1);
  const next = content.charCodeAt(end);
  if (last >= 0xd800 && last <= 0xdbff &&
      next >= 0xdc00 && next <= 0xdfff) end -= 1;
  return end;
}

/** Only Dīgha import units have the known very-long-single-chunk
 * publication contract and the source-position display fallback. */
export function isProgressiveDighaSource(title: string, content: string, windowSize?: number): boolean {
  return windowSize === 32 &&
    /dīgha nikāya/iu.test(title) &&
    content.length > LARGE_SOURCE_LIMIT;
}
