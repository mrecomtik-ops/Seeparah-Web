#!/usr/bin/env python3
"""Prepare verified publication of Wikisource's 1893 James Legge Confucian Analects.
Only documented extract display blocks; no machine translation or scripture reconstruction.
"""
from pathlib import Path
import json,hashlib,uuid,collections
ROOT=Path(__file__).resolve().parents[1] / "data" / "sacred" / "analects-legge-1893"
OUT=Path("C:/Temp/seeparah-analects-import-20261019")
OUT.mkdir(exist_ok=True)
manifest=json.loads((ROOT/"manifest.json").read_text(encoding="utf8"))
assert len(manifest)==20
assert [x["book"] for x in manifest]==list(range(1,21))
BOOK=str(uuid.uuid5(uuid.NAMESPACE_URL,"seeparah:analects:legge:1893:wikisource:scan-backed-bilingual"))
EDITION=str(uuid.uuid5(uuid.NAMESPACE_URL,"seeparah:analects-edition:legge:1893:wikisource:scan-backed-bilingual"))
SOURCE="https://en.wikisource.org/wiki/The_Chinese_Classics/Volume_1/Confucian_Analects"
LICENSE="https://en.wikisource.org/wiki/Wikisource:Copyright_policy"
RIGHTS="Confucius original ancient Chinese and James Legge historical 1893 Chinese/English edition; Legge died 1897; source transcription via Wikisource, current community markup attributed. No new translation or synthetic scripture."
romans=[x["roman"] for x in manifest]
def lit(v):
 if v is None:return "NULL"
 if isinstance(v,bool):return "true" if v else "false"
 if isinstance(v,int):return str(v)
 return "'"+str(v).replace("'","''")+"'"
def insert(table,fields):
 return "INSERT INTO public."+table+" ("+",".join(fields.keys())+") VALUES ("+",".join(lit(v) for v in fields.values())+") ON CONFLICT DO NOTHING;"
def packed(table,typ,rows):
 data=json.dumps(rows,ensure_ascii=False,separators=(",",":"))
 assert "$analects$" not in data
 return "INSERT INTO public."+table+" ("+",".join(typ)+") SELECT "+",".join("x."+x for x in typ)+" FROM jsonb_to_recordset($analects$"+data+"$analects$::jsonb) AS x("+",".join(f"{k} {v}" for k,v in typ.items())+") ON CONFLICT DO NOTHING;"
def write(name,sql): (OUT/name).write_text(sql+"\n",encoding="utf8")
texts=[]
units=[]
heads=[]
source_files=[]
for x in manifest:
 ix=x["book"]
 b=(ROOT/f"book-{ix:02d}.txt").read_text(encoding="utf8").encode("utf8")
 s=b.decode("utf8")
 assert hashlib.sha256(b).hexdigest()==x["body_sha256"]
 assert len(s)==x["chars"]
 assert any("\u3400"<=c<="\u9fff" for c in s[:50]), (ix,s[:25])
 assert "BOOK" in s or "Book" in s
 parts=s.split("\n\n")
 assert len(parts)==x["segments"] and all(part.strip() for part in parts), (ix,len(parts),x["segments"])
 texts.append(b)
 units.append(parts)
 source_files.append({"edition_id":EDITION,"source_path":f"book-{ix:02d}.txt","source_url":x["source_url"],
  "sha256":x["body_sha256"],"bytes":len(b),"file_role":"bilingual_transcription",
  "preservation_encoding":"UTF-8","source_bytes_preserved":False,"authoritative_text":False,
  "notes":"Wikisource pinned rendered transcription selected direct content blocks; HTML markup removed, paragraph spacing inserted. This SHA fingerprints Seeparah's display extraction, NOT a facsimile or unaltered upstream HTML."})
joined_sha=hashlib.sha256(b"\n\n".join(texts)).hexdigest()
description=("The Confucian Analects (Lunyu), traditional classical Chinese with James Legge's "
 "historical English translation (1893 second-edition line), 20 books. Source: a revision-pinned "
 "Wikisource scan-linked transcription; source punctuation retained in displayed blocks. "
 "Community transcription, not a critical edition. Not the complete Chinese Classics series.")
notes=("Twenty pinned original Wikisource revision IDs and SHA-256 hashes per book; community-rendered "
       "Chinese/English source sections, with only page navigational markup excluded. Attribution: "
       "James Legge (1815–1897), Chinese original is ancient. Not Project Gutenberg ebook #3330 or #4094. "
       "Wikisource contribution licensing acknowledged, no machine translation.")
book={"id":BOOK,"title":"Confucian Analects (Legge bilingual)","author":"Confucius (traditional attribution); James Legge, translator",
  "available_languages":"{Bilingual}","total_chunks":sum(map(len,units)),"source_language":"Bilingual",
  "description":description,"genre":"Sacred Text","categories":"{Religious,Confucian traditions,Analects}",
  "status":"draft","access_type":"free","source_version":1,"rights_basis":RIGHTS,
  "rights_evidence_url":LICENSE,"attribution":"1893 James Legge Chinese/English transcription via English Wikisource (revisions pinned per book).",
  "source_url":SOURCE,"source_edition_id":"wikisource-legge-analects-1893-bilingual",
  "import_key":"sacred:confucian:analects:legge:1893:bilingual:wikisource",
  "checksum":joined_sha,"rights_status":"approved","edition_review_status":"approved",
  "structure_review_status":"approved","cleanup_review_status":"approved",
  "edition_title":"Confucian Analects — Legge 1893 Chinese/English transcription (Wikisource)",
  "publisher":"Historical James Legge edition / Wikisource volunteer transcription",
  "content_classification":"religious","translation_generation_policy":"source_only",
  "typography_profile":"standard","authenticity_notes":notes,
  "source_revision":"20 pinned Wikisource page revision IDs",
  "reuse_notice":"Original Chinese public domain; Legge translation public domain. Wikisource transcription contributors and revision source credited.",
  "source_file_path":"20-display-extractions-from-Wikisource",
  "source_file_sha256":joined_sha}
ed={"book_id":BOOK,"language":"Bilingual","access_type":"free",
  "provenance_type":"source_text","typography_profile":"standard","authenticity_notes":notes,
  "edition_title":book["edition_title"],"translator":"James Legge",
  "publisher":book["publisher"],"version_label":"1893 historical edition; 20 pinned source revisions",
  "source_url":SOURCE,"source_edition_id":book["source_edition_id"],
  "rights_basis":RIGHTS,"rights_evidence_url":LICENSE,
  "reuse_notice":book["reuse_notice"],"source_file_path":book["source_file_path"],
  "source_file_sha256":joined_sha}
src={"id":EDITION,"edition_key":"wikisource:legge:analects:zh-en:1893",
  "tradition":"Confucian traditions","collection_title":"The Chinese Classics Vol. 1",
  "work_title":"Confucian Analects","edition_title":book["edition_title"],
  "language":"Chinese / English","content_role":"scripture",
  "translator_editor":"James Legge (1893)","publisher":book["publisher"],
  "version_label":ed["version_label"],"source_url":SOURCE,"rights_evidence_url":LICENSE,
  "reuse_status":RIGHTS,"source_revision":joined_sha,
  "package_filename":"20-Wikisource-revision-pinned-HTML-content-extractions",
  "publication_status":"unpublished_structure","unpublished_reason":"Reader/import source parity verification pending",
  "book_id":BOOK,"reader_language":"Bilingual","notes":notes}
write("00_stage.sql","\n".join([insert("books",book),insert("book_editions",ed),insert("sacred_source_editions",src)]+[insert("sacred_source_files",r) for r in source_files]))
node_types={"book_id":"uuid","language":"text","source_version":"integer","node_key":"text","parent_node_key":"text",
 "node_type":"text","title":"text","ordinal":"integer","depth":"integer","start_chunk_index":"integer",
 "end_chunk_index":"integer","metadata":"jsonb"}
chunk_types={"book_id":"uuid","language":"text","chunk_index":"integer","content":"text",
 "status":"text","source_version":"integer","provider":"text"}
nodes=[];chunks=[];k=0
for x,parts in zip(manifest,units):
 ix=x["book"];first=k
 for i,text in enumerate(parts,1):
  chunks.append({"book_id":BOOK,"language":"Bilingual","chunk_index":k,
    "content":text,"status":"published","source_version":1,"provider":"source-import"})
  nodes.append({"book_id":BOOK,"language":"Bilingual","source_version":1,
    "node_key":f"book-{ix}-block-{i}","parent_node_key":f"book-{ix}",
    "node_type":"paragraph","title":None,"ordinal":k,"depth":1,
    "start_chunk_index":k,"end_chunk_index":k,
    "metadata":{"canonical_ref":f"Analects Book {x['roman']}, source block {i}",
      "reference_kind":"source-paragraph","reference_label":str(i),
      "source_revision":x["oldid"]}})
  k+=1
 nodes.append({"book_id":BOOK,"language":"Bilingual","source_version":1,
    "node_key":f"book-{ix}","parent_node_key":None,
    "node_type":"chapter","title":f"Book {x['roman']}","ordinal":ix-1,"depth":0,
    "start_chunk_index":first,"end_chunk_index":k-1,
    "metadata":{"canonical_ref":f"Analects Book {x['roman']}",
      "reference_kind":"book","reference_label":f"Book {x['roman']}",
      "source_revision":x["oldid"],"wikisource_url":x["source_url"]}})
write("01_chapters.sql",packed("book_structure_nodes",node_types,[x for x in nodes if x["node_type"]=="chapter"]))
parts=[x for x in nodes if x["node_type"]=="paragraph"]
assert len(chunks)==sum(x["segments"] for x in manifest)
for st in range(0,len(chunks),30):
 sql=packed("book_chunks",chunk_types,chunks[st:st+30])+"\n"+packed("book_structure_nodes",node_types,parts[st:st+30])
 write(f"{2+st//30:03d}_content.sql",sql)
ordered_md5=hashlib.md5(chr(31).join(x["content"] for x in chunks).encode("utf8")).hexdigest()
final=f"""DO $verified$ BEGIN
 IF (SELECT count(*) FROM public.book_chunks WHERE book_id={lit(BOOK)}::uuid AND language='Bilingual')<>{len(chunks)}
 OR (SELECT min(chunk_index) FROM public.book_chunks WHERE book_id={lit(BOOK)}::uuid AND language='Bilingual')<>0
 OR (SELECT max(chunk_index) FROM public.book_chunks WHERE book_id={lit(BOOK)}::uuid AND language='Bilingual')<>{len(chunks)-1}
 OR (SELECT md5(string_agg(content,chr(31) ORDER BY chunk_index)) FROM public.book_chunks WHERE book_id={lit(BOOK)}::uuid AND language='Bilingual')<>{lit(ordered_md5)}
 OR (SELECT count(*) FROM public.book_structure_nodes WHERE book_id={lit(BOOK)}::uuid AND language='Bilingual')<>{len(nodes)}
 THEN RAISE EXCEPTION 'Analects source parity/structure failed; cannot publish'; END IF;
 UPDATE public.books SET status='published' WHERE id={lit(BOOK)}::uuid AND status='draft';
 UPDATE public.sacred_source_editions SET publication_status='published',unpublished_reason=NULL WHERE id={lit(EDITION)}::uuid AND publication_status='unpublished_structure';
 END $verified$;"""
write("999_verify_publish.sql",final)
(OUT/"manifest.json").write_text(json.dumps({"book_id":BOOK,"edition_id":EDITION,"expected_chunks":len(chunks),
 "expected_nodes":len(nodes),"text_sha256":joined_sha,"md5_chunks":ordered_md5,
 "pages":manifest},ensure_ascii=False,indent=2),encoding="utf8")
print(json.dumps({"book_id":BOOK,"edition_id":EDITION,"chunks":len(chunks),"nodes":len(nodes),"files":len(list(OUT.glob("*.sql"))),"md5":ordered_md5},ensure_ascii=False))
