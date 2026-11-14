-- Full-byte source equivalence audit; never certify a changed Gutenberg
-- snapshot as the original of an older Seeparah reading edition.
CREATE TABLE IF NOT EXISTS public.gutenberg_legacy_source_comparison (
 book_id uuid PRIMARY KEY REFERENCES public.books(id) ON DELETE CASCADE,
 gutenberg_id integer NOT NULL CHECK(gutenberg_id BETWEEN 1 AND 9999999),
 prior_recorded_source_sha256 text,
 current_official_raw_sha256 text NOT NULL CHECK(current_official_raw_sha256 ~ '^[0-9a-f]{64}$'),
 current_official_body_sha256 text NOT NULL CHECK(current_official_body_sha256 ~ '^[0-9a-f]{64}$'),
 stored_reader_body_sha256 text NOT NULL CHECK(stored_reader_body_sha256 ~ '^[0-9a-f]{64}$'),
 current_official_chars integer NOT NULL CHECK(current_official_chars>0),
 stored_reader_chars integer NOT NULL CHECK(stored_reader_chars>0),
 source_bytes integer NOT NULL CHECK(source_bytes>0),
 exact_reader_source_match boolean NOT NULL,
 current_source_url text NOT NULL,
 comparison_method text NOT NULL DEFAULT 'NFC text, Unicode whitespace stripped; entire canonical body compared to all published source-language chunks',
 candidate_storage_path text,
 checked_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.gutenberg_legacy_source_comparison ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.gutenberg_legacy_source_comparison FROM anon,authenticated;
CREATE UNIQUE INDEX IF NOT EXISTS gutenberg_legacy_source_comparison_gutenberg_id ON public.gutenberg_legacy_source_comparison(gutenberg_id);
ALTER TABLE public.gutenberg_legacy_source_comparison
 ADD COLUMN IF NOT EXISTS archive_state text NOT NULL DEFAULT 'pending'
 CHECK (archive_state IN ('pending','archived_verified','staged_mismatch','unavailable','error')),
 ADD COLUMN IF NOT EXISTS archive_attempted_at timestamptz,
 ADD COLUMN IF NOT EXISTS archive_error text;
