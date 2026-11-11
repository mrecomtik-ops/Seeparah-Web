import { describe, expect, it } from "vitest";
import { matchesLibraryGenre, publishedGenreFacetCounts } from "./library-genres";
import type { Book } from "@/lib/data";
const book=(genre: string|null,categories: string[])=>({genre,categories}) as Pick<Book,"genre"|"categories">;
describe("QA-025 actual published genres and sourced subjects",()=>{
  it("allows a genre or an already-assigned topic, never guesses from titles",()=>{
    const item=book("Literature",["Fiction","Adventure"]);
    expect(matchesLibraryGenre(item,"Literature")).toBe(true);
    expect(matchesLibraryGenre(item,"Adventure")).toBe(true);
    expect(matchesLibraryGenre(item,"Philosophy")).toBe(false);
    expect(matchesLibraryGenre(item,null)).toBe(true);
  });
  it("counts a book once where genre and category coincide, excludes empty/unpublished topics",()=>{
    const counts=publishedGenreFacetCounts([book("Literature",["Literature","Fiction"]),
      book(null,["Fiction","Religious"]),book("Sacred Text",["Religious"])]);
    expect(counts.get("Literature")).toBe(1);
    expect(counts.get("Fiction")).toBe(2);
    expect(counts.get("Sacred Text")).toBe(1);
    expect(counts.has("Religious")).toBe(false);
    expect(counts.has("Mystery & Detective")).toBe(false);
  });
});