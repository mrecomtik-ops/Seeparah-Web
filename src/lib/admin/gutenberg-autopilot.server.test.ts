import {describe,expect,it} from "vitest";
import {csvRows,selectGutenbergCandidates} from "./gutenberg-autopilot.server";

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
  it("rejects truncated or foreign Gutenberg metadata",()=>{
    expect(()=>[...csvRows('"broken')]).toThrow(/truncated/);
    expect(()=>selectGutenbergCandidates("title,author\nx,y")).toThrow(/headers/);
  });
});
