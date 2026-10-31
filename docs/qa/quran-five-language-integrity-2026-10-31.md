# Seeparah Qur'an five-language production source-integrity verification

Verified read-only in production Supabase, 31 October 2026, project `wxldqxuxpjurttspbxok`, work id `f7e3a9f0-931a-5207-9859-a27210cc2ca8`.

## Verification results

- Published `book_chunks` counts: **6,236** each in Arabic, English, Urdu, Hindi, Chinese. All indices contiguous from **0 through 6,235**; zero empty chunks.
- `book_structure_nodes` sourced ayah canonical references: **6,236 distinct reference keys**. **Zero** keys with fewer than five source languages or different chunk indexes between translations.
- Arabic metadata for separate basmala: **112** marked verses. `Quran 1:1` (integral first verse) and `Quran 9:1` have **no separate** basmala metadata.
- Publicly recorded edition identities remained distinct: Tanzil Uthmani Arabic; Rowwad Translation Center English; Muhammad Ibrahim Junagarhi Urdu; Azizul Haq Al-Omari Hindi; Muhammad Makeen Chinese.
- No scriptures, translators, punctuation, diacritics, basmalas or verse numbering were rewritten or generated.

## Read-only verification queries

```sql
SELECT language, count(*) AS published_chunks, min(chunk_index), max(chunk_index),
       count(*) FILTER (WHERE content IS NULL OR btrim(content) = '') AS empty
FROM public.book_chunks
WHERE book_id = 'f7e3a9f0-931a-5207-9859-a27210cc2ca8' AND status = 'published'
GROUP BY language ORDER BY language;

WITH verse_nodes AS (
 SELECT language, metadata->>'canonical_ref' AS ref, start_chunk_index AS idx,
        metadata->>'bismillah' AS basmala
 FROM public.book_structure_nodes
 WHERE book_id = 'f7e3a9f0-931a-5207-9859-a27210cc2ca8'
   AND metadata->>'reference_kind' = 'ayah'
), aligned AS (
 SELECT ref, count(*) AS langs, count(DISTINCT idx) AS positions
 FROM verse_nodes GROUP BY ref
)
SELECT (SELECT count(*) FROM aligned) AS refs,
 (SELECT count(*) FROM aligned WHERE langs <> 5 OR positions <> 1) AS mismatches,
 (SELECT count(*) FROM verse_nodes WHERE language='Arabic' AND basmala IS NOT NULL) AS arabic_separate_basmalas,
 (SELECT count(*) FROM verse_nodes WHERE language='Arabic' AND ref='Quran 9:1' AND basmala IS NULL) AS surah_9_unmarked,
 (SELECT count(*) FROM verse_nodes WHERE language='Arabic' AND ref='Quran 1:1' AND basmala IS NULL) AS surah_1_integral;
```

## What this does not prove

- It does not justify changing source metadata or adding/removing basmalas through a formatting rule.
- It does not prove every Unicode glyph, RTL font or passage pairing visually renders correctly on every device; bilingual speech-language and browser zoom need separate QA.
- It does not authorize a new Mushaf page numbering or machine-generated translations.
