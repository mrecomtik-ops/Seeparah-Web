# Seeparah sacred editions — reconciliation and release, 16 October 2026

## Scope and evidence

**Important:** This is a reconciliation of the named acquired editions, not a claim that all religious scriptures, recensions, or translations have been acquired or imported.

- Live website: https://seeparah.com/sacred-texts
- Related source-holdings page: https://seeparah.com/sacred-texts/sources
- Structured edition-by-edition, source-by-source ledger: [sacred-edition-reconciliation-2026-10-16.csv](sacred-edition-reconciliation-2026-10-16.csv). The CSV has **166 rows**: 134 published source/translation editions and 32 unpublished source records.
- All 79 published reader titles remain published and were left in place. All 32 unpublished records remain excluded from the full-text reader.
- Latest acquisition update: `Seeparah_Acquisition_Update_2026-10-12.md` (supersedes older summaries). Earlier baseline: `Seeparah_Scripture_Collection_Report.md`.
- **No new translations, scripture wording or database punctuation was generated, corrected, or overwritten.** The reader fix is only the interpretation of limited published-source inline markup in presentation.
- No unrelated books, user data, environment variables, review/rights flags or publication statuses were modified.

## Published edition structural checks (production)

| Family | Titles | Languages | Chunk counts per language | Index and blank checks |
|---|---:|---|---:|---|
| Qur’an — Tanzil Uthmani and QuranEnc named translations | 1 | Arabic, English, Urdu, Hindi, Chinese | 6,236 each | contiguous 0–6,235; zero empty |
| Sefaria Tanakh export units | 39 | Hebrew, JPS 1917 English | 23,206 each | zero bad sequences and zero empty |
| SBL Greek New Testament | 27 | Greek | 7,939 | zero bad sequences and zero empty |
| Dhammapada | 1 | Pali, English | 423 each | zero bad sequences and zero empty |
| Selected SuttaCentral Bilara collections | 11 | Pali, Bhikkhu Sujato English | 4,059 each | zero bad sequences and zero empty |

These are counts against the imported records, not manuscript-level collation. The 39 Tanakh export units do not represent a claim that the traditional Jewish Tanakh has 39 canonical books. The 11 Sutta collections are not a complete Tipiṭaka.

## Source-byte integrity completed on attached acquired packages

| Source package | Package SHA-256 | Files verified against pinned register | Result |
|---|---|---:|---|
| Seeparah_Quran_Five_Languages_2026-10-12.zip | e99a96489d0be0f65738f767c918d109ae41899dba2f82e9a7734023887c0356 | five complete XML editions | each has 114 surahs and 6,236 canonical references |
| Seeparah_Pali_VRI_2026-10-12.zip | ca75f2924b072824e6948e9f9dceefbc46d01e30d7a1faf0882055698d86c86e | 219 files (217 XML, two README files) | all byte lengths and SHA-256 match |
| Seeparah_Tibetan_Kangyur_2026-10-12.zip | e07996896dd743167ff1908cb89d5d1a88ac84bdd4555e25b36d8c32360b181a | 108 files (103 text, five source/support files) | all byte lengths and SHA-256 match |
| Seeparah_Tibetan_Tengyur_2026-10-12.zip | bed29282ef8be85fd42731159c1d0d042beee1d2c914591b4ae9008b0717e4d3 | 217 files (213 text, four docs) | all byte lengths and SHA-256 match |
| Seeparah_Source_Records_2026-10-12.zip | 939497565080d046aa9b6657e82223870fbbf6ce465b5f13a4fdb68da17d4728 | 14 register / evidence files | package hash matches signed acquisition inventory |

## Full ordered Qur’an fidelity

Source-XML ordered-verse text was joined with ASCII unit separator between entries, and MD5 was compared to production DB's `string_agg(content, chr(31) order by chunk_index)`. Results:

| Language | Source and DB ordered-content MD5 | Outcome |
|---|---|---|
| English (Rowwad 1.0.19) | 4327ec95001fd407f216e9e2f6975bda | exact |
| Urdu (Muhammad Ibrahim Junagarhi 1.1.3) | 0eaf4d2e7bf75984936504ca8190176e | exact |
| Hindi (Azizul Haq Al-Omari 1.1.5) | 8a4b2938efbd0ffb75ac9693c8ac23c3 | exact |
| Chinese (Muhammad Makeen 1.0.8) | 570e8ac47fb2accf478ee863f5bc0a5a | exact |
| Arabic (Tanzil Uthmani 1.1) | 42a66dd526138e97ebf672cd4e4a380f | exact **after accounting for prefatory Bismillah in edition metadata** |

The Arabic DB stores a prefatory `bismillah` field for each of 112 surahs; a separate display prefix and line-break precede their first numbered ayah. The original acquired XML contains the numbered ayah, without this separate prefatory line. Exactly stripping the **metadata-documented** 112 prefixes in a read-only verification SQL expression produces the XML's exact ordered MD5. The stored DB text was **not** changed or normalized. Each of the five editions has all 6,236 references, first 1:1 and final 114:6.

**Mufti Taqi Usmani Urdu remains unacquired and unpublished.** The published Urdu is Muhammad Ibrahim Junagarhi; do not relabel.

## Renderer issue and correction

Original DN34 English text contains meaningful inline source markup, including `<b>What one thing is helpful?</b>`. The reader previously rendered source markup as visible angle-bracket tags. A safe React rendering layer now interprets a restricted set of Bilara inline tags (`b`, `em`, `i`, SuttaCentral `a` links, and source `j` join markers). No source bytes are changed and **no `dangerouslySetInnerHTML`** or arbitrary source HTML is used. Unknown/malformed markup remains visibly literal; script and unsafe URLs are not executed. The same treatment is applied to named annotations, not only one DN34 sample.

## Exact unresolved publication and acquisition boundaries

All 32 unpublished source-registry rows retain their original statuses and blockers in the CSV and in the public *source holdings* listing. No record was converted to a reader or silently marked complete.

- **Rights/reuse:** CBETA Chinese subset (2,459 source XMLs), 84000 released TEI (331 source files), BDK Lotus Sutra, VRI Pali (61 root, 49 commentary, 22 subcommentary, 85 other XML files), GRETIL Sanskrit, historical Gutenberg downloads and official modern copyrighted files. Noncommercial or territory-dependent terms are not automatically satisfied by a free launch.
- **Structure:** the PD Esukhia Derge Kangyur and Tengyur archives have real Tibetan files and identifiable volume/folio/Tohoku markers, but contain editorial notation, normalized conventions and mixed work boundaries. Dedicated lossless per-work parsing, navigation, duplicate/coverage mapping and final QA remain before publication.
- **Scans:** Swete three-volume Septuagint, historical Hindu/Jain/Confucian/Shinto/Avesta scans and the BDK Lotus PDF must retain facsimile/edition status. Scans are not authority for unverified OCR; some scans have worldwide rehosting uncertainty. Links on the source-holdings page point to publisher/source locations and do not imply all PDFs are hosted or that a generic homepage is an exact scan.
- **Partial acquisitions:** the six acquired Ganguli Mahabharata English files are not a complete 18-parvan translation; Griffith Ramayana English does not provide a full verse-matched seven-book translation; the Hindu Vedic and Upanishadic source files are selected recensions; the older core/historical packages named by the 28 Sept report are not currently mountable in this audit's Library snapshot, so source-by-source byte verification for those was not repeated.
- **Not acquired or not rehostable:** Aasan Tarjuma-e-Quran by Mufti Taqi Usmani; selected official publisher files and link-only records.

Only already eligible, evidenced source editions should be imported as readable texts. New source holdings metadata is **not an import**.

## Rollback and hosting

Production is on **Cloudflare Workers**. Keep `wrangler.jsonc` `keep_vars: true`; do not remove env vars. The release is limited to frontend reader markup, holdings discovery and audit documentation. Roll back via the previous Cloudflare Worker version and revert this release's GitHub pull request if needed. Source and user database rows remain unchanged.
