import { describe, expect, it } from "vitest";
import { countSourceChapterHeadings, curatedPilotMetadata, extractGutenbergBody, likelyDuplicateGutenbergWork, mergeImportJobMetadata, verifyGutenbergCandidate, vettedBatchMetadata } from "./gutenberg-fast-import.server";

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
  it("allows batch-50's individually checked catalog identity during a Gutendex outage",()=>{
    const job={
      id:81,gutenberg_id:601,original_publication_year:1796,attempts:2,
      metadata:{
        batchId:"PG-2026-11-09-B50-01",batchPosition:11,
        metadataSource:"Gutenberg catalogue page reviewed",
        title:"The Monk: A Romance",author:"Matthew Gregory Lewis",
        authorDeathYear:1818,originalPublicationYear:1796,
      },
    };
    const catalog=vettedBatchMetadata(job);
    expect(catalog).toMatchObject({
      id:601,media_type:"Text",copyright:false,languages:["en"],
      authors:[{name:"Matthew Gregory Lewis",death_year:1818}],
    });
    expect(verifyGutenbergCandidate(catalog,601,1796).author).toBe("Matthew Gregory Lewis");
    expect(mergeImportJobMetadata(job.metadata,{sourceSha256:"abc123"})).toMatchObject({
      batchId:"PG-2026-11-09-B50-01",sourceSha256:"abc123",
    });
    expect(()=>vettedBatchMetadata({...job,metadata:{...job.metadata,authorDeathYear:1970}})).toThrow();
    expect(()=>vettedBatchMetadata({...job,metadata:{...job.metadata,originalPublicationYear:1900}})).toThrow();
    expect(()=>vettedBatchMetadata({...job,metadata:{...job.metadata,batchId:"unreviewed"}})).toThrow();
    expect(()=>vettedBatchMetadata({...job,metadata:{...job.metadata,metadataSource:"reader-submitted"}})).toThrow();
    expect(()=>vettedBatchMetadata({...job,metadata:null})).toThrow();
  });
  it("rejects copyright restrictions, translations and modern contributors",()=>{
    expect(()=>verifyGutenbergCandidate({...sample,copyright:true},55,1900)).toThrow();
    expect(()=>verifyGutenbergCandidate({...sample,translators:[{name:"New Translator"}]},55,1900)).toThrow();
    expect(()=>verifyGutenbergCandidate({...sample,authors:[{name:"Modern",death_year:1970}]},55,1900)).toThrow();
    expect(verifyGutenbergCandidate({...sample,languages:["en","fr"]},55,1900).author).toBe("Baum, L. Frank");
    expect(()=>verifyGutenbergCandidate(sample,56,1900)).toThrow();
  });
  it("accepts single-language original Chinese, French and Finnish Gutenberg metadata",()=>{
    for(const language of ["zh","fr","fi"])
      expect(verifyGutenbergCandidate({...sample,languages:[language]},55,1900).deathYear).toBe(1919);
  });
  it("accepts complete non-spaced Unicode source text without inventing words",()=>{
    const chinese="天地玄黃宇宙洪荒日月盈昃辰宿列張".repeat(100);
    const source="*** START OF THE PROJECT GUTENBERG EBOOK TEST ***\n"+
      chinese+"\n*** END OF THE PROJECT GUTENBERG EBOOK TEST ***";
    expect(extractGutenbergBody(source)).toBe(chinese);
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

describe("Gutenberg work deduplication before publication", () => {
  it("detects punctuation variants and inverse author names", () => {
    expect(likelyDuplicateGutenbergWork(
      "Moby-Dick; or, The Whale", "Melville, Herman",
      { title: "Moby Dick or The Whale", author: "Herman Melville" },
    )).toBe(true);
    expect(likelyDuplicateGutenbergWork(
      "The Clockmaker", "Haliburton, Thomas Chandler",
      { title: "The Clockmaker", author: "Thomas Chandler Haliburton" },
    )).toBe(true);
  });
  it("never merges different works even by the same author", () => {
    expect(likelyDuplicateGutenbergWork("Bleak House", "Dickens, Charles", {
      title: "Oliver Twist", author: "Charles Dickens",
    })).toBe(false);
  });
});

describe("chapter heading completeness guard", () => {
  it("counts chapter headings from source bytes, not a corrupted navigation table", () => {
    const original = [
      "CONTENTS", "I. One", "II. Two",
      "CHAPTER I", "Body of chapter one.",
      "CHAPTER II", "Body of chapter two.",
      "CHAPTER III", "Body of chapter three.",
    ].join("\n\n");
    expect(countSourceChapterHeadings(original)).toBe(3);
  });
});
