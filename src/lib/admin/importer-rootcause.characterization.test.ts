// Regression tests for the content-integrity defects found by the 1 Oct 2026 audit.
// Each assertion protects corrected importer/reader behavior so future uploads
// cannot silently reintroduce the same loss or structure errors.
import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import { parseEpub } from "@/lib/admin/epub.server";
import { extractEpubToManuscriptText } from "@/lib/admin/catalog.server";
import { parseManuscript } from "@/lib/manuscript";
import {
  buildFallbackNavigation,
  classifyHeading,
  looksLikePrintedContentsLine,
} from "@/lib/reader-structure";

async function epub(bodies: string[], headTitle = "The Project Gutenberg eBook of Test") {
  const zip = new JSZip();
  zip.file(
    "META-INF/container.xml",
    `<container><rootfiles><rootfile full-path="OEBPS/content.opf"/></rootfiles></container>`,
  );
  zip.file(
    "OEBPS/content.opf",
    `<package><manifest>${bodies.map((_, i) => `<item id="f${i}" href="f${i}.xhtml"/>`).join("")}<item id="ncx" href="toc.ncx"/></manifest><spine>${bodies.map((_, i) => `<itemref idref="f${i}"/>`).join("")}</spine></package>`,
  );
  zip.file(
    "OEBPS/toc.ncx",
    `<ncx><navMap><navPoint><navLabel><text>I. THE DOOR</text></navLabel></navPoint></navMap></ncx>`,
  );
  bodies.forEach((b, i) =>
    zip.file(
      `OEBPS/f${i}.xhtml`,
      `<html><head><title>${headTitle}</title></head><body>${b}</body></html>`,
    ),
  );
  return new Uint8Array(await zip.generateAsync({ type: "uint8array" }));
}

describe("epub.server.ts parseEpub / stripTagsToText", () => {
  it("preserves drop-cap letters supplied as <img alt>", async () => {
    const parsed = await parseEpub(
      await epub([
        `<h2>I.</h2><div class="initial"><img alt="M" src="m.jpg"/></div><p>uch to the author’s surprise</p>`,
      ]),
    );
    expect(parsed.chapters[0]!.text).toContain("Much to the author’s surprise");
  });

  it("does not inject <head><title> metadata into spine text", async () => {
    const parsed = await parseEpub(
      await epub([`<h2>CHAPTER I.</h2><p>Body one.</p>`, `<h2>CHAPTER II.</h2><p>Body two.</p>`]),
    );
    for (const c of parsed.chapters)
      expect(c.text).not.toContain("The Project Gutenberg eBook of Test");
  });

  it("does not duplicate a chapter heading already present in extracted text", async () => {
    const { text } = await extractEpubToManuscriptText(
      await epub([`<h2>CHAPTER I.</h2><p>Body one.</p>`]),
    );
    expect(text.match(/CHAPTER I\./g)?.length).toBe(1);
  });

  it("preserves table-row boundaries instead of collapsing printed contents", async () => {
    const parsed = await parseEpub(
      await epub([
        `<h2>CONTENTS.</h2><table><tr><td>I.</td><td>THE DOOR.</td></tr><tr><td>II.</td><td>THE MARKET.</td></tr></table>`,
      ]),
    );
    expect(parsed.chapters[0]!.text).toContain("I. THE DOOR.\n\nII. THE MARKET.");
  });

  it("does NOT drop leaf <div> verse/drama blocks (so Moby-Dick's div loss is not this code path)", async () => {
    const parsed = await parseEpub(
      await epub([
        `<div class="subheadc">LOOMINGS.</div><div class="drama">1ST NANTUCKET SAILOR.</div><div class="i0">The ribs and terrors in the whale,</div>`,
      ]),
    );
    const t = parsed.chapters[0]!.text;
    expect(t).toContain("LOOMINGS.");
    expect(t).toContain("1ST NANTUCKET SAILOR.");
    expect(t).toContain("The ribs and terrors in the whale,");
  });

  it("retains NCX navigation labels as structure evidence", async () => {
    const parsed = await parseEpub(await epub([`<p>x</p>`]));
    expect(parsed.navigation.map((item) => item.title)).toContain("I. THE DOOR");
  });

  it("strips Project Gutenberg wrapper markers while retaining body text", async () => {
    const parsed = await parseEpub(
      await epub([`<p>*** START OF THE PROJECT GUTENBERG EBOOK TEST ***</p><p>Body.</p>`]),
    );
    expect(parsed.chapters[0]!.text).not.toContain("START OF THE PROJECT GUTENBERG");
    expect(parsed.chapters[0]!.text).toContain("Body.");
  });
});

describe("manuscript.ts parseManuscript", () => {
  const book = [
    "THE TEST BOOK",
    "Contents",
    "CHAPTER I. The Door",
    "CHAPTER II. The Market",
    "CHAPTER I. The Door",
    "Body of chapter one. ".repeat(40),
    "CHAPTER II. The Market",
    "Body of chapter two. ".repeat(40),
  ].join("\n\n");

  it("keeps printed-contents copies out of chapter structure", () => {
    const parsed = parseManuscript(book, { preserveLineation: true });
    const chapters = parsed.structure.filter((n) => n.nodeType === "chapter").map((n) => n.title);
    expect(chapters.filter((t) => t.startsWith("CHAPTER I.")).length).toBe(1);
    expect(parsed.chunks.some((c) => c.trim() === "CHAPTER II. The Market")).toBe(false);
  });

  it("recognises explicit front-matter headings before the body", () => {
    const parsed = parseManuscript(
      ["TITLE PAGE", "To my father", "PREFACE", "Preface text.", "CHAPTER I", "Body."].join("\n\n"),
      { preserveLineation: true },
    );
    const front = parsed.structure.filter((n) => n.nodeType === "front_matter").map((n) => n.title);
    expect(front).toContain("TITLE PAGE");
    expect(front).toContain("PREFACE");
  });

  it("preserves strongly verse-like lineation in the normal plain-text path", () => {
    const parsed = parseManuscript(
      "BOOK I\n\nOf Mans First Disobedience, and the Fruit\nOf that Forbidden Tree, whose mortal tast\nBrought Death into the World",
      {},
    );
    expect(parsed.chunks.join("\n")).toContain("Fruit\nOf that Forbidden Tree");
  });
});

describe("reader-structure.ts render-time heading rules", () => {
  it("recognises hyphenated ALL-CAPS literary titles ending in a period", () => {
    expect(classifyHeading("THE PRISON-DOOR.")).not.toBeNull();
  });
  it("recognises bare roman-numeral chapter labels", () => {
    expect(classifyHeading("I.")?.kind).toBe("chapter");
    expect(classifyHeading("XXIV.")?.kind).toBe("chapter");
  });
  it("recognises source-shaped printed-contents candidates without page numbers", () => {
    expect(looksLikePrintedContentsLine("CHAPTER I.  Loomings")).toBe(true);
    expect(looksLikePrintedContentsLine("Scene I. A public place.")).toBe(true);
  });
  it("fallback navigation keeps multiple headings that share one chunk", () => {
    const nav = buildFallbackNavigation([
      { chunk_index: 0, content: "CHAPTER I\n\nshort\n\nCHAPTER II\n\nshort" },
      { chunk_index: 1, content: "CHAPTER III\n\nbody" },
    ]);
    expect(nav.map((n) => n.title)).toEqual(["CHAPTER I", "CHAPTER II", "CHAPTER III"]);
  });
});
