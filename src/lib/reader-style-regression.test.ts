import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/** Browser Rendering found 32x32 Back-to-library at 320px despite an
 * earlier @media 44px rule: a later override silently won the cascade.
 * Verify base and last mobile cascade declarations stay >=44px.
 */
const css = readFileSync(new URL("../styles.css", import.meta.url), "utf8");

function sizeFrom(block: string, property: "height" | "width" | "min-width") {
  const match = block.match(new RegExp("(?:^|\\n)\\s*" + property + ":\\s*(\\d+)px\\s*;"));
  return match ? Number(match[1]) : 0;
}

describe("SP-23 literature reader hit area CSS", () => {
  it("sets all default toolbar icons to at least 44px", () => {
    const block = css.match(/\.reader-v3-icon,\s*\.reader-v3-icon-label\s*\{([^}]+)\}/)?.[1] ?? "";
    expect(sizeFrom(block, "height")).toBeGreaterThanOrEqual(44);
    expect(sizeFrom(block, "min-width")).toBeGreaterThanOrEqual(44);
  });
  it("does not re-shrink Back to library in the last 639px override", () => {
    const block = css.match(/@media \(max-width: 639px\)\s*\{\s*\.reader-v3-icon-label\s*\{([^}]+)\}/)?.[1] ?? "";
    expect(sizeFrom(block, "height")).toBeGreaterThanOrEqual(44);
    expect(sizeFrom(block, "width")).toBeGreaterThanOrEqual(44);
  });
  it("keeps the reading-language selector at a 44px minimum", () => {
    const block = css.match(/\.reader-v3-language\s*\{([^}]+)\}/)?.[1] ?? "";
    expect(sizeFrom(block, "height")).toBeGreaterThanOrEqual(44);
  });
  it("preserves Greek and Chinese script-aware serif fallbacks", () => {
    expect(css).toMatch(/:lang\(el\)\s*\{\s*font-family:\s*"Noto Serif"/);
    expect(css).toMatch(/:lang\(zh-Hant\)\s*\{\s*font-family:/);
    expect(css).toMatch(/:lang\(zh\)\s*\{\s*font-family:/);
  });
});
