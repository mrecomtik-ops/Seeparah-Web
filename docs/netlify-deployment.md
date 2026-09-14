# Netlify deployment — diagnosis and fix (2026-09-14)

## Symptom reported

`seeparah.com` served Netlify's own generic "Page not found" page at the
homepage; Chrome showed "Not secure."

## What was checked, and what it showed

### 1. Repository state

- Branch `main`, HEAD `1d2aa9b` at the time of this investigation, in sync
  with `origin/main`.
- `package.json`: `@tanstack/react-start@1.168.32`,
  `@tanstack/react-router@1.170.18`, `vite@8.1.5`, built via
  `@lovable.dev/vite-tanstack-config` (a wrapper around TanStack Start's
  own Vite plugin + Nitro).
- **No `netlify.toml` existed anywhere in the repository before this
  change.** Netlify therefore had nothing in version control telling it
  the build command, publish directory, or Node version — it was relying
  entirely on whatever is configured in the Netlify dashboard for this
  site (not inspectable from here — no Netlify CLI session or API token
  was available; see "What I could not check" below).
- `vite.config.ts` documents that the Lovable wrapper's Nitro integration
  defaults to `preset: "cloudflare-module"` — this is where the earlier
  "the build targeted Cloudflare through Lovable's configuration" came
  from, and is still true for local/Lovable builds (see below).

### 2. Is the Cloudflare default actually the problem?

**No — checked directly, not assumed.** Read
`node_modules/@lovable.dev/vite-tanstack-config/dist/index.js`: the
aggressive "force `cloudflare-module`, ignore any preset env var" behavior
(lines ~1139-1166) is gated behind `if (isSandbox)` — it only applies
inside Lovable's own build environment. Outside it, the Nitro plugin is
called with `{ defaultPreset: "cloudflare-module", ...userNitroOpts }`,
and Nitro's own preset resolver
(`node_modules/nitro/dist/_presets.mjs`, `resolvePreset`) only falls back
to `defaultPreset` when no preset could be determined any other way —
including Nitro's own environment auto-detection.

Verified empirically:

```
$ rm -rf .output .netlify .wrangler dist
$ npm run build                       # no NETLIFY env var
→ .output/server/wrangler.json, .output/public/... (Cloudflare Worker)

$ NETLIFY=true npm run build          # matches Netlify's real build env
→ dist/ (static assets, incl. dist/_headers)
→ .netlify/functions-internal/server/... (Nitro's Netlify Function output)
→ .netlify/functions-internal/nitro.json reports "preset": "netlify"
```

So the installed toolchain **already builds correctly for Netlify with
zero code changes**, as long as Netlify's own build environment variable
(`NETLIFY=true`, set automatically by every Netlify build) is present.
This rules out "wrong build target in code" as the root cause.

Nitro's own vendored docs confirm this is expected, zero-config behavior:
`node_modules/nitro/dist/docs/1.deploy/2.providers/17.netlify.md`:

> Normally, the deployment to Netlify does not require any configuration.
> Nitro will auto-detect that you are in a Netlify build environment...
> For new sites, Netlify will detect that you are using Nitro and set the
> publish directory to `dist` and build command to `npm run build`. **If
> you are upgrading an existing site you should check these and update
> them if needed.**

That last sentence is the likely root cause: this Netlify site was almost
certainly connected/configured before this app was rebuilt on TanStack
Start + Nitro (the app was previously deployed via Lovable's own
Cloudflare-Workers-backed hosting at `pic-perfect-clone-44.lovable.app`,
confirmed in an earlier session). If the Netlify site's dashboard-side
publish directory and/or build command are unset, blank, or left over
from a different setup, Netlify has nothing valid to serve at `/`, and
falls back to its own branded 404 — which is exactly the reported symptom.

### 3. Is `seeparah.com` even reaching Netlify? (ruling out DNS/domain mapping)

Checked directly against the live domain:

```
$ curl -sSI https://seeparah.com
HTTP/1.1 404 Not Found
Cache-Status: "Netlify Edge"; fwd=miss; fwd-status=404; stored
Server: Netlify
X-Nf-Request-Id: 01M2FCF7Q1GFH1YBK3HBKPS6QJ
Strict-Transport-Security: max-age=31536000
```

- `seeparah.com` resolves (via `8.8.8.8`) to two A records:
  `63.176.8.218` and `35.157.26.135`. Forced connections to **both**
  individually (`curl --resolve`) terminate TLS successfully and both
  return the identical genuine Netlify-branded 404 (`Server: Netlify`,
  `Cache-Status: "Netlify Edge"`) — so this is not a split/inconsistent
  DNS setup between a working and a broken endpoint.
- `http://seeparah.com` → `301` to `https://seeparah.com/` (correct
  HTTP→HTTPS redirect, served by Netlify).
- `https://www.seeparah.com` → `301` to `https://seeparah.com/` (correct
  www→apex redirect, served by Netlify).
- A plain TLS handshake against `seeparah.com` (`curl -v`, no `-k`)
  completed with no certificate errors reported.

**Conclusion: the domain is genuinely and correctly pointed at Netlify,
and Netlify's HTTPS certificate for it is valid.** This is a deployment/
build-output problem, not a DNS or domain-mapping problem — Netlify has
the domain, has a working certificate, and is correctly answering — it
just has nothing published that matches `/`.

I could not reproduce the "Not secure" Chrome warning from here: the
certificate validated cleanly, HSTS is present, and the redirect chain is
correct. This may already be resolved, may be intermittent, or may be a
client-side (cache/HSTS-state) artifact on the reporting browser — flagged
as unconfirmed rather than explained away.

### 4. What I could not check (no Netlify dashboard/API access)

No `NETLIFY_AUTH_TOKEN` and no saved `netlify login` session were
available (`netlify status` → "Not logged in"; `netlify sites:list` →
"Authentication required"). I could not inspect, from here:

- The connected repository/branch this Netlify **site** actually builds
  from, or whether it's connected at all.
- The site's current dashboard build settings (build command, publish
  directory, base directory) — my hypothesis above is that these are
  stale/wrong, but this is not directly confirmed.
- The deploy log for the most recent deploy (success/failure, and why).
- Whether any Netlify Functions were actually generated in a past deploy.
- The site's default `<name>.netlify.app` address, to compare against
  `seeparah.com` per the standard "does the default subdomain also fail"
  diagnostic. **Please provide, or check directly in the dashboard**:
  - Site name / `<name>.netlify.app` URL (does it also 404, or does it
    work? If it works, the domain mapping I already verified as correct
    might still have a subtlety I can't see from outside; if it also
    404s, that fully confirms this is a build/publish problem, matching
    everything found above).
  - Site settings → Build & deploy → **Build command** and **Publish
    directory** as currently configured.
  - Deploys tab → the most recent deploy's status and its log (does it
    fail? what's the last error, if so? if it "succeeds," what does it
    say the publish directory's contents were?).
  - Site settings → Environment variables → whether `NODE_VERSION` (or
    any Node-version-relevant setting) is already set, so the new
    `netlify.toml` doesn't conflict.

## What changed

- **`netlify.toml`** (new): `build.command = "npm run build"`,
  `build.publish = "dist"`, `NODE_VERSION = "22"`. This matches Nitro's
  own documented zero-config expectation exactly (see §2's quoted docs),
  and — critically — takes precedence over whatever is currently set in
  the Netlify dashboard, so it corrects the site's configuration
  regardless of what's wrong there, without needing dashboard access to
  fix it.
- No `[[redirects]]` block, no catch-all rewrite to `/index.html`, and no
  `[functions]` block were added — deliberately. This app is
  server-rendered (Nitro emits directly to
  `.netlify/functions-internal/`, which Netlify auto-discovers as part of
  its Nitro integration); a blanket SPA-style rewrite would break SSR,
  server functions, and every request-time access check (auth state,
  reader gates, the admin MFA gate) by serving the same static shell for
  every route.
- `.gitignore` gained a `.netlify` entry (local Netlify CLI/dev cache;
  `netlify-cli` added this automatically the first time it ran here).

## Verification performed

- `npx vitest run` — 65/65 passed.
- `npx tsc --noEmit` — clean (exit 0).
- `npm run build` (no `NETLIFY` env) — succeeds, still produces the
  Cloudflare-targeted `.output/` (Lovable's own hosting path is
  unaffected by this change).
- `NETLIFY=true npm run build` — succeeds, produces `dist/` +
  `.netlify/functions-internal/`, confirmed via `nitro.json`:
  `"preset": "netlify"`.
- Local route checks (via `vite dev` on an explicit port, testing the
  app's own SSR — not Netlify's function runtime specifically, which
  `netlify dev` could not emulate in this sandbox: it hard-expects the
  framework dev server on port 3000, and this environment's own port
  contention pushed Vite to 8081, causing `netlify dev` to time out
  waiting — a local tooling limitation, not a finding about the app or
  the Netlify config):
  - `GET /` → 200, `<title>Seeparah — Read world classics in your
    language</title>`, full homepage markup rendered.
  - `GET /library` → 200, `<title>Library — Seeparah</title>`, ~24KB of
    real content.
  - `GET /admin` (no session/cookies — anonymous) → 200, renders only the
    loading-gate shell (`animate-spin`), with **no admin data of any
    kind** in the response (checked for role names, catalog content —
    none found; the one incidental match for "editor" was inside the
    unrelated word "editorial" in page meta description copy). The actual
    "Sign in required" text is applied client-side after
    `useAuth()`/`useAdminSession()` resolve — consistent with the code in
    `src/routes/admin/route.tsx`, and confirms no admin content or
    bypass is exposed to a signed-out/anonymous request.
  - `GET /auth` → 200, renders the sign-in form ("Sign in", "Password"
    present).

**Not verified: whether this actually fixes the live site.** Applying
`netlify.toml` requires Netlify to run a NEW deploy that reads it — that
depends on this branch being pushed (done, see the commit below) AND
Netlify's site being connected to this repository/branch and set to
auto-deploy, neither of which could be confirmed from here without
dashboard/API access. A successful local build is not evidence the live
site is fixed; only a fresh Netlify deploy log and a re-check of
`seeparah.com` (and the `.netlify.app` address, once known) confirm that.
