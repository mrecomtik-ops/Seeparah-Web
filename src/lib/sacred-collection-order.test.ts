import { describe, expect, it } from "vitest";
import { NT_ORDER, TORAH, PROPHETS_ORDER, WRITINGS_ORDER } from "@/lib/sacred-collection-order";

describe("source-edition collection ordering", () => {
  it("lists the 27 canonical New Testament units only once", () => {
    expect(NT_ORDER).toHaveLength(27);
    expect(new Set(NT_ORDER).size).toBe(27);
    expect(NT_ORDER[0]).toBe("Matthew");
    expect(NT_ORDER.at(-1)).toBe("Revelation");
  });
  it("lists the Tanakh's 39 imported export units by Torah, Prophets and Writings", () => {
    const ordered = [...TORAH, ...PROPHETS_ORDER, ...WRITINGS_ORDER];
    expect(ordered).toHaveLength(39);
    expect(new Set(ordered).size).toBe(39);
    expect(ordered[0]).toBe("Genesis");
    // Preserve the imported JPS source title conventions without silently renaming.
    expect(ordered).toContain("I Samuel");
    expect(ordered.at(-1)).toBe("II Chronicles");
  });
});
