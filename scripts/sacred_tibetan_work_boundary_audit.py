#!/usr/bin/env python3
"""Read-only, lossless work-marker index for pinned Esukhia Tibetan archives.

This outputs *candidate* Tohoku boundaries, not an import-ready canonical text.
No Unicode normalization, Tibetan edits, ORM/database operations, or OCR.
"""
from __future__ import annotations
import argparse
import collections
import csv
import hashlib
import json
import re
import zipfile
from pathlib import Path

TOH = re.compile(rb"\{D[0-9]+(?:-[0-9]+)?[a-z]?\}")
FOLIO = re.compile(rb"\[(?:[0-9]+[a-z](?:\.[0-9]+)?)\]")
EXPECTED = {
    "Kangyur": (103, "8d1cc9afe32095344afd8240dfb772fa17ab0cbcba2a89dd3b7da7e4a5af84ca"),
    "Tengyur": (213, "14af177bb47e21030b70b89b2ca6e8e0d3280dbe348bbd2b6ea9f2e32c3fcfce"),
}

def scan(path: Path, corpus: str):
    volumes, rows = [], []
    detected = collections.defaultdict(list)
    full_hash = hashlib.sha256()
    with zipfile.ZipFile(path) as z:
        paths = {n.split("/text/",1)[1]:n for n in z.namelist()
                 if "/text/" in n and n.endswith(".txt")}
        for rel in sorted(paths):
            full_hash.update(rel.encode("utf-8") + b"\0" + hashlib.sha256(z.read(paths[rel])).digest())
        expected_count, fingerprint = EXPECTED[corpus]
        if len(paths) != expected_count or full_hash.hexdigest() != fingerprint:
            raise RuntimeError(f"Acquired snapshot mismatch: {corpus}; refuse analysis")
        for ordinal, rel in enumerate(sorted(paths), 1):
            raw = z.read(paths[rel])
            raw.decode("utf-8-sig", errors="strict")
            marks = list(TOH.finditer(raw))
            pieces = []
            if marks:
                pieces.append((0, marks[0].start(), "", "leading text / continuation"))
                for i, m in enumerate(marks):
                    end = marks[i+1].start() if i+1 < len(marks) else len(raw)
                    pieces.append((m.start(), end, m.group().decode("ascii")[1:-1], "Toh marker candidate"))
            else:
                pieces.append((0, len(raw), "", "unmarked volume / continuation"))
            assert b"".join(raw[start:end] for start,end,_,_ in pieces) == raw
            volumes.append(dict(corpus=corpus, volume=ordinal, source_path=rel, bytes=len(raw),
                sha256=hashlib.sha256(raw).hexdigest(), marker_occurrences=len(marks),
                unmarked_volume=(not marks), unmarked_prefix=(not marks or marks[0].start()>128),
                exact_source_byte_reconstruction=True))
            for idx, (start,end,toh,kind) in enumerate(pieces):
                if end == start: continue
                if toh: detected[toh].append((rel,start))
                preceding = list(FOLIO.finditer(raw[max(0,start-150):start]))
                rows.append(dict(corpus=corpus, source_path=rel, span_ordinal=idx,
                    span_kind=kind, toh_candidate=toh,
                    source_start_byte=start, source_end_byte=end, bytes=end-start,
                    sha256=hashlib.sha256(raw[start:end]).hexdigest(),
                    preceding_folio=preceding[-1].group().decode("ascii") if preceding else "",
                    verified_canonical_work=False))
    duplicate_ids={k:len(v) for k,v in detected.items() if len(v)>1}
    return volumes,rows,dict(corpus=corpus, volumes=len(volumes), marker_occurrences=sum(v["marker_occurrences"] for v in volumes),
        unique_marker_ids=len(detected), volumes_without_markers=sum(v["unmarked_volume"] for v in volumes),
        volumes_with_unmarked_prefix=sum(v["unmarked_prefix"] for v in volumes),
        duplicate_ids=duplicate_ids, fingerprint_sha256=full_hash.hexdigest(), exact_byte_reconstruction=True,
        canonical_work_map_verified=False)

def export(rows, out):
    with out.open("w",encoding="utf-8-sig",newline="") as f:
        writer=csv.DictWriter(f,fieldnames=list(rows[0]))
        writer.writeheader()
        writer.writerows(rows)

def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument("--kangyur",type=Path,required=True)
    p.add_argument("--tengyur",type=Path,required=True)
    p.add_argument("--output",type=Path,required=True)
    args=p.parse_args()
    args.output.mkdir(parents=True,exist_ok=True)
    inventory,spans,summaries=[],[],[]
    for corpus,path in (("Kangyur",args.kangyur),("Tengyur",args.tengyur)):
        vols,markers,summary=scan(path,corpus)
        inventory.extend(vols);spans.extend(markers);summaries.append(summary)
    export(inventory,args.output/"tibetan_source_volume_checksums.csv")
    export(spans,args.output/"tibetan_candidate_work_markers.csv")
    (args.output/"audit_summary.json").write_text(json.dumps(summaries,indent=2,ensure_ascii=False)+"\n",encoding="utf-8")
    print(json.dumps(summaries,ensure_ascii=False),flush=True)
    print("No scripture database, original ZIP bytes or publication flags were changed.",flush=True)

if __name__=="__main__":
    main()
