import {describe,expect,it} from "vitest";
import {corroborateGutenbergFirstPublication,wikidataFirstPublicationYear} from "./gutenberg-two-source-bibliography.server";

function mockFetch(url:URL):Promise<any>{
  const action=url.searchParams.get("action");
  if(action==="wbsearchentities")return Promise.resolve({ok:true,json:async()=>({
    search:[{id:"Q100",label:"Bleak House"},{id:"Q101",label:"Bleak House"}]})});
  if(action==="wbgetentities"&&url.searchParams.get("props")==="labels|claims")
    return Promise.resolve({ok:true,json:async()=>({entities:{
      Q100:{labels:{en:{value:"Bleak House"}},claims:{
        P577:[{mainsnak:{datavalue:{value:{time:"+1853-01-01T00:00:00Z",precision:9}}}}],
        P50:[{mainsnak:{datavalue:{value:{id:"Q200"}}}}],
      }},
      Q101:{labels:{en:{value:"Bleak House"}},claims:{P577:[{mainsnak:{datavalue:{value:{time:"+2002-01-01T00:00:00Z",precision:9}}}}],
        P50:[{mainsnak:{datavalue:{value:{id:"Q300"}}}}]}}
    }})});
  return Promise.resolve({ok:true,json:async()=>({entities:{
    Q200:{labels:{en:{value:"Charles Dickens"}}},
    Q300:{labels:{en:{value:"Different Writer"}}},
  }})});
}
describe("Independent first-print year verification",()=>{
  it("matches bibliographic work title, author and dated Wikidata P577",async()=>{
    const p=await wikidataFirstPublicationYear("Bleak House","Dickens, Charles",mockFetch as any);
    expect(p).toEqual({year:1853,url:"https://www.wikidata.org/wiki/Q100"});
  });
  it("rejects conflicting or missing bibliography and known false placeholder years",async()=>{
    const wd=async()=>({year:1853,url:"https://www.wikidata.org/wiki/Q100"});
    const good=async()=>({year:1853,evidenceUrl:"https://openlibrary.org/search.json?query=bleak"});
    expect((await corroborateGutenbergFirstPublication("Bleak House","Dickens, Charles",1870,wd as any,good as any))?.sources).toHaveLength(2);
    const wrong=async()=>({year:1854,evidenceUrl:"https://openlibrary.org"});
    expect(await corroborateGutenbergFirstPublication("Bleak House","Dickens, Charles",1870,wd as any,wrong as any)).toBeNull();
    const falseOld=async()=>({year:1800,evidenceUrl:"https://openlibrary.org"});
    expect(await corroborateGutenbergFirstPublication("Bleak House","Dickens, Charles",1870,wd as any,falseOld as any)).toBeNull();
  });
});
