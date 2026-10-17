# Sacred Hindu Sanskrit source import — 17 October 2026

## Published edition
- Title: Bhagavad Gita. Sanskrit original in the gita/gita JSON digital edition.
- Book ID: e0c836a6-6d04-5914-9196-aeb9871776e9
- Source-edition registry ID: ecfc364e-b6cd-5ba8-a042-c87f730a9da9
- Pinned revision: c6fce39595445768876ddbb8d1268a9c935e1d2b
- Source: https://github.com/gita/gita/tree/c6fce39595445768876ddbb8d1268a9c935e1d2b
- License: The Unlicense, https://github.com/gita/gita/blob/c6fce39595445768876ddbb8d1268a9c935e1d2b/LICENSE
- Sanskrit source only. No AI translation, commentary, or manuscript reconstruction.

## Verified source bytes and numbered structure
- Exact acquired upstream data/verse.json SHA-256: bb599e666e552bd65080f1f8da6d488f067237f64091ab265978861cf3fadec7
- Exact acquired upstream data/chapters.json SHA-256: d435d980cef34fcb5529b2fa4c3e3ff617df44080094d22481b884299cc14dc9
- 18 chapters and 701 uniquely numbered verse units (chapter 13 contains 35 in this edition). Alternative traditional arrangements count 700; do not silently change source numbering.
- Consecutive database chunk indexes 0–700, no empty verse units.
- Ordered verse content MD5 with ASCII unit separator: 398da57ebe7835b9991b7d0331d7b325. Matches original source text exactly.
- 719 structure nodes: 18 chapter nodes and 701 verse nodes, with edition-specific canonical references.
- 6834 whitespace-delimited tokens, 35-minute platform reading estimate.
- The source dataset is not described as a critical collation of manuscripts or as the entire Hindu canon.

## Reproduction and safe publication
- The checked-in script scripts/prepare_gita_sanskrit_import.py regenerates deterministic SQL batches from the pinned source snapshots, refusing to proceed on source hash, license, coverage, numbering, uniqueness or script mismatch. The script stores no credentials.
- Local generated SQL files: C:\Temp\seeparah-gita-sanskrit-import-20261017.
- The importer first creates a draft; the final publication transaction raises an exception unless 701 chunks, sequential indexes, matching full ordered-text checksum and 719 nodes exist.
- The actual edition-quality, structure, rights and text QA checks passed and are recorded in book review_notes. This denotes technical source verification, not religious-authority certification.
- No previously blocked edition's status or source text changed.

## Live verification
- Catalogue: https://seeparah.com/sacred-texts
- Book detail: https://seeparah.com/sacred-texts/e0c836a6-6d04-5914-9196-aeb9871776e9
- Reader first page: https://seeparah.com/read/e0c836a6-6d04-5914-9196-aeb9871776e9?lang=Sanskrit&page=1
- Reader last source verse: https://seeparah.com/read/e0c836a6-6d04-5914-9196-aeb9871776e9?lang=Sanskrit&page=701
- Live headless Chrome checks verified visible source and edition metadata, first and final original Sanskrit shlokas, and no page-load errors on tested routes.
- Production sacred reader titles increased from 79 to 80; Cloudflare remains the only production host and environment variables were untouched.

## Remaining boundaries
Original GRETIL Sanskrit, historical Gita facsimiles, Edwin Arnold English translations, other Hindu works and remaining traditions retain their distinct editions and pre-existing rights, scan or structural blockers. This one release cannot certify comprehensive scripture coverage.
