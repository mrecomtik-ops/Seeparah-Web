-- Private source-reconciliation audit. A hash label is not proof until
-- preserved original bytes have actually matched that existing hash.
CREATE TABLE IF NOT EXISTS public.gutenberg_legacy_archive_checks(
  book_id uuid PRIMARY KEY REFERENCES public.books(id) ON DELETE CASCADE,
  gutenberg_id integer NOT NULL CHECK (gutenberg_id BETWEEN 1 AND 9999999),
  expected_sha256 text NOT NULL CHECK (expected_sha256 ~ '^[0-9a-f]{64}$'),
  state text NOT NULL CHECK (state IN ('archived','unavailable','checksum_mismatch')),
  observed_source_name text,
  archived_path text,
  details text NOT NULL DEFAULT '',
  checked_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.gutenberg_legacy_archive_checks ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.gutenberg_legacy_archive_checks FROM anon,authenticated;
