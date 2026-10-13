# Sacred-text import and production handoff — 2026-10-13

This file records the source-preserving sacred-text import performed from the
Seeparah Library acquisition packages dated 2026-09-28 through 2026-10-12.

## Non-negotiable content rules

- Sacred texts use `content_classification = 'religious'` and
  `translation_generation_policy = 'source_only'`.
- No scripture text is generated, translated, completed, corrected or
  rewritten by Seeparah.
- A source-language text, published translation, commentary, subcommentary,
  editorial apparatus, footnote and scan remain distinct source layers.
- Source bytes/checksums are recorded in `sacred_source_files`; edition-level
  publication/reuse decisions are recorded in `sacred_source_editions`.
- Reader structure keeps the imported edition's canonical reference labels and
  numbering. The platform does not normalize one tradition into another
  tradition's chapter/verse system.
- Scan-only acquisitions are never promoted from OCR into authoritative text.

## Acquired package checksums

October 12 supplements:

| Package | SHA-256 |
| --- | --- |
| Seeparah_Quran_Five_Languages_2026-10-12.zip | `e99a96489d0be0f65738f767c918d109ae41899dba2f82e9a7734023887c0356` |
| Seeparah_Pali_VRI_2026-10-12.zip | `ca75f2924b072824e6948e9f9dceefbc46d01e30d7a1faf0882055698d86c86e` |
| Seeparah_Tibetan_Kangyur_2026-10-12.zip | `e07996896dd743167ff1908cb89d5d1a88ac84bdd4555e25b36d8c32360b181a` |
| Seeparah_Tibetan_Tengyur_2026-10-12.zip | `bed29282ef8be85fd42731159c1d0d042beee1d2c914591b4ae9008b0717e4d3` |
| Seeparah_Source_Records_2026-10-12.zip | `939497565080d046aa9b6657e82223870fbbf6ce465b5f13a4fdb68da17d4728` |

Earlier retained packages:

| Package | SHA-256 |
| --- | --- |
| Seeparah_Verified_Core_Texts.zip | `29705f10fce9e037904a0c59002d435c3e8350d548b5bf3f3fe0dd57ff1cb78d` |
| Seeparah_Verified_Buddhist_Editions.zip | `c74a3eaf0aab4c3cb7bac61d7c9f5875d00ce573c3783b397d53d7bba472e951` |
| Seeparah_Verified_Historical_Editions.zip | `ab32146415dd0cd4598ed6bccd027c9711d1d527069fdac2d17f18da3a6ee464` |
| Seeparah_Recovered_Scripture_Texts.zip | `15eef6db73beacc57963ee708c0b1d770cd8984a27082556317893f558b1fe29` |
| Seeparah_Hinduism_Scans_2026-10-10.zip | `0ef5acd9331556f7d390bfa4da4660124a28ac137c83e0cae23550a56ea53dee` |
| Seeparah_Christianity_Scans_2026-10-10.zip | `bb67cf249a920924ee99506e98625d45dbcb241bddb01f476b576fc1d6255686` |
| Seeparah_Confucianism_Scans_2026-10-10.zip | `fa2b04e80c3836a60ce7c6503386d2d968b6d84ae30215e226e8e50b07e0855f` |
| Seeparah_Shinto_Scans_2026-10-10.zip | `2de023c7fc4a0e50520fb220fc5aaf2870b8925aec2cccb93fb851d21964c40e` |

## Published database state

Production Supabase contains 68 published sacred reader titles and 112
published language/edition reader sets:

- Islam: The Qur'an — Tanzil Uthmani Arabic plus sourced English, Urdu, Hindi
  and Chinese QuranEnc editions.
- Judaism: 39 Sefaria Tanakh export units, each with the selected
  Hebrew/Aramaic source edition and JPS 1917 English edition. The 39 export
  units must not be described as the traditional Jewish 24-book grouping.
- Christianity: 27 SBL Greek New Testament books. The SBLGNT critical
  apparatus is stored separately from scripture text.
- Buddhism: Dhammapada — SuttaCentral/Bilara Pali root plus Bhikkhu Sujato
  English edition.

Every published sacred reader set was audited for contiguous zero-based chunk
indexes, expected source-unit count, a matching published source registry
entry, and preserved source-file checksum records. No published sacred book is
paid and no sacred book has an AI translation job.

### Qur'an identity

- Arabic: Tanzil Uthmani 1.1
- English: Rowwad Translation Center 1.0.19
- Urdu: **Muhammad Ibrahim Junagarhi**, QuranEnc/Rowwad 1.1.3
- Hindi: Azizul Haq Al-Omari 1.1.5
- Chinese: Muhammad Makeen, reviewed by Muhammad Sulaiman and language
  experts, 1.0.8

Each language has 114 surahs and 6,236 ayahs. Translation canonical-reference
sequences were checked against Arabic. Translation footnotes remain separate
in `sacred_annotations`.

**Mufti Taqi Usmani Urdu was not acquired and must never be represented by the
Junagarhi edition or another substitute.**

## Acquired but not reader-published

The registry deliberately does not turn acquisition into publication approval.

- VRI Pali: unpublished for public production because the source specifies
  non-commercial use. The 217 XML files remain classified as 61 root-text,
  49 commentary, 22 subcommentary and 85 other files; those are file counts,
  not canonical book counts.
- Esukhia Derge Kangyur and Tengyur: rights are clear, but public reader import
  remains blocked on lossless work/volume/folio/editorial-notation structure.
  Source NFD Tibetan and edition conventions must not be normalized away.
- CBETA: unpublished because the acquired source license is non-commercial and
  the selected subset mixes scripture/commentarial classifications.
- 84000 released translations: unpublished because the source is
  non-commercial/no-derivatives and reader segmentation/rehosting is not
  cleared.
- BDK Lotus Sutra, Swete Septuagint, historical Hindu/Jain/Confucian/Shinto/
  Zoroastrian scans: scan-only/source-record status; unverified OCR is not
  authoritative reader text.
- GRETIL Hindu Sanskrit material: unpublished because the acquired material is
  under a non-commercial condition and contains edition/commentary boundaries
  that must remain distinct.
- SikhNet/Gurbanifiles Guru Granth Sahib PDFs: rehosting permission unresolved.
- Bahá'í and current official Latter-day Saint publisher files: source-link
  only unless rehosting permission is obtained.
- Project Gutenberg historical editions in the acquisition set remain
  unpublished for worldwide production because the source notice itself tells
  users outside the United States to check local law. Exact acquired file
  hashes are still preserved in the registry.

The collection is partial and must never be advertised as every scripture,
canon, recension or translation of Islam, Christianity, Judaism, Buddhism,
Hinduism or any other tradition.

## Reader architecture

Large sacred works are not loaded as one multi-megabyte paginated DOM. The
religious read route uses a canonical-section reader that loads only the
containing surah/chapter/section, preserves the requested source-unit deep link,
supports language switching, RTL scripts and source-specific Unicode, and
shows footnotes/commentary as distinct expandable annotations.

General books continue to use Reader V3 unchanged.

## Deployment

Cloudflare remains the only production web host. `wrangler.jsonc` keeps
dashboard variables with `keep_vars: true`; no environment variable or
unrelated book is part of this import.

Production database import is complete. The repository branch/PR contains the
final section-reader fix. A final Cloudflare deploy requires either an online
authorized Desktop Commander session or a configured
`CLOUDFLARE_API_TOKEN` in GitHub Actions. GitHub Actions currently has no
Cloudflare API token configured, so the branch can be fully tested/buildable
there but cannot deploy itself.
