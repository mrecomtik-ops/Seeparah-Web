import {describe,expect,it} from "vitest";
import {gutenbergSourceLanguage,normalizeGutenbergLanguageCodes,sameGutenbergLanguages,gutenbergIdentityKey} from "./gutenberg-language";
import {languageToBcp47} from "./languages";
describe("Gutenberg source-language identities",()=>{
  it("recognizes books in original languages",()=>{
    for(const [code,expected] of [["en","English"],["fr","French"],["fi","Finnish"],["ar","Arabic"],["zh","Chinese"],["grc","Ancient Greek"]])
      expect(gutenbergSourceLanguage([code])).toBe(expected);
  });
  it("retains bilingual and multilingual work identities",()=>{
    expect(gutenbergSourceLanguage(["en","fr"])).toBe("Bilingual");
    expect(gutenbergSourceLanguage(["en","fr","de"])).toBe("Multilingual");
    expect(sameGutenbergLanguages(["en","fr"],["fr","en"])).toBe(true);
    expect(sameGutenbergLanguages(["en"],["fr"])).toBe(false);
  });
  it("rejects missing or malformed codes",()=>{
    expect(normalizeGutenbergLanguageCodes([])).toEqual([]);
    expect(normalizeGutenbergLanguageCodes(["../en"])).toEqual([]);
    expect(normalizeGutenbergLanguageCodes(["FR","fr","en"])).toEqual(["en","fr"]);
    expect(()=>gutenbergSourceLanguage([])).toThrow();
  });
  it("preserves script tags and non-Latin title identity",()=>{
    expect(languageToBcp47("Finnish")).toBe("fi");
    expect(languageToBcp47("Ancient Greek")).toBe("grc");
    expect(languageToBcp47("Multilingual")).toBe("mul");
    expect(gutenbergIdentityKey("閱微草堂筆記")).not.toBe("");
    expect(gutenbergIdentityKey("西遊記")).not.toBe(gutenbergIdentityKey("紅樓夢"));
  });
});
