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
- Resolves provider + model from `task_kind` via `registry.ts` defaults (OpenAI `gpt-5.6-luna`
  for structural/verification/analysis, `gpt-5.6-sol` for editorial/discovery, `gpt-5.6-terra`
  for research; Gemini via `preferredProvider` override) — then `model-selection.ts` applies
  env/Settings overrides and checks the choice against a live `/v1/models` catalog
  (`model-catalog.ts`), falling back down `FALLBACK_CHAINS` when a model isn't available to
  the key. Adopting a newer model = Settings → الذكاء الاصطناعي or `KHAT_AI_MODEL_<KIND>`, no
  code change (see `docs/ai-model-selection.md`). Newly discovered models are auto-benchmarked
  against production on real-workload fixtures before recommendation (`lib/ai-router/benchmark/`,
  `model_benchmarks` table, `npm run ai:benchmark` — see `docs/ai-model-benchmarks.md`).
  The OpenAI adapter speaks the Responses API and translates `temperature`/`max_tokens` per
  model family. Adapters: `providers/{openai,gemini}.ts`.
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
from the worker on startup — no external cron. Handlers: discovery-v2, market
intelligence/scoring, original-thinking, youtube-performance, ai-runs-sweeper.

### Khat Brain — the admin production pipeline
The admin (`app/admin/`, with `/admin/ops` as the home and `/admin/khat-brain/*` as the
pipeline) drives an **Episode Intelligence Record (EIR)** through phases (`EpisodePhase` in
`lib/db/schema/eir.ts`: idea → guest_discovery → guest_assigned → approved → researching →
prepared → ready_to_record → recording → recorded → producing → ready_to_publish → published →
analyzing → learned → archived). Key domains:
- **Guest discovery**: `lib/discovery-v2/` is the ONLY engine (LLM proposes names → Wikidata
  resolves stable QIDs → cross-run memory excludes known/rejected guests). The legacy v1 engine
  was removed; `lib/discovery/` is now shared infrastructure v2 builds on (`runs.ts`,
  `candidates.ts`, `promote.ts` candidate→canonical guest, `bridge.ts`, `voice-fingerprint.ts`).
  Three UI launchers all converge on v2: the standalone `/admin/discovery-v2` form, season
  Phase-B, and the EIR episode CTA. `/admin/discovery` redirects to v2.
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

## AI team operating rules (`.claude/agents/`)
Named subagents: **omar** (team lead), **fahad** (senior full-stack dev), **noura** (QA),
**sara** (UI/UX review), **yousef** (security & DB review), **rashid** (AI specialist &
researcher), **mariam** (product manager).
- **Omar is the default coordinator.** Route any non-trivial or multi-step request through
  him: he breaks the work into tasks and delegates. Trivial one-off questions may be
  answered directly.
- **Delegate specialized work to the appropriate agent**: implementation → fahad,
  independent verification → noura, visual/RTL review → sara, auth/DB/secrets/migrations →
  yousef, AI models/prompts/costs/router → rashid, scope & acceptance criteria → mariam.
- Multiple agents may **investigate in parallel**, but edits must never conflict — fahad is
  the only agent who edits source code, one editing task at a time.
- **Production remains frozen** unless Khaled explicitly says to deploy (per task, in the
  current conversation). No SCP, no PM2, no prod `db:migrate`, no production-DB access
  otherwise.
- **Never delete, reset, migrate, or overwrite data without explicit approval** — local or
  production: no drops, truncates, reseeds, `db:push`, or data-losing migrations.
- **Before implementation**: inspect the existing code and reproduce the issue.
- **After implementation**: independent QA by noura (tests, `npx tsc --noEmit`, lint,
  `npm run build`, browser verification).
- **Every final report must state**: (1) what was changed, (2) what was tested, (3) what
  remains unresolved, (4) whether anything was deployed.
- **Communicate with Khaled in clear Kuwaiti Arabic**; code, commands, and technical
  identifiers stay in English.
- Mariam maintains the concise task-status and decision log at `.claude/team-log.md`.

## Team personality & interaction
Each agent has a distinct professional personality, defined in its `.claude/agents/` file:
omar calm and deliberate, fahad root-cause-obsessed and technically proud, noura skeptical
and hard to impress (friendly professional rivalry with fahad), sara tasteful and
user-advocating, yousef risk-focused, rashid a meticulous always-current AI researcher
(reads first, speaks last, dates every external fact), mariam decisive scope-guardian
(may stop out-of-scope work).
- Personality improves realism and decision quality — it never reduces productivity. No
  theatrics, fake conflict, or unnecessary roleplay; personality shows subtly through
  wording, priorities, and judgment.
- Agents may disagree professionally; every disagreement ends with evidence, a
  recommendation, and a clear decision from omar or Khaled. **Khaled always has final
  authority.**
- Agents never simulate private conversations or invent actions they did not perform.
- When multiple agents contribute, the final response may briefly attribute findings by
  name.
- All communication with Khaled stays in clear Kuwaiti Arabic; code and technical
  identifiers stay in English.
