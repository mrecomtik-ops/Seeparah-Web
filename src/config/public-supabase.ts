/**
 * Public Supabase browser configuration for Seeparah.
 *
 * These values are intentionally safe to ship to the browser:
 * - the project URL is public
 * - the sb_publishable_* key is Supabase's public client key
 *
 * Keeping a committed fallback makes Cloudflare builds deterministic even when
 * VITE_* build variables are absent. RLS remains the security boundary.
 * Never place the service-role key or any other secret in this file.
 */
export const PUBLIC_SUPABASE_URL = "https://wxldqxuxpjurttspbxok.supabase.co";
export const PUBLIC_SUPABASE_PUBLISHABLE_KEY = "sb_publishable_0dqRtyB4-A7AuuYzP_KNMQ_PBjrfDHy";
