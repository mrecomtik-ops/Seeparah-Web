#!/usr/bin/env python3
"""Only certify the 42nd premium cover after real production evidence exists.

Preserves original failed-author artwork checksum and original handoff package.
The separately corrected WebP has a new SHA-256 and new public release entry.
"""
import csv
import hashlib
import json
from pathlib import Path

ROOT=Path(__file__).resolve().parents[2]
DOC=ROOT/"docs/cover-deployment"
MANIFEST=DOC/"seeparah-42-status-2026-11-05.json"
DB=DOC/"seeparah-42-production-records-2026-11-05.json"
LIVE=DOC/"seeparah-42-live-qa-2026-11-05.json"
NEW_IMAGE=ROOT/"public/book-covers/premium-42/SP-CAND-0105_tenda-e-castello.webp"
ORIGINAL=ROOT/"cover-staging/2026-11-05/SP-CAND-0105_tenda-e-castello.webp"
KEY="SP-CAND-0105"
URL="https://seeparah.com/book-covers/premium-42/SP-CAND-0105_tenda-e-castello.webp"
SHA="97ed730530b6b8c26c78844907e2046e55aae7d39489b11f108521080ccd347f"
BOOK="935c4918-3380-464d-91fe-872825d8f40d"

def main():
    rows=json.loads(MANIFEST.read_text(encoding="utf-8"))
    db=json.loads(DB.read_text(encoding="utf-8"))
    live=json.loads(LIVE.read_text(encoding="utf-8"))
    assert len(rows)==len(db)==len(live)==42
    assert hashlib.sha256(NEW_IMAGE.read_bytes()).hexdigest()==SHA
    row=next(r for r in rows if r.get("candidate_id")==KEY)
    assert row["source_id"]=="gutenberg:71320"
    assert row["catalog_author"]=="Roberto Sacchetti"
    assert hashlib.sha256(ORIGINAL.read_bytes()).hexdigest()==row["webp_sha256"]
    record=next(r for r in db if r["import_key"]==KEY)
    assert record["id"]==BOOK
    assert record["source_edition_id"]=="gutenberg:71320"
    assert record["title"]=="Tenda e castello"
    assert record["author"]=="Roberto Sacchetti"
    assert record["status"]=="published" and record["rights_status"]=="approved"
    assert record["cover_url"]==URL
    asset=next(r for r in live if r.get("candidate")==KEY)
    assert asset["status"]=="VERIFIED_LIVE"
    assert asset["http"]==200 and asset["mime"]=="image/webp"
    assert asset["sha256"]==SHA and asset["expected_sha256"]==SHA

    # The original handoff SHA stays unchanged as documented evidence.
    row.update({
      "disposition":"DEPLOYED_CORRECTED_AUTHOR",
      "blocker":None,
      "edition_match_status":"VERIFIED_SP_CAND_AND_GUTENBERG_ID",
      "image_review":"CORRECTED_AUTHOR_ROBERTO_SACCHETTI_VERIFIED",
      "production_deployment":"VERIFIED_LIVE_CLOUDFLARE_AND_SUPABASE",
      "final_status":"NEWLY_DEPLOYED_2026_11_05",
      "corrected_webp_sha256":SHA,
      "correction":"Original cover credited Carlo Dossi; corrected author to Roberto Sacchetti without changing original illustrated design.",
      "corrected_artwork_date":"2026-11-05",
      "corrected_original_webp_sha256":row["webp_sha256"],
      "public_cover_url":URL,
      "repo_asset_path":"public/book-covers/premium-42/SP-CAND-0105_tenda-e-castello.webp",
      "cloudflare_version":441,
      "production_asset_http":200,
      "production_asset_sha256_verified":True,
      "verification":"SHA256_OK_1024x1536_CORRECTED_WEBP",
      "book_id":BOOK,
      "book_detail_url":"https://seeparah.com/book/"+BOOK,
    })
    assert sum(r["final_status"]=="NEWLY_DEPLOYED_2026_11_05" for r in rows)==42
    assert all(r.get("public_cover_url") for r in rows)
    MANIFEST.write_text(json.dumps(rows,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
    columns=list(dict.fromkeys(k for r in rows for k in r))
    with (DOC/"seeparah-42-status-2026-11-05.csv").open("w",encoding="utf-8-sig",newline="") as f:
      writer=csv.DictWriter(f,fieldnames=columns)
      writer.writeheader()
      writer.writerows(rows)
    links=DOC/"seeparah-42-updated-book-urls.md"
    from_id={r["id"]:r for r in db}
    literary=sorted((r for r in rows if r.get("candidate_id")),key=lambda r:r["candidate_id"])
    sacred=[r for r in rows if not r.get("candidate_id")]
    assert len(literary)==38 and len(sacred)==4
    lines=["# Published Seeparah books — all 42 premium covers (5 November 2026)",
           "", "42 of 42 book cover URLs are live and verified; 38 literary books and 4 original-language sacred texts.",
           "", "## Literary books (38)"]
    for item in literary:
      book=from_id[item["book_id"]]
      assert book["cover_url"]==item["public_cover_url"]
      lines.append("- ["+book["title"]+"]("+item["book_detail_url"]+") — "
                   +item["candidate_id"]+" — [WebP]("+item["public_cover_url"]+")")
    lines.extend(["", "## Sacred original-language books (4)"])
    for item in sacred:
      book=from_id[item["book_id"]]
      assert book["cover_url"]==item["public_cover_url"]
      lines.append("- ["+book["title"]+"]("+item["book_detail_url"]+") — "
                   +item["language"]+" / "+item["source_id"]+" — [WebP]("+item["public_cover_url"]+")")
    lines.append("")
    links.write_text("\n".join(lines),encoding="utf-8")
    (DOC/"README.md").write_text(
      "# Seeparah premium 42 covers — 42/42 live, 5 November 2026\n\n"
      "**All 42 matched and rights-approved book covers have been published.**\n"
      "38 literary books (including the corrected Tenda e castello cover) and "
      "4 original-language sacred editions. No covers remain staged for publishing.\n\n"
      "The initial artwork for SP-CAND-0105 incorrectly named Carlo Dossi; the "
      "actual approved source is Roberto Sacchetti, Project Gutenberg #71320. "
      "The original failed-author image remains isolated in non-public staging "
      "for provenance; a separate corrected 1024x1536 WebP was committed and "
      "deployed, retaining the illustration and Seeparah branding. Original "
      "handoff checksums remain in the manifest; corrected SHA stored separately.\n\n"
      "All original editions, publication rights, source text, translations and "
      "user records were preserved. Cloudflare-only deployment. New asset URLs "
      "were independently SHA-256 verified and mapped via guarded SQL; "
      "see deployment manifest and browser QA evidence for details.\n",
      encoding="utf-8")
    print(json.dumps({"total":len(rows),"live":42,"blocked":0,"replaced_existing":0,
      "new_corrected_sha256":SHA,"production_book_id":BOOK},indent=2))

if __name__=="__main__":
    main()
