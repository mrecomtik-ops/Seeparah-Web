# Seeparah production acceptance and safety status — 1 November 2026

This report distinguishes code merged to `main`, current Cloudflare deployment, source-database facts, verified public browser journeys, and checks we **cannot** sign off without an authorized test device/account.

## New fixes in PRs #81–#85

- [#81](https://github.com/mrecomtik-ops/Seeparah-Web/pull/81) — complete typed content settings for announcements, featured books, homepage collections, translation budget and launch languages, with server-side safeguards and existing version/audit trail. Passed CI, merged. Not tested in authenticated owner/administrator production session.
- [#82](https://github.com/mrecomtik-ops/Seeparah-Web/pull/82) — identify actors in MFA-gated audit history by authenticated Supabase account, and resolve ticket/research/translation/source record labels. Passed CI, merged. Not tested in production owner/administrator session. Actor display labels are not used for authorization.
- [#83](https://github.com/mrecomtik-ops/Seeparah-Web/pull/83) — source-edition cover preview and optional deliberate 2:3 crop. Original upload image is unchanged by default; editorial assignment still requires a separate action and full attribution. Passed CI, merged. No cover artifacts were assigned by this change.
- [#84](https://github.com/mrecomtik-ops/Seeparah-Web/pull/84) — dedicated published-source tradition facet, distinct from collections/topics. Eight recorded traditions are distinguished from Tanakh/Torah source collections. Passed CI, merged. Public browser verified correct Judaism and Tanakh results through category filters; the **new dedicated control** was not separately confirmed after the deployment.
- [#85](https://github.com/mrecomtik-ops/Seeparah-Web/pull/85) — reading-room transient page, chapter and language URLs remain noindex,follow and canonicalize to the stable work detail route. Passed CI, merged. Search-engine response/metadata QA pending.

## Qur'an basmala integrity — read-only source verification

Public book UUID: `f7e3a9f0-931a-5207-9859-a27210cc2ca8`.

- 6,236 contiguous published verse chunks in each of the five sourced Arabic/English/Urdu/Hindi/Chinese editions; zero empty chunks or cross-edition reference/index mismatches.
- Exactly **112** Arabic first-ayah structure nodes carry `metadata.bismillah`.
- For **all 112** records, the exact metadata basmala equals the opening text of that same `book_chunks.content`, followed by a newline. **Zero mismatches**.
- Source chunk `Quran 1:1` starts with its own integral basmala, and has no separate marker; `Quran 9:1` has no separate basmala marker. **Do not render metadata as a second basmala**: it would duplicate the recorded source. No scripture changes were needed or performed.

SQL verification:
```sql
WITH src AS (
  SELECT s.metadata->>'canonical_ref' ref,
         s.metadata->>'bismillah' basmala, c.content
  FROM public.book_structure_nodes s
  JOIN public.book_chunks c ON c.book_id=s.book_id
    AND c.language=s.language AND c.chunk_index=s.start_chunk_index
  WHERE s.book_id='f7e3a9f0-931a-5207-9859-a27210cc2ca8'
    AND s.language='Arabic'
    AND s.metadata->>'reference_kind'='ayah'
    AND s.metadata->>'bismillah' IS NOT NULL
)
SELECT count(*) marker_count,
       count(*) FILTER (WHERE content LIKE basmala||E'\n%') exact_prefix_plus_newline,
       count(*) FILTER (WHERE content NOT LIKE basmala||E'\n%') mismatched_prefix
FROM src;
-- 112 / 112 / 0
```

## Public browser verification

A read-only automated browser session on Seeparah verified:
- `?category=Tanakh` returns relevant Tanakh books, without unrelated literature.
- `?category=Judaism` returns relevant Judaism works, without unrelated literature.
- `The Strange Case of Dr. Jekyll and Mr. Hyde` opens its book-like reader; settings contain Literary/Serif/Sans typefaces, Compact/Comfortable/Relaxed/Spacious spacing, Roomy/Standard/Compact page margins. Opening/closing settings worked.
- Earlier mobile Cloudflare Browser Rendering on `/sacred-texts` and `/library` at a real 320 CSS-px viewport measured root document scrollWidth equal to 320, no document-level overflow. This is **not** a native browser 200% zoom test.

The automated browser **could not** change the viewport to 320 CSS px, apply native 200% browser zoom or measure page geometry; its standard-viewport pass cannot be represented as a mobile/zoom pass.

## Required acceptance before claiming all 36 issues resolved

- In an authorized MFA owner/administrator session, exercise non-destructive catalog filters, editor cover staging, exact-edition preview, pending review queues, typed settings and audit identity/export; never test irreversible deletion on production user data.
- Test 320px and 390px phones, native 200% browser zoom, tab/arrow keyboard input, screen readers and actual font loading across Urdu, Arabic, Hebrew, Devanagari and Greek.
- Test long Jekyll/Hyde repagination and 32-passage/large sacred-source performance, exact original/verified-translation parallel pairing on Quran, Genesis, Matthew.
- Identify and match each remaining source-eligible missing cover to its edition using licensed artwork and attribution. Code cannot invent, silently substitute or assign assets without verifying source identity and rights.
- Observe actual Cloudflare deployments **after** relevant merges and public browser behavior; a green CI badge is not a production/browser pass.

No change in this report authorizes AI-generated sacred text, fabricated canonical pages, misassigned translations, altered marks/diacritics or production account manipulation.
