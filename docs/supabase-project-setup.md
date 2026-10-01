# Supabase project setup for Seeparah

Seeparah uses Supabase for database, authentication and storage, with the application running on Cloudflare Workers.

## Required values

Local development may use `.env.local` for browser-facing Vite values and `.dev.vars` for Worker runtime values. Never commit real keys.

Browser-facing:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`
- `VITE_SUPABASE_PROJECT_ID` when required by tooling

Worker runtime:

- `SUPABASE_URL`
- `SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `GEMINI_API_KEY`
- `RESEND_API_KEY`
- `SUPPORT_RATE_LIMIT_SALT`
- `SUPPORT_RATE_LIMIT_PEPPER`

Optional translation/runtime settings are documented in `.dev.vars.example`.

## Setup sequence

1. Create or select the Supabase project.
2. Apply the repository migrations in order from `supabase/migrations`.
3. Regenerate `src/integrations/supabase/types.ts` against the resulting schema when schema changes require it.
4. Configure Google OAuth using the Supabase callback URL for the project.
5. Set the Worker variables and secrets in Cloudflare.
6. Build with `npm run build`.
7. Deploy with `npm run deploy:cloudflare`.
8. Verify authentication, reader access, admin permissions, translation requests and public catalog behavior on the deployed Worker.

## Safety rules

Do not expose the service-role key to browser code. Do not put real secrets in `wrangler.jsonc`, `.dev.vars.example`, source files or committed environment files. Keep RLS and the repository's server-side authorization checks in place.
