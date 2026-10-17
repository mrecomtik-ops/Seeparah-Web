import { describe, expect, it } from "vitest";
import holdings from "./sacred-unpublished-holdings.json";
import { sacredTraditionId, matchSacredHolding, sourceTraditionCounts } from "./sacred-holdings-discovery";

describe("source holdings discovery", () => {
  it("preserves all 32 unpublished records by classification", () => {
    expect(holdings).toHaveLength(32);
    for (const [status, total] of Object.entries({
      scan_only: 8, source_link_only: 2, unpublished_rights: 20, unpublished_structure: 2
    })) expect(holdings.filter(item => item.status === status)).toHaveLength(total);
  });
  it("preserves all recorded traditions without suggesting published readers", () => {
    const counts = sourceTraditionCounts(holdings);
    expect(counts["Hinduism"]).toBe(6);
    expect(counts["Buddhism"]).toBe(9);
    expect(counts["Jainism"]).toBe(1);
  });
  it("supports case-insensitive original-title and translator searches", () => {
    const target = holdings.find(item => item.translator === "Swami Swarupananda")!;
    expect(matchSacredHolding(target, "swarupananda")).toBe(true);
    expect(matchSacredHolding(target, "SANSKRIT")).toBe(true);
    expect(matchSacredHolding(target, "TIPITAKA")).toBe(false);
  });
  it("builds stable tradition anchors", () => {
    expect(sacredTraditionId("Hinduism")).toBe("source-tradition-hinduism");
    expect(sacredTraditionId("Bahá’í")).toBe("source-tradition-baha-i");
  });
});
