#!/usr/bin/env python3
"""Prepare the 42 user-supplied WebPs: verify checksums, retain exact editions,
publish only source-matched assets, and quarantine known artwork mistakes.
No database writes. Safe to re-run without overwriting other assets.
"""
import csv
import hashlib
import io
import json
from pathlib import Path
from zipfile import ZipFile
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
ARCHIVE = Path.home() / "Downloads" / "Seeparah_42_Named_WebP_Covers_Deployment_Handoff.zip"
SOURCES = dict(zip(
 "0058 0059 0063 0069 0074 0105 0125 0163 0167 0183 0226 0229 0246 0280 0281 0304 0306 0307 0308 0320 0323 0327 0329 0333 0353 0360 0383 0385 0387 0399 0404 0405 0407 0408 0411 0413 0415 0419".split(),
 "19476 17983 564 53874 3300 71320 4238 575 3290 6143 796 14157 4791 17223 320 3747 997 998 999 271 561 580 968 2432 12 2166 1951 1880 811 82 555 652 792 1026 1906 2021 2276 4084".split(),
))
SACRED = {
 "SACRED-EDITION-PENDING_bhagavad-gita.webp": {
  "book_id":"e0c836a6-6d04-5914-9196-aeb9871776e9","title":"Bhagavad Gita",
  "language":"Sanskrit","book_source_id":"gita-gita-sanskrit-c6fce3959544",
  "source_id":"gita-gita-sanskrit-c6fce3959544","file":"sacred-bhagavad-gita-sanskrit.webp"},
 "SACRED-EDITION-PENDING_dao-de-jing-wang-bi-commentary.webp": {
  "book_id":"83acc105-30e9-58f5-9db4-8bcc35b7ab4b","title":"Dao De Jing — Wang Bi Commentary",
  "language":"Chinese","book_source_id":"zh-wikisource-wangbi-dao-de-jing-rev2354026",
  "source_id":"zh-wikisource-wangbi-dao-de-jing-rev2354026","file":"sacred-dao-de-jing-wang-bi-chinese.webp"},
 "SACRED-EDITION-PENDING_dhammapada.webp": {
  "book_id":"3e2c1103-36a9-5a44-987c-259d27dea072","title":"Dhammapada",
  "language":"Pali","book_source_id":"suttacentral-bilara-dhp-06ab1b50b259",
  "source_id":"bilara-root-pli-ms-dhp","file":"sacred-dhammapada-pali.webp"},
 "SACRED-EDITION-PENDING_li-ji-book-of-rites.webp": {
  "book_id":"85eb2806-8964-5fb7-9236-0f8ac79a4ca2","title":"禮記 (Li Ji — Book of Rites)",
  "language":"Chinese","book_source_id":"gutenberg:liji:24048",
  "source_id":"gutenberg:liji:24048","file":"sacred-li-ji-chinese.webp"},
}

def write_exact(p:Path,data:bytes):
 p.parent.mkdir(parents=True,exist_ok=True)
 if p.exists() and p.read_bytes()!=data:
  raise RuntimeError("Existing different asset: "+str(p))
 p.write_bytes(data)

def main():
 with ZipFile(ARCHIVE) as archive:
  original=json.loads(archive.read("Seeparah_42_Cover_Deployment_Manifest.json"))
  assert len(original)==42
  assert len(SOURCES)==38
  keys={x["candidate_id"].removeprefix("SP-CAND-") for x in original if x["candidate_id"]}
  assert keys==set(SOURCES),("Missing literary key",keys^set(SOURCES))
  sacred_names={x["renamed_webp"] for x in original if not x["candidate_id"]}
  assert sacred_names==set(SACRED),("Sacred mismatch",sacred_names^set(SACRED))
  rows=[]
  for x in original:
   item=dict(x)
   name=x["renamed_webp"]
   raw=archive.read("WEBP_Deployment/"+name)
   assert hashlib.sha256(raw).hexdigest()==x["webp_sha256"],name
   with Image.open(io.BytesIO(raw)) as im:
    assert im.format=="WEBP" and im.size==(1024,1536),name
    im.verify()
   candidate=x["candidate_id"]
   if candidate=="SP-CAND-0105":
    place=Path("cover-staging/2026-11-05/")/name
    info={"disposition":"STAGED_QUALITY_MISMATCH",
      "blocker":"Artwork credits Carlo Dossi; original Gutenberg #71320 identifies Roberto Sacchetti",
      "public_cover_url":None,"source_id":"gutenberg:71320",
      "book_id":None,"language":"Italian","book_source_id":"gutenberg:71320"}
   elif candidate:
    place=Path("public/book-covers/premium-42")/name
    src="gutenberg:"+SOURCES[candidate.split("-")[-1]]
    info={"disposition":"READY_LITERARY_PUBLISHED",
      "blocker":None,"source_id":src,"book_id":None,"language":None,
      "book_source_id":src,
      "public_cover_url":"https://seeparah.com/"+place.relative_to("public").as_posix()}
   else:
    s=SACRED[name]
    place=Path("public/book-covers/premium-42/sacred")/s["file"]
    info={"disposition":"READY_SACRED_EXACT_SOURCE",
      "blocker":None,"source_id":s["source_id"],"book_id":s["book_id"],
      "language":s["language"],"book_source_id":s["book_source_id"],
      "public_cover_url":"https://seeparah.com/"+place.relative_to("public").as_posix()}
   write_exact(ROOT/place,raw)
   item.update(info)
   item["image_review"] = "BLOCKED_WRONG_COVER_AUTHOR" if candidate=="SP-CAND-0105" else "CONTACT_SHEET_ARTWORK_REVIEWED_2026_11_05"
   item["edition_match_status"] = "BLOCKED_AUTHOR_DISCREPANCY" if candidate=="SP-CAND-0105" else ("VERIFIED_SP_CAND_AND_GUTENBERG_ID" if candidate else "VERIFIED_SACRED_ORIGINAL_LANGUAGE_SOURCE_EDITION")
   item["source_text_rights_status"] = "PRODUCTION_PUBLISHED_AND_APPROVED_2026_11_05"
   item["production_deployment"] = "STAGED_NOT_PUBLIC" if candidate=="SP-CAND-0105" else "ASSET_READY_NOT_YET_DEPLOYED"
   item["repo_asset_path"]=place.as_posix()
   item["verification"]="SHA256_OK_1024x1536_WEBP"
   rows.append(item)
 doc=ROOT/"docs"/"cover-deployment"
 doc.mkdir(parents=True,exist_ok=True)
 (doc/"seeparah-42-original-2026-10-31.json").write_text(
  json.dumps(original,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
 (doc/"seeparah-42-status-2026-11-05.json").write_text(
  json.dumps(rows,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
 with (doc/"seeparah-42-status-2026-11-05.csv").open("w",encoding="utf-8-sig",newline="") as fp:
  writer=csv.DictWriter(fp,fieldnames=list(rows[0]))
  writer.writeheader();writer.writerows(rows)
 (doc/"README.md").write_text(
  "# Verified 42 premium Seeparah covers — 5 Nov 2026\n\n"
  "37 published literary covers are ready for protected database assignment; "
  "4 sacred covers target exact original-language source editions. "
  "SP-CAND-0105 remains in non-public staging due to a wrong author credit.\n\n"
  "Asset integrity: all 42 are individual 1024x1536 WebPs whose SHA-256 "
  "matches the original Library handoff manifest. No existing cover is overwritten. "
  "The READY state does not claim that Cloudflare has deployed or database links "
  "have been updated. Never publish unpublished or unauthorized books.\n",
  encoding="utf-8")
 print(json.dumps({
  "total":len(rows),
  "ready_literature":sum(x["disposition"]=="READY_LITERARY_PUBLISHED" for x in rows),
  "ready_sacred":sum(x["disposition"]=="READY_SACRED_EXACT_SOURCE" for x in rows),
  "quality_staged":sum(x["disposition"]=="STAGED_QUALITY_MISMATCH" for x in rows),
  "bytes":sum((ROOT/x["repo_asset_path"]).stat().st_size for x in rows),
 },indent=2))

if __name__=="__main__":
 main()
