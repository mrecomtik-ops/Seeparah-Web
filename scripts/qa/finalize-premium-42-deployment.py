#!/usr/bin/env python3
"""Finalize cover deployment only after verified Cloudflare / DB / browser QA."""
import csv
import json
from pathlib import Path

ROOT=Path(__file__).resolve().parents[2]
DIR=ROOT/"docs/cover-deployment"
MAN=DIR/"seeparah-42-status-2026-11-05.json"
SRC=DIR/"seeparah-42-production-records-2026-11-05.json"
LIVE=DIR/"seeparah-42-live-qa-2026-11-05.json"
BROWSER=DIR/"seeparah-42-responsive-browser-qa.json"

def main():
    rows=json.loads(MAN.read_text(encoding="utf-8"))
    db=json.loads(SRC.read_text(encoding="utf-8"))
    checks=json.loads(LIVE.read_text(encoding="utf-8"))
    browser=json.loads(BROWSER.read_text(encoding="utf-8"))
    assert len(rows)==42 and len(db)==42 and len(checks)==42
    assert len(browser)==16 and all(x["passed"] for x in browser)
    assert all(r["status"]=="published" and r["rights_status"]=="approved" for r in db)
    by_url={r["cover_url"]:r for r in db if r["cover_url"]}
    by_import={r["import_key"]:r for r in db}
    by_check={c["url"]:c for c in checks if c["url"]}
    assert len(by_url)==41 and len(by_check)==41
    staged=0
    live=0
    for row in rows:
        expected=row.get("public_cover_url")
        if not expected:
            assert row["candidate_id"]=="SP-CAND-0105"
            b=by_import[row["candidate_id"]]
            assert b["cover_url"] is None and b["source_edition_id"]=="gutenberg:71320"
            row["book_id"]=b["id"]
            row["book_detail_url"]="https://seeparah.com/book/"+b["id"]
            row["production_deployment"]="STAGED_NOT_PUBLIC_WRONG_AUTHOR"
            row["final_status"]="STAGED_ARTWORK_CORRECTION_REQUIRED"
            row["cloudflare_version"]=None
            staged+=1
            continue
        b=by_url.get(expected)
        assert b is not None, "Missing production cover: "+expected
        if row["candidate_id"]:
            assert b["import_key"]==row["candidate_id"]
            assert b["title"]==row["catalog_title"]
            assert b["author"]==row["catalog_author"]
            assert b["source_edition_id"]==row["source_id"]
        else:
            assert b["id"]==row["book_id"]
            assert b["source_edition_id"]==row["book_source_id"]
            assert row["source_id"] and row["language"]
        check=by_check.get(expected)
        assert check and check["status"]=="VERIFIED_LIVE",expected
        assert check["mime"]=="image/webp" and check["http"]==200
        assert check["sha256"]==row["webp_sha256"]
        row["book_id"]=b["id"]
        row["book_detail_url"]="https://seeparah.com/book/"+b["id"]
        row["production_deployment"]="VERIFIED_LIVE_CLOUDFLARE_AND_SUPABASE"
        row["final_status"]="NEWLY_DEPLOYED_2026_11_05"
        row["cloudflare_version"]=439
        row["production_asset_http"]=200
        row["production_asset_sha256_verified"]=True
        live+=1
    assert live==41 and staged==1
    links=["# Published Seeparah book URLs updated — 5 November 2026",
           "", "41 cover references changed from missing to verified premium artwork.",
           "Every link below is a published book detail page; the cover links are immutable source artwork.",
           "", "## Literary books (37)"]
    for row in sorted((r for r in rows if r["candidate_id"] and r["final_status"].startswith("NEWLY_")),key=lambda r:r["candidate_id"]):
        links.append("- ["+row["catalog_title"]+"]("+row["book_detail_url"]+") — "
                     +row["candidate_id"]+" — [WebP]("+row["public_cover_url"]+")")
    links.extend(["", "## Sacred original-language books (4)"])
    for row in (r for r in rows if not r["candidate_id"]):
        links.append("- ["+row["catalog_title"]+"]("+row["book_detail_url"]+") — "
                     +row["language"]+" / "+row["source_id"]+" — [WebP]("+row["public_cover_url"]+")")
    links.extend(["", "## Held in staging (1)",
                  "- Tenda e castello (SP-CAND-0105): no cover URL assigned; artwork incorrectly credits Carlo Dossi rather than Roberto Sacchetti.", ""])
    (DIR/"seeparah-42-updated-book-urls.md").write_text("\n".join(links),encoding="utf-8")
    MAN.write_text(json.dumps(rows,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
    fields=list(dict.fromkeys(k for row in rows for k in row))
    with (DIR/"seeparah-42-status-2026-11-05.csv").open("w",newline="",encoding="utf-8-sig") as f:
        w=csv.DictWriter(f,fieldnames=fields)
        w.writeheader()
        w.writerows(rows)
    (DIR/"README.md").write_text(
        "# Seeparah premium 42 cover deployment — verified 5 November 2026\n\n"
        "**41 newly deployed, 0 previously covered, 1 staged, 0 unmatched book records.**\n\n"
        "- 37 literary covers: published books, exact SP-CAND / title / author / Gutenberg source IDs, previously NULL cover URLs.\n"
        "- 4 sacred original-language covers: published books, exact approved original-language source editions and matching edition-specific artwork; sibling translation edition cover records untouched.\n"
        "- SP-CAND-0105 (Tenda e castello): art credits Carlo Dossi, while Gutenberg source credits Roberto Sacchetti. Staged privately, no public URL or database assignment.\n"
        "- All 42 original WebPs individually verified as 1024x1536 using the original handoff SHA-256 list.\n"
        "- Cloudflare Worker v439 deployed at 100%; all 41 WebP URLs returned HTTP 200, image/webp and matching SHA-256.\n"
        "- Idempotent protected SQL applied transactionally. Post-check: 41 matched book URLs, 4 original-language edition cover records.\n"
        "- Browser QA: 16/16 book detail cover checks passed (8 books x mobile and desktop); library book cards use the same book cover field.\n"
        "- Code: PR #152, merge eaf5fa3e636e76ab72db1e0d9ded4becb8a7f093. Final evidence and manifest: follow-up PR.\n"
        "- No authentication, environment variables, translations, source text, rights approvals, user data, reading positions, publication statuses or unrelated covers changed.\n\n"
        "Per-cover evidence and book detail links: see status CSV/JSON. Original handoff manifest retained separately.\n",
        encoding="utf-8")
    report={"total":len(rows),"newly_deployed":live,"already_displayed":0,
            "staged_wrong_author":staged,"unmatched_book_records":0,
            "cloudflare_version":439,"browser_checks_passed":len(browser),
            "verified_live_webps":len(by_check)}
    print(json.dumps(report,indent=2))

if __name__=="__main__":main()
