import {describe,expect,it} from "vitest";
import {csvRows,isTransientGutenbergFailure,selectGutenbergCandidates,candidateFromFullInventory} from "./gutenberg-autopilot.server";

describe("Gutenberg unattended catalogue intake",()=>{
  it("parses official RFC4180 CSV including escaped quotes and multiline titles",()=>{
    const data='Text#,Type,Issued,Title,Language,Authors,Subjects,LoCC,Bookshelves\r\n'
      +'1,Text,2000-01-01,"A ""quoted"",\nlong title",en,"Dickens, Charles, 1812-1870",Fiction,PR,Books\r\n';
    const rows=[...csvRows(data)];
    expect(rows).toHaveLength(2);
    expect(rows[1]?.[3]).toBe('A "quoted",\nlong title');
    expect(rows[1]?.[5]).toBe("Dickens, Charles, 1812-1870");
  });
  it("prefers original English historic works and never invents print years",()=>{
    let csv='Text#,Type,Issued,Title,Language,Authors,Subjects,LoCC,Bookshelves\n';
    for(let i=1;i<=540;i++){
      csv+=i+',Text,1901-01-01,"Old narrative '+i+'",en,'
        +'"Austen, Jane, 1775-1817",Fiction,PR,Books\n';
    }
    csv+='9000,Text,1998-01-01,New Work,en,'
      +'"Modern, Writer, 1960-2020",Fiction,PR,Books\n';
    csv+='9001,Text,1998-01-01,Translated Text,en,'
      +'"Wilde, Oscar, 1854-1900 [Translator]",Fiction,PR,Books\n';
    const items=selectGutenbergCandidates(csv,500);
    expect(items).toHaveLength(500);
    expect(items[0]).toMatchObject({
      gutenberg_id:1,original_publication_year:null,
      catalog_issued:"1901-01-01",author:"Austen, Jane",
      author_death_year:1817,priority:0,
    });
    expect(items.every(x=>x.gutenberg_id<9000)).toBe(true);
  });
  it("discovers Twain, Hardy and Conrad as review-only source candidates, never modern editions", () => {
    const csv=[
      "Text#,Type,Issued,Title,Language,Authors,Subjects,LoCC,Bookshelves",
      '1001,Text,2000-01-01,Adventures of Huckleberry Finn,en,"Twain, Mark, 1835-1910",Fiction',
      '1002,Text,2000-01-01,The Mayor of Casterbridge,en,"Hardy, Thomas, 1840-1928",Fiction',
      '1003,Text,2000-01-01,Lord Jim,en,"Conrad, Joseph, 1857-1924",Fiction',
      '1004,Text,2000-01-01,Modern Work,en,"Author, Modern, 1950-2025",Fiction',
    ].join("\n");
    const matches=selectGutenbergCandidates(csv,50);
    expect(matches.map(x=>x.author_death_year)).toEqual([1910,1928,1924]);
    expect(matches.every(x=>x.original_publication_year===null)).toBe(true);
  });
  it("retries only network errors and leaves rights failures in review",()=>{
    expect(isTransientGutenbergFailure("Both authorized Gutenberg mirrors unavailable: operation was aborted due to timeout")).toBe(true);
    expect(isTransientGutenbergFailure("HTTP 502 from mirror")).toBe(true);
    expect(isTransientGutenbergFailure("Manuscript contains rights/revision signals requiring review")).toBe(false);
    expect(isTransientGutenbergFailure("Unverified original publication date")).toBe(false);
    expect(isTransientGutenbergFailure("Missing copyright permission")).toBe(false);
    expect(isTransientGutenbergFailure("Independent first publication lookup returned 521")).toBe(true);
    expect(isTransientGutenbergFailure("Both authorized Gutenberg mirrors unavailable: HTTP 404")).toBe(false);
    expect(isTransientGutenbergFailure("Source exceeds import size")).toBe(false);
  });
  it("rejects truncated or foreign Gutenberg metadata",()=>{
    expect(()=>[...csvRows('"broken')]).toThrow(/truncated/);
    expect(()=>selectGutenbergCandidates("title,author\nx,y")).toThrow(/headers/);
  });
});

describe("Complete private-inventory publication intake",()=>{
  it("only selects conservative original-English historic works and never invents first-print dates",()=>{
    const base={
      gutenberg_id:500,title:"An Original English Classical Novel",
      source_type:"Text",author_raw:"Dickens, Charles, 1812-1870",
      language_codes:["en"],catalog_issued:"2001-01-01",subjects:"Fiction",
    };
    const eligible=candidateFromFullInventory(base);
    expect(eligible).toMatchObject({
      gutenberg_id:500,author:"Dickens, Charles",author_death_year:1870,
      original_publication_year:null,priority:0,
    });
    expect(candidateFromFullInventory({...base,language_codes:["en","fr"]})).toBeNull();
    expect(candidateFromFullInventory({...base,language_codes:["es"]})).toBeNull();
    expect(candidateFromFullInventory({...base,author_raw:"Recent, Person, 1900-1950"})).toBeNull();
    expect(candidateFromFullInventory({...base,author_raw:"Dickens, Charles, 1812-1870; Translator, X, 1920-1990"})).toBeNull();
    expect(candidateFromFullInventory({...base,source_type:"Sound"})).toBeNull();
  });
});
