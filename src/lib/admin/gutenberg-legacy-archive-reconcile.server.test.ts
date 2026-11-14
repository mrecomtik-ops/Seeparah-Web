import {createHash} from "node:crypto";
import {describe,expect,it} from "vitest";
import {verifyLegacySourceBytes,verifyCurrentSourceAgainstAudit,canonicalOriginal} from "./gutenberg-legacy-archive-reconcile.server";
const original="*** START OF THE PROJECT GUTENBERG EBOOK TEST ***\n"+
  "Opening chapter... 你好. ".repeat(40)+
  "\n*** END OF THE PROJECT GUTENBERG EBOOK TEST ***";
const bytes=new TextEncoder().encode(original);
const rawSha=createHash("sha256").update(bytes).digest("hex");
const canonical=canonicalOriginal("Opening chapter... 你好. ".repeat(40));
const sha=createHash("sha256").update(canonical).digest("hex");
const audit={
  book_id:"test",gutenberg_id:111,prior_recorded_source_sha256:null,
  current_official_raw_sha256:rawSha,current_official_body_sha256:sha,
  stored_reader_body_sha256:sha,current_official_chars:canonical.length,
  stored_reader_chars:canonical.length,exact_reader_source_match:true,
  archive_state:"pending"
};
describe("legacy Gutenberg archival proof",()=>{
  it("only links exact historical SHA bytes under legacy rule",()=>{
    expect(verifyLegacySourceBytes(111,bytes,rawSha)?.sha256).toBe(rawSha);
    expect(verifyLegacySourceBytes(111,bytes,"f".repeat(64))).toBeNull();
  });
  it("independently verifies contemporary official source text and Unicode",()=>{
    expect(verifyCurrentSourceAgainstAudit(bytes,audit)?.bodySha).toBe(sha);
    expect(verifyCurrentSourceAgainstAudit(bytes,{...audit,current_official_body_sha256:"a".repeat(64)})).toBeNull();
    expect(verifyCurrentSourceAgainstAudit(bytes,{...audit,current_official_raw_sha256:"a".repeat(64)})).toBeNull();
    expect(canonicalOriginal("A" + String.fromCharCode(10) + " B")).toBe("AB");
  });
  it("rejects bytes whose Gutenberg START/END boundaries were removed",()=>{
    const corrupted=new TextEncoder().encode("Opening chapter... 你好. ".repeat(40));
    const match=createHash("sha256").update(corrupted).digest("hex");
    expect(()=>verifyCurrentSourceAgainstAudit(corrupted,{...audit,current_official_raw_sha256:match})).toThrow();
  });
});
