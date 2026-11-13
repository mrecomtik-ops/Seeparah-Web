import { describe,expect,it } from "vitest";
import { adequateBookCover,auditPersistedGutenbergToc,jpegDimensions,safeClassicAutoPublish } from "./gutenberg-publication-qa.server";

const good={
  gutenbergCopyright:false as const,authorDeathYear:1870,firstPublishedYear:1853,
  hasModernContributors:false,independentBibliographyCount:2,
  hasTextRightsSignals:false,verifiedCover:true,sourceIntegrity:true,
  storedIntegrity:true,tocIntegrity:true,warnings:0,
};
describe("Gutenberg cover resolution gate",()=>{
  it("recognizes original cover JPEG dimensions without trusting a filename",()=>{
    const bytes=new Uint8Array(120);
    bytes.set([0xff,0xd8,0xff,0xc0,0,17,8,0x03,0x20,0x02,0x58,3],0);
    expect(jpegDimensions(bytes)).toEqual({width:600,height:800});
    expect(adequateBookCover(jpegDimensions(bytes))).toBe(true);
    bytes[9]=0x01;bytes[10]=0x2c; // 300 px
    expect(adequateBookCover(jpegDimensions(bytes))).toBe(false);
    expect(jpegDimensions(new Uint8Array(200))).toBeNull();
  });
});
describe("Gutenberg TOC storage audit",()=>{
  const parsed={chunks:[
    "CONTENTS\n\nI. Begin\n\nII. Continue","CHAPTER I\n\nOpening words.","CHAPTER II\n\nEnding words."],
    structure:[
      {nodeKey:"front-0001",parentNodeKey:null,nodeType:"front_matter",title:"CONTENTS",ordinal:0,startChunkIndex:0,endChunkIndex:0},
      {nodeKey:"chapter-0002",parentNodeKey:null,nodeType:"chapter",title:"CHAPTER I",ordinal:1,startChunkIndex:1,endChunkIndex:1},
      {nodeKey:"chapter-0003",parentNodeKey:null,nodeType:"chapter",title:"CHAPTER II",ordinal:2,startChunkIndex:2,endChunkIndex:2}
    ]};
  const stored=parsed.structure.map(x=>({
    node_key:x.nodeKey,parent_node_key:x.parentNodeKey,node_type:x.nodeType,
    title:x.title,ordinal:x.ordinal,start_chunk_index:x.startChunkIndex,end_chunk_index:x.endChunkIndex,
  }));
  it("accepts source-backed chapter titles and exact stored ordering",()=>{
    expect(auditPersistedGutenbergToc(parsed,stored).ok).toBe(true);
  });
  it("blocks missing chapter, off-by-one targets and fabricated headings",()=>{
    expect(auditPersistedGutenbergToc(parsed,stored.slice(1)).ok).toBe(false);
    expect(auditPersistedGutenbergToc(parsed,stored.map(x=>({...x,start_chunk_index:0}))).ok).toBe(false);
    expect(auditPersistedGutenbergToc(parsed,stored.map(x=>({...x,title:"CHAPTER XIX"}))).ok).toBe(false);
  });
});
describe("Conservative direct publication rule",()=>{
  it("allows a validated classical original",()=>expect(safeClassicAutoPublish(good).allowed).toBe(true));
  it("fails closed on each publication blocker",()=>{
    const variants=[
      {gutenbergCopyright:null},{authorDeathYear:1924},{firstPublishedYear:null},
      {firstPublishedYear:1901},{hasModernContributors:true},
      {independentBibliographyCount:1},{hasTextRightsSignals:true},
      {verifiedCover:false},{sourceIntegrity:false},{storedIntegrity:false},
      {tocIntegrity:false},{warnings:1},
    ];
    for(const item of variants)expect(safeClassicAutoPublish({...good,...item}).allowed).toBe(false);
  });
});
