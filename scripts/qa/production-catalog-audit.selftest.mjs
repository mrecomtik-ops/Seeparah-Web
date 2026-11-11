import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  analyzeCatalogue, createReadOnlySupabase, csvField, detectEditionVariants,
  main, makeCsv, renderMarkdown, smokeSitemap,
} from './production-catalog-audit.mjs';

const data = {
  books: [
    { id: 'a', title: 'Moby-Dick', author: 'Melville, Herman', source_scan_id: 'gutenberg:1', original_publication_year: null, cover_url: 'https://example.test/books/1/cover-medium.jpg' },
    { id: 'b', title: 'Moby Dick', author: 'Herman Melville', source_scan_id: 'gutenberg:2', original_publication_year: null, cover_url: '/premium/cover.webp' },
    { id: 'c', title: 'Other Book', author: 'Author', source_scan_id: 'gutenberg:3', original_publication_year: 1800, cover_url: null },
    { id: 'd', title: 'Sacred Book', author: 'Anonymous', source_scan_id: 'tanzil:1', original_publication_year: 610, cover_url: null },
  ],
  reviews: [
    { book_id: 'a', book_title: 'Moby-Dick', priority: 0, status: 'requires_manual_source_review', source_chapter_pattern_chunks: 100, stored_chapter_nodes: 70 },
    { book_id: 'b', book_title: 'Moby Dick', priority: 1, status: 'navigation_repaired_pending_visual_qa' },
  ],
  oldYears: [{ book_id: 'a' }],
  importer: { enabled: false, target_published: 10000, batch_size: 100 },
};

test('read-only PostgREST paging never truncates after 500 or calls a mutation endpoint', async () => {
  const called = [];
  const fetchFn = async (url, options) => {
    called.push({ url, options });
    const isFirst = options.headers.Range === '0-499';
    const rows = isFirst ? Array.from({ length: 500 }, (_, i) => ({ id: `${i}` })) : [{ id: 'last' }];
    return { ok: true, json: async () => rows };
  };
  const c = createReadOnlySupabase({ url: 'https://project.supabase.co', key: 'sb_secret_fictional_fixture', fetchFn });
  const result = await c.getAll('books', { select: 'id', status: 'eq.published' });
  assert.equal(result.length, 501);
  assert.deepEqual(called.map(c => c.options.method), ['GET', 'GET']);
  assert.deepEqual(called.map(c => c.options.headers.Range), ['0-499', '500-999']);
  assert(called.every(c => !c.options.headers.Authorization));
  assert(called.every(c => String(c.url).startsWith('https://project.supabase.co/rest/v1/books?')));
});

test('catalog audit separates review, date, cover and visual queues, flags risky active importer', () => {
  const report = analyzeCatalogue(data, 25);
  assert.equal(report.counts.publishedBooks, 4);
  assert.equal(report.counts.sourceReview, 1);
  assert.equal(report.counts.visualReview, 1);
  assert.equal(report.counts.yearsBackedUp, 1);
  assert.equal(report.counts.lowResCovers, 1);
  assert.equal(report.counts.suspectedPublicationYears, 1);
  assert.equal(report.counts.duplicateEditionGroups, 1);
  assert.equal(report.queues.chapterRows[0].status, 'SOURCE_VERIFICATION_REQUIRED');
  assert.equal(report.queues.yearRows[0].status, 'TWO_INDEPENDENT_SOURCES_REQUIRED');
  assert(report.critical.some(s => s.includes('1800/1656')));
  assert.equal(report.critical.some(s => s.includes('Importer is ENABLED')), false);
  const unsafe = analyzeCatalogue({ ...data, importer: { ...data.importer, enabled: true } });
  assert(unsafe.critical.some(s => s.includes('Importer is ENABLED')));
  assert.throws(() => analyzeCatalogue(data, 101));
  assert.equal(detectEditionVariants(data.books).length, 1);
});

test('unknown backup book publication status causes explicit block, not false success', () => {
  const report = analyzeCatalogue({ ...data, oldYears: [{ book_id: 'unknown' }] });
  assert(report.critical.some(s => s.includes('no matching published-book')));
});

test('report escapes spreadsheet formulas and source text cannot inject markdown tables', () => {
  const csv = makeCsv(['book_id', 'title'], [{ book_id: '1', title: '=HYPERLINK("evil")' }]);
  assert(csv.includes("'="));
  assert.equal(csvField('-SUM(1)'), '"\'-SUM(1)"');
  const report = analyzeCatalogue({ ...data, reviews: [{ book_id: 'a', book_title: 'Name | <script>', status: 'requires_manual_source_review' }] });
  assert(!renderMarkdown(report).includes('<script>'));
  assert(!renderMarkdown(report).includes('Name |'));
});

test('public sitemaps smoke checks index, static page and first/last book parts', async () => {
  const requested = [];
  const pages = {
    '/sitemap.xml': '<?xml version="1.0"?><sitemapindex><sitemap><loc>https://seeparah.com/sitemaps/static.xml</loc></sitemap><sitemap><loc>https://seeparah.com/sitemaps/books-1.xml</loc></sitemap><sitemap><loc>https://seeparah.com/sitemaps/books-2.xml</loc></sitemap></sitemapindex>',
    '/sitemaps/static.xml': '<?xml version="1.0"?><urlset><url><loc>https://seeparah.com/</loc></url></urlset>',
    '/sitemaps/books-1.xml': '<?xml version="1.0"?><urlset><url><loc>https://seeparah.com/book/a</loc></url></urlset>',
    '/sitemaps/books-2.xml': '<?xml version="1.0"?><urlset><url><loc>https://seeparah.com/book/b</loc></url></urlset>',
  };
  const fetchFn = async url => {
    requested.push(url.pathname);
    return { ok: true, text: async () => pages[url.pathname] ?? '' };
  };
  const result = await smokeSitemap('https://seeparah.com', fetchFn);
  assert.equal(result.status, 'passed');
  assert.equal(result.bookPages, 2);
  assert.deepEqual(requested, ['/sitemap.xml', '/sitemaps/static.xml', '/sitemaps/books-1.xml', '/sitemaps/books-2.xml']);
  await assert.rejects(() => smokeSitemap('https://example.com', fetchFn), /Only Seeparah/);
});

test('offline fixture creates the four exact review-queue CSVs with no credentials', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'seeparah-autopilot-test-'));
  const f = join(dir, 'fixture.json');
  const safe = { ...data, books: data.books.filter(b => b.id !== 'c') };
  await writeFile(f, JSON.stringify(safe));
  const rc = await main(['--fixture', f, '--out', join(dir, 'report'), '--batch-size', '1']);
  assert.equal(rc, 0);
  const md = await readFile(join(dir, 'report', 'summary.md'), 'utf8');
  const queue = await readFile(join(dir, 'report', 'source-review.csv'), 'utf8');
  assert(md.includes('Production data: **verified by private read-only query**'));
  assert(queue.includes('SOURCE_VERIFICATION_REQUIRED'));
});