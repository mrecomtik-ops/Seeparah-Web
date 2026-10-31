import { describe, expect, it } from "vitest";
import { languageToBcp47 } from "@/lib/languages";

describe("reader BCP 47 language tags", () => {
  it("maps actual script languages to their correct tags", () => {
    expect(languageToBcp47("Arabic")).toBe("ar");
    expect(languageToBcp47("Urdu")).toBe("ur");
    expect(languageToBcp47("Hebrew")).toBe("he");
    expect(languageToBcp47("Chinese")).toBe("zh-CN");
    expect(languageToBcp47("Sanskrit")).toBe("sa");
    expect(languageToBcp47("Greek")).toBe("el");
  });
  it("does not confuse a bilingual format with Bislama", () => {
    expect(languageToBcp47("Bilingual")).toBe("mul");
    expect(languageToBcp47("Unknown source")).toBe("und");
  });
});
