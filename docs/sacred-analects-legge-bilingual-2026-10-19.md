# Confucian Analects Legge bilingual — source import QA (2026-10-19)

## Published
- Book: Confucian Analects (Legge bilingual), UUID 898fc232-957e-52e6-8339-01a38c2a9da8.
- New source-edition UUID cd6ca65c-b257-5a20-9bc8-d567a391f1cf.
- Traditional Chinese and James Legge's 1893 historical English translation (translator lived 1815–1897).
- Wikisource scan-linked edition: https://en.wikisource.org/wiki/The_Chinese_Classics/Volume_1/Confucian_Analects
- Reproducible corpus: data/sacred/analects-legge-1893/book-01.txt to book-20.txt, plus manifest.json with exact revision IDs, pinned source URLs and SHA-256 source-extraction checksums.

## Fidelity and review
- Original ancient Chinese and existing Legge English; no new or AI translation.
- 20 original books; 1,408 reading content blocks; 1,428 navigation nodes. No missing chunk indexes (0–1407).
- Complete ordered chunk content MD5 is 58b63e48a60cc41a7f89defdfa5f2b83, independently checked in Supabase against verified local source extraction.
- Wikimedia page HTML CSS/navigation markup omitted; reading text and punctuation kept unchanged in extracted content blocks. This is a revision-pinned volunteer transcription, not original HTML bytes or a facsimile: source_files.source_bytes_preserved=false.
- Word estimate: 29,597 whitespace-delimited tokens across Chinese and English, not a scholarly word segmentation.
- The source copyright status rests on Legge's historical translation and the ancient Chinese text. Wikisource editorial contributions and attribution must be honored. See https://en.wikisource.org/wiki/Wikisource:Copyright_policy.
- UAE Federal Decree-Law 38 of 2021, Article 20 provides lifetime plus 50 years generally for literary works (https://uaelegislation.gov.ae/en/legislations/1534). Rights status does not extend to arbitrary newly copyrighted editions.

## Reproduction
- Script scripts/prepare_analects_legge_bilingual.py regenerates staged SQL from 20 committed source text snapshots, validates source hashes and counts, and refuses to publish if exact 1,408 contents or 1,428 nodes fail parity. No secrets are stored.
- Staged SQL generated into C:\Temp\seeparah-analects-import-20261019 on the connected operator PC. Source rows, reading content, structure and final publish gate imported by authorized Supabase connector.
- Independent live Chrome tests passed for catalogue, edition detail, opening Chinese reading page and final bilingual page, mobile/desktop.
- Reader URL https://seeparah.com/read/898fc232-957e-52e6-8339-01a38c2a9da8?lang=Bilingual&page=1
- Published sacred book titles increased to 81. No other books or Cloudflare environment variables changed.

## Original 32 acquisitions still pending
- The two original Gutenberg Analects digital transcriptions are not falsely marked as published by this Wikisource import.
- This is a new authentic alternative. It does not automatically clear copyright-limited Buddhist editions, scan OCR, publisher-controlled sacred texts or Tibetan work-boundary reconciliation.
