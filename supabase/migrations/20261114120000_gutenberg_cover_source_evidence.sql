-- Immutable source evidence from official Gutenberg medium JPEG downloads.
-- Keep provenance distinct from historical printed-book jackets.
CREATE TABLE IF NOT EXISTS public.gutenberg_cover_source_evidence (
  book_id uuid PRIMARY KEY REFERENCES public.books(id) ON DELETE CASCADE,
  gutenberg_id integer NOT NULL CHECK (gutenberg_id BETWEEN 1 AND 9999999),
  official_cover_url text NOT NULL CHECK (official_cover_url ~ '^https://www[.]gutenberg[.]org/cache/epub/[0-9]+/pg[0-9]+[.]cover[.]medium[.]jpg$'),
  source_sha256 text NOT NULL CHECK (source_sha256 ~ '^[0-9a-f]{64}$'),
  source_width integer NOT NULL CHECK (source_width BETWEEN 150 AND 8000),
  source_height integer NOT NULL CHECK (source_height BETWEEN 180 AND 10000),
  source_bytes integer NOT NULL CHECK (source_bytes BETWEEN 2500 AND 2000000),
  verified_at timestamptz NOT NULL DEFAULT now(),
  archived_storage_path text,
  archived_at timestamptz,
  provenance_note text NOT NULL DEFAULT 'Exact Gutenberg ID JPEG verified by HTTP response, dimensions and SHA-256; canonical Gutenberg generated source cover; not a historical print jacket'
);
CREATE UNIQUE INDEX IF NOT EXISTS gutenberg_cover_source_evidence_ebook
 ON public.gutenberg_cover_source_evidence(gutenberg_id);
ALTER TABLE public.gutenberg_cover_source_evidence ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.gutenberg_cover_source_evidence FROM anon,authenticated;
