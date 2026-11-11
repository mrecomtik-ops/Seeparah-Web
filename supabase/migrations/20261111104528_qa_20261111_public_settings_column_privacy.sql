-- Applied in Seeparah production at 2026-11-11: QA-031.
-- The public config API needs only key/value/visibility/version/timestamp,
-- never the admin user UUID from updated_by.
-- Server-side service_role and authenticated admin management are untouched.
REVOKE SELECT ON TABLE public.content_settings FROM anon, authenticated;
GRANT SELECT (key, value, is_public, version, updated_at)
ON TABLE public.content_settings TO anon, authenticated;
