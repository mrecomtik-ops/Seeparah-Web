#!/usr/bin/env python3
"""Fail-closed original Project Gutenberg #3330 / James Legge English Analects import.

Existing multilingual Analects reader is preserved; this adds separately attributed
English chunks. No invented translation, no PG legal/publisher boilerplate in scripture.
"""
from pathlib import Path
import hashlib, re, json, collections
SRC=Path("C:/Temp/seeparah-legge-pg3330-20261019.txt")
OUT=Path("C:/Temp/seeparah-legge-pg3330-sql-20261019")
OUT.mkdir(exist_ok=True)
PG_SHA="a42433a069290280b52f13cd5832a74aa6ecd6cd4e881fa572ccb34e92e5807a"
BOOK="898fc232-957e-52e6-8339-01a38c2a9da8"
EDITION="f55e2ef5-c9bf-428f-8785-08cbfd8adc84"
SOURCE_URL="https://www.gutenberg.org/ebooks/3330"
SOURCE_TEXT_URL="https://www.gutenberg.org/cache/epub/3330/pg3330.txt"
assert hashlib.sha256(SRC.read_bytes()).hexdigest()==PG_SHA,"Publisher source changed"
raw=SRC.read_bytes().decode("utf-8-sig","strict")
assert "\ufffd" not in raw
startmarker="*** START OF THE PROJECT GUTENBERG EBOOK"
endmarker="*** END OF THE PROJECT GUTENBERG EBOOK"
start=raw.index(startmarker)
end=raw.index(endmarker)
body=raw[start:end].replace("\r\n","\n")
matches=list(re.finditer(r"(?m)^BOOK\s+([IVXLCDM]+)\.\s+",body))
ROMANS="I II III IV V VI VII VIII IX X XI XII XIII XIV XV XVI XVII XVIII XIX XX".split()
assert len(matches)==20,[(m.group(1),m.start()) for m in matches]
assert [m.group(1) for m in matches]==ROMANS,"Missing/reordered Analects books"
chapter_re=re.compile(r"(?m)^[ \t]*(?:CHAPTER|CHAP\.?)\s+([IVXLCDM]+)(?:[.\s])")
texts=[]
nodes=[]
chapter_count=0
book_manifest=[]
for k,m in enumerate(matches):
    bstart=m.start()
    bend=matches[k+1].start() if k+1<20 else len(body)
    section=body[bstart:bend]
    assert len(section)>1500
    chs=list(chapter_re.finditer(section))
    assert len(chs)>=3,(k+1,len(chs))
    # Preserve publisher punctuation and midline spacing. Text is only split on
    # publisher's visible chapter markers. Original CRLF normalized to LF.
    boundary=[0]+[c.start() for c in chs if c.start()>0]+[len(section)]
    boundary=sorted(set(boundary))
    ordinal_start=len(texts)
    for i in range(len(boundary)-1):
        snippet=section[boundary[i]:boundary[i+1]].strip("\n")
        if not snippet.strip():continue
        assert "\ufffd" not in snippet
        idx=len(texts)
        texts.append(snippet)
        nodes.append({"book_id":BOOK,"language":"English","source_version":1,
          "node_key":f"source-book-{k+1}-part-{i+1}","parent_node_key":f"source-book-{k+1}",
          "node_type":"paragraph","title":None,"ordinal":idx,"depth":1,
          "start_chunk_index":idx,"end_chunk_index":idx,
          "metadata":{"canonical_ref":f"Analects, Book {ROMANS[k]}, source section {i+1}",
                      "reference_kind":"source-section","source_ebook":"3330"}})
    assert len(texts)>ordinal_start
    nodes.append({"book_id":BOOK,"language":"English","source_version":1,
      "node_key":f"source-book-{k+1}","parent_node_key":None,"node_type":"chapter",
      "title":f"Book {ROMANS[k]}","ordinal":k,"depth":0,
      "start_chunk_index":ordinal_start,"end_chunk_index":len(texts)-1,
      "metadata":{"canonical_ref":f"Analects Book {ROMANS[k]}",
                  "reference_kind":"book","source_ebook":"3330"}})
    book_manifest.append({"book":k+1,"roman":ROMANS[k],"source_chars":len(section),
                          "chunks":len(texts)-ordinal_start,
                          "sha256":hashlib.sha256(section.encode("utf8")).hexdigest()})
    chapter_count+=len(chs)
assert all(len(t.strip())>=5 for t in texts)
assert sum(x["chunks"] for x in book_manifest)==len(texts)
ordered_md5=hashlib.md5(chr(31).join(texts).encode("utf8")).hexdigest()
reader_sha=hashlib.sha256(chr(31).join(texts).encode("utf8")).hexdigest()
def lit(value):
    if value is None:return "NULL"
    if isinstance(value,bool):return str(value).lower()
    if isinstance(value,int):return str(value)
    return "'"+str(value).replace("'","''")+"'"
def jsoninsert(table,cols,rows):
    blob=json.dumps(rows,ensure_ascii=False,separators=(",",":"))
    assert "$legge$" not in blob
    return "INSERT INTO public."+table+" ("+",".join(cols)+") SELECT "+",".join("x."+k for k in cols)+" FROM jsonb_to_recordset($legge$"+blob+"$legge$::jsonb) AS x("+",".join(f"{k} {v}" for k,v in cols.items())+") ON CONFLICT DO NOTHING;"
def save(n,s):(OUT/n).write_text(s+"\n",encoding="utf8")
RIGHTS="James Legge (1815–1897) historical English translation, first published during the nineteenth century, is public domain on age-of-author basis. Project Gutenberg #3330 publisher header/license excluded from display; accurate attribution retained."
NOTES=("English translation-only transcription from Project Gutenberg eBook #3330, source hash "+PG_SHA+
       ". 20 books of the Confucian Analects, not the entire Chinese Classics series. "
       "No Chinese original, textual apparatus or Legge notes supplied by this English-only file. "
       "Publisher line endings normalized and verse display segmented on extant chapter labels; wording preserved.")
row={
 "book_id":BOOK,"language":"English","access_type":"free",
 "provenance_type":"public_domain_translation","typography_profile":"standard",
 "authenticity_notes":NOTES,
 "edition_title":"The Analects of Confucius — James Legge historical English (Project Gutenberg #3330)",
 "translator":"James Legge","publisher":"Historical Legge English edition; sourced from Project Gutenberg",
 "version_label":"PG #3330 UTF-8 eBook, downloaded 2026-10-19, SHA-256 "+PG_SHA[:16],
 "source_url":SOURCE_URL,"source_edition_id":"gutenberg:analects:3330",
 "rights_basis":RIGHTS,"rights_evidence_url":SOURCE_URL,
 "reuse_notice":"Historical public-domain James Legge translation. Seeparah is not affiliated with or endorsed by Project Gutenberg.",
 "source_file_path":"pg3330.txt","source_file_sha256":PG_SHA
}
stage=("INSERT INTO public.book_editions ("+",".join(row)+") VALUES ("+
       ",".join(lit(x) for x in row.values())+") ON CONFLICT DO NOTHING;")
save("00_edition.sql",stage)
files={"edition_id":EDITION,"source_path":"pg3330.txt","source_url":SOURCE_TEXT_URL,"sha256":PG_SHA,
       "bytes":len(SRC.read_bytes()),"file_role":"translation","preservation_encoding":"UTF-8",
       "source_bytes_preserved":True,"authoritative_text":True,
       "notes":"Original source bytes SHA verified; only public-domain historical English translation displayed, minus Project Gutenberg boilerplate."}
save("01_source.sql","INSERT INTO public.sacred_source_files ("+",".join(files)+") VALUES ("+
     ",".join(lit(x) for x in files.values())+") ON CONFLICT DO NOTHING;")
node_cols={"book_id":"uuid","language":"text","source_version":"integer","node_key":"text",
           "parent_node_key":"text","node_type":"text","title":"text","ordinal":"integer",
           "depth":"integer","start_chunk_index":"integer","end_chunk_index":"integer",
           "metadata":"jsonb"}
chunk_cols={"book_id":"uuid","language":"text","chunk_index":"integer","content":"text",
            "status":"text","source_version":"integer","provider":"text"}
chapters=[n for n in nodes if n["depth"]==0]
paragraphs=[n for n in nodes if n["depth"]==1]
assert len(paragraphs)==len(texts) and len(chapters)==20
save("02_books.sql",jsoninsert("book_structure_nodes",node_cols,chapters))
for i in range(0,len(texts),24):
    rows=[{"book_id":BOOK,"language":"English","chunk_index":j,
           "content":texts[j],"status":"published","source_version":1,
           "provider":"source-import"} for j in range(i,min(i+24,len(texts)))]
    stmt=jsoninsert("book_chunks",chunk_cols,rows)+"\n"+jsoninsert("book_structure_nodes",node_cols,paragraphs[i:i+24])
    save(f"{3+i//24:03d}_chunks.sql",stmt)
publish=f"""DO $final$ BEGIN
IF (SELECT count(*) FROM public.book_chunks WHERE book_id={lit(BOOK)}::uuid AND language='English')<>{len(texts)}
OR (SELECT min(chunk_index) FROM public.book_chunks WHERE book_id={lit(BOOK)}::uuid AND language='English')<>0
OR (SELECT max(chunk_index) FROM public.book_chunks WHERE book_id={lit(BOOK)}::uuid AND language='English')<>{len(texts)-1}
OR (SELECT md5(string_agg(content,chr(31) ORDER BY chunk_index)) FROM public.book_chunks WHERE book_id={lit(BOOK)}::uuid AND language='English')<>{lit(ordered_md5)}
OR (SELECT count(*) FROM public.book_structure_nodes WHERE book_id={lit(BOOK)}::uuid AND language='English')<>{len(nodes)}
THEN RAISE EXCEPTION 'Legge #3330 original-source parity/structure validation failed'; END IF;
UPDATE public.books SET available_languages=array_append(available_languages,'English')
WHERE id={lit(BOOK)}::uuid AND status='published' AND NOT ('English'=ANY(available_languages));
UPDATE public.sacred_source_editions SET
book_id={lit(BOOK)}::uuid,reader_language='English',
publication_status='published',unpublished_reason=NULL,
reuse_status={lit(RIGHTS)},source_revision={lit(PG_SHA)},
notes={lit(NOTES)}
WHERE id={lit(EDITION)}::uuid AND edition_key='gutenberg:analects:3330'
AND publication_status='unpublished_rights';
END $final$;"""
save("999_publish.sql",publish)
manifest={"source":"Project Gutenberg #3330","source_sha256":PG_SHA,"reader_sha256":reader_sha,
          "ordered_md5":ordered_md5,"book_id":BOOK,"edition_id":EDITION,
          "total_chunks":len(texts),"nodes":len(nodes),"source_chapter_markers":chapter_count,
          "books":book_manifest,"files":len(list(OUT.glob("*.sql")))}
(OUT/"manifest.json").write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding="utf8")
print(json.dumps({k:v for k,v in manifest.items() if k not in ["books"]},indent=2))
