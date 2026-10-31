import { describe, expect, it } from "vitest";
import { calculatePortraitCrop } from "./cover-crop";

describe("optional editor 2:3 portrait crop", () => {
  it("preserves a 2:3 source entirely", () => {
    expect(calculatePortraitCrop(1200, 1800, 50, 50)).toEqual({
      x: 0, y: 0, width: 1200, height: 1800,
    });
  });
  it("crops only horizontal edges from landscape art", () => {
    const crop = calculatePortraitCrop(1800, 1200, 50, 50);
    expect(crop).toEqual({ x: 500, y: 0, width: 800, height: 1200 });
  });
  it("clamps source selection for tall art", () => {
    const crop = calculatePortraitCrop(800, 2400, 125, -20);
    expect(crop).toEqual({ x: 0, y: 0, width: 800, height: 1200 });
  });
});
