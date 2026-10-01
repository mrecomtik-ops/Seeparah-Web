// Self-test for the read-only catalog validator. Builds a synthetic source
// package + production snapshot that reproduce every defect class found in
// the 1 Oct 2026 structure audit, runs the validator offline, and asserts
// that each defect is detected. No network, no production access.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import JSZip from "jszip";
import { run } from "./validate.mjs";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "seeparah-validator-"));
const corpus = path.join(tmp, "corpus");

async function makePackage(key, title, xhtmlFiles, ncx) {
  const dir = path.join(corpus, key);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "metadata.json"), JSON.stringify({ candidate_id: key, title }));
  fs.writeFileSync(path.join(dir, "structure.json"), JSON.stringify({ nodes: ncx.map((t) => ({ title: t })) }));
  const zip = new JSZip();
  zip.file("mimetype", "application/epub+zip");
  zip.file("META-INF/container.xml", `<?xml version="1.0"?><container><rootfiles><rootfile full-path="OEBPS/content.opf"/></rootfiles></container>`);
  const items = xhtmlFiles.map((_, i) => `<item id="f${i}" href="f${i}.xhtml" media-type="application/xhtml+xml"/>`).join("");
  const spine = xhtmlFiles.map((_, i) => `<itemref idref="f${i}"/>`).join("");
  zip.file("OEBPS/content.opf", `<?xml version="1.0"?><package xmlns:dc="http://purl.org/dc/elements/1.1/"><metadata><dc:title>${title}</dc:title></metadata><manifest>${items}<item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/></manifest><spine>${spine}</spine></package>`);
  zip.file("OEBPS/toc.ncx", `<?xml version="1.0"?><ncx><navMap>${ncx.map((t, i) => `<navPoint id="n${i}"><navLabel><text>${t}</text></navLabel><content src="f0.xhtml"/></navPoint>`).join("")}</navMap></ncx>`);
  xhtmlFiles.forEach((body, i) => zip.file(`OEBPS/f${i}.xhtml`, `<html><head><title>${title}</title></head><body>${body}</body></html>`));
  fs.writeFileSync(path.join(dir, `${key}-images.epub`), await zip.generateAsync({ type: "nodebuffer" }));
}

const para = (n, w = 60) => Array.from({ length: w }, (_, i) => `word${n}x${i}`).join(" ");

// Book A: Scarlet-like drop caps + stranded chapter heading
await makePackage("SP-CAND-9001", "Dropcap Book", [
  `<div>*** START OF THE PROJECT GUTENBERG EBOOK DROPCAP ***</div>
   <h1>DROPCAP BOOK.</h1><h2>CONTENTS.</h2><table><tr><td>I.</td><td>THE DOOR.</td></tr><tr><td>II.</td><td>THE MARKET.</td></tr><tr><td>III.</td><td>THE END.</td></tr><tr><td>IV.</td><td>THE HILL.</td></tr><tr><td>V.</td><td>THE YARD.</td></tr></table>
   <h2>I.</h2><h4>THE DOOR.</h4><div class="initial"><img alt="M" src="m.jpg"/></div><p>uch was said about the door ${para(1)}</p><p>${para(2)}</p>
   <h2>II.</h2><h4>THE MARKET.</h4><div class="initial"><img alt="T" src="t.jpg"/></div><p>he market was busy ${para(3)}</p>
   <div>*** END OF THE PROJECT GUTENBERG EBOOK DROPCAP ***</div>`,
], ["I.", "II."]);

// Book B: Moby-like dropped divs (subtitle, verse, drama cues, stage directions)
await makePackage("SP-CAND-9002", "Div Book", [
  `<div>*** START OF THE PROJECT GUTENBERG EBOOK DIV ***</div>
   <h2>CHAPTER I.</h2><div class="subheadc">LOOMINGS.</div><p>Call me Ishmael ${para(4)}</p>
   <div class="i0">The ribs and terrors in the whale,<br/>Arched over me a dismal gloom,</div>
   <h2>CHAPTER II.</h2><div class="subheadc">MIDNIGHT, FORECASTLE.</div>
   <div class="drama small">HARPOONERS AND SAILORS.</div><p>(Foresail rises and discovers the watch.) ${para(5, 10)}</p>
   <div class="drama">1ST NANTUCKET SAILOR.</div><p>Oh, boys, don't be sentimental ${para(6, 20)}</p>
   <div class="stage">(Sings, and all follow.)</div>
   <div>*** END OF THE PROJECT GUTENBERG EBOOK DIV ***</div>`,
], ["CHAPTER I.", "CHAPTER II.", "CHAPTER II."]);

// Book C: Gulliver-like inserted Part headings + off-by-one nav
await makePackage("SP-CAND-9003", "Part Book", [
  `<div>*** START OF THE PROJECT GUTENBERG EBOOK PART ***</div>
   <h3>THE PUBLISHER TO THE READER.</h3><p>${para(7)}</p>
   <h2>PART I. A VOYAGE TO LILLIPUT.</h2><h3>CHAPTER I.</h3><p>${para(8)}</p><h3>CHAPTER II.</h3><p>${para(9)}</p><h3>CHAPTER III.</h3><p>${para(10)}</p>
   <div>*** END OF THE PROJECT GUTENBERG EBOOK PART ***</div>`,
], ["PART I. A VOYAGE TO LILLIPUT.", "CHAPTER I.", "CHAPTER II.", "CHAPTER III."]);

// Book D: clean book
await makePackage("SP-CAND-9004", "Clean Book", [
  `<div>*** START OF THE PROJECT GUTENBERG EBOOK CLEAN ***</div>
   <h2>CHAPTER I.</h2><p>${para(11, 200)}</p><h2>CHAPTER II.</h2><p>${para(12, 200)}</p>
   <div>*** END OF THE PROJECT GUTENBERG EBOOK CLEAN ***</div>`,
], ["CHAPTER I.", "CHAPTER II."]);

const book = (key, title) => ({ id: key, import_key: key, title, status: "published", source_language: "English", source_version: 1 });
const ch = (...blocks) => ({ content: blocks.join("\n\n") });
const snapshot = {
  readAt: "selftest",
  books: [
    {
      book: book("SP-CAND-9001", "Dropcap Book"),
      chunks: [
        ch("I.", "THE DOOR.", "II.", "THE MARKET.", "III.", "THE END.", "IV.", "THE HILL.", "V.", "THE YARD."),
        ch(`uch was said about the door ${para(1)}`, para(2), "II.", "THE MARKET."),
        ch(`he market was busy ${para(3)}`),
      ],
      nodes: [
        { node_key: "c1", node_type: "chapter", title: "I.", depth: 0, start_chunk_index: 1 },
        { node_key: "c2", node_type: "chapter", title: "II.", depth: 0, start_chunk_index: 1 },
      ],
    },
    {
      book: book("SP-CAND-9002", "Div Book"),
      chunks: [
        ch("CHAPTER I.", `Call me Ishmael ${para(4)}`),
        ch("CHAPTER II.", `(Foresail rises and discovers the watch.) ${para(5, 10)}`, `Oh, boys, don't be sentimental ${para(6, 20)}`),
      ],
      nodes: [
        { node_key: "c1", node_type: "chapter", title: "CHAPTER I.", depth: 0, start_chunk_index: 0 },
        { node_key: "c2", node_type: "chapter", title: "CHAPTER II.", depth: 0, start_chunk_index: 1 },
        { node_key: "c3", node_type: "chapter", title: "CHAPTER II.", depth: 0, start_chunk_index: 1 },
      ],
    },
    {
      book: book("SP-CAND-9003", "Part Book"),
      chunks: [
        ch(para(7), "PART I. A VOYAGE TO LILLIPUT."),
        ch("CHAPTER I.", para(8), "PART I. A VOYAGE TO LILLIPUT."),
        ch("CHAPTER II.", para(9), "PART I. A VOYAGE TO LILLIPUT."),
        ch("CHAPTER III.", para(10)),
      ],
      nodes: [
        { node_key: "p1", node_type: "part", title: "PART I. A VOYAGE TO LILLIPUT.", depth: 0, start_chunk_index: 0 },
        { node_key: "c1", node_type: "chapter", title: "CHAPTER I.", depth: 1, start_chunk_index: 0 },
        { node_key: "c2", node_type: "chapter", title: "CHAPTER II.", depth: 1, start_chunk_index: 1 },
        { node_key: "c3", node_type: "chapter", title: "CHAPTER III.", depth: 1, start_chunk_index: 2 },
      ],
    },
    {
      book: book("SP-CAND-9004", "Clean Book"),
      chunks: [ch("CHAPTER I.", para(11, 200)), ch("CHAPTER II.", para(12, 200))],
      nodes: [
        { node_key: "c1", node_type: "chapter", title: "CHAPTER I.", depth: 0, start_chunk_index: 0 },
        { node_key: "c2", node_type: "chapter", title: "CHAPTER II.", depth: 0, start_chunk_index: 1 },
      ],
    },
  ],
};
const snapPath = path.join(tmp, "prod.json");
fs.writeFileSync(snapPath, JSON.stringify(snapshot));
const out = path.join(tmp, "out");
const results = await run({ corpus, out, snapshot: snapPath });
const byKey = Object.fromEntries(results.map((r) => [r.summary.importKey, r]));
const has = (k, re) => byKey[k].issues.some((i) => re.test(i.defect));

let failed = 0;
const check = (label, cond) => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${label}`);
  if (!cond) failed++;
};
check("A: 2 drop caps lost", byKey["SP-CAND-9001"].summary.dropCaps.lost === 2);
check("A: printed TOC rendered as body", has("SP-CAND-9001", /printed TOC rendered as body/));
check("A: heading stranded at end of chunk", has("SP-CAND-9001", /stranded/));
check("A: category TEXT LOSS", byKey["SP-CAND-9001"].summary.flags.includes("TEXT LOSS"));
check("B: lost chapter subtitle", has("SP-CAND-9002", /lost chapter title\/subtitle/));
check("B: dropped verse", has("SP-CAND-9002", /dropped verse/));
check("B: lost speaker cue", has("SP-CAND-9002", /lost speaker cue/));
check("B: lost stage direction", has("SP-CAND-9002", /lost stage direction/));
check("B: duplicate nav heading", has("SP-CAND-9002", /duplicate heading in navigation/));
check("C: duplicated Part heading", has("SP-CAND-9003", /duplicated text/));
check("C: TOC target one page early", byKey["SP-CAND-9003"].summary.nav.offByOne === 3);
check("C: front heading missing from text (structure)", has("SP-CAND-9003", /source heading missing from text/));
check("C: category includes insertion + navigation", ["TEXT INSERTION / DUPLICATION", "NAVIGATION DEFECT"].every((f) => byKey["SP-CAND-9003"].summary.flags.includes(f)));
check("D: clean book passes text integrity", byKey["SP-CAND-9004"].summary.flags[0] === "PASS — text integrity" || byKey["SP-CAND-9004"].summary.flags[0] === "STRUCTURE ISSUE ONLY");
check("D: no text loss/insertion", !byKey["SP-CAND-9004"].issues.some((i) => /TEXT/.test(i.category)));
check("reports written", ["report.md", "discrepancies.csv", "books.json"].every((f) => fs.existsSync(path.join(out, f))));
console.log(`\n${failed ? `${failed} FAILED` : "ALL PASSED"} — output in ${out}`);
process.exit(failed ? 1 : 0);