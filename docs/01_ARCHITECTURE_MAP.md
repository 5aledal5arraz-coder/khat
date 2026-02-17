# 01 — Architecture Map

## Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| Framework | Next.js (App Router) | 16.1.6 |
| React | React | 19.2.3 |
| Language | TypeScript | 5.x |
| Database | Supabase (PostgreSQL + Auth) | supabase-js 2.93.3 |
| Styling | Tailwind CSS v4 | 4.x |
| AI | OpenAI API | openai 6.18.0 |
| Hosting | Vercel (implied) | — |

---

## Directory Structure

```
khat/
├── app/                          # Next.js App Router pages
│   ├── layout.tsx                # Root layout (RTL, Arabic font, providers)
│   ├── page.tsx                  # Home page
│   ├── globals.css               # Tailwind + custom CSS
│   ├── about/                    # About page
│   ├── admin/                    # Admin panel (15 pages)
│   │   ├── layout.tsx            # Admin layout (sidebar, no header/footer)
│   │   ├── components/           # Shared admin UI (sidebar, breadcrumbs, glow-card)
│   │   ├── episodes/             # Episode management
│   │   ├── studio/               # Content production pipeline
│   │   ├── home-content/         # Home page content editor
│   │   ├── guests/               # Guest management
│   │   ├── topics/               # Topic management
│   │   ├── content/              # Static content editor
│   │   ├── submissions/          # Guest/sponsor/newsletter submissions
│   │   ├── moderation/           # Hibr content moderation
│   │   ├── ads/                  # Ad management
│   │   ├── analytics/            # Website analytics dashboard
│   │   ├── media-kit/            # Sponsor media kit builder
│   │   └── settings/             # Site settings, SEO, feature flags, theme
│   ├── api/                      # API routes
│   │   ├── admin/                # Admin-only API routes
│   │   │   ├── analytics/        # Social stats + website analytics
│   │   │   ├── episodes/         # Episode enrichments
│   │   │   ├── guests/           # Guest CRUD + upload
│   │   │   ├── media-kit/        # Media kit + share
│   │   │   ├── studio/           # Studio session lifecycle
│   │   │   ├── submissions/      # Submission management
│   │   │   ├── content/          # Static content + video upload
│   │   │   └── teaser/           # Teaser management
│   │   ├── space/                # Hibr community API (18 routes)
│   │   ├── guest-application/    # Public guest form submission
│   │   ├── newsletter/           # Newsletter signup
│   │   ├── sponsor/              # Sponsor form submission
│   │   ├── events/               # Visitor event tracking
│   │   ├── personalization/      # Visitor profile & recommendations
│   │   └── teaser/               # Public teaser data
│   ├── auth/                     # Auth pages (login)
│   ├── contact/                  # Contact page
│   ├── episodes/                 # Episode pages
│   │   ├── page.tsx              # Episodes listing
│   │   └── [slug]/page.tsx       # Episode detail
│   ├── guest/                    # Guest application page
│   ├── media-kit/[slug]/         # Password-protected media kit view
│   ├── more/                     # "More" navigation page
│   ├── paths/                    # Emotional paths
│   │   ├── page.tsx              # All paths listing
│   │   └── [slug]/page.tsx       # Path detail with episodes
│   ├── resources/                # Resources page
│   ├── saved/                    # Saved episodes page
│   ├── series/                   # Series/seasons page
│   ├── settings/                 # User settings page
│   ├── space/                    # Hibr community
│   │   ├── page.tsx              # Feed
│   │   ├── [id]/page.tsx         # Article detail
│   │   ├── author/[id]/          # Author profile
│   │   └── write/page.tsx        # Write editor
│   └── sponsor/                  # Sponsor info page
├── components/                   # Shared React components
│   ├── actions/                  # Save button
│   ├── ads/                      # Ad banner, sponsored card
│   ├── episodes/                 # Episode UI components
│   ├── forms/                    # Guest, newsletter, sponsor forms
│   ├── home/                     # Home page sections
│   ├── layout/                   # Header, footer, mobile nav
│   ├── media-kit/                # Media kit view
│   ├── personalization/          # Recommendation components
│   ├── providers/                # Auth provider
│   ├── quotes/                   # Quote card
│   ├── space/                    # Hibr community components
│   ├── theme/                    # Theme sync
│   └── ui/                       # Primitives (button, card, toaster, etc.)
├── config/                       # JSON config files (episode data, settings)
├── lib/                          # Server-side utilities & business logic
│   ├── supabase/                 # Supabase client (server + browser)
│   ├── youtube/                  # YouTube API client & queries
│   ├── cache/                    # Episode cache layer
│   ├── episodes/                 # Episode data merge logic
│   ├── mocks/                    # Mock data for development
│   ├── personalization/          # Personalization engine
│   └── *.ts                      # Domain-specific modules
├── supabase/migrations/          # 14 SQL migration files
├── types/                        # TypeScript type definitions
├── public/                       # Static assets
└── data/                         # Runtime data (studio audio, mock stores)
```

---

## Rendering Strategy

| Route | Strategy | Reason |
|-------|----------|--------|
| `/` (Home) | **Server Component** | Reads config, DB, YouTube; passes to client sections |
| `/episodes` | **Server Component** | Fetches episodes list server-side |
| `/episodes/[slug]` | **Server Component** + Client islands | Server fetches data; YouTube player is client |
| `/paths`, `/paths/[slug]` | **Server Component** | Static-ish content from config |
| `/space` | **Client Component** | Dynamic feed with auth, interactions |
| `/space/write` | **Client Component** | Rich editor with state |
| `/admin/*` | **Mixed** | Pages are server (data fetch), children are client (interactivity) |
| `/api/*` | **Route Handlers** | Standard Next.js API routes |

---

## Data Flow

### Episode Data Pipeline (3-source merge)

```
YouTube API ─────────────────┐
                              ├─→ mergeEpisodeLists() → Episode[]
Supabase episodes table ─────┘         │
                                       ▼
                              applyOverrides() ← config/episode-overrides.json
                                       │
                              applyGuestAssignments() ← config/episode-guest-assignments.json
                                       │
                              filter hidden/deleted ← config/episode-sections.json
                                       │
                              ▼ Final Episode Data
```

**File:** `lib/supabase/queries.ts` → `getEpisodes()`

Logic:
1. Fetch from YouTube API (if `YOUTUBE_API_KEY` set) OR use cached data
2. Fetch from Supabase `episodes` table (if configured)
3. Merge: DB fields override YouTube fields; YouTube provides video metadata
4. Apply admin overrides (custom titles, descriptions from config files)
5. Apply guest assignments (link episodes to guests)
6. Filter out hidden/deleted episodes (unless `includeHidden: true`)

### Config Store Pattern

Many data types use JSON files instead of database tables:

```
lib/config-store.ts → createConfigStore<T>(filename, defaults)
                           │
                    ┌──────┴──────┐
                    │  Per-file   │
                    │ FIFO queue  │
                    └──────┬──────┘
                           │
                    ┌──────┴──────┐
                    │   Atomic    │
                    │   write     │
                    │ (tmp+rename)│
                    └─────────────┘
```

Config files using this pattern:
- `config/episode-overrides.json` — Custom episode titles/descriptions
- `config/episode-quotes.json` — AI-generated quotes per episode
- `config/episode-enrichments.json` — Rich content (Why, Central Q, etc.)
- `config/emotional-paths.json` — Path definitions + episode assignments
- `config/home-quotes.json` — Home page rotating quotes
- `config/daily-reflections.json` — Daily reflection content
- `config/ads.json` — Ad banner configurations
- `config/analytics.json` — Social media follower stats
- `config/studio-push-log.json` — Audit log of Studio pushes
- `config/site-settings.json` — Feature flags, SEO, metadata
- `config/topics.json` — Topic categories
- `config/teaser.json` — Upcoming episode teaser

### Authentication Flow

```
Browser ──→ /auth/login ──→ Supabase Auth (email/social)
                                    │
                              Sets cookie via @supabase/ssr
                                    │
                              AuthProvider (client context)
                                    │
                    ┌───────────────┴───────────────┐
                    │                               │
              Public routes                   Protected routes
              (read cookies                   (/space/write, /admin)
               for optional                   require auth check
               personalization)
```

**Admin auth:** `lib/api-utils.ts` → `requireAdmin()` / `requireAdminAPI()`
- Checks Supabase auth → then `profiles.is_admin` column
- Bypass: `ADMIN_AUTH_BYPASS=true` env var (development only)

### API Route Pipeline (Hibr mutations)

```
Request → validateOrigin() → validateCustomHeader('x-requested-with: khat')
       → getAuthUser() → checkBan → checkRateLimit
       → validateInput (lib/validation.ts)
       → sanitizeContent (lib/sanitize.ts + isomorphic-dompurify)
       → moderateContent (lib/moderation.ts)
       → Supabase insert/update
       → Update counts → revalidatePath()
```

---

## Key Architectural Patterns

### 1. Server-First with Client Islands
Pages fetch data in server components, pass to interactive client components. Example: `/admin/episodes/page.tsx` is a server component that fetches episodes, overrides, sections, guests, quotes, YouTube packs in `Promise.all()`, then renders `<EpisodesListing>` (client).

### 2. Graceful Degradation
Every data source has fallbacks:
- No Supabase → mock data
- No YouTube API → cached episodes
- No OpenAI → manual content entry
- Config file missing → defaults returned

### 3. RTL Design System
- `dir="rtl"` on `<html>`, `lang="ar"`
- Tailwind logical properties (`start`/`end`, `ms-`/`me-`)
- IBM Plex Sans Arabic font
- Arabic UI strings throughout (no i18n library — single-language)

### 4. Theme System
- Three modes: `dark`, `light`, `system`
- Config stored in `config/theme.json`
- Inline `<script>` in `<head>` prevents FOUC
- `ThemeSync` component watches for changes
- CSS variables in `globals.css` for color tokens

### 5. Hybrid Storage (DB + Config Files)
- **Supabase:** Episodes, guests, user profiles, Hibr content, studio sessions, visitor events
- **JSON config files:** Episode overrides, quotes, enrichments, paths, settings, ads
- Reasoning: Config files allow fast iteration without migrations; DB for relational/user data
