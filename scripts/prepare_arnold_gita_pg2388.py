#!/usr/bin/env python3
"""Source-pinned import of Sir Edwin Arnold's 1885 poetic Bhagavad Gita, PG #2388.
Original chapter boundaries retained. No AI translation or fake verse alignment.
"""
from pathlib import Path
import hashlib,re,json
SOURCE=Path("C:/Temp/seeparah-arnold-pg2388-20261019.txt")
OUT=Path("C:/Temp/seeparah-arnold-pg2388-sql-20261019")
OUT.mkdir(exist_ok=True)
SRC_SHA="85b22401a9d256179f9a2e407215eb516da9b8213f23c32e03d66709d839a9e0"
assert hashlib.sha256(SOURCE.read_bytes()).hexdigest()==SRC_SHA
original=SOURCE.read_bytes().decode("utf-8-sig","strict")
assert "\ufffd" not in original
start=original.index("*** START OF THE PROJECT GUTENBERG EBOOK")
end=original.index("*** END OF THE PROJECT GUTENBERG EBOOK")
body=original[start:end].replace("\r\n","\n")
roman="I II III IV V VI VII VIII IX X XI XII XIII XIV XV XVI XVII XVIII".split()
pattern=re.compile(r"(?m)^[ \t]*CHAPTER\s+([IVX]+)\s*$")
match=list(pattern.finditer(body))
assert len(match)==18,[(m.group(1),m.start()) for m in match]
assert [m.group(1) for m in match]==roman
BID="e0c836a6-6d04-5914-9196-aeb9871776e9"
EID="8457fd55-4685-4114-9cea-9951ac00993d" # exact existing source-edition registry ID
PG="https://www.gutenberg.org/ebooks/2388"
URL="https://www.gutenberg.org/cache/epub/2388/pg2388.txt"
def lit(v):
 if v is None:return "NULL"
 if isinstance(v,bool):return str(v).lower()
 if isinstance(v,int):return str(v)
 return "'"+str(v).replace("'","''")+"'"
def packed(table,typ,rows):
 blob=json.dumps(rows,ensure_ascii=False,separators=(",",":"))
 assert "$arnold$" not in blob
 return "INSERT INTO public."+table+" ("+",".join(typ)+") SELECT "+",".join("x."+k for k in typ)+" FROM jsonb_to_recordset($arnold$"+blob+"$arnold$::jsonb) AS x("+",".join(k+" "+v for k,v in typ.items())+") ON CONFLICT DO NOTHING;"
def insert(table,fields):
 return "INSERT INTO public."+table+" ("+",".join(fields)+") VALUES ("+",".join(lit(v) for v in fields.values())+") ON CONFLICT DO NOTHING;"
def save(name,q):(OUT/name).write_text(q+"\n",encoding="utf8")
SOURCE_NOTES=("Edwin Arnold's 1885 historical poetic English rendering of Bhagavad Gita, "
              "Project Gutenberg eBook #2388. Eighteen chapters. Not a literal verse-by-verse "
              "translation or a matching recension of the Sanskrit source. Poetry and chapter "
              "headings retained; Gutenberg legal and editorial front matter excluded.")
RIGHTS=("English historical original by Sir Edwin Arnold (1832–1904), first published 1885. "
        "Translation copyright has expired on age-of-author basis; Project Gutenberg "
        "trademark/boilerplate not reproduced.")
ed={"book_id":BID,"language":"English","access_type":"free",
 "provenance_type":"public_domain_translation","typography_profile":"standard",
 "authenticity_notes":SOURCE_NOTES,"edition_title":"The Song Celestial — Edwin Arnold (1885 poetic rendering)",
 "translator":"Sir Edwin Arnold","publisher":"Historical 1885 edition / Project Gutenberg #2388",
 "version_label":"PG #2388 source SHA-256 "+SRC_SHA[:16],"source_url":PG,
 "source_edition_id":"gutenberg:gita:2388","rights_basis":RIGHTS,"rights_evidence_url":PG,
 "reuse_notice":"Poetic adaptation, not a verse-to-verse gloss of the Sanskrit; translator credited.",
 "source_file_path":"pg2388.txt","source_file_sha256":SRC_SHA}
save("00_edition.sql",insert("book_editions",ed))
chunks=[];nodes=[]
for k,m in enumerate(match):
 source_piece=body[m.start():match[k+1].start() if k<17 else len(body)].strip("\n")
 assert len(source_piece)>1900
 stanzas=[part for part in re.split(r"\n{2,}",source_piece) if part.strip()]
 assert len(stanzas)>4,(k,len(stanzas))
 first=len(chunks)
 for p,stanza in enumerate(stanzas):
  idx=len(chunks)
  chunks.append({"book_id":BID,"language":"English","chunk_index":idx,
     "content":stanza,"status":"published","source_version":1,"provider":"source-import"})
  nodes.append({"book_id":BID,"language":"English","source_version":1,
     "node_key":f"arnold-{k+1}-{p+1}","parent_node_key":f"arnold-chapter-{k+1}",
     "node_type":"paragraph","title":None,"ordinal":idx,"depth":1,
     "start_chunk_index":idx,"end_chunk_index":idx,
     "metadata":{"canonical_ref":f"Song Celestial, chapter {roman[k]}, stanza block {p+1}",
                 "reference_kind":"source-stanza"}})
 nodes.append({"book_id":BID,"language":"English","source_version":1,
     "node_key":f"arnold-chapter-{k+1}","parent_node_key":None,
     "node_type":"chapter","title":f"Chapter {roman[k]}","ordinal":k,"depth":0,
     "start_chunk_index":first,"end_chunk_index":len(chunks)-1,
     "metadata":{"canonical_ref":f"Song Celestial Chapter {roman[k]}",
                 "reference_kind":"chapter"}})
assert len(chunks)>100 and len([n for n in nodes if n["depth"]==0])==18
node_types={"book_id":"uuid","language":"text","source_version":"integer","node_key":"text",
  "parent_node_key":"text","node_type":"text","title":"text","ordinal":"integer",
  "depth":"integer","start_chunk_index":"integer","end_chunk_index":"integer","metadata":"jsonb"}
chunk_types={"book_id":"uuid","language":"text","chunk_index":"integer","content":"text",
  "status":"text","source_version":"integer","provider":"text"}
save("01_chapters.sql",packed("book_structure_nodes",node_types,[n for n in nodes if n["depth"]==0]))
pars=[n for n in nodes if n["depth"]==1]
for i in range(0,len(chunks),30):
 q=packed("book_chunks",chunk_types,chunks[i:i+30])+"\n"+packed("book_structure_nodes",node_types,pars[i:i+30])
 save(f"{2+i//30:03d}_chunks.sql",q)
ordered_md5=hashlib.md5(chr(31).join(x["content"] for x in chunks).encode("utf8")).hexdigest()
publish=f"""DO $qa$ BEGIN
IF (SELECT count(*) FROM public.book_chunks WHERE book_id={lit(BID)}::uuid AND language='English')<>{len(chunks)}
OR (SELECT min(chunk_index) FROM public.book_chunks WHERE book_id={lit(BID)}::uuid AND language='English')<>0
OR (SELECT max(chunk_index) FROM public.book_chunks WHERE book_id={lit(BID)}::uuid AND language='English')<>{len(chunks)-1}
OR (SELECT md5(string_agg(content,chr(31) ORDER BY chunk_index)) FROM public.book_chunks WHERE book_id={lit(BID)}::uuid AND language='English')<>{lit(ordered_md5)}
OR (SELECT count(*) FROM public.book_structure_nodes WHERE book_id={lit(BID)}::uuid AND language='English')<>{len(nodes)}
THEN RAISE EXCEPTION 'Arnold #2388 missing or altered text'; END IF;
UPDATE public.books SET available_languages=array_append(available_languages,'English')
 WHERE id={lit(BID)}::uuid AND status='published' AND NOT ('English'=ANY(available_languages));
UPDATE public.sacred_source_editions SET book_id={lit(BID)}::uuid,reader_language='English',
 publication_status='published',unpublished_reason=NULL,source_revision={lit(SRC_SHA)},
 reuse_status={lit(RIGHTS)},notes={lit(SOURCE_NOTES)}
 WHERE edition_key='gutenberg:gita:2388' AND publication_status='unpublished_rights';
END $qa$;"""
save("999_publish.sql",publish)
(OUT/"manifest.json").write_text(json.dumps({"book_id":BID,"source_sha256":SRC_SHA,
 "chunks":len(chunks),"nodes":len(nodes),"ordered_md5":ordered_md5,
 "source_chapters":18,"files":len(list(OUT.glob("*.sql")))},indent=2),encoding="utf8")
print("CREATED",json.dumps({"chunks":len(chunks),"nodes":len(nodes),"md5":ordered_md5,"files":len(list(OUT.glob("*.sql")))}))
