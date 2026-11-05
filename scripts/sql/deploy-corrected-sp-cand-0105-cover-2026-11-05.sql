-- Safe, idempotent correction of one already-published, rights-approved book.
-- Run only AFTER Cloudflare serves the exact corrected WebP and SHA-256 matches
-- 97ed730530b6b8c26c78844907e2046e55aae7d39489b11f108521080ccd347f.
-- The original wrong-author image remains quarantined in non-public staging.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
DO $pre$
DECLARE n int;
BEGIN
 SELECT count(*) INTO n FROM public.books b WHERE
 b.id='935c4918-3380-464d-91fe-872825d8f40d'::uuid
 AND b.import_key='SP-CAND-0105'
 AND b.title='Tenda e castello'
 AND b.author='Roberto Sacchetti'
 AND b.source_edition_id='gutenberg:71320'
 AND b.source_language='Italian'
 AND b.status='published'
 AND b.rights_status='approved'
 AND b.edition_review_status='approved'
 AND b.structure_review_status='approved'
 AND b.cleanup_review_status='approved'
 AND b.total_chunks=32
 AND b.source_file_sha256='eb4b2e28630434b55d8cb6203a6cc2cd0d631314c8324cb9a0d43a3ba20383f0'
 AND (b.cover_url IS NULL OR b.cover_url='https://seeparah.com/book-covers/premium-42/SP-CAND-0105_tenda-e-castello.webp');
 IF n<>1 THEN RAISE EXCEPTION 'SP-CAND-0105 exact source/rights/cover preflight failed, matches=%',n; END IF;
END $pre$;
UPDATE public.books b SET cover_url='https://seeparah.com/book-covers/premium-42/SP-CAND-0105_tenda-e-castello.webp'
WHERE b.id='935c4918-3380-464d-91fe-872825d8f40d'::uuid
AND b.import_key='SP-CAND-0105'
AND b.title='Tenda e castello'
AND b.author='Roberto Sacchetti'
AND b.source_edition_id='gutenberg:71320'
AND b.status='published'
AND b.rights_status='approved'
AND b.edition_review_status='approved'
AND b.structure_review_status='approved'
AND b.cleanup_review_status='approved'
AND b.cover_url IS NULL;
DO $post$
DECLARE n int;
BEGIN
 SELECT count(*) INTO n FROM public.books b
 WHERE b.id='935c4918-3380-464d-91fe-872825d8f40d'::uuid
 AND b.import_key='SP-CAND-0105'
 AND b.author='Roberto Sacchetti'
 AND b.source_edition_id='gutenberg:71320'
 AND b.cover_url='https://seeparah.com/book-covers/premium-42/SP-CAND-0105_tenda-e-castello.webp';
 IF n<>1 THEN RAISE EXCEPTION 'SP-CAND-0105 cover postcheck failed'; END IF;
END $post$;
COMMIT;
SELECT id::text,import_key,title,author,source_edition_id,cover_url FROM public.books WHERE import_key='SP-CAND-0105';
