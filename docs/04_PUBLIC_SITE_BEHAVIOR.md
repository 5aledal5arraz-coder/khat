# 04 — Public Site Behavior

## Global Layout

**File:** `app/layout.tsx`

Every public page wraps in:
```
<html lang="ar" dir="rtl" data-theme-mode={mode}>
  <body className="font-sans antialiased">
    <AuthProvider>
      <ThemeSync />
      <ViewportFix />
      <Header hibrEnabled={flag} />
      <main>{children}</main>
      <Footer />
      <MobileNav hibrEnabled={flag} />
      <Toaster />
    </AuthProvider>
  </body>
</html>
```

- **Font:** IBM Plex Sans Arabic (300–700 weights)
- **Theme:** Dark mode flash prevention via inline `<script>` in `<head>`
- **Auth:** `AuthProvider` wraps all pages, provides user context
- **Navigation:** Header (desktop) + MobileNav (bottom bar, mobile)

---

## Page-by-Page Technical Behavior

### Home — `/`
**File:** `app/page.tsx` — Server Component

**Data fetching (parallel via `Promise.all`):**
1. `getEpisodes({ limit: 20 })` — Latest episodes
2. `getHomeQuote()` — Random rotating quote from `config/home-quotes.json`
3. `getEmotionalPaths()` — All emotional paths from `config/emotional-paths.json`
4. `getDailyReflection()` — Today's reflection from `config/daily-reflections.json`
5. `isEnabled("personalizationEnabled")` — Feature flag check
6. `isEnabled("adsEnabled")` — Feature flag check

**Sections rendered (top to bottom):**
1. `HeroPauseMoment` — Full-bleed quote with "أكمل الفكرة" CTA → `/quotes/{id}`, "استمع للحلقة" → `/episodes/{slug}`
2. `EmotionalPathsSection` — Grid of path cards with emoji, title, gradient
3. `DeepContentSection` — Featured episode card + recent episodes grid
4. `BecauseYouWatched` — Personalized (client component, fetches visitor profile)
5. `RecommendedForYou` — Personalized recommendations
6. `AskTheGuest` — Guest interaction prompt
7. `AdBanner` — If ads enabled

**Failure modes:** If Supabase down → fallback to cached/mock episodes. If no quote → section hidden. If personalization disabled → personalized sections hidden.

---

### Episodes Listing — `/episodes`
**File:** `app/episodes/page.tsx` — Server Component

**Data:** `getEpisodes()` with sections config for grouping.

**Display:** Episodes grouped by section (seasons/categories). Each section shows its episodes in a grid. Search functionality. Filter by section.

**Component:** `EpisodesGrid` renders `EpisodeCard` components with:
- YouTube thumbnail via `next/image` (remote pattern: `img.youtube.com`, `i.ytimg.com`)
- Title, guest name, duration, release date
- Click → `/episodes/{slug}`

---

### Episode Detail — `/episodes/[slug]`
**File:** `app/episodes/[slug]/page.tsx` — Server Component with Client islands

**Data fetching (parallel):**
1. `getEpisodeBySlug(slug)` — Episode + guest data
2. `getPublishedQuotes(episodeId)` — Published quotes
3. `getEpisodeEnrichment(episodeId)` — Rich content sections

**Rendering:**
- `EpisodeHero` — YouTube embed, title, guest info, description
- `YouTubeEmbed` — Client component with custom player, watch tracking (fires `episode_view`, `watch_50`, `watch_90` events)
- `GuestIntroSection` — Guest photo, bio, links
- `WhyThisConversation` — If enrichment exists
- `CentralQuestion` — If enrichment exists
- `BeforeYouWatch` — If enrichment exists
- `ConversationMap` — Visual conversation topic flow
- `ResourcesList` — Links and resources
- `QuoteCard` components — Episode quotes
- `UnsaidReflections` — Deeper reflections
- `ExclusiveClip` — If available
- `EpisodeConnections` — Related episodes

**Client-side behavior:**
- YouTube IFrame API loaded via `youtube-embed.tsx`
- Player state tracking (play, pause, progress)
- Progress events fire at 50% and 90% watch marks
- Events sent to `/api/events` for personalization
- Save button persists to localStorage (`lib/saved.ts`)

**SEO:** Dynamic `<title>` and `<meta>` from episode data. OpenGraph image from YouTube thumbnail.

---

### Emotional Paths — `/paths`
**File:** `app/paths/page.tsx` — Server Component

**Data:** `getEmotionalPaths()` from config.

**Display:** Grid of path cards. Each card: emoji, Arabic title, description, gradient background, episode count.

### Path Detail — `/paths/[slug]`
**File:** `app/paths/[slug]/page.tsx` — Server Component

**Data:** Path info + episodes assigned to this path.

**Display:** Path header (emoji, title, description) + episodes grid.

---

### Series — `/series`
**File:** `app/series/page.tsx` — Server Component

Grouped episodes by section/season. Uses `getSectionsConfig()` for grouping.

---

### Hibr Feed — `/space`
**File:** `app/space/page.tsx` — Client Component

**Auth:** Optional (read without auth, write requires auth)

**Data:** Fetches from `/api/space/feed` with sort/filter/pagination.

**Features:**
- Sort tabs: newest / popular / discussed
- Tag filter pills (trending tags)
- Infinite scroll (IntersectionObserver)
- `UnifiedFeed` component renders `FeedCard` for articles and thoughts
- Each `FeedCard` shows: author avatar, name, date, content preview, tags, like/comment counts, share button
- Writing prompts shown when feed is quiet

**Layout:** `app/space/layout.tsx` adds Hibr-specific sub-navigation.

---

### Article Detail — `/space/[id]`
**File:** `app/space/[id]/page.tsx` → `article-detail.tsx` — Client Component

**Data:** Fetches article, comments, related articles.

**Features:**
- Full article content (sanitized HTML via DOMPurify)
- Author info with follow button
- Like, bookmark, share actions
- Emoji reactions
- Comment thread with nested replies
- Related articles sidebar

---

### Author Profile — `/space/author/[id]`
**File:** `app/space/author/[id]/page.tsx` → `author-profile.tsx` — Client Component

**Data:** Author profile, their articles and thoughts.

**Features:** Avatar, bio, follower/following counts, follow button, tabbed content (articles/thoughts).

---

### Write — `/space/write`
**File:** `app/space/write/page.tsx` → `write-editor.tsx` — Client Component

**Auth:** Required (redirects to `/auth/login` if not authenticated)

**Features:**
- Toggle: Article (long-form) vs Thought (short-form)
- Article: Title input, rich text content, tags (up to 5), optional episode link
- Thought: 280-char text area with counter
- Writing tips sidebar
- Auto-save to drafts (`/api/space/drafts`)
- Publish → sends to moderation pipeline

---

### Saved — `/saved`
**File:** `app/saved/page.tsx` — Client Component

**Data:** Saved episode IDs from localStorage (`lib/saved.ts`), then fetches episode data.

**Features:** Grid of saved episodes. Remove from saved. Empty state if no saves.

---

### About — `/about`
**File:** `app/about/page.tsx` — Server Component

**Sections:** Host photo, welcome video (`about-video.tsx`), values, team, CTA with logo.

---

### Contact — `/contact`
**File:** `app/contact/page.tsx` — Server Component

Contact information and social links.

---

### More — `/more`
**File:** `app/more/page.tsx` — Server Component

**Purpose:** Hub page linking to all sections. Contains links to: episodes, paths, series, resources, Hibr, about, contact, sponsor, guest application, saved.

---

### Resources — `/resources`
**File:** `app/resources/page.tsx` → `resources-client.tsx`

Curated resources and links, possibly aggregated from episode resources.

---

### Guest Application — `/guest`
**File:** `app/guest/page.tsx` — Server Component with Client form

Multi-step form: personal info → story topic → filming concerns → submit.
Submits to `POST /api/guest-application` with validation and rate limiting.

---

### Sponsor — `/sponsor`
**File:** `app/sponsor/page.tsx` — Server Component with Client elements

Sponsorship info page with hero CTA (`sponsor-hero-cta.tsx`). Form submits to `POST /api/sponsor`.

---

### Media Kit (Password-Protected) — `/media-kit/[slug]`
**File:** `app/media-kit/[slug]/page.tsx` — Client Component

**Flow:**
1. Show password form
2. `POST /api/media-kit/verify` with slug + password
3. Rate limited: 5 attempts per 15 min per IP
4. On success: renders `MediaKitView` with podcast stats, analytics, sponsorship options
5. Password verified via bcrypt (with auto-upgrade from legacy SHA-256)

---

### Settings — `/settings`
**File:** `app/settings/page.tsx` → `settings-client.tsx`

User settings (theme preference, notification settings). Requires auth.

---

### Auth — `/auth/login`
**File:** `app/auth/login/page.tsx` — Client Component

Supabase Auth UI. Supports email/password and social login. Redirects to `?redirect` param after login (default: `/space`).

---

## Navigation

### Header (`components/layout/header.tsx`)
- Logo linking to `/`
- Nav items: الحلقات (`/episodes`), المسارات (`/paths`), عن خط (`/about`), المزيد (`/more`)
- Hibr link (if enabled): حبر (`/space`)
- Search icon → search modal
- Theme toggle

### Footer (`components/layout/footer.tsx`)
- Logo + tagline
- Quick links: episodes, paths, about, contact
- Social links: YouTube, X, TikTok, Instagram
- Guest application + sponsor links

### Mobile Nav (`components/layout/mobile-nav.tsx`)
- Bottom bar (sticky)
- 5 items: Home, Episodes, Paths, Hibr (if enabled), More

---

## Client-Side Patterns

### Save to Local Storage
**File:** `lib/saved.ts`
- `getSavedIds()` / `toggleSaved(id)` / `isSaved(id)`
- Stores array of episode IDs in `localStorage`
- No auth required

### Screenshot Sharing
**Library:** `modern-screenshot`
- Used in quote cards and episode cards
- Adds KHAT branding (logo.png + khatpodcast.com domain)

### Personalization Tracking
**File:** `lib/personalization/tracker.ts` (client-side)
- Sends events to `POST /api/events`
- Anonymous visitor ID (generated + stored in cookie/localStorage)
- Debounced event batching
