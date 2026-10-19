from pathlib import Path
import json,hashlib,uuid
R=Path(__file__).resolve().parents[1]/"data/sacred/dao-de-jing-wangbi"
M=json.loads((R/"manifest.json").read_text(encoding="utf8"))
assert M["revision"]==2354026 and len(M["chapters"])==81
OUT=Path("C:/Temp/seeparah-dao-wangbi-import-20261019");OUT.mkdir(exist_ok=True)
BOOK=str(uuid.uuid5(uuid.NAMESPACE_URL,"seeparah:dao-de-jing:wang-bi:zh-wikisource:rev2354026"))
EDITION=str(uuid.uuid5(uuid.NAMESPACE_URL,"seeparah:dao-wangbi:edition:rev2354026"))
SOURCE="https://zh.wikisource.org/wiki/%E9%81%93%E5%BE%B7%E7%B6%93_(%E7%8E%8B%E5%BC%BC%E6%9C%AC)"
RIGHTS="Original Laozi ancient Chinese with historical Wang Bi (third-century CE) commentary, public domain by age. Modern Wikisource transcription and contributors acknowledged; source text never self-translated."
license="https://zh.wikisource.org/wiki/Wikisource:版权信息"
def lit(v):
 if v is None:return "NULL"
 if isinstance(v,bool):return "true" if v else "false"
 if isinstance(v,int):return str(v)
 return "'"+str(v).replace("'","''")+"'"
def ins(table,row):
 return "INSERT INTO public."+table+" ("+",".join(row)+") VALUES ("+",".join(lit(x) for x in row.values())+") ON CONFLICT DO NOTHING;"
def pack(table,ty,rows):
 p=json.dumps(rows,ensure_ascii=False,separators=(",",":"))
 assert "$wangbi$" not in p
 return "INSERT INTO public."+table+" ("+",".join(ty)+") SELECT "+",".join("x."+x for x in ty)+" FROM jsonb_to_recordset($wangbi$"+p+"$wangbi$::jsonb) AS x("+",".join(k+" "+v for k,v in ty.items())+") ON CONFLICT DO NOTHING;"
def save(name,sql): (OUT/name).write_text(sql+"\n",encoding="utf8")
texts=[]
for entry in M["chapters"]:
 n=entry["number"]
 b=(R/f"chapter-{n:02d}.txt").read_text(encoding="utf8").encode("utf8")
 assert hashlib.sha256(b).hexdigest()==entry["sha256"]
 assert len(b.decode("utf8"))==entry["chars"]
 texts.append(b.decode("utf8"))
assert "道可道" in texts[0] and "信言不美" in texts[-1]
md5=hashlib.md5(chr(31).join(texts).encode("utf8")).hexdigest()
sha=hashlib.sha256("\n\n".join(texts).encode("utf8")).hexdigest()
note=("81 original numbered chapters of the classical Dao De Jing, in the historic Wang Bi "
 "annotated Chinese edition. Chapter scripture and original third-century commentary are preserved "
 "in displayed source order; this is NOT an English translation, not a clean scripture-only text, "
 "not the Project Gutenberg #7337/Legge edition, and not a manuscript-critical facsimile. "
 "Wikisource rendered HTML navigation/CSS excluded, source punctuation retained, edition revision pinned.")
book={"id":BOOK,"title":"Dao De Jing — Wang Bi Commentary","author":"Laozi (traditional attribution); commentary by Wang Bi",
 "available_languages":"{Chinese}","total_chunks":81,"source_language":"Chinese",
 "description":note,"genre":"Sacred Text","categories":"{Religious,Daoism,Dao De Jing}",
 "status":"draft","access_type":"free","source_version":1,
 "rights_basis":RIGHTS,"rights_evidence_url":license,
 "attribution":"Chinese classical Dao De Jing with historical Wang Bi commentary; Wikisource oldid "+str(M["revision"]),
 "source_url":SOURCE,"source_edition_id":"zh-wikisource-wangbi-dao-de-jing-rev2354026",
 "import_key":"sacred:daoism:dao-de-jing:wang-bi:2354026",
 "checksum":sha,"rights_status":"approved","edition_review_status":"approved",
 "structure_review_status":"approved","cleanup_review_status":"approved",
 "edition_title":"Dao De Jing — Wang Bi original Chinese commentary edition",
 "publisher":"Historical Wang Bi commentary / Wikisource volunteer transcription",
 "content_classification":"religious","translation_generation_policy":"source_only",
 "typography_profile":"standard","authenticity_notes":note,
 "source_revision":str(M["revision"]),"reuse_notice":"Public-domain classical Chinese, historical commentary, attribution and source revision retained; Wikisource terms apply to transcription.",
 "source_file_path":"Wikisource-revision-2354026-extracted-81-chapters","source_file_sha256":sha}
ed={"book_id":BOOK,"language":"Chinese","access_type":"free",
 "provenance_type":"source_text","typography_profile":"standard","authenticity_notes":note,
 "edition_title":book["edition_title"],"publisher":book["publisher"],
 "editor":"Wang Bi, historical Chinese commentary",
 "version_label":"Wikisource oldid 2354026",
 "source_url":SOURCE,"source_edition_id":book["source_edition_id"],
 "rights_basis":RIGHTS,"rights_evidence_url":license,
 "reuse_notice":book["reuse_notice"],"source_file_path":book["source_file_path"],"source_file_sha256":sha}
registry={"id":EDITION,"edition_key":"wikisource:dao-wangbi:chinese:2354026",
 "tradition":"Daoism","collection_title":"Dao De Jing","work_title":"Dao De Jing",
 "edition_title":book["edition_title"],"language":"Chinese",
 "content_role":"scripture","translator_editor":"Wang Bi, historical commentary",
 "publisher":book["publisher"],"version_label":ed["version_label"],
 "source_url":SOURCE,"rights_evidence_url":license,"reuse_status":RIGHTS,
 "source_revision":str(M["revision"]),"package_filename":"Wikisource rendered original Chinese rev2354026",
 "publication_status":"unpublished_structure",
 "unpublished_reason":"staged; exact text and canonical 81 chapter audit pending",
 "book_id":BOOK,"reader_language":"Chinese","notes":note}
save("00_book.sql",ins("books",book))
save("01_edition.sql",ins("book_editions",ed))
save("02_registry.sql",ins("sacred_source_editions",registry))
source_rows=[{"edition_id":EDITION,"source_path":f"chapter-{x['number']:02d}.txt",
 "source_url":SOURCE+"?oldid="+str(M["revision"]),"sha256":x["sha256"],
 "bytes":len(texts[x["number"]-1].encode("utf8")),"file_role":"scripture_and_commentary",
 "preservation_encoding":"UTF-8","source_bytes_preserved":False,"authoritative_text":False,
 "notes":"Extracted from archived Wikisource HTML, NOT original raw source bytes; original Chinese scripture and ancient Wang Bi commentary interleaved."}
 for x in M["chapters"]]
# keep source file roles within DB permitted enum; historical commentary is described in notes
for x in source_rows:x["file_role"]="scripture"
srtypes={"edition_id":"uuid","source_path":"text","source_url":"text","sha256":"text","bytes":"integer",
 "file_role":"text","preservation_encoding":"text","source_bytes_preserved":"boolean","authoritative_text":"boolean","notes":"text"}
save("03_source_files.sql",pack("sacred_source_files",srtypes,source_rows))
chunktypes={"book_id":"uuid","language":"text","chunk_index":"integer","content":"text",
 "status":"text","source_version":"integer","provider":"text"}
nodetypes={"book_id":"uuid","language":"text","source_version":"integer","node_key":"text",
 "parent_node_key":"text","node_type":"text","title":"text","ordinal":"integer",
 "depth":"integer","start_chunk_index":"integer","end_chunk_index":"integer","metadata":"jsonb"}
chunks=[];nodes=[]
for i,(entry,content) in enumerate(zip(M["chapters"],texts)):
 chunks.append({"book_id":BOOK,"language":"Chinese","chunk_index":i,"content":content,
  "status":"published","source_version":1,"provider":"source-import"})
 nodes.append({"book_id":BOOK,"language":"Chinese","source_version":1,
  "node_key":"chapter-"+str(entry["number"]),"parent_node_key":None,
  "node_type":"chapter","title":entry["heading"],
  "ordinal":i,"depth":0,"start_chunk_index":i,"end_chunk_index":i,
  "metadata":{"canonical_ref":"Dao De Jing, Wang Bi chapter "+str(i+1),
   "reference_label":entry["heading"],"reference_kind":"chapter","wikisource_revision":M["revision"],
   "includes_wangbi_commentary":True}})
for n in range(0,81,12):
 save(f"{4+n//12:02d}_chapters.sql",pack("book_chunks",chunktypes,chunks[n:n+12])+"\n"+pack("book_structure_nodes",nodetypes,nodes[n:n+12]))
final=(f"DO $qa$ BEGIN IF (SELECT count(*) FROM public.book_chunks WHERE book_id={lit(BOOK)}::uuid AND language='Chinese')<>81"
 f" OR (SELECT min(chunk_index) FROM public.book_chunks WHERE book_id={lit(BOOK)}::uuid AND language='Chinese')<>0"
 f" OR (SELECT max(chunk_index) FROM public.book_chunks WHERE book_id={lit(BOOK)}::uuid AND language='Chinese')<>80"
 f" OR (SELECT md5(string_agg(content,chr(31) ORDER BY chunk_index)) FROM public.book_chunks WHERE book_id={lit(BOOK)}::uuid AND language='Chinese')<>{lit(md5)}"
 f" OR (SELECT count(*) FROM public.book_structure_nodes WHERE book_id={lit(BOOK)}::uuid AND language='Chinese')<>81"
 " THEN RAISE EXCEPTION 'Dao De Jing Wang Bi edition source parity failed'; END IF;"
 f" UPDATE public.books SET status='published' WHERE id={lit(BOOK)}::uuid AND status='draft';"
 f" UPDATE public.sacred_source_editions SET publication_status='published',unpublished_reason=NULL WHERE id={lit(EDITION)}::uuid AND publication_status='unpublished_structure';"
 " END $qa$;")
save("99_verified_publish.sql",final)
print(json.dumps({"book_id":BOOK,"edition_id":EDITION,"md5":md5,"sha":sha,"chapter_count":81,"sql_files":len(list(OUT.glob("*.sql")))},ensure_ascii=False))
