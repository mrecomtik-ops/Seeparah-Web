#!/usr/bin/env python3
"""Generate an exact, independently checkable index of pinned Tibetan source volumes.

No scripture text is changed, imported, converted, or bundled; sources stay in pinned
upstream files. Output manifest contains only identity, provenance, counts and checksums.
"""
from __future__ import annotations
import argparse
import hashlib
import json
import re
import zipfile
from pathlib import Path

SOURCES = {
    "Kangyur": {
        "rev": "a582cf471b7c85a101035071078032f106a8e536",
        "expected_volumes": 103,
        "fingerprint": "8d1cc9afe32095344afd8240dfb772fa17ab0cbcba2a89dd3b7da7e4a5af84ca",
        "repo": "derge-kangyur",
    },
    "Tengyur": {
        "rev": "174653137d62af481f53c6ae3dc842bf8629323e",
        "expected_volumes": 213,
        "fingerprint": "14af177bb47e21030b70b89b2ca6e8e0d3280dbe348bbd2b6ea9f2e32c3fcfce",
        "repo": "derge-tengyur",
    }
}
MARKER = re.compile(rb"\{D[0-9]+(?:-[0-9]+)?[a-z]?\}")

def inspect_archive(path: Path, corpus: str):
    cfg = SOURCES[corpus]
    volumes = []
    rollup = hashlib.sha256()
    with zipfile.ZipFile(path) as z:
        files = {n.split("/text/", 1)[1]: n for n in z.namelist()
                 if "/text/" in n and n.endswith(".txt")}
        for filename in sorted(files):
            data = z.read(files[filename])
            rollup.update(filename.encode("utf-8") + b"\x00" + hashlib.sha256(data).digest())
        actual = rollup.hexdigest()
        if len(files) != cfg["expected_volumes"] or actual != cfg["fingerprint"]:
            raise SystemExit(f"{corpus} changed from acquired pinned source: {actual} / {len(files)}")
        for i, filename in enumerate(sorted(files), 1):
            raw = z.read(files[filename])
            raw.decode("utf-8-sig", errors="strict")
            marker_count = len(MARKER.findall(raw))
            volumes.append({
                "corpus": corpus,
                "volume": i,
                "filename": filename,
                "sha256": hashlib.sha256(raw).hexdigest(),
                "bytes": len(raw),
                "markerCount": marker_count,
                "catalogue": bool("དཀར་ཆག" in filename),
            })
    return volumes

def main():
    p = argparse.ArgumentParser()
    p.add_argument("--kangyur", required=True, type=Path)
    p.add_argument("--tengyur", required=True, type=Path)
    p.add_argument("--output", required=True, type=Path)
    a = p.parse_args()
    volumes = inspect_archive(a.kangyur, "Kangyur") + inspect_archive(a.tengyur, "Tengyur")
    a.output.parent.mkdir(parents=True, exist_ok=True)
    a.output.write_text(json.dumps({
        "source": "Esukhia pinned and byte-verified October 12 2026 source volumes",
        "notCanonicalWorkSegmentation": True,
        "corpora": SOURCES,
        "volumes": volumes,
    }, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Verified {len(volumes)} volumes; no original source bytes changed")

if __name__ == "__main__":
    main()
