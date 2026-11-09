import { describe, expect, it } from "vitest";
import { curatedPilotMetadata, extractGutenbergBody, verifyGutenbergCandidate } from "./gutenberg-fast-import.server";

const sample={
  id:55,title:"The Wonderful Wizard of Oz",media_type:"Text",copyright:false,
  languages:["en"],authors:[{name:"Baum, L. Frank",death_year:1919}],
  editors:[],translators:[],
  formats:{"text/plain; charset=utf-8":"https://www.gutenberg.org/ebooks/55.txt.utf-8"},
  summaries:["The book recounts the adventures of an American girl who arrives in a strange land."],
};
describe("Gutenberg fast track must fail closed",()=>{
  it("permits an original English classic with old author and original publication",()=>{
    expect(verifyGutenbergCandidate(sample,55,1900)).toEqual({
      author:"Baum, L. Frank",deathYear:1919,
    });
  });
  it("falls back to individually curated classics when Gutendex is down, never unknown IDs",()=>{
    const pilot=curatedPilotMetadata(55,1900);
    expect(pilot.title).toBe("The Wonderful Wizard of Oz");
    expect(verifyGutenbergCandidate(pilot,55,1900).deathYear).toBe(1919);
    expect(()=>curatedPilotMetadata(55,1901)).toThrow(/no independent/);
    expect(()=>curatedPilotMetadata(999999,1850)).toThrow(/no independent/);
  });
  it("rejects copyright restrictions, translations and modern contributors",()=>{
    expect(()=>verifyGutenbergCandidate({...sample,copyright:true},55,1900)).toThrow();
    expect(()=>verifyGutenbergCandidate({...sample,translators:[{name:"New Translator"}]},55,1900)).toThrow();
    expect(()=>verifyGutenbergCandidate({...sample,authors:[{name:"Modern",death_year:1970}]},55,1900)).toThrow();
    expect(()=>verifyGutenbergCandidate({...sample,languages:["en","fr"]},55,1900)).toThrow();
    expect(()=>verifyGutenbergCandidate(sample,56,1900)).toThrow();
  });
  it("uses only exact Gutenberg body boundaries and preserves source punctuation",()=>{
    const original="CHAPTER ONE\n\nIt's a long tale—said Alice. \u0628\u0650\u0633\u0652\u0645\u0650\n\n";
    const body=original.repeat(1100);
    const input="Header\n*** START OF THE PROJECT GUTENBERG EBOOK TITLE ***\n"+body+
      "*** END OF THE PROJECT GUTENBERG EBOOK TITLE ***\nLicense text";
    const result=extractGutenbergBody(input);
    expect(result).toContain(original.trim());
    expect(result).not.toContain("License text");
    expect(result).not.toContain("START OF THE PROJECT");
  });
  it("rejects truncated or unmarked manuscripts rather than publishing them",()=>{
    expect(()=>extractGutenbergBody("No Gutenberg markers")).toThrow(/START boundary/);
    expect(()=>extractGutenbergBody("*** START OF THIS PROJECT GUTENBERG EBOOK X ***\nshort")).toThrow(/END boundary/);
    expect(()=>extractGutenbergBody("*** START OF THIS PROJECT GUTENBERG EBOOK X ***\nshort\n*** END OF THIS PROJECT GUTENBERG EBOOK X ***")).toThrow(/too short/);
  });
});
