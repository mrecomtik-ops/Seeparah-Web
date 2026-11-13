/**
 * Explicit Gutenberg rights evidence from the individual, ID-matched official
 * RDF record. Weekly CSV does NOT include this field and must never be
 * treated as rights clearance. Unknown/malformed stays UNKNOWN.
 *
 * A US public-domain flag does not supersede copyright rules elsewhere.
 * Only historic originals without modern contributors proceed to later gates.
 */
export function parseGutenbergRdfUsRights(
  rdf: string,
  gutenbergId: number,
): { copyright: boolean; rights: string } | null {
  if(!Number.isSafeInteger(gutenbergId)||gutenbergId<1 ||
     gutenbergId>9_999_999 || rdf.length>1_000_000)return null;
  const match = /<pgterms:ebook\b([^>]*)>([\s\S]*?)<\/pgterms:ebook\s*>/giu;
  for (const item of rdf.matchAll(match)) {
    const attributes=item[1]??"";
    const id = /\brdf:about\s*=\s*["']ebooks\/(\d+)["']/iu.exec(attributes)?.[1];
    if(Number(id)!==gutenbergId)continue;
    const rightsMatch=/<dcterms:rights\b[^>]*>([\s\S]*?)<\/dcterms:rights\s*>/iu.exec(item[2]??"");
    if(!rightsMatch)return null;
    const rights=rightsMatch[1]!.replace(/<[^>]+>/gu,"")
      .replace(/&amp;/gu,"&").replace(/\s+/gu," ").trim();
    if(/^Public domain in the USA\.?$/iu.test(rights))return{copyright:false,rights};
    if(/^Copyrighted\b/iu.test(rights))return{copyright:true,rights};
    return null;
  }
  return null;
}
