-- Production-applied 2026-11-11. Seeparah QA-002 private rollback evidence.
-- All chapter-navigation repairs are data fixes only: published source
-- content, chunks, canonical sacred text, reading progress stay unchanged.
CREATE TABLE IF NOT EXISTS public.qa_20261111_structure_repair_backups (
  book_id uuid PRIMARY KEY REFERENCES public.books(id),
  source_version integer NOT NULL,
  original_nodes jsonb NOT NULL,
  repaired_node_keys text[] NOT NULL DEFAULT '{}',
  marker_count integer NOT NULL,
  inserted_count integer NOT NULL DEFAULT 0,
  repaired_at timestamptz NOT NULL DEFAULT now(),
  evidence text NOT NULL DEFAULT 'Recovered direct chapter headings from existing immutable Gutenberg text chunks; no text or reader progress changed'
);
ALTER TABLE public.qa_20261111_structure_repair_backups ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.qa_20261111_structure_repair_backups FROM PUBLIC, anon, authenticated;
COMMENT ON TABLE public.qa_20261111_structure_repair_backups IS 'Private restore points for 2026-11-11 chapter-navigation-only repairs; no manuscript source changed.';
