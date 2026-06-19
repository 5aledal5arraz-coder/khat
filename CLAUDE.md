# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview
Arabic podcast platform (RTL, `lang="ar"`) for **خط بودكاست** (khatpodcast.com): a public
site + a deep admin/operations panel ("Khat Brain") that plans seasons, discovers guests,
and generates episode content with AI.

## Tech Stack
- **Framework**: Next.js 16 (App Router) + React 19, TypeScript
- **Styling**: Tailwind CSS + shadcn/ui; token-driven theming (see Theming below)
- **Database**: PostgreSQL (DigitalOcean Managed) via Drizzle ORM
- **Auth**: Custom bcrypt + PostgreSQL sessions (`__admin_session` cookie). Firebase is NOT used.
- **AI**: A provider-agnostic **AI router** (`lib/ai-router/`) over OpenAI + Gemini
- **Background work**: Postgres-backed job queue + a separate worker process (`lib/jobs/`)
- **Email**: Resend · **Icons**: lucide-react

## Key Commands
```bash
npm run dev          # Next dev server ONLY (does NOT start the job worker)
npm run worker       # Job worker — REQUIRED for discovery/studio/market jobs (see below)
npm run dev:all      # dev + worker together (concurrently)
npm run build        # Production build — run before deploying
npm run lint         # ESLint
npm run test         # Vitest (run a single file: npx vitest run path/to/file.test.ts)
npm run db:generate  # Generate a versioned migration from schema changes
npm run db:migrate   # Apply pending migrations (shared/local DBs)
npm run db:adopt     # One-time: baseline an EXISTING DB into the migration system
npm run db:studio    # Drizzle Studio
npm run db:push      # Throwaway LOCAL only — interactive + unsafe on shared DBs
```

> **`npm run dev` does not run the worker.** Discovery, studio generation, market
> intelligence, and original-thinking jobs are enqueued to the `jobs` table and processed by
> `npm run worker`. Without it they sit `pending` forever. Use `npm run dev:all` locally.

## Database & migrations
- **Schema**: `lib/db/schema/` (~36 files, ~108 tables) re-exported from `index.ts`
- **Connection**: `lib/db.ts` (pg Pool + Drizzle). Always use `DATABASE_URL` — never hardcode.
- **Post-schema**: `scripts/post-schema.sql` — triggers, CHECK constraints, RPC functions
  (e.g. `push_episode_data`), and indexes/constraints not modeled in Drizzle. Applied AFTER
  migrations; idempotent; safe to re-run.
- **Schema changes go through versioned migrations, not `db:push`.** Flow: edit
  `lib/db/schema/` → `db:generate` → review the `.sql` → `db:migrate` → commit `.sql`+`meta/`.
  On deploy: `db:migrate` then re-apply `post-schema.sql`. First-time on an existing DB:
  `db:adopt` once. `db:push` is interactive ("created or renamed?") and can rename/drop tables
  — reserve it for disposable local DBs. See `drizzle/migrations/README.md`.

## Architecture

### Unified platform
Public site and admin are ONE system sharing: one type system (`types/database.ts` — never
define parallel entity types in components), one formatter module (`lib/shared/formatters.ts`),
one validation layer (`lib/validation/`), and the domain logic in `lib/`. Infrastructure files
(`db.ts`, `utils.ts`, `api-utils.ts`, `config-store.ts`, `cache.ts`, `rate-limit.ts`) live at
`lib/` root; everything else is grouped by domain folder.

### AI router (the single chokepoint) — `lib/ai-router/`
Every AI call goes through **`runAiTask()` in `lib/ai-router/router.ts`**. Callers describe
*what* they want (a `task_kind`, prompt, input snapshot); the router decides *how*:
- Resolves provider + model from `task_kind` via `registry.ts` (defaults: OpenAI `gpt-4o-mini`
  for structural/verification/analysis, `gpt-4o` for editorial/discovery/research; Gemini is
  reachable via `preferredProvider` override). Adapters: `providers/{openai,gemini}.ts`.
- Opens an `ai_runs` telemetry row (provider, model, tokens in/out, `cost_usd`, latency,
  `error_class`, prompt hash/version) — this is the observability spine for all AI.
- Passes a Postgres-backed rate-limit permit (`rate-limit.ts`) before executing.
- Hardens output: a JSON-repair ladder (`lib/ai/json-repair.ts`: strict→sanitize→extract→
  truncation-repair) + bounded exponential-backoff retry on transient errors (rate-limit /
  timeout / 5xx). Both are in the router, so every generator inherits them.

The ~38 generators in **`lib/ai/`** (e.g. `episode-intelligence.ts`, `studio.ts`,
`sponsorship.ts`, `guest-application.ts`) build prompts and call `runAiTask`. The legacy
`STRUCTURE_MODEL`/`EDITORIAL_MODEL` constants in `lib/ai/client.ts` still exist, but the router
registry is authoritative. `prepareTranscript()` (`lib/ai/client.ts`) chunk-summarizes long
transcripts and is **memoized by content hash** so the ~8 Studio generators don't re-summarize.

### Background job worker — `lib/jobs/`
A Postgres `jobs` table is the queue. `worker.ts` polls, claims with `FOR UPDATE SKIP LOCKED`,
runs the registered handler, and writes results (with lease-based stale-job reclaim). Handlers
self-register: `registered.ts` imports every handler in `handlers/` for its side effects;
`registry.ts` maps `job.type → handler`. `HANDLER_TIMEOUT_MS` keys MUST match registered job
types (a boot guard warns otherwise). Schedulers (market intel, ai-runs-sweeper) bootstrap
from the worker on startup — no external cron. Handlers: discovery, discovery-v2, market
intelligence/scoring, original-thinking, youtube-performance, ai-runs-sweeper.

### Khat Brain — the admin production pipeline
The admin (`app/admin/`, with `/admin/ops` as the home and `/admin/khat-brain/*` as the
pipeline) drives an **Episode Intelligence Record (EIR)** through phases (`EpisodePhase` in
`lib/db/schema/eir.ts`: idea → guest_discovery → guest_assigned → approved → researching →
prepared → ready_to_record → recording → recorded → producing → ready_to_publish → published →
analyzing → learned → archived). Key domains:
- **Guest discovery**: `lib/discovery-v2/` (LLM proposes names → Wikidata resolves stable QIDs
  → cross-run memory excludes known/rejected guests). `lib/discovery/` is v1 but its
  `promote.ts` (candidate → canonical guest) is still load-bearing.
- **Season planning**: `lib/khat-map/` (the season wizard) → `lib/eir/` (phase transitions).
- **Studio**: `lib/studio/` + `app/admin/studio/` — per-episode content generation (transcript →
  intelligence → ai_output → chapters → clips → website package → analysis), streamed over SSE.
- **Guest identity**: fragmented across `guests` + several candidate/junction tables; the
  canonical service is `lib/guests/canonical.ts` (`ensureGuest` create-or-merge).

### Studio context pattern
Each Studio feature has its own React context under `app/admin/studio/contexts/`, hydrated from
one batched `/full` fetch via `PreloadProvider`. New feature: add a context to the provider
chain in `index.tsx` and a service module in `lib/studio/`.

### Theming & brand
Theming is **token-driven** — components read KHAT semantic CSS variables (`bg-card`,
`text-foreground`, `border-border`, `bg-primary`, etc.) defined in `app/globals.css`, so a
scoped palette recolors a whole subtree with no per-component edits.
- **Public site**: a light, Apple-editorial identity (deep **indigo** + **orange**), scoped via
  `SITE_LIGHT_TOKENS` (`components/brand/site-theme.ts`) on the layout wrapper.
- **Admin**: forced **single light mode** via `ADMIN_LIGHT_TOKENS`
  (`app/admin/components/light-theme.ts`) on the shell; admin routes never get `.dark`.
- **Brand mark**: `<KhatLogo>` (`components/brand/khat-logo.tsx`) — replaces `/logo.png`. The
  shared admin UI kit is `app/admin/components/ui-kit.tsx`.

## Auth
- bcrypt password hashing + SHA-256 session tokens in PostgreSQL (12h expiry, DB-backed).
- Tables `admin_users` / `admin_sessions` / `admin_audit_logs` (`lib/db/schema/admin-auth.ts`);
  logic in `lib/admin/auth.ts`. Roles: OWNER (3) > ADMIN (2) > EDITOR (1) > VIEWER (0).
- Every admin route handler calls `requireAdminAPI()` from `lib/api-utils.ts`. Public mutating
  endpoints use `validateOrigin` (CSRF) + `checkIpRateLimit`. Middleware does a cookie-existence
  check for `/admin/*` and `/api/admin/*`. `ADMIN_AUTH_BYPASS` was removed — do not re-add.

## Deployment
DigitalOcean droplet (`ssh root@khatpodcast.com`, path `/root/khat`), PM2 (`pm2 restart khat`).
No git on server — files uploaded via SCP, then `npm run build` + `pm2 restart`. On schema
changes, also run `db:migrate` + re-apply `post-schema.sql` against the production DB.

## Conventions
- All user-facing text is Arabic; RTL throughout — use logical properties (`ms-/me-/ps-/pe-/
  start-/end-`), not `left/right`. Use `cn()` (`lib/utils.ts`) for class merging.
- API routes return JSON with consistent error shapes (`lib/api-utils.ts`).
- Date/time/duration formatting lives only in `lib/shared/formatters.ts` (re-export elsewhere).
