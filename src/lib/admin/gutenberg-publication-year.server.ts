/** Independent evidence for an original print-publication year.
 * Gutenberg's "Issued" is the electronic edition date, not the first print
 * publication year. Never substitute it or an author's death date.
 */
export function normalizeWorkTitle(value:string):string{
  return value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"")
    .replace(/[^a-z0-9 ]+/g," ").replace(/\s+/g," ").trim();
}
export function matchesHistoricalBibliography(
  workTitle:string, author:string,
  doc:{title?:string;author_name?:string[];first_publish_year?:number},
):boolean{
  const title=normalizeWorkTitle(workTitle);
  const found=normalizeWorkTitle(doc.title??"");
  if(!title||!found)return false;
  // Permit a subtitle after ":" in either catalog, but reject unrelated works.
  const shortTitle=normalizeWorkTitle(workTitle.split(/[:;]/)[0]??workTitle);
  const shortFound=normalizeWorkTitle((doc.title??"").split(/[:;]/)[0]??"");
  if(!(title===found || shortTitle===shortFound ||
       (shortTitle.length>=14 && (found.startsWith(shortTitle+" ") ||
                                title.startsWith(shortFound+" ")))))return false;
  const surname=normalizeWorkTitle(author.split(",")[0]??"");
  if(surname.length<3||!Array.isArray(doc.author_name))return false;
  return doc.author_name.some(name=>{
    const p=normalizeWorkTitle(name);
    return p.split(" ").includes(surname) || p.startsWith(surname+" ");
  });
}
export async function independentFirstPublicationYear(
  title:string,author:string,authorDeathYear:number,
):Promise<{year:number;evidenceUrl:string}>{
  const url=new URL("https://openlibrary.org/search.json");
  url.searchParams.set("title",title.split(/[:;]/)[0]??title);
  url.searchParams.set("author",author);
  url.searchParams.set("fields","title,author_name,first_publish_year");
  url.searchParams.set("limit","7");
  const response=await fetch(url,{
    headers:{Accept:"application/json","User-Agent":"Seeparah-Source-Verification/1.0 (+https://seeparah.com)"},
    signal:AbortSignal.timeout(8000),
  });
  if(!response.ok)throw new Error("Independent first publication lookup returned "+response.status);
  const data=await response.json() as {
    docs?:Array<{title?:string;author_name?:string[];first_publish_year?:number}>;
  };
  const candidates=(data.docs??[]).filter(row=>
    matchesHistoricalBibliography(title,author,row) &&
    Number.isInteger(row.first_publish_year) &&
    (row.first_publish_year??0)>=1400 &&
    (row.first_publish_year??9999)<=1900 &&
    (row.first_publish_year??9999)<=authorDeathYear+10,
  );
  if(!candidates.length)throw new Error("Independent historical first publication year unavailable");
  return {year:Math.min(...candidates.map(x=>x.first_publish_year!)),evidenceUrl:url.toString()};
}
