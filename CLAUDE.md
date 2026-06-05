# CLAUDE.md — Khat Podcast

## Project Overview
Arabic podcast website (RTL, `lang="ar"`) for **خط بودكاست** (khatpodcast.com).

## Tech Stack
- **Framework**: Next.js 16 (App Router) + React 19
- **Language**: TypeScript
- **Styling**: Tailwind CSS + shadcn/ui components
- **Database**: PostgreSQL (DigitalOcean Managed) via Drizzle ORM
- **Auth**: Custom bcrypt + PostgreSQL sessions (admin: email/password, `__admin_session` cookie)
- **Email**: Resend (noreply@khatpodcast.com)
- **AI**: OpenAI — dual model: gpt-4o-mini (structural) + gpt-4o (editorial)
- **Icons**: lucide-react

## Project Structure
```
app/                  # Next.js App Router pages
  admin/              # Admin dashboard (protected)
  api/                # API routes
  episodes/           # Public episode pages
components/           # React components
  ui/                 # shadcn/ui primitives
  layout/             # Header, footer, mobile-nav
  episodes/           # Episode cards, grids, player
  museum/             # Homepage museum sections
  icons/              # Custom SVG icons
lib/                  # Business logic (domain-organized)
  shared/             # Shared modules (formatters)
  db/                 # Drizzle connection + schema
  queries/            # Public data query layer
  admin/              # Admin queries + auth
  ai/                 # AI generation modules (12+ files)
  studio/             # Studio service layer
  episodes/           # Episode domain (enrichments, overrides, quotes, versions, guests, boost)
  validation/         # Input validation (audio, upload, video, forms)
  media-kit/          # Media kit config + sharing
  content/            # Homepage content (quotes, reflections, static, museum)
  youtube/            # YouTube API client + helpers
  rss/                # RSS feed generation
  firebase/           # (removed — no longer used)
config/               # Site config JSON files
scripts/              # DB seed, migration, utility scripts
types/                # TypeScript type definitions
public/               # Static assets
```

## Key Commands
```bash
npm run dev          # Local dev server
npm run build        # Production build
npm run lint         # ESLint
npm run db:push      # Push Drizzle schema to DB
npm run db:generate  # Generate Drizzle migrations
npm run db:studio    # Open Drizzle Studio
```

## Database
- **Schema**: `lib/db/schema/index.ts` (62+ tables across 11 schema files)
- **Connection**: `lib/db.ts` (pg Pool + Drizzle, connection pooling)
- **Post-schema**: `scripts/post-schema.sql` (triggers, constraints, RPC functions, indexes)
- **Drizzle config**: `drizzle.config.ts` (SSL-aware for DigitalOcean)
- Always use `DATABASE_URL` env var, never hardcode credentials

## Auth
- **System**: Custom bcrypt password hashing + SHA-256 session tokens in PostgreSQL
- **Tables**: `admin_users`, `admin_sessions`, `admin_audit_logs` (in `lib/db/schema/admin-auth.ts`)
- **Auth logic**: `lib/admin/auth.ts` — login, session create/verify/destroy, role checks
- **API protection**: `requireAdminAPI()` from `lib/api-utils.ts` in every admin route handler
- **Middleware**: Cookie-existence check for `/admin/*` and `/api/admin/*` routes
- **Roles**: OWNER (3) > ADMIN (2) > EDITOR (1) > VIEWER (0)
- **Session expiry**: 12 hours, DB-backed
- **Important**: Firebase is NOT used. The `__admin_session` cookie contains a hashed token verified against PostgreSQL.

## Deployment
- **Server**: DigitalOcean droplet, SSH: `ssh root@khatpodcast.com`
- **Path on server**: `/root/khat`
- **Process manager**: PM2 (`pm2 restart khat`)
- **Deploy flow**: Upload files via SCP → `npm run build` on server → `pm2 restart khat`
- No git on server — files are uploaded directly

## Conventions
- All user-facing text is in Arabic
- RTL layout throughout (`dir="rtl"`)
- Use `cn()` from `lib/utils.ts` for Tailwind class merging
- UI components in `components/ui/` (shadcn/ui pattern)
- API routes return JSON with consistent error shapes (see `lib/api-utils.ts`)
- Admin routes are protected via `__admin_session` cookie + `requireAdminAPI()`
- **Shared formatters**: All date/time/duration formatting lives in `lib/shared/formatters.ts`. Other modules re-export from there for backward compat.
- **Domain types**: All entity types in `types/database.ts`. Admin view types (`AdminEpisodeView`, `AdminGuestView`) also there. Never define parallel types in components.
- **Domain folders in `lib/`**: Group related files by domain (`lib/episodes/`, `lib/validation/`, `lib/media-kit/`, `lib/content/`). Keep infrastructure files (`db.ts`, `utils.ts`, `api-utils.ts`, `config-store.ts`, `cache.ts`, `rate-limit.ts`) at `lib/` root.

## Important Notes
- Never commit or expose `.env` files — they contain DB, OpenAI, and Resend API keys
- The `ADMIN_AUTH_BYPASS` env var has been removed — do not re-add it
- When modifying DB schema, update both Drizzle schema files and `scripts/post-schema.sql` if triggers/constraints are affected
- Test builds locally (`npm run build`) before uploading to server

## Architecture

### Unified Platform Philosophy
The public website and admin panel are one system sharing:
- **One type system**: `types/database.ts` is the single source of truth for all entity types
- **One formatting system**: `lib/shared/formatters.ts` provides all date/time/duration/count formatters
- **One domain logic layer**: `lib/` domain folders contain business logic used by both public and admin
- **One validation layer**: `lib/validation/` serves both public form submissions and admin operations
- **One AI system**: `lib/ai/` with dual-model architecture (STRUCTURE_MODEL + EDITORIAL_MODEL)

### Domain Folder Structure
```
lib/episodes/       # enrichments, overrides, quotes, versions, guest-assignment, boost
lib/validation/     # audio, upload, video, form validation
lib/media-kit/      # config, sharing
lib/content/        # home-quotes, daily-reflections, static-content, museum-data
lib/ai/             # 14+ AI modules (analysis, generation, intelligence)
lib/studio/         # 11 studio service modules
lib/youtube/        # YouTube API client, download, transcript
lib/rss/            # RSS feed generation
lib/admin/          # Admin auth, queries, date utils
lib/queries/        # Public data queries
lib/shared/         # Cross-cutting shared modules (formatters)
lib/db/             # Database connection + Drizzle schema
```

### Two-Model AI Architecture
All AI logic lives in `lib/ai/` with explicit model specialization:
- `STRUCTURE_MODEL` (gpt-4o-mini) — fast structural extraction: timestamps, chapters, clips, metadata, scoring
- `EDITORIAL_MODEL` (gpt-4o) — deep editorial quality: quotes, ideas, summaries, analysis, guest intelligence
- **Global Episode Intelligence** (`episode-intelligence.ts`) — full-episode understanding consumed by all editorial generators
- **Guest Application AI** (`guest-application.ts`) — analysis, episode concept, response drafts
- **Sponsorship AI** (`sponsorship.ts`) — lead analysis, proposal generation
- New AI features should follow: structural tasks use STRUCTURE_MODEL, editorial tasks use EDITORIAL_MODEL

### Studio Context Pattern
Each Studio feature has its own React context under `app/admin/studio/contexts/`. Contexts self-load via preloaded batch data from `PreloadProvider`. New Studio features: create a context, add it to the provider chain in `index.tsx`, and create the corresponding service module in `lib/studio/`.

### Known Remaining Items
1. **True ISR for episode pages**: Requires moving `searchParams` to client-side `useSearchParams()`
2. **Rate limiting on AI endpoints**: Studio generation endpoints have no rate limiting
3. **Query caching**: Homepage and episode listing queries hit DB on every request
4. **JSON config migration**: 15 JSON config files in `config/` could be migrated to DB for multi-instance support
5. **Session refresh**: Admin sessions expire after 12h with no refresh mechanism
