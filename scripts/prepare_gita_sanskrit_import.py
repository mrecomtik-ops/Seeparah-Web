import json, hashlib, pathlib, uuid, collections
from json import dumps
root=pathlib.Path("C:/Temp")
rev="c6fce39595445768876ddbb8d1268a9c935e1d2b"
source="https://github.com/gita/gita/tree/"+rev
url="https://raw.githubusercontent.com/gita/gita/"+rev+"/data/"
vr=(root/"gita-verses-20261017.json").read_bytes()
cr=(root/"gita-chapters-20261017.json").read_bytes()
li=(root/"gita-license-20261017.txt").read_bytes()
vsha="bb599e666e552bd65080f1f8da6d488f067237f64091ab265978861cf3fadec7"
csha="d435d980cef34fcb5529b2fa4c3e3ff617df44080094d22481b884299cc14dc9"
assert hashlib.sha256(vr).hexdigest()==vsha and hashlib.sha256(cr).hexdigest()==csha
assert b"This is free and unencumbered software released into the public domain." in li
verses=json.loads(vr); chapters=json.loads(cr)
assert len(verses)==701 and len(chapters)==18
counts=collections.Counter(x["chapter_number"] for x in verses)
assert [counts[n] for n in range(1,19)]==[47,72,43,42,29,47,30,28,34,42,55,20,35,27,20,24,28,78]
assert [x["verse_order"] for x in verses]==list(range(1,702))
assert len(set((x["chapter_number"],x["verse_number"]) for x in verses))==701
assert all(x["text"].strip() and any("\u0900"<=q<="\u097f" for q in x["text"]) for x in verses)
for n in range(1,19):
  assert [x["verse_number"] for x in verses if x["chapter_number"]==n]==list(range(1,counts[n]+1))
  assert chapters[n-1]["verses_count"]==counts[n]
bid=str(uuid.uuid5(uuid.NAMESPACE_URL,"seeparah:gita-gita:"+rev))
eid=str(uuid.uuid5(uuid.NAMESPACE_URL,"seeparah:gita-gita:edition:"+rev))
out=root/"seeparah-gita-sanskrit-import-20261017";out.mkdir(exist_ok=True)
def lit(s):
  return "NULL" if s is None else "'"+str(s).replace("'","''")+"'"
def insert(tab, d):
  return "INSERT INTO public."+tab+" ("+",".join(d)+") VALUES ("+",".join(lit(v) for v in d.values())+") ON CONFLICT DO NOTHING;"
def recordset(tab,cols,types,rows):
  payload=dumps(rows,ensure_ascii=False,separators=(",",":"))
  return ("INSERT INTO public."+tab+" ("+",".join(cols)+") SELECT "+
          ",".join("x."+k for k in cols)+" FROM jsonb_to_recordset($gita$"+
          payload+"$gita$::jsonb) AS x("+",".join(k+" "+types[k] for k in cols)+") ON CONFLICT DO NOTHING;")
def write(name, text):
  (out/name).write_text(text+"\n",encoding="utf8")
source_note=("Sanskrit original, gita/gita Unlicense dataset pinned at "+rev+
 ". Contains 701 numbered verse units, including 35 in chapter 13 (an edition-specific numbering variant). No translations or commentary imported.")
rights="Ancient Sanskrit original; source dataset released under The Unlicense; retain source/edition provenance."
book={"id":bid,"title":"Bhagavad Gita","author":"Traditional Sanskrit scripture",
 "available_languages":"{Sanskrit}","total_chunks":701,"source_language":"Sanskrit",
 "description":source_note,"genre":"Sacred Text","status":"draft","access_type":"free",
 "source_version":1,"rights_basis":rights,"rights_evidence_url":"https://github.com/gita/gita/blob/"+rev+"/LICENSE",
 "attribution":"gita/gita Bhagavad Gita in JSON; pinned original Sanskrit source "+rev,
 "source_url":source,"source_edition_id":"gita-gita-sanskrit-"+rev[:12],
 "categories":"{Religious,Hinduism,Bhagavad Gita}",
 "import_key":"sacred:hinduism:bhagavad-gita:gita-gita:"+rev,
 "checksum":vsha,"rights_status":"approved","edition_review_status":"approved",
 "structure_review_status":"approved","cleanup_review_status":"approved",
 "edition_title":"gita/gita Sanskrit (701-unit edition)",
 "publisher":"gita/gita open-source contributors","content_classification":"religious",
 "translation_generation_policy":"source_only","typography_profile":"standard",
 "authenticity_notes":source_note,"source_revision":rev,
 "reuse_notice":"The Unlicense. No generated translations; source and edition credited.",
 "source_file_path":"data/verse.json","source_file_sha256":vsha}
ed={"book_id":bid,"language":"Sanskrit","access_type":"free","provenance_type":"source_text",
 "typography_profile":"standard","authenticity_notes":source_note,
 "edition_title":book["edition_title"],"publisher":"gita/gita open-source contributors",
 "version_label":rev[:12],"source_url":source,"source_edition_id":book["source_edition_id"],
 "rights_basis":rights,"rights_evidence_url":book["rights_evidence_url"],
 "reuse_notice":book["reuse_notice"],"source_file_path":"data/verse.json","source_file_sha256":vsha}
registry={"id":eid,"edition_key":"gita-gita:sanskrit:"+rev[:12],"tradition":"Hinduism",
 "collection_title":"Bhagavad Gita","work_title":"Bhagavad Gita","edition_title":book["edition_title"],
 "language":"Sanskrit","content_role":"scripture","publisher":"gita/gita open-source contributors",
 "version_label":rev[:12],"source_url":source,"rights_evidence_url":book["rights_evidence_url"],
 "reuse_status":rights,"source_revision":rev,"package_filename":"gita-gita-pinned-json",
 "publication_status":"unpublished_structure","unpublished_reason":"Staged import; verification pending.",
 "book_id":bid,"reader_language":"Sanskrit","notes":source_note}
files=[
 {"edition_id":eid,"source_path":"data/verse.json","source_url":url+"verse.json",
  "sha256":vsha,"bytes":len(vr),"file_role":"scripture","preservation_encoding":"UTF-8",
  "source_bytes_preserved":True,"authoritative_text":True},
 {"edition_id":eid,"source_path":"data/chapters.json","source_url":url+"chapters.json",
  "sha256":csha,"bytes":len(cr),"file_role":"metadata","preservation_encoding":"UTF-8",
  "source_bytes_preserved":True,"authoritative_text":False}
]
for r in files:
 for k in ["source_bytes_preserved","authoritative_text"]:
  r[k]=str(r[k]).lower()
write("00_prepare.sql","\n".join([insert("books",book),insert("book_editions",ed),
 insert("sacred_source_editions",registry)]+[insert("sacred_source_files",x) for x in files]))
first,last={},{}
for i,x in enumerate(verses):
 c=x["chapter_number"];first.setdefault(c,i);last[c]=i
node_type={"book_id":"uuid","language":"text","source_version":"int","node_key":"text",
 "parent_node_key":"text","node_type":"text","title":"text","ordinal":"int","depth":"int",
 "start_chunk_index":"int","end_chunk_index":"int","metadata":"jsonb"}
chapter_rows=[]
for chapter in chapters:
 n=chapter["chapter_number"]
 chapter_rows.append({"book_id":bid,"language":"Sanskrit","source_version":1,
 "node_key":"chapter-"+str(n),"parent_node_key":None,"node_type":"chapter",
 "title":chapter["name"],"ordinal":n-1,"depth":0,
 "start_chunk_index":first[n],"end_chunk_index":last[n],
 "metadata":{"canonical_ref":"Bhagavad Gita "+str(n),"reference_kind":"chapter",
 "reference_label":"Chapter "+str(n),"reference_path":[{"kind":"chapter","label":"Chapter","value":str(n)}]}})
write("01_chapters.sql",recordset("book_structure_nodes",list(node_type),node_type,chapter_rows))
chunk_type={"book_id":"uuid","language":"text","chunk_index":"int","content":"text",
 "status":"text","source_version":"int","provider":"text"}
for start in range(0,701,25):
 chunks=[];nodes=[]
 for i in range(start,min(start+25,701)):
  x=verses[i];n=x["chapter_number"];v=x["verse_number"]
  chunks.append({"book_id":bid,"language":"Sanskrit","chunk_index":i,
   "content":x["text"],"status":"published","source_version":1,"provider":"source-import"})
  nodes.append({"book_id":bid,"language":"Sanskrit","source_version":1,
   "node_key":"verse-"+str(n)+"-"+str(v),"parent_node_key":"chapter-"+str(n),
   "node_type":"paragraph","title":None,"ordinal":i,"depth":1,
   "start_chunk_index":i,"end_chunk_index":i,
   "metadata":{"canonical_ref":f"Bhagavad Gita {n}:{v}","reference_kind":"verse",
    "reference_label":f"{n}:{v}","reference_path":[
      {"kind":"chapter","label":"Chapter","value":str(n)},
      {"kind":"verse","label":"Verse","value":str(v)}]}})
 write(f"{2+start//25:02d}_verses.sql",
   recordset("book_chunks",list(chunk_type),chunk_type,chunks)+"\n"+
   recordset("book_structure_nodes",list(node_type),node_type,nodes))
md5=hashlib.md5(chr(31).join(x["text"] for x in verses).encode("utf8")).hexdigest()
write("99_verify_publish.sql",
 "DO $check$ BEGIN IF (SELECT count(*) FROM public.book_chunks WHERE book_id="+lit(bid)+"::uuid AND language='Sanskrit') <> 701"+
 " OR (SELECT min(chunk_index) FROM public.book_chunks WHERE book_id="+lit(bid)+"::uuid AND language='Sanskrit') <> 0"+
 " OR (SELECT max(chunk_index) FROM public.book_chunks WHERE book_id="+lit(bid)+"::uuid AND language='Sanskrit') <> 700"+
 " OR (SELECT md5(string_agg(content,chr(31) ORDER BY chunk_index)) FROM public.book_chunks WHERE book_id="+lit(bid)+"::uuid AND language='Sanskrit') <> "+lit(md5)+
 " OR (SELECT count(*) FROM public.book_structure_nodes WHERE book_id="+lit(bid)+"::uuid AND language='Sanskrit') <> 719"+
 " THEN RAISE EXCEPTION 'Gita source integrity or structure mismatch; publication denied'; END IF; "+
 " UPDATE public.books SET status='published' WHERE id="+lit(bid)+"::uuid AND status='draft';"+
 " UPDATE public.sacred_source_editions SET publication_status='published',unpublished_reason=NULL WHERE id="+lit(eid)+"::uuid AND publication_status='unpublished_structure'; END $check$;")
print(dumps({"book_id":bid,"edition_id":eid,"source_sha256":vsha,
 "ordered_content_md5":md5,"records":701,"chapters":18,"files":len(list(out.glob("*.sql"))),
 "largest_sql_bytes":max(f.stat().st_size for f in out.glob("*.sql"))},ensure_ascii=False))
