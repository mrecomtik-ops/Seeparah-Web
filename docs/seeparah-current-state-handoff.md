# Seeparah current state

## Production

Seeparah runs on Cloudflare Workers with Supabase as the backend.

- Repository: `mrecomtik-ops/Seeparah-Web`
- Worker: `seeparah-web`
- Production domains: `seeparah.com` and `www.seeparah.com`
- Build: `@cloudflare/vite-plugin` through `vite.config.ts`
- Worker configuration: `wrangler.jsonc`
- SSR entry: `src/server.ts`
- Database/auth/storage: Supabase

The standard commands are:

```bash
npm run dev
npm run build
npm run deploy:cloudflare
```

## Launch-hardening state

The launch-hardening pass includes:

- book-specific SEO metadata and canonical handling;
- security headers and cache policy;
- author category editing with server-side category validation;
- stricter publication/review gates;
- RLS and foreign-key performance fixes;
- consolidated database read policies and private policy helpers;
- semantic admin preview rendering;
- reader structure and dialogue/verse handling;
- optimized book thumbnails and logo assets;
- real imported-book summaries in place of placeholders.

The production database migrations for those changes have been applied.

## Text repairs

Two imported books were repaired directly from their reviewed acquisition sources:

- `SP-CAND-0005` — Romeo and Juliet: 90 source-language chunks, 25,957 words.
- `SP-CAND-0029` — Paradise Lost: 76 source-language chunks, 79,957 words.

The reviewed paragraph text was aligned against the source EPUBs before replacement. Romeo and Juliet matched 1,050/1,050 reviewed paragraphs and Paradise Lost matched 359/359 reviewed paragraphs after whitespace normalization.

## Verification

Before deployment, run:

```bash
npm ci
npx tsc --noEmit
npm test -- --run
npm run build
npm audit --omit=dev
```

After deployment, verify the production domain, security headers, public catalog visibility, authentication, reader routes and admin access.
