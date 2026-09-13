import { describe, expect, it } from "vitest";
import JSZip from "jszip";
import { parseEpub, EpubValidationError } from "@/lib/admin/epub.server";

const CONTAINER_XML = `<?xml version="1.0"?>
<container><rootfiles><rootfile full-path="OEBPS/content.opf"/></rootfiles></container>`;

function opf(spineIds: string[], manifestExtra = "") {
  const manifestItems = spineIds.map((id) => `<item id="${id}" href="${id}.xhtml" media-type="application/xhtml+xml"/>`).join("\n");
  const spineItems = spineIds.map((id) => `<itemref idref="${id}"/>`).join("\n");
  return `<?xml version="1.0"?>
<package><manifest>${manifestItems}${manifestExtra}</manifest><spine>${spineItems}</spine></package>`;
}

async function buildEpub(chapters: Record<string, string>, opfXml?: string): Promise<Uint8Array> {
  const zip = new JSZip();
  zip.file("META-INF/container.xml", CONTAINER_XML);
  zip.file("OEBPS/content.opf", opfXml ?? opf(Object.keys(chapters)));
  for (const [id, xhtml] of Object.entries(chapters)) {
    zip.file(`OEBPS/${id}.xhtml`, xhtml);
  }
  return zip.generateAsync({ type: "uint8array" });
}

describe("parseEpub", () => {
  it("extracts chapters in spine order with tags stripped to plain text", async () => {
    const bytes = await buildEpub({
      ch1: "<html><body><h1>Chapter One</h1><p>Hello world.</p></body></html>",
      ch2: "<html><body><h1>Chapter Two</h1><p>Second chapter.</p></body></html>",
    });
    const result = await parseEpub(bytes);
    expect(result.chapters).toHaveLength(2);
    expect(result.chapters[0]?.title).toBe("Chapter One");
    expect(result.chapters[0]?.text).toContain("Hello world.");
    expect(result.chapters[1]?.title).toBe("Chapter Two");
  });

  it("never executes or retains <script> content", async () => {
    const bytes = await buildEpub({
      ch1: '<html><body><script>alert("pwned")</script><p>Safe text.</p></body></html>',
    });
    const result = await parseEpub(bytes);
    expect(result.chapters[0]?.text).not.toContain("pwned");
    expect(result.chapters[0]?.text).toContain("Safe text.");
  });

  it("rejects a manifest entry that tries to escape the archive via ../", async () => {
    const badOpf = opf(["ch1"]).replace('href="ch1.xhtml"', 'href="../../../etc/passwd"');
    const bytes = await buildEpub({ ch1: "<p>irrelevant</p>" }, badOpf);
    await expect(parseEpub(bytes)).rejects.toThrow(EpubValidationError);
  });

  it("rejects a file that isn't a zip archive at all", async () => {
    await expect(parseEpub(new TextEncoder().encode("not a zip"))).rejects.toThrow(EpubValidationError);
  });

  it("rejects an epub with no spine (no reading order)", async () => {
    const emptyOpf = `<?xml version="1.0"?><package><manifest></manifest><spine></spine></package>`;
    const bytes = await buildEpub({}, emptyOpf);
    await expect(parseEpub(bytes)).rejects.toThrow(EpubValidationError);
  });

  it("flags an empty chapter as a warning rather than silently dropping it", async () => {
    const bytes = await buildEpub({
      ch1: "<html><body></body></html>",
      ch2: "<html><body><p>Real content here.</p></body></html>",
    });
    const result = await parseEpub(bytes);
    expect(result.warnings.some((w) => w.includes("empty"))).toBe(true);
    expect(result.chapters.some((c) => c.text.includes("Real content"))).toBe(true);
  });

  it("refuses an epub whose every chapter is empty (likely a scanned/image-only book needing OCR)", async () => {
    const bytes = await buildEpub({ ch1: "<html><body></body></html>" });
    await expect(parseEpub(bytes)).rejects.toThrow(/OCR/);
  });
});
