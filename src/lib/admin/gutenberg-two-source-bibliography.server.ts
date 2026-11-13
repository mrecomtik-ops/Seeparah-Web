/**
 * Conservative two-provider bibliographic corroboration.
 * A Gutenberg "Issued" date is NOT the first print year. A single Open
 * Library first_publish_year is not reliable enough (1800/1656 incidents).
 * Only exact title+author Wikidata P577 agreement permits auto-publication.
 * Failure is review, not an invented publication year.
 */
import { independentFirstPublicationYear, normalizeWorkTitle } from "@/lib/admin/gutenberg-publication-year.server";

export type VerifiedBibliography = {
  year: number;
  sources: Array<{provider: "openlibrary"|"wikidata";url:string;year:number}>;
};
type Entity={id?:string;labels?:Record<string,{value?:string}>;claims?:Record<string,Array<{
  mainsnak?:{datavalue?:{value?:any}};
}>>};
function normalized(value:string):string{
  return normalizeWorkTitle(value).replace(/\s+/gu,"");
}
function sameWork(a:string,b:string):boolean{
  return normalized(a)===normalized(b) ||
    normalized(a.split(/[;:]/u)[0]??a)===normalized(b.split(/[;:]/u)[0]??b);
}
function sameAuthor(name:string, label:string):boolean{
  const tokens=(value:string)=>normalizeWorkTitle(value).split(" ").filter(x=>x.length>=2).sort();
  const a=tokens(name),b=tokens(label);
  return a.length>=2&&b.length>=2&&a.every(x=>b.includes(x));
}
function getStatementIds(entity:Entity):string[]{
  return (entity.claims?.P50??[]).flatMap(x=>{
    const value=x.mainsnak?.datavalue?.value;
    return value && typeof value.id==="string" && /^Q\d+$/u.test(value.id) ?[value.id]:[];
  });
}
function getPubYears(entity:Entity):number[]{
  return (entity.claims?.P577??[]).flatMap(x=>{
    const value=x.mainsnak?.datavalue?.value;
    const time=typeof value?.time==="string"?value.time:"";
    const match=/^\+(\d{4})-/u.exec(time);
    if(!match || Number(value?.precision??0)<9)return [];
    const year=Number(match[1]);
    return year>=1400&&year<=1930?[year]:[];
  });
}
async function wikidataRequest<T>(params:Record<string,string>,fetchFn:typeof fetch):Promise<T>{
  const url=new URL("https://www.wikidata.org/w/api.php");
  for(const [key,value] of Object.entries(params))url.searchParams.set(key,value);
  url.searchParams.set("format","json");
  const r=await fetchFn(url,{
    signal:AbortSignal.timeout(8000),
    headers:{Accept:"application/json","User-Agent":"Seeparah-Edition-Bibliography/1.0 (+https://seeparah.com)"},
  });
  if(!r.ok)throw new Error("Wikidata bibliography HTTP "+r.status);
  return await r.json() as T;
}

export async function wikidataFirstPublicationYear(
  title:string,author:string,fetchFn:typeof fetch=fetch,
):Promise<{year:number;url:string}|null>{
  const search=await wikidataRequest<{search?:Array<{id?:string;label?:string}>}>({
    action:"wbsearchentities",search:title.split(/[;:]/u)[0]?.trim()??title,
    language:"en",type:"item",limit:"8",
  },fetchFn);
  const ids=(search.search??[])
    .filter(x=>x.id&&/^Q\d+$/u.test(x.id)&&sameWork(title,x.label??""))
    .map(x=>x.id!);
  if(!ids.length)return null;
  const all=await wikidataRequest<{entities?:Record<string,Entity>}>({
    action:"wbgetentities",ids:ids.join("|"),
    props:"labels|claims",languages:"en",
  },fetchFn);
  const candidates=ids.flatMap(id=>{
    const e=all.entities?.[id];
    if(!e||!sameWork(title,e.labels?.en?.value??""))return [];
    const years=getPubYears(e);
    const authors=getStatementIds(e);
    if(!years.length || !authors.length)return [];
    return [{id,years,authors}];
  });
  if(!candidates.length)return null;
  const authorIds=[...new Set(candidates.flatMap(x=>x.authors))];
  const people=await wikidataRequest<{entities?:Record<string,Entity>}>({
    action:"wbgetentities",ids:authorIds.slice(0,20).join("|"),
    props:"labels",languages:"en",
  },fetchFn);
  const approved=candidates.flatMap(c=>
    c.authors.some(id=>sameAuthor(author,people.entities?.[id]?.labels?.en?.value??""))
      ? c.years.map(year=>({year,url:"https://www.wikidata.org/wiki/"+c.id})) : []);
  const unique=[...new Set(approved.map(x=>x.year))];
  // Multiple differing dates might describe versions/serial instalments.
  if(unique.length!==1)return null;
  return approved.find(x=>x.year===unique[0])??null;
}

export async function corroborateGutenbergFirstPublication(
  title:string,author:string,authorDeathYear:number,
  wikidataLookup:typeof wikidataFirstPublicationYear=wikidataFirstPublicationYear,
  libraryLookup:typeof independentFirstPublicationYear=independentFirstPublicationYear,
):Promise<VerifiedBibliography|null>{
  try {
    const ol=await libraryLookup(title,author,authorDeathYear);
    if(ol.year===1800||ol.year===1656)return null; // known historical placeholders
    const wd=await wikidataLookup(title,author);
    if(!wd||wd.year!==ol.year)return null;
    if(ol.year>1900||ol.year<1400||ol.year>authorDeathYear+10)return null;
    return {year:ol.year,sources:[
      {provider:"openlibrary",year:ol.year,url:ol.evidenceUrl},
      {provider:"wikidata",year:wd.year,url:wd.url},
    ]};
  }catch{
    return null; // no bibliographic evidence means cannot auto-publish
  }
}
