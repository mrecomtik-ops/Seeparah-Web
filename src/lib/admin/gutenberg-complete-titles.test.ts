import { describe, expect, it } from "vitest";
import { candidateFromFullInventory } from "./gutenberg-autopilot.server";
import { officialCatalogMetadata } from "./gutenberg-fast-import.server";

const inventory = {
  gutenberg_id: 158,
  source_type: "Text",
  title: "Emma",
  author_raw: "Austen, Jane, 1775-1817",
  language_codes: ["en"],
  catalog_issued: "1994-08-01",
  subjects: "English fiction",
};

describe("Gutenberg complete historical title candidate intake",()=>{
  it("includes short original classical work titles rather than rejecting by name length",()=>{
    const candidate=candidateFromFullInventory(inventory);
    expect(candidate?.title).toBe("Emma");
    expect(candidate?.gutenberg_id).toBe(158);
  });
  it("includes complete works, source volumes, and collections as separate source identities",()=>{
    for(const title of ["Vol. I","Complete Works of Jane Austen","Seventh Volume","A Collection of Letters"]){
      const selected=candidateFromFullInventory({...inventory,title});
      expect(selected?.title).toBe(title);
    }
  });
  it("keeps contributor and non-text safeguards while allowing other source languages",()=>{
    expect(candidateFromFullInventory({...inventory,author_raw:"Living, Author, 1901-1999"})).toBeNull();
    expect(candidateFromFullInventory({...inventory,author_raw:"Austen, Jane [Translator], 1775-1817"})).toBeNull();
    expect(candidateFromFullInventory({...inventory,source_type:"Audio"})).toBeNull();
    expect(candidateFromFullInventory({...inventory,language_codes:["fr"]})?.priority).toBe(-1);
  });
  it("keeps exact-ID official fallback identity for a short Gutenberg title with UNKNOWN rights",()=>{
    const record=officialCatalogMetadata({
      id:1,gutenberg_id:158,attempts:1,original_publication_year:null,
      metadata:{
        autopilot:true,batchId:"PG-AUTO-0053",title:"Emma",
        author:"Austen, Jane",authorDeathYear:1817,
        metadataSource:"Project Gutenberg official weekly CSV",
        catalogUrl:"https://www.gutenberg.org/cache/epub/feeds/pg_catalog.csv",
      },
    });
    expect(record.title).toBe("Emma");
    expect(record.copyright).toBeNull();
  });
});
