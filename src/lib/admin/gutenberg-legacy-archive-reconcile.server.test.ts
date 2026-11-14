import {createHash} from "node:crypto";
import {describe,it,expect} from "vitest";
import {verifyLegacySourceBytes} from "./gutenberg-legacy-archive-reconcile.server";
describe("legacy Gutenberg source proof must not be fabricated",()=>{
  const manuscript="*** START OF THE PROJECT GUTENBERG EBOOK PROOF ***\n"+
    "Chapitre I\n\nBonjour le monde. 你好世界.\n".repeat(25)+
    "*** END OF THE PROJECT GUTENBERG EBOOK PROOF ***";
  const bytes=new TextEncoder().encode(manuscript);
  const hash=createHash("sha256").update(bytes).digest("hex");
  it("accepts exactly the raw bytes with genuine Gutenberg boundaries",()=>{
    expect(verifyLegacySourceBytes(19476,bytes,hash)).toEqual({
      sha256:hash,key:"gutenberg/19476/pg19476-"+hash.slice(0,12)+".txt",
    });
  });
  it("rejects changed source editions and missing digests",()=>{
    expect(verifyLegacySourceBytes(19476,bytes,"f".repeat(64))).toBeNull();
    expect(verifyLegacySourceBytes(19476,bytes,"")).toBeNull();
  });
  it("rejects a matching hash for non-Gutenberg bytes",()=>{
    const invalid=new TextEncoder().encode("This is not a source. ".repeat(20));
    const digest=createHash("sha256").update(invalid).digest("hex");
    expect(()=>verifyLegacySourceBytes(19476,invalid,digest)).toThrow();
  });
});
