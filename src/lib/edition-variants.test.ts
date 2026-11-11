import { describe, expect, it } from "vitest";
import { publishedEditionVariantCounts } from "./edition-variants";
import type { Book } from "@/lib/data";
const b=(id:string,title:string,author:string,source_edition_id:string)=>({id,title,author,source_edition_id}) as Pick<Book,"id"|"title"|"author"|"source_edition_id">;
describe("QA-011 duplicate Gutenberg works retain edition provenance",()=>{
  it("labels punctuation and catalog author variants without removing originals",()=>{
    const originals=[
      b("a","Moby Dick; Or, The Whale","Melville, Herman","gutenberg:2489"),
      b("b","Moby-Dick; or, The Whale","Herman Melville","gutenberg:15"),
      b("c","Jane Eyre","Brontë, Charlotte","gutenberg:1260"),
    ];
    const result=publishedEditionVariantCounts(originals);
    expect(result.get("a")).toBe(2);
    expect(result.get("b")).toBe(2);
    expect(result.has("c")).toBe(false);
    expect(originals).toHaveLength(3);
  });
  it("never combines distinct authors or sources from non-Gutenberg collections",()=>{
    const result=publishedEditionVariantCounts([
      b("x","Shared Work","Jane Doe","gutenberg:1"),
      b("y","Shared Work","John Doe","gutenberg:2"),
      b("z","Shared Work","Jane Doe","sacred:3"),
    ]);
    expect(result.size).toBe(0);
  });
});