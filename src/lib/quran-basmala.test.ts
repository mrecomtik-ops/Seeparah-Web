import { describe,expect,it } from "vitest";
import { displayAyahTextForCopy, separateUnnumberedQuranBasmala } from "./quran-basmala";

const BASMALA = "بِسْمِ ٱللَّهِ ٱلرَّحْمَـٰنِ ٱلرَّحِيمِ";
const ALIF_LAM_MIM = "الٓمٓ";
const input=(canonicalRef:string,content:string,language="Arabic",layout="quran") =>
  ({canonicalRef,content,language,layout});

describe("QA-021 Quran authentic Basmala presentation only", () => {
  it("separates the precise unnumbered Basmala from ayah 2:1 for render and Copy text",()=>{
    const raw = BASMALA+"\n"+ALIF_LAM_MIM;
    const result=separateUnnumberedQuranBasmala(input("Quran 2:1",raw));
    expect(result).toEqual({basmala:BASMALA,ayah:ALIF_LAM_MIM});
    expect(result.basmala+"\n"+result.ayah).toBe(raw);
    expect(displayAyahTextForCopy(input("Quran 2:1",raw))).toBe(ALIF_LAM_MIM);
  });
  it("preserves Al-Fatiha 1:1 and Surah 9 unmodified and without a false heading",()=>{
    expect(separateUnnumberedQuranBasmala(input("Quran 1:1",BASMALA)))
      .toEqual({basmala:null,ayah:BASMALA});
    const tawbah="بَرَآءَةٌ مِّنَ ٱللَّهِ";
    expect(separateUnnumberedQuranBasmala(input("Quran 9:1",tawbah)))
      .toEqual({basmala:null,ayah:tawbah});
  });
  it("never changes translated ayahs, non-first ayahs or other scripture",()=>{
    const source=BASMALA+"\n"+ALIF_LAM_MIM;
    for(const args of [input("Quran 2:1","Alif Lam Mim","English"),
      input("Quran 2:2",source),
      input("Matthew 2:1",source,"Arabic","bible"),
      input("Quran 3:1",ALIF_LAM_MIM),
      input("Quran 999:1",source)]) {
      expect(separateUnnumberedQuranBasmala(args).basmala).toBeNull();
      expect(displayAyahTextForCopy(args)).toBe(args.content);
    }
  });
});
