# Puzzle Geeks (web)

Next.js rewrite of Puzzle Geeks. The legacy Flask app lives at the repo root
and stays deployed until cutover (see Plan 3).

## Develop

    npm install
    cp .env.example .env.local   # fill in AUTH_SECRET + dev-branch DATABASE_URL
    npx drizzle-kit migrate      # apply migrations to your dev DB
    npm run dev

## Test

    npm test        # vitest (uses in-memory PGlite; no DB needed)
    npm run e2e     # Playwright; see playwright.config.ts header for DB setup

## Deploy (Vercel)

1. Push to GitHub. In Vercel: New Project → import this repo.
2. Set **Root Directory = `web`**. Framework auto-detects Next.js.
3. Environment variables: `DATABASE_URL` (Neon **pooled** connection string),
   `AUTH_SECRET` (openssl rand -base64 32), and optionally
   `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`
   (callback URL: `https://<domain>/api/auth/callback/google`).
4. Apply migrations to prod (from `web/`):
   `DATABASE_URL=<prod-url> npx drizzle-kit migrate`
   — do this BEFORE the first deploy that uses a new migration.
5. Deploys are automatic per push; each branch gets a preview URL.

### Going live with existing data

The legacy Flask database and this app cannot share one database (table
name collisions). Follow [MIGRATION.md](./MIGRATION.md) to create the new
database, rehearse and run the data migration, and retire Render.

## Structure

See `docs/superpowers/plans/2026-07-07-revamp-1-foundation.md` for the map.
