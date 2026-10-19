# World English Bible Classic New Testament import — 19 October 2026

## Scope and source identity
- Existing 27 Christian SBL Greek New Testament titles now also contain a separately sourced English edition: **World English Bible Classic (WEB Classic)** from eBible.org.
- No new book titles were created; 27 additional book/language editions were imported into existing Christian titles.
- Original Greek text, separate apparatus and the prior reader metadata remain intact.
- Official publisher: https://ebible.org/find/show.php?id=eng-web
- Official source package: https://ebible.org/Scriptures/eng-web_vpl.zip
- Rights: official World English Bible Classic publisher listing states public domain, and asks that changed text not retain the WEB trademark. Source lines were not rewritten. Title/edition, source and public-domain notices are retained in book_editions and sacred_source_editions.
- The exact publisher ZIP and its extracted verse-by-line UTF-8 source are stored only in the operator's local C:\Temp, not committed to web assets or deployed as a new file.
- The source package's eng-web_about.htm explicitly says this VPL text export excludes paragraph formatting, textual editorial notes, headings and introductions. The reader edition is labelled accordingly; the text is not falsely represented as a facsimile or the publisher's full annotated/typographic edition.

## Exact source checks
- Extracted eng-web_vpl.txt SHA-256: 52b92dc6db45070408ea45e4af0957d02b0f2263319a9ea10de7c8cf9e2cd8c4.
- Encoding: strict UTF-8; no U+FFFD substitution.
- All 27 New Testament file codes found and verified: MAT MAR LUK JOH ACT ROM 1CO 2CO GAL EPH PHI COL 1TH 2TH 1TI 2TI TIT PHM HEB JAM 1PE 2PE 1JO 2JO 3JO JUD REV.
- **7,953 nonempty source verse records** published, each preserving text after the publisher's verse prefix without punctuation or whitespace rewriting.
- Five intentionally blank original source reference entries remain omitted, not fabricated: Luke 17:36; Acts 8:37, 15:34, 24:7; Romans 16:25. They are enumerated in the relevant English book edition authenticity notes and original source register.
- Chapter and verse reference identifiers are preserved; no artificial verse-by-verse pairing with the independent SBL Greek critical edition was attempted.
- English publication only occurs after each book's chapter nodes, verse nodes, contiguous chunk indexes 0..N-1, and ordered source-text MD5 match the verified local source. If any check fails, the book's English language remains unpublished.
- The existing Greek source_language, Greek book_chunks, SBL notes and Greek source-edition identities remain unchanged.
- Source-file register contains original ZIP package checksum and extracted original text SHA-256, with reuse evidence URL.

## Database release and independent verification
- 27 of 27 WEB Classic English edition rows have publication_status=published.
- Database verification joined all 27 expected per-book source MD5 hashes to actual ordered DB source text: checked_books=27, source_verses=7953, fully_verified=27, failures=null.
- 27 existing Christian titles now list both Greek and English in available_languages. Published sacred book titles remain 80.
- All 32 previously blocked acquired source-edition records retain their original restrictions. This adds *alternative*, explicitly identified eligible English editions; it does **not** clear rights for Douay–Rheims, Swete scans, or any other restricted source.
- No environment variables, other book texts or user records altered.

## Reproduction
- See scripts/prepare_web_classic_nt_import.py in this repository. The operator must supply the original, unmodified official ZIP at C:\Temp\seeparah-web-vpl-20261019.zip.
- The importer checks publisher source SHA-256, unique book/chapter/verse references, strict source order and exact text, then generates staged SQL under C:\Temp\seeparah-web-english-nt-import-20261019. It never stores production credentials.
- The original generated 35-verse SQL batches and source manifest are retained locally; publication gates are separate transactions per book.
- The local packer groups only already verified SQL batches for efficient authorized Supabase import; it never modifies source text or publication logic.
- A full 66-book public-domain Bible on Seeparah is a separate project: this release covers all **27 New Testament books**, not all Old Testament books or denominational apocrypha.

## Production QA
- Tested desktop and mobile Chrome on actual routes:
  - Matthew English first verse at /read/7bc812fd-6a4d-544e-903f-b2e333a5cc4f?lang=English&page=1
  - Philemon English first verse at /read/da43c1ce-a246-5fef-8f6b-2469822c6033?lang=English&page=1
  - Revelation English last verse at /read/0f04a44a-fe48-5f59-99f9-36ce801271ee?lang=English&page=404
  - Matthew source/edition detail and main catalogue
- Verified source passage displayed and WEB attribution present; no load failures.
- Existing application checks: 445 tests across 61 files, TypeScript clean, production build passed with browser Supabase config verified.
- Frontend catalogue release adds direct Read Greek / Read English links for source-provenanced Christian books and corrects the Christian collection description. Cloudflare remains the only production web host.
