# Seeparah production handoff

## Production architecture

Seeparah production runs on Cloudflare Workers with Supabase as the backend.

- Application repository: `mrecomtik-ops/Seeparah-Web`
- Worker: `seeparah-web`
- Production domains: `seeparah.com` and `www.seeparah.com`
- Build integration: `@cloudflare/vite-plugin`
- Worker configuration: `wrangler.jsonc`
- SSR entry: `src/server.ts`
- Database/auth/storage: Supabase

`vite.config.ts` is the single application build configuration and targets the Cloudflare Workers runtime. `npm run build` is therefore the production build. `npm run deploy:cloudflare` builds and deploys the Worker.

## Runtime configuration

Production server variables are managed in Cloudflare. `wrangler.jsonc` keeps dashboard variables intact with `keep_vars: true` and declares the production custom domains in code.

Required secret names are documented in `wrangler.jsonc`. Never commit secret values. Local Worker development uses `.dev.vars`, which is ignored by Git; `.dev.vars.example` contains names only.

## Supabase

The browser uses the publishable key. Privileged server paths use the service-role key only inside the Worker runtime. Keep RLS enabled and use server-side capability checks for privileged admin actions.

## Verification before production changes

Run:

```bash
npm ci
npx tsc --noEmit
npm test -- --run
npm run build
npm audit --omit=dev
```

Then deploy with:

```bash
npm run deploy:cloudflare
```

After deployment verify `https://seeparah.com`, security headers, public catalog visibility, reader routes, authentication, and the admin surface.

## Browser Supabase configuration invariant

The browser must always have the production Supabase project URL and the
`sb_publishable_*` client key. They are public client configuration, not
secrets, and are intentionally retained in
`src/config/public-supabase.ts` as a committed fallback.

The client may prefer `VITE_SUPABASE_URL` and
`VITE_SUPABASE_PUBLISHABLE_KEY` when a build environment provides them, but a
missing Vite environment must never make the browser bundle unusable.

Every `npm run build` runs
`scripts/verify-client-supabase-config.mjs` after Vite. The build fails if the
production Supabase URL or publishable key is absent from the generated browser
JavaScript. Do not remove this guard. The service-role key remains server-only
and must never be placed in browser configuration.
