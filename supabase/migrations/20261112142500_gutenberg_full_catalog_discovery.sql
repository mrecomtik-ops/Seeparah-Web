-- Discover ALL text-edition identities from the official Gutenberg CSV feed,
-- including multilingual, translated, editor-attributed and recent works.
-- Discovery is not publication permission. All rows start review-pending.
-- This migration creates no public read policy and changes no existing book.
CREATE TABLE IF NOT EXISTS public.gutenberg_catalog_inventory (
  gutenberg_id integer PRIMARY KEY CHECK (gutenberg_id BETWEEN 1 AND 9999999),
  source_type text NOT NULL DEFAULT 'Text',
  title text NOT NULL DEFAULT '',
  author_raw text NOT NULL DEFAULT '',
  language_codes text[] NOT NULL DEFAULT ARRAY[]::text[],
  catalog_issued date,
  subjects text,
  catalog_url text NOT NULL DEFAULT 'https://www.gutenberg.org/cache/epub/feeds/pg_catalog.csv',
  catalog_sha256 text NOT NULL CHECK (catalog_sha256 ~ '^[0-9a-f]{64}$'),
  rights_status text NOT NULL DEFAULT 'unreviewed' CHECK (
    rights_status IN ('unreviewed','needs_review','approved','rejected')
  ),
  intake_status text NOT NULL DEFAULT 'discovered' CHECK (
    intake_status IN ('discovered','unavailable_format','in_review','imported','rejected')
  ),
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.gutenberg_catalog_inventory ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.gutenberg_catalog_inventory FROM PUBLIC, anon, authenticated;
COMMENT ON TABLE public.gutenberg_catalog_inventory IS
  'Private, idempotent complete Gutenberg text catalogue. Metadata discovery is neither original-text verification nor publication/rights approval.';

CREATE TABLE IF NOT EXISTS public.gutenberg_discovery_state (
  id smallint PRIMARY KEY CHECK (id=1),
  enabled boolean NOT NULL DEFAULT false,
  catalog_offset integer NOT NULL DEFAULT 0 CHECK (catalog_offset>=0),
  last_catalog_sha256 text,
  batch_size integer NOT NULL DEFAULT 2500 CHECK (batch_size BETWEEN 100 AND 5000),
  last_attempt_at timestamptz,
  last_success_at timestamptz,
  completed_at timestamptz,
  processed_rows integer NOT NULL DEFAULT 0 CHECK (processed_rows>=0),
  last_error text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.gutenberg_discovery_state (id,enabled,batch_size)
VALUES (1,false,2500) ON CONFLICT (id) DO NOTHING;
ALTER TABLE public.gutenberg_discovery_state ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.gutenberg_discovery_state FROM PUBLIC, anon, authenticated;
COMMENT ON TABLE public.gutenberg_discovery_state IS
  'Private checkpoint for full (75k+) Gutenberg CSV discovery; separate from publication autopilot. Controlled pause is fail-closed.';
