# Tibetan pinned source-volume browser — Cloudflare release

## Scope
This release makes all **316 acquired Derge Tibetan *source-volume transcriptions*** available from the public Seeparah acquired-source holdings page without misrepresenting them as canonical complete individual works:
- 103 Derge Kangyur source volumes at pinned revision `a582cf471b7c85a101035071078032f106a8e536`.
- 213 Derge Tengyur source volumes at pinned revision `174653137d62af481f53c6ae3dc842bf8629323e`.

The source filenames remain original, including Tibetan, volume number and catalogue markers. The browser obtains each file directly from `raw.githubusercontent.com/Esukhia` at the pinned commit, checks the exact UTF-8 byte size and SHA-256 against the verified October 12 acquired source archives, and refuses to display mismatches. The 316 source metadata records have checksum + volume names and are committed to `src/lib/sacred-tibetan-source-manifest.json`.

The reader displays raw UTF-8 text in 25,000-UTF16-code-unit display slices, without suppressing original folio/line markers, errors or editorial notation. Display slices are **not** labeled sutras, chapters, verses, or work boundaries. Full original source files remain accessible with direct pinned GitHub links. Source files are **not** bundled into Cloudflare worker assets; the browser needs access to GitHub Raw.

The page is intentionally separate from the published 79 Seeparah sacred-text book records. No new `books`/`book_chunks`/`book_editions` rows were created, no publication flag was changed and no existing database contents were modified. Source rights and labels reflect the pinned Esukhia editorial version (not a facsimile copy of woodblock page images); the verified source is described as Tibetan **text** and the cross-volume work segmentation remains unverified.

## Routing
- Public: `/sacred-texts/tibetan-volumes`
- Optional params: `?corpus=Kangyur&volume=1`, `?corpus=Tengyur&volume=213`
- Linked from `/sacred-texts/sources` and discoverable via the sacred-text catalogue.

## Security and reproducibility
- No `dangerouslySetInnerHTML`; React displays text escapes.
- Client verifies source using `crypto.subtle.digest('SHA-256')`, fail closed.
- CSP `connect-src` expands *only* to `https://raw.githubusercontent.com`, alongside existing authorized sources.
- Metadata generation script: `scripts/generate_sacred_tibetan_manifest.py`, which refuses unpinned/revised source ZIP content.
- Program to identify unresolved candidate Tohoku work boundaries: `scripts/sacred_tibetan_work_boundary_audit.py`.
- Source audit markers: 1208 Kangyur, 3363 Tengyur; 54 volumes have no start marker; eight Kangyur IDs repeated in catalogue contexts; **these remain unresolved**.

## Still unresolved
- The 316 volume-level **transcriptions** do not mean all canonical works are complete or individually mapped, and should not be counted as 316 newly published sacred-book readers.
- Need a validated cross-volume work-level map with precise Tohoku relationships, selection/partial/complete badges and position preservation before importing to the main book reader.
- Remaining restricted material (VRI, GRETIL, CBETA, 84000, source-link-only scans, and translations) stays unpublished pending actual rights and source-fidelity validation. Mufti Taqi Usmani Urdu remains unavailable.
- Dhammapada has no individual generated cover in the 42 original artworks; the previously corrected title panel remains.

## Production protection
Cloudflare continues as the sole production platform with `keep_vars: true`, original custom domains, credentials, user data and unrelated books untouched.
