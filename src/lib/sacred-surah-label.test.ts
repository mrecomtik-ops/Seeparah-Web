import { describe, expect, it } from "vitest";
import { QURAN_SURAH_ARABIC_NAMES, sourcedSurahLabel } from "./sacred-surah-label";

describe("QA-034 Tanzil-source surah display metadata", () => {
  it("preserves all 114 chapters in canonical order, including Surah 9", () => {
    expect(QURAN_SURAH_ARABIC_NAMES).toHaveLength(114);
    expect(sourcedSurahLabel("Surah 1")).toBe("Surah 1 · الفاتحة");
    expect(sourcedSurahLabel("Surah 2")).toBe("Surah 2 · البقرة");
    expect(sourcedSurahLabel("Surah 9")).toBe("Surah 9 · التوبة");
    expect(sourcedSurahLabel("Surah 114")).toBe("Surah 114 · الناس");
  });
  it("does not invent chapter names for other traditions or invalid numbers", () => {
    expect(sourcedSurahLabel("Matthew 2")).toBe("Matthew 2");
    expect(sourcedSurahLabel("Surah 0")).toBe("Surah 0");
    expect(sourcedSurahLabel("Surah 115")).toBe("Surah 115");
    expect(sourcedSurahLabel("Surah 2 · البقرة")).toBe("Surah 2 · البقرة");
  });
});
