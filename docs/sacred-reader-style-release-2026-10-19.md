# Sacred Reader presentation implementation — 19 October 2026

Source: user-provided Seeparah-Sacred-Reader-Style-Audit-2026-10-19(1).md.

## Production baseline
The uploaded audit observed 80 titles before the latest sacred-text imports. The production catalogue subsequently reached 84 titles and 168 published source-edition registry records, with 28 of the original 32 records still unpublished. Counts are date-bound; do not use the old 80-title figure as today's total.

## Implemented reader presentation, no content changes
- R01: new **Book** mode defaults to a calm, continuous reading surface without separate bordered verse cards. **Study** mode preserves the old per-chunk references and annotations.
- R02: selected edition title/people, revision, source URL and reuse notice moved into an accessible disclosure. Reuse notices also appear after the reading surface for visible attribution.
- R03: script-specific readable text widths, centered surfaces and adjustable Narrow/Comfortable/Wide measures.
- R07–R08: source-language-specific reading font sizes and line heights, including Arabic/Urdu/Hebrew/Devanagari, English and Greek. On-demand Google Noto font stylesheets loaded only for selected non-English scripts, with fallback stacks. Loading is not a per-device font-license or availability certification.
- R10: reading header labels selected language edition or translation where explicitly credited; hides the generic 'Source-only edition' label from translated content.
- R11: accessible reading settings (text size, line height, width, English accessible sans-serif); direct **Contents** selector populated with canonical source top-level navigation records only on demand. Selecting an unrelated language resets to its first section instead of falsely assuming numeric unit alignment. Font/view changes keep current canonical chunk reference and URL unchanged.
- R09 (partial): Sanskrit source double dandas, speaker lines and script source whitespace remain present as supplied, without reinsertion or guessed verse boundaries.
- R06: the WEB Classic text-only edition is explicitly described as a reflow, not a publisher-verified original layout; no headings or poetic breaks generated.

## Still blocked or only partial
- R04, R05, R12: Dhammapada/Pali Bilara stanza line structure, long DN1 discourse semantics and Hebrew Psalm poetry require separately verified structural data. This UI release does not recreate lost line breaks or claim facsimile fidelity.
- Facsimiles require permitted, aligned scanned pages; none generated.
- Edition-specific ayah markers, Torah special line layouts, alignment of separate script/translation versions, Tibetan work-to-volume mappings and exact source print page numbers remain separate ingestion/markup tasks.
- Persisting display preferences across device sessions, 200% zoom, full screen-reader coverage, actual glyph-font files loaded on all target devices and an exhaustive 84-title matrix are not certified by the automated checks.
- Correct Quran basmala/translation mapping and Buddhist DN34 markup must be tested separately, per user audit.

## Verifications
- Test suite: 451 Vitest tests passing in 62 files.
- TypeScript compiler: exit code 0 after one strict dataset-property fix.
- Production build: exit code 0; public Supabase config verified in browser bundle.
- Existing source text, chunk hashes and Supabase records unchanged by this code change.
- Cloudflare remains production target; no Netlify references, environment-variable changes or database migrations made.
- Live browser QA of key script samples and narrow viewports is required after Cloudflare release; do not claim complete visual certification solely from compilation.

## Files
- src/components/reader/SacredTextReader.tsx
- src/lib/sacred-reader-layout.ts
- src/lib/sacred-reader-layout.test.ts
