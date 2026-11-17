-- Applied to Seeparah production with Supabase migration 20261117070715.
-- Fix: every one-minute Cloudflare cron was timing out in Gutenberg queue
-- preparation because the repeated OR anti-join materialized all books.
-- Keep existing Gutenberg ID, official URL, and normalized-title de-dup.
CREATE INDEX IF NOT EXISTS books_gutenberg_scan_lookup_idx
  ON public.books (source_scan_id) WHERE source_scan_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS books_gutenberg_url_lookup_idx
  ON public.books (source_url) WHERE source_url IS NOT NULL;
CREATE INDEX IF NOT EXISTS books_gutenberg_title_lookup_idx
  ON public.books ((lower(title))) WHERE title IS NOT NULL;

-- Source-of-truth definition is the verified live function. Scan at most
-- one bounded queue batch; no full candidate pool COUNT per minute.
CREATE OR REPLACE FUNCTION public.gutenberg_autopilot_prepare_batch()
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE
  cfg public.gutenberg_autopilot_settings%rowtype;
  published_count integer;
  inflight_count integer;
  to_enqueue integer;
  inserted_count integer;
  batch_number integer;
  batch_key text;
BEGIN
  SELECT * INTO cfg FROM public.gutenberg_autopilot_settings
  WHERE id=1 FOR UPDATE;
  IF NOT FOUND OR NOT cfg.enabled THEN
    RETURN jsonb_build_object('status','paused');
  END IF;

  SELECT count(*) INTO published_count FROM public.books
  WHERE status='published';
  IF published_count >= cfg.target_published THEN
    UPDATE public.gutenberg_import_jobs SET
      status='skipped',
      last_error='Stopped: target published catalogue count reached',
      updated_at=now()
    WHERE status='queued' AND metadata->>'autopilot'='true';
    UPDATE public.gutenberg_autopilot_settings SET
      enabled=false,updated_at=now(),last_error=null WHERE id=1;
    RETURN jsonb_build_object('status','complete',
      'published',published_count,'target',cfg.target_published);
  END IF;

  SELECT count(*) INTO inflight_count FROM public.gutenberg_import_jobs
  WHERE status IN ('queued','processing');
  IF inflight_count > 0 THEN
    RETURN jsonb_build_object('status','running',
      'published',published_count,'pending',inflight_count,
      'batchNumber',cfg.last_batch_number);
  END IF;

  to_enqueue := least(cfg.batch_size,cfg.target_published-published_count);
  batch_number := cfg.last_batch_number+1;
  batch_key := 'PG-AUTO-'||lpad(batch_number::text,4,'0');

  WITH eligible AS (
    SELECT c.* FROM public.gutenberg_catalog_candidates c
    WHERE NOT EXISTS (
      SELECT 1 FROM public.gutenberg_import_jobs j
      WHERE j.gutenberg_id=c.gutenberg_id
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.books b
      WHERE b.source_scan_id='gutenberg:'||c.gutenberg_id
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.books b
      WHERE b.source_url='https://www.gutenberg.org/ebooks/'||c.gutenberg_id
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.books b
      WHERE lower(b.title)=lower(c.title)
    )
    ORDER BY c.priority,c.gutenberg_id
    LIMIT to_enqueue
  ), added AS (
    INSERT INTO public.gutenberg_import_jobs(
      gutenberg_id,original_publication_year,status,metadata
    )
    SELECT e.gutenberg_id,e.original_publication_year,'queued',
      jsonb_build_object(
        'autopilot',true,'batchId',batch_key,
        'title',e.title,'author',e.author,
        'authorDeathYear',e.author_death_year,
        'originalPublicationYear',e.original_publication_year,
        'metadataSource','Project Gutenberg official weekly CSV',
        'catalogIssued',e.catalog_issued,'catalogUrl',e.catalog_url,
        'subjects',e.subjects,
        'rightsReview','pending independent source and date check'
      )
    FROM eligible e
    ON CONFLICT (gutenberg_id) DO NOTHING
    RETURNING id
  )
  SELECT count(*) INTO inserted_count FROM added;

  IF inserted_count=0 THEN
    RETURN jsonb_build_object('status','needs_catalog',
      'published',published_count,'target',cfg.target_published);
  END IF;
  UPDATE public.gutenberg_autopilot_settings SET
    last_batch_number=batch_number,
    updated_at=now(),
    last_error=null
  WHERE id=1;

  RETURN jsonb_build_object(
    'status','batch_started',
    'batchId',batch_key,'batchNumber',batch_number,
    'queued',inserted_count,
    'published',published_count,'target',cfg.target_published
  );
END;
$function$
REVOKE ALL ON FUNCTION public.gutenberg_autopilot_prepare_batch() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.gutenberg_autopilot_prepare_batch() TO service_role;
COMMENT ON FUNCTION public.gutenberg_autopilot_prepare_batch() IS
  'Bounded, index-backed Gutenberg queue refiller. Preserves source ID, URL and title duplicate checks; rights and source integrity remain enforced by importer.';
