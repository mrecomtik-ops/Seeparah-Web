import {describe,it,expect} from "vitest";
import {
  CANONICAL_BOOK_FONT_SIZE,paperZoomForFontSize,paperSheetBounds,
} from "./reader-page-zoom";

describe("fixed pagination with proportional paper zoom",()=>{
  it("scales the whole leaf and never feeds a different font size to the pagination layout",()=>{
    expect(CANONICAL_BOOK_FONT_SIZE).toBe(16);
    expect(paperZoomForFontSize(16)).toBe(1);
    expect(paperZoomForFontSize(18)).toBe(1.125);
    expect(paperZoomForFontSize(20)).toBe(1.25);
    const original=paperSheetBounds(360,540,false,paperZoomForFontSize(16));
    const larger=paperSheetBounds(360,540,false,paperZoomForFontSize(20));
    expect(original.originalWidth).toBe(larger.originalWidth);
    expect(original.scaledWidth).toBe(360);
    expect(larger.scaledWidth).toBe(450);
    expect(larger.scaledHeight).toBe(675);
  });
  it("keeps a two-leaf spread and spine proportionate",()=>{
    expect(paperSheetBounds(400,600,true,1.25,10)).toEqual({
      originalWidth:810,scaledWidth:1013,scaledHeight:750,
    });
  });
  it("clamps unusual font preferences",()=>{
    expect(paperZoomForFontSize(Number.NaN)).toBe(1);
    expect(paperZoomForFontSize(500)).toBe(1.25);
  });
});
