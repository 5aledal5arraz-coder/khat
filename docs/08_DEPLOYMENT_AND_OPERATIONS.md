# 08 — Deployment and Operations

## Prerequisites

- **Node.js** 18+ (for Next.js 16)
- **npm** (lockfile: `package-lock.json`)
- **Supabase project** (or run with mock data)
- **OpenAI API key** (optional — for Studio AI features)
- **YouTube Data API key** (optional — for live episode data)

---

## Local Development Setup

### 1. Install Dependencies
```bash
npm install
```

### 2. Environment Variables

Create `.env.local`:
```env
# Supabase (required for DB features)
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# OpenAI (optional — for Studio AI generation)
OPENAI_API_KEY=sk-...

# YouTube (optional — for live episode data)
YOUTUBE_API_KEY=AIza...

# Development shortcuts
ADMIN_AUTH_BYPASS=true

# Feature toggles
NEXT_PUBLIC_HIBR_USE_DB=true
```

### 3. Run Database Migrations

Apply all 14 migrations to your Supabase project:
```bash
# Via Supabase CLI
supabase db push

# Or manually run each file in order:
# supabase/migrations/001_hibr_tables.sql
# supabase/migrations/002_studio_sessions.sql
# ... through 014_personalization_v2.sql
```

### 4. Start Development Server
```bash
npm run dev
```

Server starts at `http://localhost:3000`

---

## Running Without External Services

The app gracefully degrades when services are unavailable:

| Service | Without It |
|---------|-----------|
| Supabase | Mock data for episodes; Hibr disabled; Studio uses file-based mock store |
| YouTube API | Episodes served from cache (`lib/cache/episode-cache.ts`) |
| OpenAI | Studio AI generation disabled; manual content entry only |

**Detection logic:**
```typescript
// lib/supabase/queries.ts
const USE_MOCK_DATA = process.env.NEXT_PUBLIC_SUPABASE_URL?.includes('placeholder') || !process.env.NEXT_PUBLIC_SUPABASE_URL
const USE_YOUTUBE = !!process.env.YOUTUBE_API_KEY
const USE_DB = !USE_MOCK_DATA
```

---

## Build

```bash
npm run build   # Next.js production build
npm run start   # Start production server
```

**Build configuration (`next.config.ts`):**
- `serverActions.bodySizeLimit: "200mb"` — Required for Studio audio uploads
- Remote image patterns: YouTube thumbnails, Supabase storage, Unsplash, Pravatar

**Expected build output:** All routes compile without errors. Server components pre-render where possible.

---

## Production Deployment

### Vercel (Recommended)

The app is built for Vercel deployment:
- Next.js App Router with server components
- API routes as serverless functions
- Static assets served from CDN

**Environment variables to set in Vercel:**
- All variables from `.env.local` (except `ADMIN_AUTH_BYPASS`)
- **CRITICAL:** Do NOT set `ADMIN_AUTH_BYPASS=true` in production

### Other Platforms

Requirements:
- Node.js 18+ runtime
- Support for Next.js 16 App Router
- File system access (for config files in `config/` and audio in `data/`)
- Environment variable support

**Note:** Config files are read/written at runtime. On serverless platforms without persistent filesystem, config file changes will be lost between deployments. Consider migrating config data to Supabase for serverless-compatible storage.

---

## File System Dependencies

The app reads/writes files at runtime:

| Path | Purpose | Read | Write |
|------|---------|------|-------|
| `config/*.json` | Episode overrides, quotes, enrichments, settings | Yes | Yes |
| `data/studio-audio/` | Uploaded podcast audio files | No | Yes (temporary) |
| `data/studio-mock/` | Mock store for Studio (dev only) | Yes | Yes |
| `public/content/` | Uploaded video content | No | Yes |

**Implication:** Deployment platforms must provide writable filesystem for config files, or these features need database migration.

---

## Scripts

| Command | Purpose |
|---------|---------|
| `npm run dev` | Start development server (with Turbopack) |
| `npm run build` | Production build |
| `npm run start` | Start production server |
| `npm run lint` | Run ESLint |

---

## Dependencies

### Production

| Package | Version | Purpose |
|---------|---------|---------|
| `next` | 16.1.6 | Framework |
| `react` / `react-dom` | 19.2.3 | UI library |
| `@supabase/supabase-js` | 2.93.3 | Supabase client |
| `@supabase/ssr` | 0.8.0 | Supabase SSR helpers |
| `openai` | 6.18.0 | OpenAI API client |
| `bcryptjs` | 3.0.3 | Password hashing (media kit) |
| `isomorphic-dompurify` | 2.35.0 | HTML sanitization |
| `lucide-react` | 0.563.0 | Icon library |
| `modern-screenshot` | 4.6.8 | Screenshot/sharing |
| `class-variance-authority` | 0.7.1 | Component variants |
| `clsx` | 2.1.1 | Class name utility |
| `tailwind-merge` | 3.4.0 | Tailwind class merging |
| `tailwindcss-rtl` | 0.9.0 | RTL Tailwind plugin |

### Development

| Package | Version | Purpose |
|---------|---------|---------|
| `tailwindcss` | 4.x | CSS framework |
| `@tailwindcss/postcss` | 4.x | PostCSS plugin |
| `typescript` | 5.x | Type checking |
| `eslint` / `eslint-config-next` | 9.x / 16.1.6 | Linting |
| `@types/*` | various | Type definitions |

---

## Monitoring & Logging

### Current State

- **Server logs:** `console.error()` calls throughout for error logging
- **No structured logging:** No log aggregation service
- **No error tracking:** No Sentry or equivalent
- **No uptime monitoring:** No health check endpoint

### Recommended Additions

1. **Error tracking:** Add Sentry for client + server error capture
2. **Health endpoint:** Create `/api/health` that checks Supabase connectivity
3. **Log aggregation:** Structured JSON logging with Vercel Logs or similar
4. **Performance monitoring:** Vercel Analytics or custom Web Vitals tracking

---

## Backup Strategy

### Database (Supabase)
- Supabase provides automatic daily backups
- Point-in-time recovery available on Pro plan

### Config Files
- Tracked in git — commit config changes regularly
- No automated backup beyond git
- **Risk:** Runtime changes to config files between deploys are lost unless committed

### Audio Files (`data/studio-audio/`)
- Temporary files, cleaned on session delete
- No backup needed (can re-upload)

### Recommendations
1. Add a cron job or git hook to auto-commit config file changes
2. Consider migrating config data to Supabase for proper backup
3. Set up Supabase daily backup verification

---

## Maintenance Tasks

### Regular
- Monitor `visitor_events` table size — add retention policy (delete > 90 days)
- Review moderation queue (`/admin/moderation`)
- Check Studio sessions for abandoned sessions (draft status, no activity > 7 days)
- Verify YouTube API quota usage

### Periodic
- Update npm dependencies (`npm audit`, `npm update`)
- Review and rotate API keys
- Test backup restoration
- Review content moderation effectiveness

### Pre-Launch
- [ ] Remove or guard `ADMIN_AUTH_BYPASS`
- [ ] Add `requireAdminAPI()` to 3 unprotected admin routes
- [ ] Run all Supabase migrations
- [ ] Seed initial episode data
- [ ] Configure production environment variables
- [ ] Set up domain and SSL
- [ ] Add robots.txt (already exists at `public/robots.txt`)
- [ ] Test all forms (guest application, sponsor, newsletter)
- [ ] Test content moderation pipeline end-to-end
- [ ] Verify media kit password protection
