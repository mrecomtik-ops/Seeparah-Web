import {describe,expect,it} from "vitest";
import {isLowResolutionGutenbergCover} from "./covers";
describe("QA-015 preserve native resolution of Gutenberg thumbnails",()=>{
  it("identifies archived 200 x 300 medium JPEGs, including public Supabase URLs",()=>{
    expect(isLowResolutionGutenbergCover("https://example.supabase.co/storage/v1/object/public/book-covers/gutenberg/555/cover-medium.jpg")).toBe(true);
    expect(isLowResolutionGutenbergCover("/gutenberg/555/pg555.cover.medium.jpg")).toBe(true);
  });
  it("does not cap premium named WebPs, staged covers or unverified variants",()=>{
    expect(isLowResolutionGutenbergCover("https://seeparah.com/book-covers/generated/SP-CAND-0007.webp")).toBe(false);
    expect(isLowResolutionGutenbergCover("/book-covers/generated/thumbs/SP-CAND-0007.webp")).toBe(false);
    expect(isLowResolutionGutenbergCover("/covers/premium-001.jpg")).toBe(false);
    expect(isLowResolutionGutenbergCover(null)).toBe(false);
  });
});