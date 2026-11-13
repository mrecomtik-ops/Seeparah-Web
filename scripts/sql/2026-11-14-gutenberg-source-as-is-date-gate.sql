-- Scoped original-print-year exception for full, checksum-archived
-- Project Gutenberg source-text editions. Preserve all other safety checks:
-- rights approval, source/edition/cleanup approvals, risk-signal review,
-- religious canonical references, evidentiary URLs, and description.
-- No unknown date is fabricated or silently backfilled.
--
-- This migration replaces ONE precise legacy predicate in each installed
-- production trigger function. Fail safely if production function changed.
BEGIN;

DO $do$
DECLARE
  fn text;
  old_clause text := 'new.original_publication_year is null and not exists (';
  scoped_clause text := $clause$new.original_publication_year is null
       and not (
         new.content_classification <> 'religious'
         and new.source_scan_id ~ '^gutenberg:[1-9][0-9]{0,6}$'
         and new.source_file_sha256 ~ '^[0-9a-f]{64}$'
         and new.source_file_path =
           'gutenberg-sources/gutenberg/' || split_part(new.source_scan_id, ':', 2) ||
           '/pg' || split_part(new.source_scan_id, ':', 2) ||
           '-' || left(new.source_file_sha256, 12) || '.txt'
         and position(
           'Original print-publication year has not been independently corroborated.'
           in coalesce(new.description, '')
         ) > 0
       )
       and not exists ($clause$;
  proc_name text;
BEGIN
  FOREACH proc_name IN ARRAY ARRAY[
    'check_book_publish_gate',
    'auto_unpublish_invalid_published_book'
  ] LOOP
    SELECT pg_get_functiondef(('public.' || proc_name || '()')::regprocedure)
      INTO fn;
    IF fn IS NULL OR position(old_clause IN fn)=0 OR
       position(scoped_clause IN fn)>0 THEN
      RAISE EXCEPTION 'Unexpected source or duplicate for %; no changes', proc_name;
    END IF;
    EXECUTE replace(fn,old_clause,scoped_clause);
  END LOOP;
END
$do$;

COMMIT;
