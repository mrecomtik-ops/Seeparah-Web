import {describe,expect,it} from "vitest";
import {
  matchesHistoricalBibliography,normalizeWorkTitle,
} from "./gutenberg-publication-year.server";
import {
  officialCatalogMetadata,verifyGutenbergCandidate,
} from "./gutenberg-fast-import.server";
describe("Gutenberg rights safeguards on automatic batches",()=>{
  const job={
    id:80,gutenberg_id:1023,attempts:1,original_publication_year:null,
    metadata:{
      autopilot:true,batchId:"PG-AUTO-0001",title:"Bleak House",
      author:"Dickens, Charles",authorDeathYear:1870,
      metadataSource:"Project Gutenberg official weekly CSV",
      catalogUrl:"https://www.gutenberg.org/cache/epub/feeds/pg_catalog.csv",
    },
  };
  it("accepts vetted source metadata but never treats unknown copyright as confirmed",()=>{
    const b=officialCatalogMetadata(job);
    expect(b.copyright).toBeNull();
    expect(()=>verifyGutenbergCandidate(b,1023,1853)).toThrow();
    expect(verifyGutenbergCandidate(b,1023,1853,"official Gutenberg weekly CSV").author)
      .toBe("Dickens, Charles");
    // Dates beyond 1900 are eligible to be acquired but must stay in
    // editorial review, never auto-publish on uncertain territory rights.
    expect(verifyGutenbergCandidate(b,1023,1901,"official Gutenberg weekly CSV").author)
      .toBe("Dickens, Charles");
  });
  it("disallows fake batch author and unreviewed catalog source",()=>{
    expect(()=>officialCatalogMetadata({...job,metadata:{...job.metadata,authorDeathYear:1970}})).toThrow();
    expect(()=>officialCatalogMetadata({...job,metadata:{...job.metadata,metadataSource:"reader submission"}})).toThrow();
    expect(()=>officialCatalogMetadata({...job,metadata:{...job.metadata,batchId:"PG-AUTO-nonsense"}})).toThrow();
  });
  it("requires independent print-year lookup to match title and historical author",()=>{
    const good={title:"Bleak House",author_name:["Charles Dickens"],first_publish_year:1853};
    expect(matchesHistoricalBibliography("Bleak House","Dickens, Charles",good)).toBe(true);
    expect(matchesHistoricalBibliography("Bleak House","Dickens, Charles",{...good,title:"Oliver Twist"})).toBe(false);
    expect(matchesHistoricalBibliography("Bleak House","Dickens, Charles",{...good,author_name:["Jane Austen"]})).toBe(false);
    expect(normalizeWorkTitle("A Tale of Two Cities")).toBe("a tale of two cities");
  });
});
