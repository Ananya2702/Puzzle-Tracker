# Puzzle Geeks Revamp — Design Spec

**Date:** 2026-07-07
**Status:** Approved pending final review

## Goal

Rebuild Puzzle Geeks as a fast, public, community speed-puzzling site with a UI people want to return to — on free hosting, replacing the slow Render + Neon (free tier cold-start) setup.

## Decisions made during brainstorming

| Question | Decision |
|---|---|
| Audience | Public community site (anyone can sign up) |
| Hosting budget | Free only |
| Stack | Full rewrite: Next.js 15 (App Router) + TypeScript on Vercel Hobby |
| Database | Keep Neon Postgres; Neon serverless driver + Drizzle ORM |
| UI vibe | User-selectable themes |
| Themes to ship | Midnight Speedrun (dark, competitive — **default**) and Cozy Table (warm, journal-like) |
| Home screen | Dashboard-first: personal stats up top, community strip below |
| Timer page | Cockpit mode: live splits vs PB, pace, projected finish |
| Feature scope | All four groups (pro timer, races/challenges, puzzle database, community), phased |

## Architecture

- **Framework:** Next.js 15 (App Router) + TypeScript, deployed on Vercel Hobby (free). Static/edge-rendered pages from the global CDN; API routes as serverless functions (sub-second cold start, vs 30–60s on Render free).
- **Database:** existing Neon Postgres, accessed via `@neondatabase/serverless` + Drizzle ORM. Typed schema, migrations as code (`drizzle-kit`).
- **Auth:** Auth.js — credentials provider (existing bcrypt hashes carry over so current logins keep working) + Google OAuth for one-click signup.
- **Realtime (races):** Phase 3 uses 2-second polling against serverless routes; the race UI consumes an abstraction so a realtime provider (e.g. Pusher/Supabase Realtime) can be swapped in later without UI changes.
- **Charts:** Recharts. **Animations:** Framer Motion + CSS.
- **PWA:** installable, service worker; timer works offline, queued sync on reconnect.
- **Repo layout:** rewrite lives in this repo; the Flask app remains untouched on a branch until the new site is live and data is migrated.

## UI design

- **Shell:** sidebar navigation on desktop, bottom tab bar on mobile. Same layout across themes; themes change color, typography, and decoration only (CSS custom properties), so new themes are cheap.
- **Themes:** theme picker in settings; `Midnight Speedrun` is the default for new/logged-out visitors.
  - *Midnight Speedrun:* dark, high-contrast, monospace timers, neon-green pace deltas, esports energy.
  - *Cozy Table:* warm cream/wood tones, soft shadows, journal-like.
- **Home (logged in):** dashboard-first — stat cards (PBs, streak, rank), trend chart, recent sessions, plus a community strip (weekly challenge banner, friend activity teaser).
- **Timer (cockpit):** large clock; phase split chips (edge → sort → assembly, customizable) each showing live time vs PB split; live sec/piece; projected finish; delta vs PB projection. Big touch targets, screen kept awake.
- **Landing page (logged out):** sells the site — themed screenshot, community numbers, sign-up CTA.

## Features & phasing

### Phase 1 — The rewrite (single-player, feature-complete)
- App shell, both themes, landing page.
- Auth: email/password (migrated accounts work) + Google sign-in.
- Cockpit timer with splits; state persisted every tick; survives reload ("resume solve?").
- Logging: quick-add + full form; history with search/filter; CSV export; CSV + myspeedpuzzling import (idempotent via `source_id`).
- Analytics: rebuild current charts — scaled trend with moving averages, best/avg by piece count, pace, distribution, by-piece-count, improvement, weekly — preserving the scaled-time system (default exponent 0.4, user-tunable).
- Goals, achievements, XP, streaks, confetti — carried over.
- PWA install + offline timer.
- One-time data migration from live Neon DB.

### Phase 2 — Community
- **Puzzle database:** shared catalog (brand, title, piece count, box image), community-contributed with search-before-create dedup. Logging links to catalog entries (optional — quick logs stay catalog-free). Puzzle page = details + per-puzzle leaderboard of all users' times. Collection ("shelf") + wishlist.
- **Profiles:** public profile pages with opt-in privacy (private / friends / public per stat group).
- **Follow + feed:** follow puzzlers; dashboard community strip becomes a real activity feed (PBs, solves, challenge entries) backed by `activity_events`.
- **Global leaderboards:** by piece count, filterable month/all-time.

### Phase 3 — Competition
- Weekly community challenge (same puzzle, ranked results).
- Live race rooms: synced countdown, live progress via polling, results board.
- Head-to-head profile comparison.
- Seasons/tournaments: schema accommodates them; built last.

## Data model

Drizzle schema on Neon Postgres:

- **users** — id, username, email, password_hash, theme, privacy settings, XP/level, streak fields; `accounts` table for OAuth (Auth.js standard).
- **puzzles** (catalog) — brand, title, piece_count, image_url, created_by.
- **solves** — user_id, puzzle_id (nullable), time_seconds, date, puzzle_type (solo/duo/team), first_attempt, notes, source, source_id, community stats columns (community_avg_time, community_best_time, player_rank, community_solvers).
- **splits** — solve_id, phase, seconds.
- **goals**, **achievements** — as today.
- **follows** — follower_id, followee_id.
- **challenges**, **challenge_entries** — Phase 3.
- **races**, **race_participants** — status + progress timestamps, Phase 3.
- **activity_events** — one row per feed item; indexed for feed queries.

Leaderboards are indexed queries at launch, with a materialized-view seam if scale demands.

## Migration

One-time script: reads live Neon DB; current `puzzles` rows map to `solves`; catalog entries created where brand+title exist; users/settings/goals preserved (bcrypt hashes unchanged). Rehearsed against a Neon branch with assertions (row counts, spot-check known PBs) before running on production. Flask app stays up until the new site is verified.

## Error handling

- Timer state → `localStorage` every tick; resume prompt after crash/reload.
- Offline solve submissions queue in the service worker and retry.
- API routes validate with Zod; typed error envelopes; inline form errors.
- Neon cold-start hiccups retried once transparently; toast if longer.
- Imports idempotent (source_id dedup) — safe to re-run.

## Testing

- **Vitest** unit tests: scaled-time math, pace projection, split deltas, XP/streak rules.
- **Playwright** e2e: register → log solve → dashboard shows it; timer start → split → finish → saved.
- Migration dry-run against a Neon branch with assertions.

## Operations

- GitHub → Vercel auto-deploy; per-branch preview URLs.
- Cost: $0 (Vercel Hobby + Neon free). Upgrade paths exist if traffic grows.
- Vercel web analytics (free) to measure return visits.

## Out of scope (for now)

- Zen timer mode (cockpit only at launch; toggle is a future option).
- Realtime websockets for races (polling first).
- Native mobile apps (PWA covers it).
- Additional themes beyond the two chosen.
