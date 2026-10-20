import { describe, expect, it } from "vitest";
import { bilingualAnalectsKind } from "./SacredSourceStructure";

describe("Analects source passages", () => {
  it("identifies standalone English book/chapter headings", () => {
    expect(bilingualAnalectsKind("BOOK I. HSIO R.")).toBe("english-heading");
    expect(bilingualAnalectsKind("Chapter I.")).toBe("english-heading");
  });

  it("does not style a complete English passage as a heading", () => {
    expect(
      bilingualAnalectsKind('Chapter I. 1. The Master said, "Is it not pleasant to learn?"'),
    ).toBe("english");
  });
});
