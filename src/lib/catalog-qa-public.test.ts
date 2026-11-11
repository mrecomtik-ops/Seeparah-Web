import { describe,expect,it } from "vitest";
import { publicCatalogQaProjection } from "./catalog-qa-public";

describe("Read-only public QA projection prevents privilege escalation",()=>{
 const raw={
  books:[
   {id:"pub1",status:"published",title:"Published Work",author:"Public Author",source_scan_id:"gutenberg:9",
    source_language:"English",source_version:1,original_publication_year:null,cover_url:null,
    user_id:"private-user",rights_approval:"DO NOT EXPOSE",metadata:{account:"secret"}},
   {id:"draft1",status:"draft",title:"UNPUBLISHED PRIVATE MANUSCRIPT",author:"Private Author",source_scan_id:"gutenberg:10"},
  ],
  reviews:[
   {book_id:"pub1",book_title:"GUESSED/TAMPERED PRIVATE TITLE",
    status:"requires_manual_source_review",priority:"standard",detection_note:"Sensitive QA note"},
   {book_id:"draft1",book_title:"UNPUBLISHED PRIVATE MANUSCRIPT",status:"requires_manual_source_review"},
  ],
  oldYears:[{book_id:"pub1",old_original_publication_year:1656,reason:"private"},{book_id:"draft1"}],
  importer:{enabled:false,target_published:10000,batch_size:100,service_role_key:"secret-master"},
 };
 it("projects only published book public metadata and sanctioned review states",()=>{
  const actual=publicCatalogQaProjection(raw);
  expect(actual.version).toBe(1);
  expect(actual.books).toHaveLength(1);
  expect(actual.reviews).toHaveLength(1);
  expect(actual.oldYears).toEqual([{book_id:"pub1"}]);
  expect(actual.reviews[0].book_title).toBe("Published Work");
  expect(actual.importer).toEqual({enabled:false,target_published:10000,batch_size:100});
  for(const excluded of ["secret-master","private-user","private","Sensitive QA note",
  "UNPUBLISHED PRIVATE MANUSCRIPT","DO NOT EXPOSE","1656"]){
   expect(JSON.stringify(actual)).not.toContain(excluded);
  }
 });
 it("fails closed on empty production state",()=>{
  expect(()=>publicCatalogQaProjection({...raw,books:[]})).toThrow();
  expect(()=>publicCatalogQaProjection({...raw,importer:null})).toThrow();
 });
});
