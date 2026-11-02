# Seeparah: Greek–English New Testament canonical alignment verification

**Evidence:** read-only production Supabase SQL, 2026-11-02. Project: Seeparah. This report does not authorize edits to sacred text, numbering, source metadata, translations, or the edition registry.

## Verification

All **27** published New Testament books have Greek and English leaf structure records. For each work, the verified published editions share source `node_key` and `metadata.canonical_ref` values wherever a matching leaf exists. The scan found **zero conflicting canonical references** among matching keys and **no duplicate or missing leaf reference keys** in either language. See the explicit 27-book ID allowlist in `src/lib/sacred-bible-alignment.ts`.

The following works have English-only verses or different source chunk positions. Positional array joining is unsafe, even when matching verse labels are present.

| Work | Matching canonical-ref leaves | English-only leaves | Matching references with shifted chunk positions |
|---|---:|---:|---:|
| Matthew | 1,068 | 3 | 492 |
| Mark | 673 | 5 | 410 |
| Luke | 1,149 | 1 | 92 |
| John | 878 | 1 | 709 |
| Acts | 1,002 | 2 | 302 |
| Romans | 430 | 3 | 57 |
| Revelation | 404 | 0 | 193 |
| 2 Corinthians | 256 | 1 | 0 |

Other 19 canonical books had exact matching leaf keys and references with **zero** shifted indexes. The eight listed works have 16 English-only verses in total, which **must not acquire invented Greek content**. All 27 are eligible for *exact reference comparison*, not for interchange of chunk indices or automatic translation.

## Implementation

- The strict `getBibleReferenceMatchedSection` validates an explicitly whitelisted work, a Greek↔English direction, and **1–32** requested source chunk indices.
- The server independently checks that the book is publicly published and religious, that both languages are advertised, and that the target chunks are published.
- It matches by **both** immutable imported node key and matching nonblank canonical reference, then returns text from the target edition's *actual* chunk index, labeled with the source reference.
- The UI acknowledges unmatched verses; no source passage is fabricated or silently shifted.
- Browser comparisons for Genesis and Matthew passed 2026-11-02. All 27 New Testament views still require post-deploy browser checks, especially shifted regions and mobile rendering.

## SQL audit method

Read-only join of `public.book_structure_nodes` against currently published `public.books`, limited to books with `source_language='Greek'`, `node_type='paragraph'`, single-chunk leaves and canonical_ref metadata. Paired source/translation by exact `book_id` and `node_key`; then counted exact/ref-conflicting labels, positional shifts and translation-only keys. Independently grouped each language to check unique node keys and missing reference metadata. This was a source-structure audit, not an editorial review of verse text or translation quality.

## Safety gates

Preserve Cloudflare, authentication/MFA and Supabase roles, rights reviews, source text, diacritics and canonical numbering. Never turn this alignment whitelist into a generalized fallback for other books, languages or unverified editions.
