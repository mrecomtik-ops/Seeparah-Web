#!/usr/bin/env python3
"""Lossless UTF-8 Chinese Li Ji reader source from PG ebook 24048. No AI translation."""
from pathlib import Path
import hashlib,re,json,uuid
SRC=Path("C:/Temp/seeparah-liji-pg24048-20261019.txt")
OUT=Path("C:/Temp/seeparah-liji-pg24048-sql-20261019")
OUT.mkdir(exist_ok=True)
SHA="fc429a7ff0d780c115f6d28c010e783805dbd60746f26d7a3b84da691bb247fb"
assert hashlib.sha256(SRC.read_bytes()).hexdigest()==SHA
raw=SRC.read_bytes().decode("utf-8-sig","strict")
assert "\ufffd" not in raw
raw=raw.replace("\r\n","\n")
start=raw.index("*** START OF THE PROJECT GUTENBERG EBOOK")
end=raw.index("*** END OF THE PROJECT GUTENBERG EBOOK")
body=raw[start:end]
matches=list(re.finditer(r"(?m)^[\u3000 \t]*([\u3400-\u9fff]{1,16})第([一二三四五六七八九十百]+)\s*$",body))
assert len(matches)==49
assert matches[0].group(1)=="曲禮上" and matches[-1].group(1)=="喪服四制"
BOOK=str(uuid.uuid5(uuid.NAMESPACE_URL,"seeparah:confucian:liji:project-gutenberg:24048:original-chinese"))
EDITION="888f6456-a7a5-4de4-93ca-e53ee07e06e9"
PG="https://www.gutenberg.org/ebooks/24048"
URL="https://www.gutenberg.org/cache/epub/24048/pg24048.txt"
RIGHTS=("Ancient anonymous Chinese compilation, classical text public domain on age-of-work basis. "
        "Project Gutenberg publisher legal front matter excluded; source eBook identified and attributed.")
NOTES=("Source Chinese text from Project Gutenberg eBook #24048, downloaded 2026-10-19. "
       "Forty-nine numbered original sections, original titles and punctuation retained. "
       "No generated translation, emendations, or scholarly manuscript collation. "
       "Source CRLF converted to LF for display and document blocks split at blank lines.")
def lit(v):
 if v is None:return "NULL"
 if isinstance(v,bool):return str(v).lower()
 if isinstance(v,int):return str(v)
 return "'"+str(v).replace("'","''")+"'"
def insert(table,fields):
 return "INSERT INTO public."+table+" ("+",".join(fields)+") VALUES ("+",".join(lit(v) for v in fields.values())+") ON CONFLICT DO NOTHING;"
def packed(table,typ,rows):
 blob=json.dumps(rows,ensure_ascii=False,separators=(",",":"))
 assert "$liji$" not in blob
 return "INSERT INTO public."+table+" ("+",".join(typ)+") SELECT "+",".join("x."+x for x in typ)+" FROM jsonb_to_recordset($liji$"+blob+"$liji$::jsonb) AS x("+",".join(f"{k} {v}" for k,v in typ.items())+") ON CONFLICT DO NOTHING;"
def save(n,q):(OUT/n).write_text(q+"\n",encoding="utf8")
text_sections=[]
chunks=[]
nodes=[]
for k,m in enumerate(matches):
 sec=body[m.start():matches[k+1].start() if k+1<49 else len(body)].strip("\n")
 assert len(sec)>150
 head=m.group(1)+"第"+m.group(2)
 assert head in sec[:75]
 paras=[x for x in re.split(r"\n{2,}",sec) if x.strip()]
 assert len(paras)>=2,(k,len(paras))
 first=len(chunks)
 for j,part in enumerate(paras,1):
  index=len(chunks)
  chunks.append({"book_id":BOOK,"language":"Chinese","chunk_index":index,
    "content":part,"status":"published","source_version":1,"provider":"source-import"})
  nodes.append({"book_id":BOOK,"language":"Chinese","source_version":1,
    "node_key":f"source-section-{k+1}-block-{j}","parent_node_key":f"source-section-{k+1}",
    "node_type":"paragraph","title":None,"ordinal":index,"depth":1,
    "start_chunk_index":index,"end_chunk_index":index,
    "metadata":{"canonical_ref":f"禮記 {head} · 原文段落 {j}",
      "reference_kind":"source-paragraph"}})
 nodes.append({"book_id":BOOK,"language":"Chinese","source_version":1,
    "node_key":f"source-section-{k+1}","parent_node_key":None,
    "node_type":"chapter","title":head,"ordinal":k,"depth":0,
    "start_chunk_index":first,"end_chunk_index":len(chunks)-1,
    "metadata":{"canonical_ref":f"禮記 {head}","reference_kind":"chapter",
      "source_edition":"PG-24048"}})
 text_sections.append({"section":k+1,"title":head,"chars":len(sec),
   "segments":len(paras),"sha256":hashlib.sha256(sec.encode("utf8")).hexdigest()})
assert len([n for n in nodes if n["depth"]==0])==49
assert sum(x["segments"] for x in text_sections)==len(chunks)
full_md5=hashlib.md5(chr(31).join(x["content"] for x in chunks).encode("utf8")).hexdigest()
han_count=sum(1 for x in chunks for c in x["content"] if "\u3400"<=c<="\u9fff")
assert han_count>85000
book={"id":BOOK,"title":"禮記 (Li Ji — Book of Rites)","author":"Traditional anonymous compilers",
 "available_languages":"{Chinese}","total_chunks":len(chunks),"source_language":"Chinese",
 "description":"The original Chinese Book of Rites (禮記), 49-section traditional compilation, source edition Project Gutenberg #24048. Original wording preserved and no translations generated.",
 "genre":"Sacred Text","categories":"{Religious,Confucian traditions,Book of Rites}",
 "status":"draft","access_type":"free","source_version":1,
 "word_count":han_count,"estimated_reading_minutes":max(1,(han_count+499)//500),
 "rights_basis":RIGHTS,"rights_evidence_url":PG,
 "attribution":"Anonymous classical Chinese 禮記, Project Gutenberg eBook #24048 source-text transcription.",
 "source_url":PG,"source_edition_id":"gutenberg:liji:24048",
 "import_key":"sacred:confucian:liji:original-chinese:gutenberg24048",
 "checksum":SHA,"rights_status":"approved","edition_review_status":"approved",
 "structure_review_status":"approved","cleanup_review_status":"approved",
 "edition_title":"禮記 — original Chinese, Project Gutenberg #24048",
 "publisher":"Classical Chinese source / Project Gutenberg digitization",
 "content_classification":"religious","translation_generation_policy":"source_only",
 "typography_profile":"standard","authenticity_notes":NOTES,
 "source_revision":SHA,"reuse_notice":"Ancient original Chinese text. No AI translation. Publisher source credit retained.",
 "source_file_path":"pg24048.txt","source_file_sha256":SHA}
edition={"book_id":BOOK,"language":"Chinese","access_type":"free",
 "provenance_type":"source_text","typography_profile":"standard",
 "authenticity_notes":NOTES,"edition_title":book["edition_title"],
 "publisher":book["publisher"],"version_label":"Project Gutenberg #24048 SHA-256 "+SHA[:16],
 "source_url":PG,"source_edition_id":book["source_edition_id"],
 "rights_basis":RIGHTS,"rights_evidence_url":PG,"reuse_notice":book["reuse_notice"],
 "source_file_path":"pg24048.txt","source_file_sha256":SHA}
file={"edition_id":EDITION,"source_path":"pg24048.txt","source_url":URL,
 "sha256":SHA,"bytes":len(SRC.read_bytes()),"file_role":"scripture",
 "preservation_encoding":"UTF-8","source_bytes_preserved":True,"authoritative_text":True,
 "notes":"Original Chinese source bytes intact at the publisher URL. Reader excludes Gutenberg legal notice and normalizes CRLF for display; 49 original sections."}
save("00_book.sql",insert("books",book))
save("01_edition.sql",insert("book_editions",edition))
save("02_source.sql",insert("sacred_source_files",file))
cols={"book_id":"uuid","language":"text","source_version":"integer",
 "node_key":"text","parent_node_key":"text","node_type":"text","title":"text",
 "ordinal":"integer","depth":"integer","start_chunk_index":"integer",
 "end_chunk_index":"integer","metadata":"jsonb"}
chunkcols={"book_id":"uuid","language":"text","chunk_index":"integer","content":"text",
 "status":"text","source_version":"integer","provider":"text"}
save("03_sections.sql",packed("book_structure_nodes",cols,[n for n in nodes if n["depth"]==0]))
parts=[n for n in nodes if n["depth"]==1]
for i in range(0,len(chunks),25):
 save(f"{4+i//25:03d}_content.sql",
  packed("book_chunks",chunkcols,chunks[i:i+25])+"\n"+
  packed("book_structure_nodes",cols,parts[i:i+25]))
gate=f"""DO $verify$ BEGIN
IF (SELECT count(*) FROM public.book_chunks WHERE book_id={lit(BOOK)}::uuid AND language='Chinese')<>{len(chunks)}
OR (SELECT min(chunk_index) FROM public.book_chunks WHERE book_id={lit(BOOK)}::uuid AND language='Chinese')<>0
OR (SELECT max(chunk_index) FROM public.book_chunks WHERE book_id={lit(BOOK)}::uuid AND language='Chinese')<>{len(chunks)-1}
OR (SELECT md5(string_agg(content,chr(31) ORDER BY chunk_index)) FROM public.book_chunks WHERE book_id={lit(BOOK)}::uuid AND language='Chinese')<>{lit(full_md5)}
OR (SELECT count(*) FROM public.book_structure_nodes WHERE book_id={lit(BOOK)}::uuid AND language='Chinese')<>{len(nodes)}
THEN RAISE EXCEPTION 'Li Ji PG24048 source checksum/structure mismatch; publication denied'; END IF;
UPDATE public.books SET status='published' WHERE id={lit(BOOK)}::uuid AND status='draft';
UPDATE public.sacred_source_editions SET book_id={lit(BOOK)}::uuid,reader_language='Chinese',
publication_status='published',unpublished_reason=NULL,source_revision={lit(SHA)},
reuse_status={lit(RIGHTS)},notes={lit(NOTES)}
WHERE id={lit(EDITION)}::uuid AND edition_key='gutenberg:liji:24048'
AND publication_status='unpublished_rights';
END $verify$;"""
save("999_publish.sql",gate)
manifest={"book_id":BOOK,"source_sha256":SHA,"chunks":len(chunks),"nodes":len(nodes),
 "han_characters":han_count,"sections":text_sections,"ordered_md5":full_md5}
(OUT/"manifest.json").write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding="utf8")
print(json.dumps({"book_id":BOOK,"sha256":SHA,"chunks":len(chunks),"nodes":len(nodes),"sections":len(text_sections),"han_characters":han_count,"md5":full_md5,"files":len(list(OUT.glob("*.sql")))},ensure_ascii=False))
