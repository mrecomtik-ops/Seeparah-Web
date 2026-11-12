#!/usr/bin/env node
/**
 * Seeparah nightly catalog QA — STRICTLY READ ONLY.
 * Supabase: GET only; no RPC, POST, PATCH, DELETE, or publication mutations.
 * Generates evidence queues for human/source review; does not claim a source
 * edition is complete merely because the published text contains a heading.
 */
import { mkdir, readFile, writeFile, appendFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const DEFAULT_SITE = 'https://seeparah.com';
const PAGE_SIZE = 500;
const MAX_PAGES = 100; // fail closed rather than silently truncate a 50k+ catalog
const URL_TIMEOUT_MS = 25_000;
const COLUMN_BOOK = 'id,title,author,status,source_scan_id,source_language,source_version,original_publication_year,cover_url';
const COLUMN_REVIEW = 'book_id,book_title,priority,status,source_chapter_pattern_chunks,stored_chapter_nodes,first_source_chapter_chunk,first_toc_chapter_chunk';
const COLUMN_BACKUP = 'book_id';

export function normalizedWorkKey(book) {
  const title = String(book.title ?? '').normalize('NFKD').replace(/\p{M}/gu, '')
    .toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
  let author = String(book.author ?? '').split(';')[0].trim();
  if (author.includes(',')) {
    const p = author.split(',').map(x => x.trim()).filter(Boolean);
    if (p.length === 2) author = `${p[1]} ${p[0]}`;
  }
  author = author.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase()
    .replace(/\b\d{4}\b/gu, '').replace(/[^\p{L}\p{N}]+/gu, '');
  return title.length > 5 && author.length > 3 ? `${title}:${author}` : null;
}

export function detectEditionVariants(books) {
  const groups = new Map();
  for (const b of books) {
    if (!/^gutenberg:\d+$/i.test(String(b.source_scan_id ?? ''))) continue;
    const key = normalizedWorkKey(b);
    if (!key) continue;
    const list = groups.get(key) ?? [];
    list.push({ id: b.id, title: b.title, author: b.author, source: b.source_scan_id });
    groups.set(key, list);
  }
  return [...groups.values()].filter(x => x.length > 1)
    .sort((a, b) => b.length - a.length || String(a[0].title).localeCompare(String(b[0].title)));
}

export function csvField(raw) {
  let value = String(raw ?? '').replace(/\r|\n/g, ' ');
  // Excel/Sheets interpret leading +-=@ as formulas, including after whitespace.
  if (/^\s*[=+@-]/u.test(value)) value = `'${value}`;
  return `"${value.replace(/"/g, '""')}"`;
}
export function makeCsv(columns, rows) {
  return [columns.map(csvField).join(','), ...rows.map(r => columns.map(k => csvField(r[k])).join(','))].join('\n') + '\n';
}
export function sanitizeMarkdown(raw) {
  return String(raw ?? '').replace(/[\r\n<>|]/g, ' ').trim().slice(0, 160);
}

function requestUrl(base, table, params) {
  if (!/^[a-z_][a-z_0-9]*$/i.test(table)) throw Error('Invalid table identifier');
  const baseUrl = new URL(base);
  if (baseUrl.protocol !== 'https:') throw Error('Supabase URL must use HTTPS');
  const url = new URL(`/rest/v1/${table}`, baseUrl);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));
  return url;
}
export function createReadOnlySupabase({ url, key, fetchFn = fetch }) {
  if (!url || !key) throw Error('Supabase credentials missing');
  const authHeaders = { apikey: key, Accept: 'application/json' };
  if (!key.startsWith('sb_')) authHeaders.Authorization = `Bearer ${key}`;
  async function get(table, params, range = null) {
    const href = requestUrl(url, table, params);
    const headers = { ...authHeaders };
    if (range) {
      headers['Range-Unit'] = 'items';
      headers.Range = `${range.start}-${range.end}`;
    }
    const response = await fetchFn(href, {
      method: 'GET', headers, redirect: 'error', signal: AbortSignal.timeout(URL_TIMEOUT_MS),
    });
    if (!response.ok) throw Error(`Supabase read-only ${table}: HTTP ${response.status}`);
    const rows = await response.json();
    if (!Array.isArray(rows)) throw Error(`Supabase ${table} did not return a row array`);
    return rows;
  }
  async function getAll(table, params) {
    const all = [];
    for (let i = 0; i < MAX_PAGES; i++) {
      const rows = await get(table, params, { start: i * PAGE_SIZE, end: (i + 1) * PAGE_SIZE - 1 });
      all.push(...rows);
      if (rows.length < PAGE_SIZE) return all;
    }
    throw Error(`Safety limit: ${table} exceeded ${MAX_PAGES * PAGE_SIZE} rows`);
  }
  return { get, getAll };
}

export async function fetchData(client) {
  const [books, reviews, oldYears, importer] = await Promise.all([
    client.getAll('books', { select: COLUMN_BOOK, status: 'eq.published', order: 'id.asc' }),
    client.getAll('qa_20261110_gutenberg_structure_candidates', { select: COLUMN_REVIEW, order: 'priority.asc,book_title.asc' }),
    client.getAll('qa_20261111_unverified_publication_year_backups', { select: COLUMN_BACKUP, verified_at: 'is.null', order: 'book_id.asc' }),
    client.get('gutenberg_autopilot_settings', { select: 'id,enabled,target_published,batch_size', id: 'eq.1', limit: '1' }),
  ]);
  if (importer.length !== 1) throw Error('Importer settings absent or duplicated');
  if (books.length === 0) throw Error('Published catalogue unexpectedly empty');
  return { books, reviews, oldYears, importer: importer[0] };
}

/** Secretless QA: fetch published-only metadata from Seeparah's own
 * allowlisted Cloudflare projection, never from private PostgREST tables.
 * The server's Supabase key remains exclusively in the existing Worker env.
 */
export async function fetchPublicQaSnapshot(url = 'https://seeparah.com/api/catalog-qa-public.json', fetchFn = fetch) {
  const target = new URL(url);
  if (target.origin !== 'https://seeparah.com' ||
      target.pathname !== '/api/catalog-qa-public.json' ||
      target.search || target.hash) {
    throw Error('Only the official Seeparah published-only QA projection is supported');
  }
  const response = await fetchFn(target, {
    method: 'GET', redirect: 'error', signal: AbortSignal.timeout(URL_TIMEOUT_MS),
    headers: { Accept: 'application/json' },
  });
  if (!response.ok) throw Error('Public Seeparah QA projection unavailable: HTTP ' + response.status);
  const payload = await response.json();
  if (payload?.version !== 1 || payload?.scope !== 'published-catalogue-only' ||
      !Array.isArray(payload.books) || !Array.isArray(payload.reviews) ||
      !Array.isArray(payload.oldYears) || !payload.importer) {
    throw Error('Invalid or outdated public QA projection response');
  }
  if (payload.books.some(b => b?.status !== 'published'))
    throw Error('Public QA projection unexpectedly includes unpublished records');
  return payload;
}

/** Read 75k+ published records in bounded, public-only pages. The older
 * unpaged projection is still supported during deployment transitions.
 * Every request is GET-only to Seeparah's fixed public endpoint.
 */
export async function fetchScalablePublicQaSnapshot(
  url = 'https://seeparah.com/api/catalog-qa-public.json',
  fetchFn = fetch,
) {
  const root = new URL(url);
  if (root.origin !== 'https://seeparah.com' ||
      root.pathname !== '/api/catalog-qa-public.json' ||
      root.search || root.hash) {
    throw Error('Only the official Seeparah published-only QA projection is supported');
  }
  async function requestKind(kind, page) {
    const target = new URL(root);
    target.searchParams.set('kind', kind);
    target.searchParams.set('page', String(page));
    const response = await fetchFn(target, {
      method: 'GET', redirect: 'error', signal: AbortSignal.timeout(URL_TIMEOUT_MS),
      headers: { Accept: 'application/json' },
    });
    if ((response.status === 404 || response.status === 400) && page === 1) {
      return null; // Older production Worker: use the original v1 endpoint.
    }
    if (!response.ok) throw Error('Published QA page ' + kind + ' HTTP ' + response.status);
    const value = await response.json();
    if (value.version !== 2 || value.scope !== 'published-catalogue-page' ||
        value.kind !== kind || value.page !== page ||
        !Array.isArray(value.rows) || typeof value.hasMore !== 'boolean') {
      throw Error('Invalid paginated QA response for ' + kind + ' page ' + page);
    }
    if (kind === 'books' && value.rows.some(b => b.status !== 'published'))
      throw Error('Private unpublished book leaked into public QA');
    return value;
  }
  const first = await requestKind('inventory', 1);
  if (!first) return fetchPublicQaSnapshot(url, fetchFn);
  const result = {
    version: 1, scope: 'published-catalogue-only',
    books: [], reviews: [], oldYears: [],
    importer: first.importer, discovery: first.discovery, queue: first.queue ?? {},
    safety: { unpublishedYearBackupCount: 0 },
  };
  if (!result.importer || !result.discovery) throw Error('Missing importer/discovery state');
  for (const [kind, key] of [
    ['books', 'books'], ['reviews', 'reviews'], ['years', 'oldYears'],
  ]) {
    let exhausted = false;
    for (let page = 1; page <= 250; page++) {
      const response = await requestKind(kind, page);
      if (!response) throw Error('QA pagination disabled after metadata handshake');
      result[key].push(...response.rows);
      if (kind === 'years') {
        result.safety.unpublishedYearBackupCount += Number(response.hiddenUnpublishedYearRows ?? 0);
      }
      if (!response.hasMore) { exhausted = true; break; }
    }
    if (!exhausted) throw Error('QA ' + kind + ' exceeded 125,000 pagination rows');
  }
  if (!result.books.length) throw Error('QA published catalogue unexpectedly empty');
  return result;
}

export function analyzeCatalogue(data, batchSize = 25) {
  if (!Number.isSafeInteger(batchSize) || batchSize < 1 || batchSize > 100)
    throw Error('Batch size must be 1 to 100');
  const books = data.books ?? [];
  const reviews = data.reviews ?? [];
  const yearIds = new Set((data.oldYears ?? []).map(r => String(r.book_id)));
  const byId = new Map(books.map(b => [String(b.id), b]));
  const sourceReview = reviews.filter(x => x.status === 'requires_manual_source_review')
    .sort((a, b) => String(a.priority).localeCompare(String(b.priority)) || String(a.book_title).localeCompare(String(b.book_title)));
  const visualReview = reviews.filter(x => x.status === 'navigation_repaired_pending_visual_qa')
    .sort((a, b) => String(a.book_title).localeCompare(String(b.book_title)));
  const years = books.filter(b => yearIds.has(String(b.id)))
    .sort((a, b) => String(a.title).localeCompare(String(b.title)));
  const covers = books.filter(b => /(?:\/cover-medium\.jpg|\/pg\d+\.cover\.medium\.jpg)(?:\?|$)/i.test(String(b.cover_url ?? '')))
    .sort((a, b) => String(a.title).localeCompare(String(b.title)));
  const suspectYears = books.filter(b => /^gutenberg:/i.test(String(b.source_scan_id ?? '')) &&
    [1800, 1656].includes(Number(b.original_publication_year)) && b.original_publication_year !== null);
  const variants = detectEditionVariants(books);
  const statuses = new Map();
  for (const r of reviews) statuses.set(r.status, (statuses.get(r.status) ?? 0) + 1);
  const importer = data.importer;
  const critical = [];
  if (importer?.enabled && (sourceReview.length > 0 || yearIds.size > 0 || visualReview.length > 0))
    critical.push('Importer is ENABLED despite unresolved historical/source/visual review queues.');
  if (suspectYears.length > 0)
    critical.push(`${suspectYears.length} published Gutenberg records still expose suspect 1800/1656 publication years.`);
  if (yearIds.size > years.length)
    critical.push(`${yearIds.size - years.length} year backup records have no matching published-book row; reconcile publication state before re-enabling imports.`);
  if (Number(data.safety?.unpublishedYearBackupCount ?? 0) > 0)
    critical.push(`${data.safety.unpublishedYearBackupCount} private year-backup records lack a published book. Human review required.`);
  const chapterRows = sourceReview.slice(0, batchSize).map(r => ({
    book_id: String(r.book_id), title: String(r.book_title ?? ''), priority: String(r.priority ?? ''),
    stored_chapters: r.stored_chapter_nodes, source_heading_hits: r.source_chapter_pattern_chunks,
    first_source_chunk: r.first_source_chapter_chunk, first_nav_chunk: r.first_toc_chapter_chunk,
    status: 'SOURCE_VERIFICATION_REQUIRED',
    evidence: 'Compare original Gutenberg edition against stored source chunks; printed TOC may be misleading',
  }));
  const visualRows = visualReview.slice(0, batchSize).map(r => ({
    book_id: String(r.book_id), title: String(r.book_title ?? ''),
    status: 'READER_DEVICE_ACCEPTANCE_REQUIRED',
    evidence: 'Open first/middle/last chapter on desktop and mobile; verify TOC and source text',
  }));
  const yearRows = years.slice(0, batchSize).map(b => ({
    book_id: String(b.id), title: String(b.title ?? ''), author: String(b.author ?? ''),
    source: String(b.source_scan_id ?? ''), status: 'TWO_INDEPENDENT_SOURCES_REQUIRED',
    evidence: 'Record URLs and historical first-publication date; verify edition and author dates',
  }));
  const coverRows = covers.slice(0, batchSize).map(b => ({
    book_id: String(b.id), title: String(b.title ?? ''), source: String(b.source_scan_id ?? ''),
    current_cover: String(b.cover_url ?? ''), status: 'ORIGINAL_HIGH_RES_ARTWORK_REQUIRED',
    evidence: 'Verify official higher-resolution source and rights; never upscale/relabel without proof',
  }));
  return {
    auditedAt: new Date().toISOString(),
    counts: {
      publishedBooks: books.length, sourceReview: sourceReview.length, visualReview: visualReview.length,
      yearsBackedUp: yearIds.size, yearsMatchingPublished: years.length,
      lowResCovers: covers.length, suspectedPublicationYears: suspectYears.length,
      duplicateEditionGroups: variants.length,
      byReviewStatus: Object.fromEntries(statuses),
      importerEnabled: Boolean(importer?.enabled),
      importerTarget: Number(importer?.target_published ?? 0),
      importerBatchSize: Number(importer?.batch_size ?? 0),
    }, critical, queues: { chapterRows, visualRows, yearRows, coverRows },
    editionVariants: variants.slice(0, 30),
  };
}

export async function smokeSitemap(base = DEFAULT_SITE, fetchFn = fetch) {
  const root = new URL(base);
  if (root.protocol !== 'https:' || root.hostname !== 'seeparah.com')
    throw Error('Only Seeparah production is permitted for the HTTP smoke test');
  async function get(path) {
    const response = await fetchFn(new URL(path, root), {
      method: 'GET', redirect: 'error', signal: AbortSignal.timeout(URL_TIMEOUT_MS),
      headers: { Accept: 'application/xml, text/xml;q=0.9' },
    });
    if (!response.ok) throw Error(`${path}: HTTP ${response.status}`);
    const body = await response.text();
    if (!body.trimStart().startsWith('<?xml')) throw Error(`${path}: not XML`);
    return body;
  }
  const index = await get('/sitemap.xml');
  if (!/<sitemapindex\b/.test(index)) throw Error('sitemap.xml is not a sitemap index');
  const paths = [...index.matchAll(/<loc>\s*(https:\/\/seeparah\.com\/[^<]+)\s*<\/loc>/g)]
    .map(x => new URL(x[1]).pathname);
  if (!paths.includes('/sitemaps/static.xml')) throw Error('Static sitemap omitted');
  const bookPages = paths.filter(p => /^\/sitemaps\/books-\d+\.xml$/.test(p));
  if (!bookPages.includes('/sitemaps/books-1.xml')) throw Error('Book sitemap omitted');
  const sampled = [...new Set(['/sitemaps/static.xml', bookPages[0], bookPages.at(-1)])];
  const details = [];
  for (const path of sampled) {
    const body = await get(path);
    if (!/<urlset\b/.test(body) || !/<url>/.test(body)) throw Error(`${path}: invalid URL sitemap`);
    details.push({ path, urls: (body.match(/<url>/g) ?? []).length });
  }
  return { status: 'passed', sitemapPages: paths.length, bookPages: bookPages.length, sampled: details };
}

export function renderMarkdown(report) {
  const { counts: c, queues: q } = report;
  const lines = [
    '# Seeparah production QA — read-only report', '',
    `Generated: ${report.auditedAt}`, '',
    `Production data: **${c ? 'verified from the published-only production snapshot' : 'NOT VERIFIED (production snapshot unavailable)'}**`,
    `Public sitemap: **${report.sitemap?.status ?? 'NOT CHECKED'}**`, '',
  ];
  if (c) {
    lines.push('| Measure | Count |', '|---|---:|',
      `| Published books | ${c.publishedBooks} |`,
      `| Historical years awaiting independent evidence | ${c.yearsBackedUp} |`,
      `| Original source/chapter review | ${c.sourceReview} |`,
      `| Repaired navigation awaiting visual QA | ${c.visualReview} |`,
      `| Low-res Gutenberg covers | ${c.lowResCovers} |`,
      `| Potential duplicate edition groups | ${c.duplicateEditionGroups} |`,
      `| 1800/1656 publication-year regressions | ${c.suspectedPublicationYears} |`,
      `| Importer enabled | ${c.importerEnabled ? '**YES**' : 'No'} |`,
      `| Import target | ${c.importerTarget} |`,
      `| Import batch size | ${c.importerBatchSize} |`, '');
  }
  if (report.critical?.length) {
    lines.push('## Safety alerts', '', ...report.critical.map(s => `- **BLOCK:** ${sanitizeMarkdown(s)}`), '');
  }
  if (!c) lines.push('## Setup needed', '',
    'Ensure https://seeparah.com/api/catalog-qa-public.json is deployed and reachable. No Supabase credentials are required in GitHub Actions.', '');
  for (const [title, rows] of [
    ['Next source-review batch', q?.chapterRows], ['Next reader/device acceptance batch', q?.visualRows],
    ['Next historical-year evidence batch', q?.yearRows], ['Next high-resolution cover source batch', q?.coverRows],
  ]) {
    lines.push(`## ${title}`, '');
    if (!rows?.length) { lines.push('No rows in this queue, or private audit unavailable.', ''); continue; }
    lines.push('| Book | ID | Action |', '|---|---|---|');
    for (const r of rows) lines.push(`| ${sanitizeMarkdown(r.title)} | \`${sanitizeMarkdown(r.book_id)}\` | ${sanitizeMarkdown(r.status)} |`);
    lines.push('');
  }
  lines.push('## Boundaries', '',
    '- This pipeline is **read-only**. It does not fetch or edit users, user progress, private accounts, rights approvals, or text content.',
    '- A chapter heading inside Seeparah does not prove a manuscript is complete. Compare the exact upstream edition and source before restoring any content.',
    '- Historical dates require at least two credible independent sources; a Project Gutenberg upload date is not a first-publication date.',
    '- High-resolution cover replacement requires exact source/edition and artwork usage rights.',
    '- Keep the Gutenberg importer paused until these gates are independently accepted.', '');
  return lines.join('\n');
}

async function writeReport(out, report) {
  await mkdir(out, { recursive: true });
  await Promise.all([
    writeFile(resolve(out, 'summary.md'), renderMarkdown(report), 'utf8'),
    writeFile(resolve(out, 'summary.json'), JSON.stringify(report, null, 2) + '\n', 'utf8'),
    ...Object.entries({
      'source-review.csv': report.queues?.chapterRows ?? [],
      'reader-acceptance.csv': report.queues?.visualRows ?? [],
      'historical-years.csv': report.queues?.yearRows ?? [],
      'cover-replacements.csv': report.queues?.coverRows ?? [],
    }).map(([name, rows]) => writeFile(resolve(out, name),
      makeCsv(rows[0] ? Object.keys(rows[0]) : ['book_id', 'title', 'status'], rows), 'utf8')),
  ]);
  if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, renderMarkdown(report) + '\n');
}

export async function main(argv = process.argv.slice(2)) {
  const val = flag => { const ix = argv.indexOf(flag); return ix < 0 ? null : argv[ix + 1] || null; };
  const out = resolve(val('--out') ?? 'audit-out/catalog-qa');
  const batchSize = Number(val('--batch-size') ?? 25);
  const fixtureFile = val('--fixture');
  const requireDb = argv.includes('--require-db') || argv.includes('--require-data');
  const report = { auditedAt: new Date().toISOString(), counts: null, critical: [], queues: {}, sitemap: null };
  let setupMissing = false;
  try {
    let data;
    if (fixtureFile) {
      data = JSON.parse(await readFile(resolve(fixtureFile), 'utf8'));
    } else if (val('--public-url')) {
      data = await fetchScalablePublicQaSnapshot(val('--public-url'));
    } else if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
      data = await fetchData(createReadOnlySupabase({
        url: process.env.SUPABASE_URL, key: process.env.SUPABASE_SERVICE_ROLE_KEY,
      }));
    } else {
      setupMissing = true;
    }
    if (data) Object.assign(report, analyzeCatalogue(data, batchSize));
    if (!fixtureFile && !argv.includes('--skip-smoke')) report.sitemap = await smokeSitemap();
  } catch (error) {
    report.critical.push(`Audit cannot be trusted: ${error instanceof Error ? error.message : String(error)}`);
  }
  await writeReport(out, report);
  console.log(`Seeparah QA report: ${out}/summary.md`);
  for (const alert of report.critical) console.error(`QA BLOCK: ${alert}`);
  if (report.critical.length > 0) return 1;
  if (setupMissing && requireDb) {
    console.error('No trusted QA data source configured (use --public-url or private Supabase credentials)');
    return 2;
  }
  return 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = await main();
}