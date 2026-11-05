#!/usr/bin/env python3
"""Production verify all 41 original WebPs; compare exact bytes with signed manifest."""
import concurrent.futures
import hashlib
import json
import sys
from pathlib import Path
from urllib.request import Request, urlopen

ROOT=Path(__file__).resolve().parents[2]
MANIFEST=ROOT/"docs/cover-deployment/seeparah-42-status-2026-11-05.json"
REPORT=ROOT/"docs/cover-deployment/seeparah-42-live-qa-2026-11-05.json"

def check(row):
    name=row["renamed_webp"]
    url=row["public_cover_url"]
    if not url:
        return {"candidate":row.get("candidate_id") or name,"status":"STAGED_NOT_PUBLIC","url":None}
    try:
        req=Request(url,headers={"User-Agent":"Seeparah-Cover-Release-QA/1.0","Cache-Control":"no-cache"})
        with urlopen(req,timeout=35) as r:
            content=r.read()
            mime=r.headers.get("Content-Type","").split(";")[0].lower()
            status=r.status
        digest=hashlib.sha256(content).hexdigest()
        ok=status==200 and mime=="image/webp" and digest==row["webp_sha256"]
        return {"candidate":row.get("candidate_id") or name,"status":"VERIFIED_LIVE" if ok else "ASSET_MISMATCH",
                "url":url,"http":status,"mime":mime,"bytes":len(content),"sha256":digest,
                "expected_sha256":row["webp_sha256"]}
    except Exception as e:
        return {"candidate":row.get("candidate_id") or name,"status":"ERROR",
                "url":url,"reason":str(e)}

def main():
    rows=json.loads(MANIFEST.read_text(encoding="utf-8"))
    with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:
        result=list(pool.map(check,rows))
    REPORT.write_text(json.dumps(result,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
    tally={k:sum(x["status"]==k for x in result) for k in sorted({x["status"] for x in result})}
    print(json.dumps({"tally":tally,"failures":[x for x in result if x["status"] not in {"VERIFIED_LIVE","STAGED_NOT_PUBLIC"}],
                     "file":str(REPORT)},ensure_ascii=False,indent=2))
    return 0 if tally.get("VERIFIED_LIVE")==41 and tally.get("STAGED_NOT_PUBLIC")==1 else 1

if __name__=="__main__":
    sys.exit(main())
