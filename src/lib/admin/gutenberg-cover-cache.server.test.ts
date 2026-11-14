import {createHash} from "node:crypto";
import {describe,it,expect} from "vitest";
import {checkGutenbergCoverSource} from "./gutenberg-cover-cache.server";
// JPEG byte-level witness: SOF0 200×230 and terminal EOI.
const source=new Uint8Array(2600).fill(1);
source.set([255,216,255,192,0,17,8,0,230,0,200,3],0);
source.set([255,217],source.length-2);
const sha=createHash("sha256").update(source).digest("hex");
const meta={source_sha256:sha,source_width:200,source_height:230,source_bytes:2600};
describe("verified Gutenberg JPEG preservation",()=>{
 it("checks byte SHA, exact dimensions, length and JPEG markers",()=>{
   expect(checkGutenbergCoverSource(source,meta)).toBe(true);
 });
 it("never accepts source mismatch, file substitution or aspect mismatch",()=>{
   expect(checkGutenbergCoverSource(source,{...meta,source_sha256:"f".repeat(64)})).toBe(false);
   expect(checkGutenbergCoverSource(source,{...meta,source_height:300})).toBe(false);
   expect(checkGutenbergCoverSource(source,{...meta,source_bytes:2700})).toBe(false);
   expect(checkGutenbergCoverSource(source,{...meta,source_width:250})).toBe(false);
 });
});
