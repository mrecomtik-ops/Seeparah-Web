#!/usr/bin/env node
// Seeparah catalog content-integrity validator — READ ONLY.
//
// Compares every imported Seeparah book in production against its local
// acquisition source package (EPUB + metadata.json + structure.json) and
// reports text loss, insertion/duplication, navigation and structure defects.
//
// Safety:
//   * Production is only ever read. All HTTP goes through `sbGet`, which
//     refuses any method other than GET and any /rpc/ endpoint.
//   * Nothing is written anywhere except the --out directory on local disk.
//   * No supabase-js client is created, so there is no accidental write path.
//
// Usage:
//   node scripts/catalog-integrity/validate.mjs \
//     --corpus "C:\Seeparah-Import\seeparah-1000-books" \
//     --env .env                      # SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (read only use)
//     --out audit-out                 # report.md, discrepancies.csv, books.json
//     [--save-snapshot prod.json]     # keep a copy of the production read
//     [--snapshot prod.json]          # run offline from a saved snapshot instead of Supabase
//     [--only SP-CAND-0075,SP-CAND-0001]
//     [--published-only]
//
// Requires the repo's own dependencies: jszip, happy-dom (devDependency).

import fs from "node:fs";
import path from "node:path";
import JSZip from "jszip";
import { Window } from "happy-dom";

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------
const argv = process.argv.slice(2);
function arg(name, fallback = undefined) {
  const i = argv.indexOf(`--${name}`);
  if (i < 0) return fallback;
  const next = argv[i + 1];
  return next && !next.startsWith("--") ? next : true;
}

const THRESHOLDS = {
  smallChunkWords: 150,
  largeChunkWords: 3000,
  minBlockNormChars: 4,
  textLossWords: 1, // any missing body word from a real text block is text loss
  parityWarnRatio: 0.002,
  manualReviewMissingRatio: 0.2, // >20% missing ⇒ probably a different edition
};

// ---------------------------------------------------------------------------
// Text helpers
// ---------------------------------------------------------------------------
const wc = (s) => (s && s.trim() ? s.trim().split(/\s+/u).length : 0);
/** Letters + digits only, lowercase, diacritics folded. Separator-free. */
function norm(s) {
  return String(s ?? "")
    .normalize("NFKD")
    .replace(/\p{M}+/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "");
}
const clip = (s, n = 140) => {
  const t = String(s ?? "").replace(/\s+/g, " ").trim();
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
};
function countOccurrences(hay, needle) {
  if (!needle) return 0;
  let n = 0;
  let i = hay.indexOf(needle);
  while (i >= 0) {
    n++;
    i = hay.indexOf(needle, i + needle.length);
  }
  return n;
}
function splitBlocks(chunk) {
  return String(chunk ?? "")
    .replace(/\r\n/g, "\n")
    .split(/\n\s*\n/)
    .map((b) => b.trim())
    .filter(Boolean);
}

const PG_BOILERPLATE_RE =
  /project gutenberg|gutenberg(?:™|\(tm\)|-tm)|\*\*\*\s*(?:start|end) of (?:the|this) project|www\.gutenberg\.org|this e-?book is for the use of anyone/i;
const BACK_MATTER_RE =
  /^(?:transcriber[’']?s? notes?|transcriber[’']?s? note:|electrotyped and printed|printed by|end of (?:the )?project gutenberg|footnotes?:?|index)\b/i;
const CONTENTS_HEADING_RE = /^(?:contents|table of contents|list of illustrations|illustrations)\.?$/i;

// ---------------------------------------------------------------------------
// Production access (GET-only)
// ---------------------------------------------------------------------------
function loadEnv(file) {
  const env = { ...process.env };
  if (file && file !== true && fs.existsSync(file)) {
    for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*"?([^"\r\n]*)"?\s*$/);
      if (m) env[m[1]] = m[2];
    }
  }
  return env;
}

function makeReader(env) {
  const url = env.SUPABASE_URL || env.VITE_SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "Need SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (used for GET requests only), or pass --snapshot.",
    );
  }
  async function sbGet(pathAndQuery, range) {
    if (/\/rpc\//.test(pathAndQuery)) throw new Error("validator refuses RPC calls");
    const headers = { apikey: key, Accept: "application/json" };
    if (!key.startsWith("sb_")) headers.Authorization = `Bearer ${key}`;
    if (range) headers.Range = range;
    const res = await fetch(`${url}/rest/v1/${pathAndQuery}`, { method: "GET", headers });
    if (!res.ok) throw new Error(`GET ${pathAndQuery} → ${res.status} ${await res.text()}`);
    return res.json();
  }
  async function getAll(pathAndQuery) {
    const out = [];
    for (let from = 0; ; from += 1000) {
      const page = await sbGet(pathAndQuery, `${from}-${from + 999}`);
      out.push(...page);
      if (page.length < 1000) break;
    }
    return out;
  }
  return { sbGet, getAll };
}

async function readProduction(env, opts) {
  const { getAll } = makeReader(env);
  const books = await getAll(
    "books?select=id,title,author,status,import_key,source_language,source_version,total_chunks,word_count,source_url,source_edition_id,edition_title,description,structure_review_status,cleanup_review_status&order=title.asc",
  );
  const selected = books.filter(
    (b) =>
      (!opts.only || opts.only.includes(b.import_key) || opts.only.includes(b.id)) &&
      (!opts.publishedOnly || b.status === "published"),
  );
  const out = [];
  for (const b of selected) {
    const sv = b.source_version ?? 1;
    const lang = encodeURIComponent(b.source_language);
    const chunks = await getAll(
      `book_chunks?select=chunk_index,content,status&book_id=eq.${b.id}&language=eq.${lang}&source_version=eq.${sv}&order=chunk_index.asc`,
    );
    const nodes = await getAll(
      `book_structure_nodes?select=node_key,parent_node_key,node_type,title,ordinal,depth,start_chunk_index,end_chunk_index&book_id=eq.${b.id}&language=eq.${lang}&source_version=eq.${sv}&order=ordinal.asc`,
    );
    out.push({ book: b, chunks, nodes });
    process.stderr.write(`  read ${b.import_key ?? b.id} ${b.title} — ${chunks.length} chunks, ${nodes.length} nodes\n`);
  }
  return { readAt: new Date().toISOString(), books: out };
}

// ---------------------------------------------------------------------------
// Local corpus discovery
// ---------------------------------------------------------------------------
function walk(dir, depth, visit) {
  let entries = [];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (depth > 0 && !/^(node_modules|\.git)$/.test(e.name)) walk(p, depth - 1, visit);
    } else visit(p);
  }
}

function indexCorpus(root) {
  const packages = new Map(); // key -> { dir, metadataPath, structurePath, epubs, txts, metadata }
  const metas = [];
  walk(root, 5, (p) => {
    if (path.basename(p).toLowerCase() === "metadata.json") metas.push(p);
  });
  for (const metadataPath of metas) {
    const dir = path.dirname(metadataPath);
    let metadata = null;
    let raw = "";
    try {
      raw = fs.readFileSync(metadataPath, "utf8");
      metadata = JSON.parse(raw);
    } catch {
      /* keep null */
    }
    const key = (raw.match(/SP-CAND-\d{3,5}/) ?? dir.match(/SP-CAND-\d{3,5}/) ?? [null])[0];
    const epubs = [];
    const txts = [];
    let structurePath = null;
    walk(dir, 3, (p) => {
      const b = path.basename(p).toLowerCase();
      if (b.endsWith(".epub")) epubs.push(p);
      else if (b.endsWith(".txt")) txts.push(p);
      else if (b === "structure.json") structurePath = p;
    });
    epubs.sort((a, b) => Number(/images/i.test(b)) - Number(/images/i.test(a)));
    const entry = { key, dir, metadataPath, structurePath, epubs, txts, metadata };
    if (key) packages.set(key, entry);
    const title = metadata?.title ?? metadata?.book?.title;
    if (title) packages.set(`title:${norm(title)}`, entry);
  }
  return packages;
}

// ---------------------------------------------------------------------------
// EPUB source model
// ---------------------------------------------------------------------------
const BLOCK_TAGS = new Set([
  "h1", "h2", "h3", "h4", "h5", "h6", "p", "li", "tr", "pre", "figcaption", "dt", "dd", "caption", "blockquote", "div",
]);
const CONTAINER_HINT = "p,div,h1,h2,h3,h4,h5,h6,table,ul,ol,blockquote,figure,section,pre,dl";

function textWithBreaks(node) {
  let out = "";
  for (const c of node.childNodes) {
    if (c.nodeType === 3) out += c.nodeValue;
    else if (c.nodeType === 1) {
      const t = c.tagName.toLowerCase();
      if (t === "br") out += "\n";
      else if (t === "img") continue;
      else if (t === "td" || t === "th") out += ` ${textWithBreaks(c)} `;
      else out += textWithBreaks(c);
    }
  }
  return out;
}
const cleanText = (s) =>
  s
    .split("\n")
    .map((l) => l.replace(/[\s\u00a0]+/g, " ").trim())
    .filter(Boolean)
    .join("\n");

function classifyBlock(tag, cls, text, ctx) {
  const c = cls.toLowerCase();
  if (/^h[1-6]$/.test(tag)) return "heading";
  if (tag === "tr") return ctx.underContents ? "toc_row" : "table_row";
  if (tag === "figcaption" || /caption|figcap|illus/.test(c) || ctx.inFigure) return "caption";
  if (/footnote|fnote|endnote/.test(c)) return "footnote";
  if (/subhead|subtitle|chapsub|chaptitle|chapter-title/.test(c)) return "subtitle";
  if (/stage|direction|scenedesc|\bsd\b|exit|entrance/.test(c)) return "stage_direction";
  if (/drama|speaker|spkr|persona|character/.test(c)) {
    if (/^\(.*\)$|^\[.*\]$/s.test(text.trim())) return "stage_direction";
    if (text.length <= 60 && !/[a-z]{3}/.test(text.replace(/\(.*?\)/g, ""))) return "speaker_cue";
    return "drama";
  }
  if (/poem|verse|stanza|^line|\bline\b|^i\d+$|\bi\d+\b|indent\d/.test(c) || (text.includes("\n") && text.split("\n").length >= 2 && tag !== "p")) return "verse";
  if (tag === "li" || tag === "dt" || tag === "dd") return "list_item";
  if (tag === "div") return "div_text";
  return "paragraph";
}

async function parseEpubSource(file) {
  const zip = await JSZip.loadAsync(fs.readFileSync(file));
  const win = new Window();
  const parser = new win.DOMParser();
  const container = await zip.file("META-INF/container.xml")?.async("string");
  const opfPath = container?.match(/full-path="([^"]+)"/)?.[1];
  if (!opfPath) throw new Error("EPUB has no OPF");
  const opf = parser.parseFromString(await zip.file(opfPath).async("string"), "text/xml");
  const base = opfPath.includes("/") ? opfPath.slice(0, opfPath.lastIndexOf("/") + 1) : "";
  const manifest = new Map();
  for (const it of opf.querySelectorAll("item")) manifest.set(it.getAttribute("id"), it.getAttribute("href"));
  const spine = [...opf.querySelectorAll("itemref")].map((r) => ({
    href: manifest.get(r.getAttribute("idref")),
    linear: r.getAttribute("linear") !== "no",
  }));
  const meta = {};
  for (const tag of ["title", "creator", "description", "source", "publisher", "rights", "identifier"]) {
    const el = [...opf.getElementsByTagName(`dc:${tag}`)];
    if (el.length) meta[tag] = el.map((e) => e.textContent.trim());
  }

  // Navigation: NCX (EPUB2) and nav.xhtml (EPUB3)
  const toc = [];
  const ncxHref = [...manifest.values()].find((h) => /\.ncx$/i.test(h));
  if (ncxHref) {
    const ncx = parser.parseFromString(await zip.file(base + ncxHref).async("string"), "text/xml");
    const walkNav = (el, depth) => {
      for (const np of [...el.children].filter((c) => c.tagName.toLowerCase() === "navpoint")) {
        toc.push({
          depth,
          label: np.querySelector("text")?.textContent.trim() ?? "",
          src: np.querySelector("content")?.getAttribute("src") ?? "",
        });
        walkNav(np, depth + 1);
      }
    };
    const navMap = ncx.querySelector("navMap");
    if (navMap) walkNav(navMap, 0);
  }

  const blocks = [];
  const images = [];
  for (let si = 0; si < spine.length; si++) {
    const href = spine[si].href;
    if (!href) continue;
    const f = zip.file(base + href);
    if (!f) continue;
    const doc = parser.parseFromString(await f.async("string"), "text/html");
    const body = doc.body;
    if (!body) continue;
    let lastHeading = "";
    const state = { underContents: false }; // document-order state shared across wrappers
    const visit = (el, ctx) => {
      for (const c of el.children) {
        const tag = c.tagName.toLowerCase();
        const cls = c.getAttribute("class") ?? "";
        const id = c.getAttribute("id") ?? ctx.id;
        const nextCtx = {
          ...ctx,
          id,
          inFigure: ctx.inFigure || tag === "figure" || /\bfig/.test(cls.toLowerCase()),
          boiler: ctx.boiler || /pg-(?:header|footer)|pg-boilerplate|pglicense/i.test(`${id} ${cls}`),
        };
        if (tag === "img") {
          images.push({ spine: si, href, alt: c.getAttribute("alt") ?? "", cls, parentCls: el.getAttribute("class") ?? "", blockIndex: blocks.length });
          blocks.push({ spine: si, href, id, tag: "img", cls, kind: "img", alt: c.getAttribute("alt") ?? "", text: "", boiler: nextCtx.boiler });
          continue;
        }
        const isBlock = BLOCK_TAGS.has(tag);
        const leaf = isBlock && (tag === "tr" || !c.querySelector(CONTAINER_HINT));
        if (leaf) {
          for (const im of c.querySelectorAll("img")) {
            images.push({ spine: si, href, alt: im.getAttribute("alt") ?? "", cls: im.getAttribute("class") ?? "", parentCls: cls, blockIndex: blocks.length });
            blocks.push({ spine: si, href, id, tag: "img", cls: im.getAttribute("class") ?? "", kind: "img", alt: im.getAttribute("alt") ?? "", text: "", boiler: nextCtx.boiler, inlineIn: blocks.length + 1 });
          }
          const text = cleanText(textWithBreaks(c));
          if (!text) continue;
          if (/^h[1-6]$/.test(tag)) state.underContents = CONTENTS_HEADING_RE.test(text.replace(/\s+/g, " "));
          const kind = classifyBlock(tag, cls, text, { ...nextCtx, underContents: state.underContents });
          if (kind === "heading") lastHeading = text;
          blocks.push({ spine: si, href, id, tag, cls, kind, text, boiler: nextCtx.boiler, afterHeading: lastHeading });
        } else {
          visit(c, nextCtx);
        }
      }
    };
    visit(body, { id: "", inFigure: false, boiler: false, underContents: false });
  }
  win.close();

  // Boilerplate range (old-style *** markers and new pg-header/footer sections)
  let start = blocks.findIndex((b) => /\*\*\*\s*start of (?:the|this) project gutenberg/i.test(b.text));
  let end = blocks.findIndex((b) => /\*\*\*\s*end of (?:the|this) project gutenberg/i.test(b.text));
  if (start < 0) start = -1;
  if (end < 0) end = blocks.length;
  blocks.forEach((b, i) => {
    b.index = i;
    b.inBody = i > start && i < end && !b.boiler;
  });

  // Running heads: identical heading text repeated ≥3 times in body
  const headCounts = new Map();
  for (const b of blocks) if (b.inBody && b.kind === "heading") headCounts.set(norm(b.text), (headCounts.get(norm(b.text)) ?? 0) + 1);
  for (const b of blocks) if (b.inBody && b.kind === "heading" && headCounts.get(norm(b.text)) >= 3 && !/^(chapter|book|part|act|scene)/i.test(b.text)) b.kind = "running_head";

  // Subtitles: short non-heading block immediately after a chapter-like heading
  for (let i = 1; i < blocks.length; i++) {
    const prev = blocks[i - 1];
    const b = blocks[i];
    if (b.inBody && prev.kind === "heading" && /^(chapter|chap\.|book|part|act|stave|letter|[ivxlcdm]+\.?$)/i.test(prev.text) && ["div_text", "paragraph"].includes(b.kind) && b.text.length <= 80 && !/[.?!]["”’]?$/.test(b.text.replace(/\.$/, "")) && b.text === b.text.toUpperCase()) {
      b.kind = "subtitle";
    }
  }
  return { file, meta, spine, toc, blocks, images };
}

function parseTxtSource(file) {
  const raw = fs.readFileSync(file, "utf8").replace(/\r\n/g, "\n");
  const s = raw.search(/\*\*\*\s*START OF (?:THE|THIS) PROJECT GUTENBERG[^\n]*\n/i);
  const e = raw.search(/\*\*\*\s*END OF (?:THE|THIS) PROJECT GUTENBERG/i);
  const body = raw.slice(s >= 0 ? raw.indexOf("\n", s) + 1 : 0, e >= 0 ? e : raw.length);
  const blocks = body
    .split(/\n\s*\n/)
    .map((t) => t.trim())
    .filter(Boolean)
    .map((text, index) => ({ index, spine: 0, href: path.basename(file), id: "", tag: "p", cls: "", kind: "paragraph", text, inBody: true }));
  return { file, meta: {}, spine: [], toc: [], blocks, images: [] };
}

// ---------------------------------------------------------------------------
// Production text model
// ---------------------------------------------------------------------------
function buildProdModel(chunks) {
  const blocks = [];
  // P is separator-free so a source block split/merged differently in
  // production still aligns; blockStarts records where each prod block begins.
  let P = "";
  const chunkStart = [];
  const blockStarts = new Set();
  chunks.forEach((c, ci) => {
    chunkStart[ci] = P.length;
    splitBlocks(c.content).forEach((text, bi) => {
      const n = norm(text);
      blocks.push({ chunk: ci, block: bi, text, n, pos: P.length });
      blockStarts.add(P.length);
      P += n;
    });
  });
  const locate = (pos) => {
    let lo = 0;
    let hi = blocks.length - 1;
    let ans = 0;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (blocks[mid].pos <= pos) {
        ans = mid;
        lo = mid + 1;
      } else hi = mid - 1;
    }
    return blocks[ans];
  };
  return { blocks, P, locate, chunkStart, blockStarts };
}

// ---------------------------------------------------------------------------
// Checks for one book
// ---------------------------------------------------------------------------
const TEXT_KINDS = new Set(["paragraph", "div_text", "verse", "drama", "speaker_cue", "stage_direction", "subtitle", "footnote", "list_item", "heading"]);

function validateBook({ book, chunks, nodes }, src, pkg) {
  const issues = [];
  const add = (o) => issues.push({ book: book.title, importKey: book.import_key, sourcePath: src?.file ?? pkg?.dir ?? "", ...o });
  const prod = buildProdModel(chunks);
  const prodWords = chunks.reduce((a, c) => a + wc(c.content), 0);
  const pageOf = (pb) => (pb ? `page ${pb.chunk + 1} (chunk ${pb.chunk}), block ${pb.block}` : "—");

  const body = src.blocks.filter((b) => b.inBody);
  const S = `|${body.map((b) => (b.kind === "img" ? norm(b.alt) : norm(b.text))).join("|")}|`;
  const sourceWords = body.reduce((a, b) => a + (b.kind === "img" ? 0 : wc(b.text)), 0);

  // 1. Missing source blocks (sequential alignment with global fallback)
  let cursor = 0;
  let missingTextWords = 0;
  let missingStructureWords = 0;
  const missingByKind = {};
  let lastFound = null;
  for (const b of body) {
    if (b.kind === "img") continue;
    const n = norm(b.text);
    if (n.length < THRESHOLDS.minBlockNormChars) continue;
    const probes = n.length > 400 ? [n.slice(0, 160), n.slice(Math.floor(n.length / 2) - 80, Math.floor(n.length / 2) + 80), n.slice(-160)] : [n];
    let pos = -1;
    const hits = probes.map((p) => {
      let i = prod.P.indexOf(p, cursor);
      if (i < 0) i = prod.P.indexOf(p);
      return i;
    });
    pos = hits[0];
    const found = hits.every((h) => h >= 0);
    if (found) {
      cursor = pos;
      lastFound = prod.locate(pos);
      continue;
    }
    const w = wc(b.text);
    const textKind = TEXT_KINDS.has(b.kind) && b.kind !== "heading";
    const defect =
      {
        subtitle: "lost chapter title/subtitle",
        verse: "dropped verse block",
        speaker_cue: "lost speaker cue",
        stage_direction: "lost stage direction",
        drama: "dropped drama block",
        div_text: "dropped <div> text",
        footnote: "dropped footnote",
        paragraph: "missing text",
        list_item: "missing text",
        heading: "source heading missing from text",
        toc_row: "printed TOC row not carried (structure)",
        table_row: "table row missing",
        caption: "caption missing (structure)",
        running_head: "running head removed (structure)",
      }[b.kind] ?? "missing text";
    const partial = hits.some((h) => h >= 0);
    if (textKind || b.kind === "table_row") missingTextWords += w;
    else missingStructureWords += w;
    missingByKind[defect] = (missingByKind[defect] ?? 0) + 1;
    add({
      sourceLocation: `${b.href}${b.id ? `#${b.id}` : ""} · block ${b.index} <${b.tag}${b.cls ? `.${b.cls}` : ""}>`,
      sourceText: clip(b.text),
      productionLocation: lastFound ? `expected after ${pageOf(lastFound)}` : "expected near start",
      productionText: lastFound ? clip(lastFound.text, 80) : "",
      defect: partial ? `${defect} (partial)` : defect,
      affected: `${w} words / 1 block`,
      words: w,
      severity: textKind ? (b.kind === "subtitle" || b.kind === "speaker_cue" ? "high" : "critical") : "low",
      category: textKind || b.kind === "table_row" ? "TEXT LOSS" : "STRUCTURE",
    });
  }

  // 2. Drop caps (img alt single letter, or initial/dropcap classes)
  let dropLost = 0;
  let dropOk = 0;
  for (const img of src.blocks.filter((b) => b.kind === "img" && b.inBody)) {
    const alt = img.alt.trim();
    const isDrop = /^[\p{Lu}]$/u.test(alt) || (/initial|drop-?cap/i.test(img.cls) && alt.length <= 2);
    if (!isDrop) continue;
    const next = src.blocks.slice(img.index + 1).find((b) => b.kind !== "img" && b.text);
    if (!next) continue;
    const frag = norm(next.text).slice(0, 30);
    const letter = norm(alt);
    // Intact = the letter immediately precedes the fragment (same block). If the
    // source text already contains the letter (decorative alt), `frag` starts
    // with it and the block-level check above covers it.
    let i = prod.P.indexOf(frag);
    let verdict = null;
    while (i >= 0 && !verdict) {
      if (prod.blockStarts.has(i)) verdict = "lost";
      else if (prod.P.slice(i - letter.length, i) === letter) verdict = "ok";
      else i = prod.P.indexOf(frag, i + 1);
    }
    if (!verdict) continue; // paragraph itself missing — reported by the block check
    if (verdict === "ok") {
      dropOk++;
      continue;
    }
    dropLost++;
    const pb = prod.locate(i);
    add({
      sourceLocation: `${img.href}${img.id ? `#${img.id}` : ""} · <img alt="${alt}"> + block ${next.index}`,
      sourceText: `${alt}${clip(next.text, 60)}`,
      productionLocation: pageOf(pb),
      productionText: clip(pb.text, 60),
      defect: "missing drop-cap letter (img alt)",
      affected: "1 word corrupted",
      words: 1,
      severity: "critical",
      category: "TEXT LOSS",
    });
  }

  // 3. Inserted / duplicated production text
  const srcBlockCounts = new Map();
  for (const b of body) if (b.kind !== "img") srcBlockCounts.set(norm(b.text), (srcBlockCounts.get(norm(b.text)) ?? 0) + 1);
  const prodBlockCounts = new Map();
  for (const pb of prod.blocks) prodBlockCounts.set(pb.n, (prodBlockCounts.get(pb.n) ?? 0) + 1);
  let insertedWords = 0;
  let duplicatedWords = 0;
  const reportedDup = new Set();
  const S2 = S.replace(/\|/g, "");
  for (const pb of prod.blocks) {
    if (pb.n.length < 6) continue;
    if (!S2.includes(pb.n)) {
      // Not in source at all → inserted (or prod merged several source blocks; check halves)
      const half = Math.floor(pb.n.length / 2);
      if (S2.includes(pb.n.slice(0, half)) && S2.includes(pb.n.slice(half))) continue;
      insertedWords += wc(pb.text);
      add({
        sourceLocation: "— (not in source)",
        sourceText: "",
        productionLocation: pageOf(pb),
        productionText: clip(pb.text),
        defect: "inserted text",
        affected: `${wc(pb.text)} words / 1 block`,
        words: wc(pb.text),
        severity: "high",
        category: "TEXT INSERTION / DUPLICATION",
      });
      continue;
    }
    if (reportedDup.has(pb.n)) continue;
    const pc = prodBlockCounts.get(pb.n) ?? 0;
    // Source occurrences count substrings too, so a heading that also appears
    // inside a printed-contents row ("II. THE MARKET.") is not a false duplicate.
    const sc = Math.max(srcBlockCounts.get(pb.n) ?? 0, pb.n.length <= 160 ? countOccurrences(S2, pb.n) : 0);
    if (pc > Math.max(1, sc)) {
      reportedDup.add(pb.n);
      const extra = pc - Math.max(1, sc);
      duplicatedWords += extra * wc(pb.text);
      const pages = prod.blocks.filter((x) => x.n === pb.n).map((x) => x.chunk + 1);
      add({
        sourceLocation: `source occurrences: ${sc}`,
        sourceText: clip(pb.text, 80),
        productionLocation: `pages ${pages.slice(0, 12).join(", ")}${pages.length > 12 ? "…" : ""}`,
        productionText: clip(pb.text, 80),
        defect: "duplicated text",
        affected: `${extra} extra copies (${extra * wc(pb.text)} words)`,
        words: extra * wc(pb.text),
        severity: "high",
        category: "TEXT INSERTION / DUPLICATION",
      });
    }
  }

  // 4. Navigation checks
  let navOffByOne = 0;
  let navMissing = 0;
  let navStranded = 0;
  let navDup = 0;
  const chunkBlocks = chunks.map((c) => splitBlocks(c.content).map(norm));
  nodes.forEach((node, i) => {
    if (!node.title) return;
    const t = norm(node.title);
    if (!t) return;
    const prevNode = nodes[i - 1];
    if (prevNode && norm(prevNode.title ?? "") === t && (prevNode.depth === node.depth)) {
      navDup++;
      add({ sourceLocation: "book_structure_nodes", sourceText: "", productionLocation: `nodes ${prevNode.node_key}, ${node.node_key}`, productionText: node.title, defect: "duplicate heading in navigation", affected: "1 nav entry", words: 0, severity: "medium", category: "NAVIGATION DEFECT" });
    }
    // Prefix matches are allowed ("chapteri" ~ "chapteriloomings") but never
    // across a numeral boundary ("chapteri" must not match "chapterii").
    const prefixOk = (long, short) =>
      long.startsWith(short) && !/[ivxlcdm0-9]/.test(long.charAt(short.length));
    const matches = (n) =>
      Boolean(n) &&
      (t.length <= 4 ? n === t : n === t || ((prefixOk(n, t) || prefixOk(t, n)) && n.length >= 3));
    const here = chunkBlocks[node.start_chunk_index] ?? [];
    const at = here.findIndex(matches);
    const label = `"${clip(node.title, 50)}" → page ${node.start_chunk_index + 1}`;
    if (at >= 0) {
      const tailWords = splitBlocks(chunks[node.start_chunk_index].content).slice(at + 1).reduce((a, b) => a + wc(b), 0);
      if (at > 0 && tailWords < 60 && node.start_chunk_index < chunks.length - 1) {
        navStranded++;
        add({ sourceLocation: "book_structure_nodes", sourceText: "", productionLocation: label, productionText: `heading is block ${at} of ${here.length}; body starts on page ${node.start_chunk_index + 2}`, defect: "heading stranded at end of previous chunk", affected: "1 nav target", words: 0, severity: "medium", category: "NAVIGATION DEFECT" });
      }
      return;
    }
    const nextHead = (chunkBlocks[node.start_chunk_index + 1] ?? []).slice(0, 4);
    if (nextHead.some(matches)) {
      navOffByOne++;
      add({ sourceLocation: "book_structure_nodes", sourceText: "", productionLocation: label, productionText: `title starts page ${node.start_chunk_index + 2}`, defect: "TOC target one page early", affected: "1 nav target", words: 0, severity: "medium", category: "NAVIGATION DEFECT" });
      return;
    }
    const anywhere = chunkBlocks.findIndex((bs) => bs.some(matches));
    navMissing++;
    add({ sourceLocation: "book_structure_nodes", sourceText: "", productionLocation: label, productionText: anywhere >= 0 ? `title found on page ${anywhere + 1}` : "title not in text", defect: anywhere >= 0 ? "TOC target mismatch" : "navigation heading missing from text", affected: "1 nav target", words: 0, severity: "medium", category: "NAVIGATION DEFECT" });
  });

  // 5. Stranded headings in chunks (any source heading as last block of a non-final chunk)
  const sourceHeadingNorms = new Set(body.filter((b) => b.kind === "heading" || b.kind === "subtitle").map((b) => norm(b.text)));
  let strandedChunks = 0;
  chunks.forEach((c, ci) => {
    if (ci === chunks.length - 1) return;
    const bs = splitBlocks(c.content);
    if (bs.length < 2) return;
    const last = norm(bs[bs.length - 1]);
    if (sourceHeadingNorms.has(last)) {
      strandedChunks++;
      add({ sourceLocation: "", sourceText: "", productionLocation: `page ${ci + 1}, last block`, productionText: clip(bs[bs.length - 1], 80), defect: "heading stranded at end of chunk", affected: "1 block", words: 0, severity: "low", category: "STRUCTURE" });
    }
  });

  // 6. Page size
  const sizes = chunks.map((c) => wc(c.content));
  const small = sizes.map((w, i) => ({ w, i })).filter((x) => x.w < THRESHOLDS.smallChunkWords);
  const large = sizes.map((w, i) => ({ w, i })).filter((x) => x.w > THRESHOLDS.largeChunkWords);
  if (small.length) add({ sourceLocation: "", sourceText: "", productionLocation: small.slice(0, 15).map((x) => `p${x.i + 1}(${x.w}w)`).join(" "), productionText: "", defect: "very small chunks/pages", affected: `${small.length} pages`, words: 0, severity: "low", category: "STRUCTURE" });
  if (large.length) add({ sourceLocation: "", sourceText: "", productionLocation: large.slice(0, 15).map((x) => `p${x.i + 1}(${x.w}w)`).join(" "), productionText: "", defect: "very large chunks/pages", affected: `${large.length} pages`, words: 0, severity: "low", category: "STRUCTURE" });

  // 7. Boilerplate / back matter / printed TOC / captions in reader content
  let boilerHits = 0;
  let backMatter = 0;
  let tocRowsAsBody = 0;
  let captionsAsBody = 0;
  const tocRowNorms = new Set(body.filter((b) => b.kind === "toc_row").map((b) => norm(b.text)).filter((n) => n.length >= 3));
  const captionNorms = new Set([
    ...body.filter((b) => b.kind === "caption").map((b) => norm(b.text)),
    ...src.blocks.filter((b) => b.kind === "img" && b.inBody && b.alt.trim().length > 2).map((b) => norm(b.alt)),
  ].filter((n) => n.length >= 6));
  // Printed TOC rows that appear in the front-matter pages (before the first body chapter target)
  const firstBodyNode = nodes.find((n) => /^(chapter|act|book|part|poem|story|canto)$/.test(n.node_type) && n.start_chunk_index > 0);
  const frontEnd = Math.max(1, firstBodyNode ? firstBodyNode.start_chunk_index : 1);
  const frontP2 = chunks.slice(0, frontEnd).map((c) => norm(c.content)).join("");
  for (const r of tocRowNorms) if (frontP2.includes(r)) tocRowsAsBody++;
  for (const pb of prod.blocks) {
    if (PG_BOILERPLATE_RE.test(pb.text)) {
      boilerHits++;
      add({ sourceLocation: "", sourceText: "", productionLocation: pageOf(pb), productionText: clip(pb.text), defect: "Project Gutenberg boilerplate in reader content", affected: "1 block", words: wc(pb.text), severity: "medium", category: "STRUCTURE" });
    }
    if (BACK_MATTER_RE.test(pb.text.trim())) {
      backMatter++;
      add({ sourceLocation: "", sourceText: "", productionLocation: pageOf(pb), productionText: clip(pb.text), defect: "back matter mixed into body", affected: "1 block", words: wc(pb.text), severity: "low", category: "STRUCTURE" });
    }
    if (captionNorms.has(pb.n)) {
      captionsAsBody++;
      add({ sourceLocation: "", sourceText: "", productionLocation: pageOf(pb), productionText: clip(pb.text, 80), defect: "illustration caption without illustration", affected: "1 block", words: wc(pb.text), severity: "low", category: "STRUCTURE" });
    }
  }
  if (tocRowsAsBody >= 3) add({ sourceLocation: "printed contents table", sourceText: `${tocRowNorms.size} rows`, productionLocation: "reader body", productionText: `${tocRowsAsBody} contents rows rendered as body blocks`, defect: "printed TOC rendered as body", affected: `${tocRowsAsBody} blocks`, words: 0, severity: "low", category: "STRUCTURE" });

  // 8. Source headings present in navigation but missing from text — covered by nav checks above.
  // 9. structure.json comparison (shape-agnostic)
  let structureJson = null;
  if (pkg?.structurePath) {
    try {
      const sj = JSON.parse(fs.readFileSync(pkg.structurePath, "utf8"));
      const titles = [];
      const grab = (o) => {
        if (Array.isArray(o)) o.forEach(grab);
        else if (o && typeof o === "object") {
          if (typeof o.title === "string") titles.push(o.title);
          Object.values(o).forEach(grab);
        }
      };
      grab(sj);
      const prodTitles = new Set(nodes.map((n) => norm(n.title ?? "")));
      const missingInProd = titles.filter((t) => !prodTitles.has(norm(t)));
      structureJson = { titles: titles.length, prodNodes: nodes.length, missingInProd: missingInProd.slice(0, 20) };
      if (missingInProd.length) add({ sourceLocation: pkg.structurePath, sourceText: missingInProd.slice(0, 5).join(" | "), productionLocation: "book_structure_nodes", productionText: `${nodes.length} nodes`, defect: "structure.json node missing from production navigation", affected: `${missingInProd.length} nodes`, words: 0, severity: "medium", category: "NAVIGATION DEFECT" });
    } catch (e) {
      structureJson = { error: String(e) };
    }
  }

  // Front matter inventory: source body items before the first chapter-level heading
  const firstBody = body.findIndex((b) => b.kind === "heading" && /^(chapter|chap\.|book|part|act|stave|letter|i\.?$|1\.?$)/i.test(b.text));
  const front = body.slice(0, firstBody < 0 ? 0 : firstBody).filter((b) => b.kind !== "img" || b.alt);
  const frontInventory = front.slice(0, 40).map((b) => {
    const n = norm(b.kind === "img" ? b.alt : b.text);
    const i = n.length >= 3 ? prod.P.indexOf(n.slice(0, 120)) : -1;
    return { kind: b.kind, tag: b.tag, text: clip(b.kind === "img" ? `[img] ${b.alt}` : b.text, 70), inProduction: i >= 0 ? pageOf(prod.locate(i)) : "absent" };
  });

  // Categorize
  const realLoss = issues.filter((x) => x.category === "TEXT LOSS");
  const ins = issues.filter((x) => x.category === "TEXT INSERTION / DUPLICATION");
  const nav = issues.filter((x) => x.category === "NAVIGATION DEFECT");
  const struct = issues.filter((x) => x.category === "STRUCTURE");
  const missingRatio = sourceWords ? missingTextWords / sourceWords : 0;
  const flags = [];
  if (missingRatio > THRESHOLDS.manualReviewMissingRatio) flags.push("NEEDS MANUAL REVIEW");
  if (realLoss.length) flags.push("TEXT LOSS");
  if (ins.length) flags.push("TEXT INSERTION / DUPLICATION");
  if (nav.length) flags.push("NAVIGATION DEFECT");
  if (!flags.length && struct.length) flags.push("STRUCTURE ISSUE ONLY");
  if (!flags.length) flags.push("PASS — text integrity");

  return {
    summary: {
      id: book.id,
      importKey: book.import_key,
      title: book.title,
      status: book.status,
      sourcePath: src.file,
      packageDir: pkg?.dir ?? null,
      chunks: chunks.length,
      nodes: nodes.length,
      sourceWords,
      prodWords,
      wordDelta: prodWords - sourceWords,
      missingTextWords,
      missingStructureWords,
      missingByKind,
      dropCaps: { lost: dropLost, intact: dropOk },
      insertedWords,
      duplicatedWords,
      nav: { offByOne: navOffByOne, missing: navMissing, stranded: navStranded, duplicates: navDup },
      strandedChunks,
      smallPages: small.length,
      largePages: large.length,
      boilerplateBlocks: boilerHits,
      backMatterBlocks: backMatter,
      tocRowsAsBody,
      captionsAsBody,
      structureJson,
      frontInventory,
      category: flags[0],
      flags,
    },
    issues,
  };
}

// ---------------------------------------------------------------------------
// Reporting
// ---------------------------------------------------------------------------
const csvCell = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
function writeReports(outDir, results, meta) {
  fs.mkdirSync(outDir, { recursive: true });
  const cols = ["book", "importKey", "sourcePath", "sourceLocation", "sourceText", "productionLocation", "productionText", "defect", "affected", "severity", "category"];
  const rows = results.flatMap((r) => r.issues);
  fs.writeFileSync(path.join(outDir, "discrepancies.csv"), [cols.join(","), ...rows.map((r) => cols.map((c) => csvCell(r[c])).join(","))].join("\n"));
  fs.writeFileSync(path.join(outDir, "books.json"), JSON.stringify({ meta, books: results.map((r) => r.summary) }, null, 2));

  const cats = ["PASS — text integrity", "STRUCTURE ISSUE ONLY", "TEXT LOSS", "TEXT INSERTION / DUPLICATION", "NAVIGATION DEFECT", "NEEDS MANUAL REVIEW"];
  const by = Object.fromEntries(cats.map((c) => [c, results.filter((r) => r.summary.flags.includes(c))]));
  const S = results.map((r) => r.summary);
  let md = `# Seeparah catalog integrity report\n\nRead-only run · ${meta.ranAt} · production read ${meta.productionReadAt}\n\n`;
  md += `| Metric | Count |\n|---|---|\n| Books checked | ${S.length} |\n| Pass (text integrity) | ${by["PASS — text integrity"].length} |\n| Textual corruption (loss or insertion) | ${S.filter((s) => s.flags.includes("TEXT LOSS") || s.flags.includes("TEXT INSERTION / DUPLICATION")).length} |\n| Structure issue only | ${by["STRUCTURE ISSUE ONLY"].length} |\n| TOC / navigation problems | ${by["NAVIGATION DEFECT"].length} |\n| Needs manual review | ${by["NEEDS MANUAL REVIEW"].length} |\n\n`;
  for (const c of cats) md += `## ${c} (${by[c].length})\n\n${by[c].map((r) => `- ${r.summary.importKey ?? ""} ${r.summary.title} (${r.summary.status}) — \`${r.summary.sourcePath}\``).join("\n") || "_none_"}\n\n`;
  md += `## Per-book metrics\n\n| Key | Title | Status | Src words | Prod words | Δ | Missing text words | Drop caps lost | Inserted+dup words | Nav early/missing/stranded/dup | Small/large pages | Flags |\n|---|---|---|---|---|---|---|---|---|---|---|---|\n`;
  for (const s of S) md += `| ${s.importKey ?? ""} | ${s.title} | ${s.status} | ${s.sourceWords} | ${s.prodWords} | ${s.wordDelta} | ${s.missingTextWords} | ${s.dropCaps.lost}/${s.dropCaps.lost + s.dropCaps.intact} | ${s.insertedWords + s.duplicatedWords} | ${s.nav.offByOne}/${s.nav.missing}/${s.nav.stranded}/${s.nav.duplicates} | ${s.smallPages}/${s.largePages} | ${s.flags.join("; ")} |\n`;
  md += `\n## Discrepancies (critical/high/medium; full list in discrepancies.csv)\n\n| Book | Local source path | Source location | Source text | Production location | Production text | Defect | Affected | Severity |\n|---|---|---|---|---|---|---|---|---|\n`;
  const esc = (v) => String(v ?? "").replace(/\|/g, "\\|").replace(/\n/g, " ");
  for (const r of rows.filter((x) => x.severity !== "low").slice(0, 3000)) md += `| ${esc(r.book)} | ${esc(r.sourcePath)} | ${esc(r.sourceLocation)} | ${esc(r.sourceText)} | ${esc(r.productionLocation)} | ${esc(r.productionText)} | ${esc(r.defect)} | ${esc(r.affected)} | ${r.severity} |\n`;
  md += `\n## Front-matter inventory (source items before the first chapter-level heading)\n\n`;
  for (const s of S) md += `### ${s.title}\n\n${s.frontInventory.map((f) => `- ${f.kind}/${f.tag}: ${esc(f.text)} → ${f.inProduction}`).join("\n") || "_none detected_"}\n\n`;
  fs.writeFileSync(path.join(outDir, "report.md"), md);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
export async function run(options) {
  const { corpus, out, snapshot, saveSnapshot, env, only, publishedOnly } = options;
  const prodData = snapshot
    ? JSON.parse(fs.readFileSync(snapshot, "utf8"))
    : await readProduction(loadEnv(env), { only, publishedOnly });
  if (saveSnapshot) fs.writeFileSync(saveSnapshot, JSON.stringify(prodData));
  const packages = indexCorpus(corpus);
  const results = [];
  for (const entry of prodData.books) {
    const { book } = entry;
    if (only && !only.includes(book.import_key) && !only.includes(book.id)) continue;
    if (publishedOnly && book.status !== "published") continue;
    const pkg = packages.get(book.import_key) ?? packages.get(`title:${norm(book.title)}`);
    const manual = (reason) =>
      results.push({
        summary: { id: book.id, importKey: book.import_key, title: book.title, status: book.status, sourcePath: pkg?.dir ?? "", category: "NEEDS MANUAL REVIEW", flags: ["NEEDS MANUAL REVIEW"], reason, sourceWords: 0, prodWords: entry.chunks.reduce((a, c) => a + wc(c.content), 0), wordDelta: 0, missingTextWords: 0, dropCaps: { lost: 0, intact: 0 }, insertedWords: 0, duplicatedWords: 0, nav: { offByOne: 0, missing: 0, stranded: 0, duplicates: 0 }, smallPages: 0, largePages: 0, frontInventory: [] },
        issues: [{ book: book.title, importKey: book.import_key, sourcePath: pkg?.dir ?? "", sourceLocation: "", sourceText: "", productionLocation: "", productionText: "", defect: reason, affected: "", severity: "high", category: "NEEDS MANUAL REVIEW" }],
      });
    if (!pkg) {
      manual("no local source package found for this import_key/title");
      continue;
    }
    let src;
    try {
      if (pkg.epubs.length) src = await parseEpubSource(pkg.epubs[0]);
      else if (pkg.txts.length) src = parseTxtSource(pkg.txts[0]);
      else {
        manual("source package has no EPUB or TXT");
        continue;
      }
    } catch (e) {
      manual(`source parse failed: ${e.message}`);
      continue;
    }
    const r = validateBook(entry, src, pkg);
    results.push(r);
    process.stderr.write(`  ${r.summary.flags.join(", ")} — ${book.title}\n`);
  }
  writeReports(out, results, { ranAt: new Date().toISOString(), productionReadAt: prodData.readAt, corpus, thresholds: THRESHOLDS });
  return results;
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith("validate.mjs")) {
  const corpus = arg("corpus");
  const out = arg("out", "audit-out");
  if (!corpus) {
    console.error("Usage: node scripts/catalog-integrity/validate.mjs --corpus <dir> [--env .env | --snapshot prod.json] [--out audit-out]");
    process.exit(2);
  }
  const only = arg("only") ? String(arg("only")).split(",").map((s) => s.trim()) : null;
  run({ corpus, out, snapshot: arg("snapshot"), saveSnapshot: arg("save-snapshot"), env: arg("env", ".env"), only, publishedOnly: Boolean(arg("published-only")) })
    .then((r) => console.error(`Done: ${r.length} books → ${out}/report.md`))
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
}