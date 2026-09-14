# Deployment

The app is a Vite single-page app (React) with a PWA service worker, backed by
Supabase. It deploys as static files to Netlify.

## Environment variables

Set these in **Netlify → Site settings → Environment variables** (they are
inlined at build time, so a redeploy is needed after changing them):

| Variable | Where to find it |
|---|---|
| `VITE_SUPABASE_URL` | Supabase → Project Settings → Data API → Project URL |
| `VITE_SUPABASE_ANON_KEY` | Supabase → Project Settings → API Keys → `anon` / publishable key |

Locally these live in `.env.local` (git-ignored). Never commit real keys.

## First deploy (GitHub + Netlify)

1. Push this repo to GitHub (see below).
2. In Netlify: **Add new site → Import an existing project → GitHub**, pick the repo.
3. Build settings are auto-detected from `netlify.toml`
   (build `npm run build`, publish `dist`). Just add the two env vars above.
4. **Deploy**. Netlify gives you a `https://<name>.netlify.app` URL.

## After the first deploy — point Supabase Auth at the live URL

Supabase → **Authentication → URL Configuration**:

- **Site URL**: your Netlify URL (or custom domain).
- **Redirect URLs**: add the Netlify URL (and custom domain) so sign-in,
  password resets, and invite links work.

Without this, logins and invite emails will fail on the deployed site.

## Updating the live site

Every push to the default branch triggers a fresh Netlify build and deploy.
The service worker auto-updates clients to the new build.
