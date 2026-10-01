// Characterization tests for the 1 Oct 2026 P0 content-integrity audit.
// These assert the CURRENT (defective) behaviour of the in-repo importer so
// the root causes are reproducible. When the importer is fixed, each
// expectation marked "DEFECT" should be inverted.
import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import { parseEpub } from "@/lib/admin/epub.server";
import { extractEpubToManuscriptText } from "@/lib/admin/catalog.server";
import { parseManuscript } from "@/lib/manuscript";
import { buildFallbackNavigation, classifyHeading, looksLikePrintedContentsLine } from "@/lib/reader-structure";

async function epub(bodies: string[], headTitle = "The Project Gutenberg eBook of Test") {
  const zip = new JSZip();
  zip.file("META-INF/container.xml", `<container><rootfiles><rootfile full-path="OEBPS/content.opf"/></rootfiles></container>`);
  zip.file(
    "OEBPS/content.opf",
    `<package><manifest>${bodies.map((_, i) => `<item id="f${i}" href="f${i}.xhtml"/>`).join("")}<item id="ncx" href="toc.ncx"/></manifest><spine>${bodies.map((_, i) => `<itemref idref="f${i}"/>`).join("")}</spine></package>`,
  );
  zip.file("OEBPS/toc.ncx", `<ncx><navMap><navPoint><navLabel><text>I. THE DOOR</text></navLabel></navPoint></navMap></ncx>`);
  bodies.forEach((b, i) => zip.file(`OEBPS/f${i}.xhtml`, `<html><head><title>${headTitle}</title></head><body>${b}</body></html>`));
  return new Uint8Array(await zip.generateAsync({ type: "uint8array" }));
}

describe("epub.server.ts parseEpub / stripTagsToText", () => {
  it("DEFECT: drops drop-cap letters supplied as <img alt>", async () => {
    const parsed = await parseEpub(await epub([`<h2>I.</h2><div class="initial"><img alt="M" src="m.jpg"/></div><p>uch to the author’s surprise</p>`]));
    expect(parsed.chapters[0]!.text).toContain("uch to the author’s surprise");
    expect(parsed.chapters[0]!.text).not.toContain("Much to the author");
  });

  it("DEFECT: keeps <head><title> text, injecting the book title at the start of every spine file", async () => {
    const parsed = await parseEpub(await epub([`<h2>CHAPTER I.</h2><p>Body one.</p>`, `<h2>CHAPTER II.</h2><p>Body two.</p>`]));
    for (const c of parsed.chapters) expect(c.text.startsWith("The Project Gutenberg eBook of Test")).toBe(true);
  });

  it("DEFECT: extractEpubToManuscriptText prepends the first heading, which the text already contains", async () => {
    const { text } = await extractEpubToManuscriptText(await epub([`<h2>CHAPTER I.</h2><p>Body one.</p>`]));
    expect(text.match(/CHAPTER I\./g)?.length).toBe(2);
  });

  it("DEFECT: printed contents tables collapse into one run-on block (</tr> is not a break)", async () => {
    const parsed = await parseEpub(await epub([`<h2>CONTENTS.</h2><table><tr><td>I.</td><td>THE DOOR.</td></tr><tr><td>II.</td><td>THE MARKET.</td></tr></table>`]));
    expect(parsed.chapters[0]!.text).toMatch(/I\.\s*THE DOOR\.\s*II\.\s*THE MARKET\./);
  });

  it("does NOT drop leaf <div> verse/drama blocks (so Moby-Dick's div loss is not this code path)", async () => {
    const parsed = await parseEpub(await epub([`<div class="subheadc">LOOMINGS.</div><div class="drama">1ST NANTUCKET SAILOR.</div><div class="i0">The ribs and terrors in the whale,</div>`]));
    const t = parsed.chapters[0]!.text;
    expect(t).toContain("LOOMINGS.");
    expect(t).toContain("1ST NANTUCKET SAILOR.");
    expect(t).toContain("The ribs and terrors in the whale,");
  });

  it("DEFECT: ignores toc.ncx / nav entirely (no navigation is returned)", async () => {
    const parsed = await parseEpub(await epub([`<p>x</p>`]));
    expect(Object.keys(parsed)).toEqual(["chapters", "warnings"]);
  });

  it("DEFECT: does not strip Project Gutenberg boilerplate", async () => {
    const parsed = await parseEpub(await epub([`<p>*** START OF THE PROJECT GUTENBERG EBOOK TEST ***</p><p>Body.</p>`]));
    expect(parsed.chapters[0]!.text).toContain("START OF THE PROJECT GUTENBERG");
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

  it("DEFECT: printed-contents lines become chapter boundaries and duplicate navigation nodes", () => {
    const parsed = parseManuscript(book, { preserveLineation: true });
    const chapters = parsed.structure.filter((n) => n.nodeType === "chapter").map((n) => n.title);
    expect(chapters.filter((t) => t.startsWith("CHAPTER I.")).length).toBe(2);
    expect(parsed.chunks.some((c) => c.trim() === "CHAPTER II. The Market")).toBe(true); // heading-only page
  });

  it("DEFECT: all front matter before the first chapter heading is one undifferentiated group", () => {
    const parsed = parseManuscript(["TITLE PAGE", "To my father", "PREFACE", "Preface text.", "CHAPTER I", "Body."].join("\n\n"), { preserveLineation: true });
    expect(parsed.chunks[0]).toContain("TITLE PAGE");
    expect(parsed.chunks[0]).toContain("To my father");
    expect(parsed.structure.map((n) => n.nodeType)).not.toContain("dedication");
  });

  it("DEFECT (plain-text path): verse lineation is flattened when preserveLineation is false", () => {
    const parsed = parseManuscript("BOOK I\n\nOf Mans First Disobedience, and the Fruit\nOf that Forbidden Tree, whose mortal tast\nBrought Death into the World", {});
    expect(parsed.chunks.join("\n")).toContain("Fruit Of that Forbidden Tree");
  });
});

describe("reader-structure.ts render-time heading rules", () => {
  it("DEFECT: short ALL-CAPS chapter titles ending in '.' are treated as drama speaker cues, not headings", () => {
    expect(classifyHeading("THE PRISON-DOOR.")).toBeNull();
  });
  it("DEFECT: bare roman-numeral chapter labels are not headings", () => {
    expect(classifyHeading("I.")).toBeNull();
    expect(classifyHeading("XXIV.")).toBeNull();
  });
  it("DEFECT: printed contents without page numbers are not recognised as contents lines", () => {
    expect(looksLikePrintedContentsLine("CHAPTER I.  Loomings")).toBe(false);
    expect(looksLikePrintedContentsLine("Scene I. A public place.")).toBe(false);
  });
  it("DEFECT: fallback navigation keeps only the first heading per chunk", () => {
    const nav = buildFallbackNavigation([{ chunk_index: 0, content: "CHAPTER I\n\nshort\n\nCHAPTER II\n\nshort" }, { chunk_index: 1, content: "CHAPTER III\n\nbody" }]);
    expect(nav.map((n) => n.title)).toEqual(["CHAPTER I", "CHAPTER III"]);
  });
});