#!/usr/bin/env python3
"""Prepare checksum-verified, reversible, staged WEB Classic NT English edition imports.
Input: publisher's unchanged eng-web_vpl.zip. No translations, normalization, or DDL.
Every target is an existing separately preserved SBL Greek New Testament title.
"""
import collections,hashlib,json,re,zipfile,pathlib,uuid
ZIP=pathlib.Path("C:/Temp/seeparah-web-vpl-20261019.zip")
OUT=pathlib.Path("C:/Temp/seeparah-web-english-nt-import-20261019")
OUT.mkdir(exist_ok=True)
ZIP_SHA=hashlib.sha256(ZIP.read_bytes()).hexdigest()
TXT_SHA="52b92dc6db45070408ea45e4af0957d02b0f2263319a9ea10de7c8cf9e2cd8c4"
SRC="https://ebible.org/find/show.php?id=eng-web"
ZIP_URL="https://ebible.org/Scriptures/eng-web_vpl.zip"
LIC="https://ebible.org/engwebp/copyright.htm"
MAPPING={
"MAT":("Matthew","7bc812fd-6a4d-544e-903f-b2e333a5cc4f"),
"MAR":("Mark","d725cedf-2443-5c10-a68a-0e100a33aecd"),
"LUK":("Luke","dbe08801-dfcf-5c68-8467-7c648f0e36b2"),
"JOH":("John","44b1989e-4ad4-5ff8-a182-9093c07b34b7"),
"ACT":("Acts","85e0097d-643e-5f10-95b5-3d78209914ca"),
"ROM":("Romans","fb88ee5d-f1aa-590e-aaee-9cf2973e48bd"),
"1CO":("1 Corinthians","bdc623a3-7ff9-5946-b936-29b24caa7ddc"),
"2CO":("2 Corinthians","a003620e-f895-5360-9511-259f6a878495"),
"GAL":("Galatians","2ed14267-d2cb-5b47-99c5-44e8e98e98c6"),
"EPH":("Ephesians","2101dd69-3029-5faf-aae3-c58350cfdb2a"),
"PHI":("Philippians","f316bafe-ec15-5ff5-bafa-b23e241275f8"),
"COL":("Colossians","141c4409-0621-5eef-ae73-3ffb0b47697f"),
"1TH":("1 Thessalonians","79cf738a-d76c-5019-b97a-3c92babf9372"),
"2TH":("2 Thessalonians","50aa2ee3-972f-50fb-b3ee-3ee66a12524a"),
"1TI":("1 Timothy","f57e4abb-a873-5659-b2bd-7786abdafd6d"),
"2TI":("2 Timothy","664972ec-50bb-5856-bac9-d1b5c849ef8a"),
"TIT":("Titus","44e046c2-c4ae-500e-ac1b-13b3b6f3d0a1"),
"PHM":("Philemon","da43c1ce-a246-5fef-8f6b-2469822c6033"),
"HEB":("Hebrews","c8276fe4-df2a-5d46-815c-a2e134431ab9"),
"JAM":("James","85e66abf-9fdb-56f8-aed1-ac13b12be217"),
"1PE":("1 Peter","63db3781-4e17-56c2-a4c2-fa3010ee1212"),
"2PE":("2 Peter","139f5b86-2e9d-5ad8-a24e-14734da91d67"),
"1JO":("1 John","13350527-5a9a-5967-beb9-10d42b5ef6f1"),
"2JO":("2 John","adaefccc-1f1f-5ad9-b6a9-fc104d85c0c6"),
"3JO":("3 John","ff0f0225-46fb-5d5c-a721-90c4eaf8de6b"),
"JUD":("Jude","ca7758d3-c6bb-5d2b-a0a4-0e0c91f96949"),
"REV":("Revelation","0f04a44a-fe48-5f59-99f9-36ce801271ee")
}
assert len(MAPPING)==27
with zipfile.ZipFile(ZIP) as z:
 raw=z.read("eng-web_vpl.txt")
 about=z.read("eng-web_about.htm").decode("utf8")
assert hashlib.sha256(raw).hexdigest()==TXT_SHA
assert "BIBLE TEXT ONLY" in about
text=raw.decode("utf8","strict")
assert "\ufffd" not in text
data=collections.defaultdict(list)
for lineno,line in enumerate(text.splitlines(),1):
 m=re.fullmatch(r"([1-4]?[A-Z]{2,4}) (\d+):(\d+) (.*)",line)
 if not m: raise AssertionError(f"Invalid VPL reference on line {lineno}: {line[:120]!r}")
 code,ch,v,t=m.groups()
 if code in MAPPING:data[code].append((int(ch),int(v),t))
assert set(data)==set(MAPPING)
def lit(v):
 if v is None:return "NULL"
 if isinstance(v,bool):return "true" if v else "false"
 if isinstance(v,int):return str(v)
 return "'"+str(v).replace("'","''")+"'"
def insert(table,obj):
 return "INSERT INTO public."+table+" ("+",".join(obj)+") VALUES ("+",".join(lit(v) for v in obj.values())+") ON CONFLICT DO NOTHING;"
def jsoninsert(table,types,rows):
 payload=json.dumps(rows,ensure_ascii=False,separators=(",",":"))
 return ("INSERT INTO public."+table+" ("+",".join(types)+") SELECT "+",".join("x."+n for n in types)+
  " FROM jsonb_to_recordset($web$"+payload+"$web$::jsonb) AS x("+",".join(k+" "+v for k,v in types.items())+") ON CONFLICT DO NOTHING;")
def save(name,script): (OUT/name).write_text(script+"\n",encoding="utf8")
chunks_type={"book_id":"uuid","language":"text","chunk_index":"integer","content":"text","status":"text","source_version":"integer","provider":"text"}
node_types={"book_id":"uuid","language":"text","source_version":"integer","node_key":"text","parent_node_key":"text",
 "node_type":"text","title":"text","ordinal":"integer","depth":"integer","start_chunk_index":"integer",
 "end_chunk_index":"integer","metadata":"jsonb"}
manifest={"source_url":ZIP_URL,"zip_sha256":ZIP_SHA,"text_sha256":TXT_SHA,"book_count":27,"books":[]}
for code,(title,bid) in MAPPING.items():
 source_verses=data[code]
 assert len(source_verses)==len(set((ch,v) for ch,v,_ in source_verses))
 assert source_verses==sorted(source_verses,key=lambda x:(x[0],x[1]))
 missing=[f"{ch}:{v}" for ch,v,t in source_verses if not t.strip()]
 # Source VPL contains intentionally blank numbered entries; retain metadata but never invent their words
 verses=[(ch,v,t) for ch,v,t in source_verses if t.strip()]
 assert len(verses)>=13
 eid=str(uuid.uuid5(uuid.NAMESPACE_URL,"seeparah:web-classic:nt:"+code+":engweb"))
 sub=OUT/code;sub.mkdir(exist_ok=True)
 # edition metadata inserted as unpublished, so partial batches never leak into published language selection
 source_note=("World English Bible Classic, public domain, eBible.org official verse-per-line edition; "
 "no headings, notes, or paragraph styles in this source file; original words/punctuation preserved. "
 "Blank publisher placeholders omitted, not replaced: "+(", ".join(missing) if missing else "none")+". "
 "Separate from SBLGNT Greek; no claim of identical textual variant or verse alignment.")
 registry={"id":eid,"edition_key":"ebible:web-classic:"+code+":english",
 "tradition":"Christianity","collection_title":"World English Bible Classic New Testament",
 "work_title":title,"edition_title":"World English Bible Classic English (eBible.org VPL)",
 "language":"English","content_role":"translation","translator_editor":"World English Bible translation team",
 "publisher":"eBible.org","version_label":"official WEB Classic VPL package pinned SHA-256 "+TXT_SHA[:16],
 "source_url":SRC,"rights_evidence_url":LIC,
 "reuse_status":"eBible.org marks World English Bible Classic public domain; retain edition and trademark distinction.",
 "source_revision":TXT_SHA,"package_filename":"eng-web_vpl.zip","package_sha256":ZIP_SHA,
 "publication_status":"unpublished_structure","unpublished_reason":"Staged import; all source units and independent reader structure must pass verification.",
 "book_id":bid,"reader_language":"English","notes":source_note}
 sf={"edition_id":eid,"source_path":"eng-web_vpl.txt","source_url":ZIP_URL,"sha256":TXT_SHA,
 "bytes":len(raw),"file_role":"translation","preservation_encoding":"UTF-8",
 "source_bytes_preserved":True,"authoritative_text":True,
 "notes":f"WEB Classic plain-text export including all Bible books; only {code} lines selected without textual rewriting."}
 save(str(code)+"/00_stage.sql",insert("sacred_source_editions",registry)+"\n"+insert("sacred_source_files",sf))
 counts=collections.Counter(ch for ch,v,t in verses)
 chapter_nodes=[];all_chunks=[];all_nodes=[];idx=0
 for chap in sorted(counts):
  rows=[(c,v,t) for c,v,t in verses if c==chap]
  first=idx
  for c,v,t in rows:
   all_chunks.append({"book_id":bid,"language":"English","chunk_index":idx,
    "content":t,"status":"published","source_version":1,"provider":"source-import"})
   all_nodes.append({"book_id":bid,"language":"English","source_version":1,
    "node_key":f"verse-{chap}-{v}","parent_node_key":f"chapter-{chap}",
    "node_type":"paragraph","title":None,"ordinal":idx,"depth":1,
    "start_chunk_index":idx,"end_chunk_index":idx,
    "metadata":{"canonical_ref":f"{title} {chap}:{v}","reference_label":f"{chap}:{v}",
      "reference_kind":"verse","reference_path":[{"kind":"chapter","label":"Chapter","value":str(chap)},
       {"kind":"verse","label":"Verse","value":str(v)}]}})
   idx+=1
  chapter_nodes.append({"book_id":bid,"language":"English","source_version":1,
   "node_key":f"chapter-{chap}","parent_node_key":None,
   "node_type":"chapter","title":f"Chapter {chap}","ordinal":chap-1,"depth":0,
   "start_chunk_index":first,"end_chunk_index":idx-1,
   "metadata":{"canonical_ref":f"{title} {chap}","reference_label":f"Chapter {chap}",
    "reference_kind":"chapter","reference_path":[{"kind":"chapter","label":"Chapter","value":str(chap)}]}})
 assert idx==len(verses)
 save(str(code)+"/01_chapters.sql",jsoninsert("book_structure_nodes",node_types,chapter_nodes))
 for start in range(0,len(verses),35):
  q=(jsoninsert("book_chunks",chunks_type,all_chunks[start:start+35])+"\n"+
  jsoninsert("book_structure_nodes",node_types,all_nodes[start:start+35]))
  save(str(code)+"/"+f"{2+start//35:03d}"+"_verses.sql",q)
 md5=hashlib.md5(chr(31).join(t for _,_,t in verses).encode("utf8")).hexdigest()
 gate=("DO $qa$ BEGIN IF "
  f"(SELECT count(*) FROM public.book_chunks WHERE book_id={lit(bid)}::uuid AND language='English') <> {len(verses)} OR "
  f"(SELECT min(chunk_index) FROM public.book_chunks WHERE book_id={lit(bid)}::uuid AND language='English') <> 0 OR "
  f"(SELECT max(chunk_index) FROM public.book_chunks WHERE book_id={lit(bid)}::uuid AND language='English') <> {len(verses)-1} OR "
  f"(SELECT md5(string_agg(content,chr(31) order by chunk_index)) FROM public.book_chunks WHERE book_id={lit(bid)}::uuid AND language='English') <> {lit(md5)} OR "
  f"(SELECT count(*) FROM public.book_structure_nodes WHERE book_id={lit(bid)}::uuid AND language='English') <> {len(verses)+len(chapter_nodes)} "
  "THEN RAISE EXCEPTION 'WEB Classic original-verse parity/structure check failed'; END IF; ")
 finalize={"book_id":bid,"language":"English","access_type":"free",
  "provenance_type":"public_domain_translation","typography_profile":"standard","authenticity_notes":source_note,
  "edition_title":"World English Bible Classic (eBible.org original plain-text verse file)",
  "translator":"World English Bible translation team","publisher":"eBible.org",
  "version_label":"source SHA-256 "+TXT_SHA[:16],"source_url":SRC,
  "source_edition_id":"web-classic-vpl-"+code,
  "rights_basis":"World English Bible Classic public domain; name is an eBible.org trademark.",
  "rights_evidence_url":LIC,
  "reuse_notice":"Public-domain WEB Classic. All reader text preserved as provided by eBible.org; VPL omits editorial headings, notes and layout.",
  "source_file_path":"eng-web_vpl.txt","source_file_sha256":TXT_SHA}
 gate+=insert("book_editions",finalize)+" "
 gate+=("UPDATE public.books SET available_languages=array_append(available_languages,'English') "
  f"WHERE id={lit(bid)}::uuid AND NOT ('English'=ANY(available_languages)); "
  "UPDATE public.sacred_source_editions SET publication_status='published',unpublished_reason=NULL "
  f"WHERE id={lit(eid)}::uuid AND publication_status='unpublished_structure'; END $qa$;")
 save(str(code)+"/999_verify_publish.sql",gate)
 manifest["books"].append({"code":code,"title":title,"book_id":bid,"edition_id":eid,
  "source_lines":len(source_verses),"imported_verses":len(verses),"blank_source_references":missing,
  "chapters":len(chapter_nodes),"md5":md5,
  "file_count":len(list(sub.glob("*.sql"))),"files":[x.name for x in sorted(sub.glob("*.sql"))]})
(OUT/"manifest.json").write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding="utf8")
print(json.dumps({"books":27,"total_verses":sum(x["imported_verses"] for x in manifest["books"]),
 "total_sql_files":sum(x["file_count"] for x in manifest["books"]),
 "total_blanks":sum(len(x["blank_source_references"]) for x in manifest["books"]),
 "source_hash":TXT_SHA,"details":[(x["code"],x["imported_verses"],x["file_count"]) for x in manifest["books"]]}))
