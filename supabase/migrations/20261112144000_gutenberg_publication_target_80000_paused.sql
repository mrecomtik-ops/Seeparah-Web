-- Extend only the CONFIGURED ceiling for future independently approved
-- Gutenberg publication. Does NOT resume the importer or approve any book.
-- Gutenberg catalogue discovery remains separate and includes non-eligible
-- modern, translated and multilingual metadata candidates for review.
DO $safe_target$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.gutenberg_autopilot_settings
    WHERE id=1 AND enabled=false AND target_published=10000 AND batch_size=100
  ) THEN RAISE EXCEPTION 'Old publication setting has changed; do not override it';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid='public.gutenberg_autopilot_settings'::regclass
      AND conname='gutenberg_autopilot_settings_target_published_check'
      AND pg_get_constraintdef(oid) LIKE '%10000%'
  ) THEN RAISE EXCEPTION 'Old publication limit constraint has changed';
  END IF;
  ALTER TABLE public.gutenberg_autopilot_settings
    DROP CONSTRAINT gutenberg_autopilot_settings_target_published_check;
  ALTER TABLE public.gutenberg_autopilot_settings
    ADD CONSTRAINT gutenberg_autopilot_settings_target_published_check
    CHECK (target_published BETWEEN 100 AND 100000);
  UPDATE public.gutenberg_autopilot_settings
  SET target_published=80000,updated_at=now()
  WHERE id=1 AND enabled=false AND target_published=10000;
  IF NOT FOUND THEN RAISE EXCEPTION 'Failed to raise target while publication paused'; END IF;
END $safe_target$;
