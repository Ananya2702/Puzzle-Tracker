# Going live: migration & cutover runbook

Goal: the new app live on Vercel with your real data, then Render retired.
Total hands-on time ≈ 30-45 minutes. Nothing here touches the legacy app
until the very last step, and every data step is rehearsed first.

## Why a separate database

The legacy Flask app and the new app both use tables named `users`,
`puzzles`, `goals`, `achievements`, `settings` — with different shapes.
The new app gets its own database in the SAME Neon project; the legacy
database stays untouched until you delete it.

## 0. Prerequisites

- The Vercel project exists (see README "Deploy") but its DATABASE_URL will
  be set in step 2.
- Legacy connection string at hand (Render dashboard → env → DATABASE_URL).

## 1. Create the new database

Neon console → your project → Databases → New database → name `puzzlegeeks`.
Copy its **pooled** connection string (this is the new app's DATABASE_URL).
For `drizzle-kit migrate` and the migration script below, prefer the
**unpooled** (direct) Neon connection string — the app itself should keep
using the pooled one.

## 2. Create the schema

From `web/` on your machine:

    DATABASE_URL='<new puzzlegeeks unpooled url>' npx drizzle-kit migrate

## 3. Rehearse the migration (no writes committed)

    LEGACY_DATABASE_URL='<legacy url>' DATABASE_URL='<new url>' npm run migrate:legacy

This is the default — nothing is committed. Read the report: user/solve/goal/
achievement counts should match what you expect from the live site.
Collisions or verification failures abort with an explanation and nothing
written.

## 4. Run it for real

    LEGACY_DATABASE_URL='<legacy url>' DATABASE_URL='<new url>' npm run migrate:legacy -- --execute

## 5. Point Vercel at the new database and verify

Vercel → project → Settings → Environment Variables → set
`DATABASE_URL` = the new pooled url (plus `AUTH_SECRET` if not set).
Redeploy. Then on the production URL:

- [ ] Log in with your EXISTING username + password (bcrypt hashes carried over)
- [ ] Dashboard totals match the old site
- [ ] History shows your sessions; PB chips look right
- [ ] Theme preference sensible (legacy dark → Midnight, light → Cozy)

## 6. Cut over

- Update any bookmarks/links to the Vercel URL (or attach your custom
  domain in Vercel → Domains).
- Keep Render running for a safety window (suggest 1-2 weeks), then:
  Render dashboard → the puzzle-tracker service → Suspend (or Delete).
- The legacy Neon database can be deleted after the same window.

## Rollback

Nothing in this flow modifies the legacy database. Rolling back = keep
using the Render URL. You can re-run the migration into a fresh database
at any time (the script refuses non-empty targets).
