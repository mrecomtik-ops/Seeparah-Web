/**
 * Immutable edition cover + semantic TOC validation for Gutenberg imports.
 * An online book is not approved solely because its raw bytes were fetched.
 * Fail closed: only a cover from the *same* ebook ID and a persisted TOC
 * checked against the unaltered source can proceed to automated publication.
 */
export function jpegDimensions(bytes: Uint8Array): {width:number;height:number} | null {
  if(bytes.length<100 || bytes[0]!==0xff || bytes[1]!==0xd8)return null;
  let cursor=2;
  while(cursor+8<bytes.length){
    if(bytes[cursor]!==0xff)return null;
    while(bytes[cursor]===0xff)cursor++;
    const marker=bytes[cursor++] ?? -1;
    if(marker===0xd9||marker===0xda)break;
    if(marker>=0xd0&&marker<=0xd7||marker===0x01)continue;
    if(cursor+2>bytes.length)return null;
    const length=((bytes[cursor]??0)<<8)+(bytes[cursor+1]??0);
    if(length<2||cursor+length>bytes.length)return null;
    if((marker>=0xc0&&marker<=0xc3)||
       (marker>=0xc5&&marker<=0xc7)||
       (marker>=0xc9&&marker<=0xcb)||
       (marker>=0xcd&&marker<=0xcf)){
      if(length<7)return null;
      const height=((bytes[cursor+3]??0)<<8)+(bytes[cursor+4]??0);
      const width=((bytes[cursor+5]??0)<<8)+(bytes[cursor+6]??0);
      if(width<1||height<1||width>14000||height>14000)return null;
      return {width,height};
    }
    cursor+=length;
  }
  return null;
}

export function adequateBookCover(
  dimensions: {width:number;height:number}|null,
):boolean{
  return Boolean(dimensions && dimensions.width>=500 &&
    dimensions.height>=700 && dimensions.height>=dimensions.width);
}

type TNode={
  node_key:string;parent_node_key:string|null;node_type:string;
  title:string;ordinal:number;start_chunk_index:number;end_chunk_index:number;
};
type ParsedNode={
  nodeKey:string;parentNodeKey:string|null;nodeType:string;
  title:string;ordinal:number;startChunkIndex:number;endChunkIndex:number;
};
function headingKey(text:string):string{
  return text.normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}]/gu,"");
}

/** Verify DB round-trip including chapter positions, not just node count.
 * Includes parts, sections, chapters, and front matter; preserves TOC order.
 * Detects the Cousin Henry missing-opening-chapter regression.
 */
export function auditPersistedGutenbergToc(
  parsed:{chunks:string[];structure:ParsedNode[]},
  stored:TNode[],
):{ok:boolean; errors:string[];chapterCount:number;tocCount:number}{
  const errors:string[]=[];
  const expected=parsed.structure;
  if(expected.length<2)errors.push("No multi-entry source-backed table of contents");
  if(expected.length!==stored.length)
    errors.push("Stored table of contents has missing or duplicated entries");
  const keys=new Set<string>();
  // A stored chunk may contain several paragraphs before its *verified*
  // heading. The previous 2,000-character cut-off rejected real sections
  // that occur later in the same chunk. Cache the complete chunk's
  // normalized text rather than guessing which prefix contains the heading.
  const normalizedChunks=new Map<number,string>();
  for(let i=0;i<stored.length;i++){
    const actual=stored[i]!;
    const original=expected[i];
    if(!original)break;
    if(keys.has(actual.node_key))errors.push("Duplicate stored table of contents key");
    keys.add(actual.node_key);
    if(actual.node_key!==original.nodeKey ||
       actual.node_type!==original.nodeType ||
       actual.parent_node_key!==original.parentNodeKey ||
       actual.title!==original.title ||
       actual.ordinal!==original.ordinal ||
       actual.start_chunk_index!==original.startChunkIndex ||
       actual.end_chunk_index!==original.endChunkIndex){
      errors.push("Stored table of contents differs from source-backed navigation");
    }
    if(actual.start_chunk_index<0 ||
       actual.end_chunk_index<actual.start_chunk_index ||
       actual.end_chunk_index>=parsed.chunks.length)
      errors.push("TOC points outside the book");
    if(["chapter","part","section"].includes(actual.node_type)){
      const label=actual.title.split(" — ")[0]??actual.title;
      const index=actual.start_chunk_index;
      let target=normalizedChunks.get(index);
      if(target===undefined){
        target=headingKey(parsed.chunks[index]??"");
        normalizedChunks.set(index,target);
      }
      if(label.trim().length>0&&!target.includes(headingKey(label)))
        errors.push("TOC chapter heading does not occur at target chunk");
    }
  }
  const chapterCount=stored.filter(n=>n.node_type==="chapter").length;
  if(expected.some(n=>n.nodeType==="chapter") && chapterCount<2)
    errors.push("Incomplete chapter navigation");
  const first=stored.find(n=>n.node_type==="chapter");
  if(first && /^(?:CHAPTER\s+(?:II|III|IV|V|X|XI|XII|2|3|4|5)|[IVX]+\.)\b/iu.test(first.title))
    errors.push("The first chapter may be missing; verify original source");
  return {ok:errors.length===0, errors:[...new Set(errors)],chapterCount,tocCount:stored.length};
}

/** Explicit conservatism: a Gutenberg ebook may be free in the US while a
 * newer edition/translation is restricted elsewhere. Only classic originals,
 * no modern editors/translators and independently corroborated print year.
 */
export function safeClassicAutoPublish(input:{
  gutenbergCopyright:boolean|null;
  authorDeathYear:number;
  firstPublishedYear:number|null;
  hasModernContributors:boolean;
  hasUnrenderedIllustrations:boolean;
  independentBibliographyCount:number;
  hasTextRightsSignals:boolean;
  verifiedCover:boolean;
  sourceIntegrity:boolean;
  storedIntegrity:boolean;
  tocIntegrity:boolean;
  warnings:number;
}):{allowed:boolean;reasons:string[]}{
  const reasons:string[]=[];
  if(input.gutenbergCopyright!==false)
    reasons.push("Gutenberg US copyright status is not confirmed unrestricted");
  if(!Number.isInteger(input.authorDeathYear)||input.authorDeathYear>1900)
    reasons.push("Contributor life-term clearance needs independent review");
  if(input.firstPublishedYear===null||input.firstPublishedYear>1900||
     input.firstPublishedYear<1400)
    reasons.push("Original publication year is unverified or outside conservative pre-1901 scope");
  if(input.hasModernContributors)reasons.push("Translator/editor rights need review");
  if(input.hasUnrenderedIllustrations)
    reasons.push("Illustrations and diagrams require an EPUB/HTML asset-preserving edition");
  if(input.independentBibliographyCount<2)reasons.push("Two concordant bibliographic references required");
  if(input.hasTextRightsSignals)reasons.push("Source has edition-level rights signals");
  if(!input.verifiedCover)reasons.push("Source-matched cover lacks verified resolution/provenance");
  if(!input.sourceIntegrity||!input.storedIntegrity)reasons.push("Original source text fails round-trip integrity");
  if(!input.tocIntegrity)reasons.push("Full source-backed TOC fails navigability audit");
  if(input.warnings>0)reasons.push("Imported book has unresolved warnings");
  return {allowed:reasons.length===0,reasons};
}
