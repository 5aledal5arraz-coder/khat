# 00 — Product Overview

## What Is KHAT?

**KHAT** (خط) is an Arabic podcast platform — a full-stack web application that serves as both a public-facing website for listeners and a comprehensive admin panel for production. The name means "line" or "thread" in Arabic, representing the thread of human stories the podcast explores.

**Live domain:** `khatpodcast.com`

---

## Core Product Pillars

### 1. Episode Experience
Episodes are the primary content unit. Each episode has:
- A YouTube video embed with custom player controls and watch tracking
- Curated quotes, resources, timestamps, and chapter markers
- Guest profiles with bios, photos, and external links
- Enrichment data: "Why this conversation", "Central question", "Before you watch", "Unsaid reflections", "Conversation map", "Exclusive clip"
- Episode connections to other episodes via related content

### 2. Emotional Paths (المسارات)
Not traditional categories. Emotional paths are **feeling-based entry points** like "اكتشاف الذات" (Self-discovery) or "قصص ملهمة" (Inspiring stories). Each path has:
- An emoji, Arabic title, description, and gradient color
- Episodes assigned to it (admin-managed)
- A dedicated `/paths/[slug]` page listing its episodes

### 3. حبر — Hibr (Community Writing Space)
A community writing platform at `/space` where authenticated users can:
- Write **articles** (long-form with title, content, tags, optional episode link)
- Post **thoughts** (short-form, 280-char max, like tweets)
- Like, comment, reply, bookmark, follow other authors
- React with emoji reactions
- Content goes through a moderation pipeline before appearing

### 4. Studio (Content Production Pipeline)
An admin-only tool at `/admin/studio` that takes a podcast episode from raw YouTube URL to fully enriched website content:
1. Create session with YouTube URL
2. Fetch/upload transcript (YouTube captions, Whisper, or manual upload)
3. AI-generate all content (quotes, resources, timestamps, chapters, clips, SEO description)
4. Review and edit generated content
5. Push to website (writes to config files that the public site reads)

### 5. Personalization Engine
Tracks visitor behavior anonymously and personalizes the experience:
- Records events: episode views, watch depth (50%/90%), path clicks, guest opens, quote opens, searches, saves
- Builds interest vectors per visitor
- Powers "Recommended for You" and "Because You Watched" sections
- Admin analytics dashboard shows aggregate visitor behavior

---

## User Journeys

### Journey 1: New Visitor
```
Landing Page → Hero quote → Emotional Paths grid → Click path →
Path page with episodes → Click episode → Watch → See related content →
Discover more episodes → Browse quotes → Visit /more for all sections
```

### Journey 2: Returning Listener
```
Landing Page → "Because You Watched" recommendations →
Personalized episode ranking → Deep content sections →
Save episodes → Visit /saved for bookmarks → Explore Hibr
```

### Journey 3: Community Member (Hibr)
```
/auth/login → Supabase Auth (email or social) →
/space → Browse feed → /space/write → Compose article or thought →
Content moderation → Published → Receive likes/comments →
View author profile → Follow other writers
```

### Journey 4: Admin (Content Producer)
```
/admin → Dashboard overview → /admin/studio → Create session →
Paste YouTube URL → Fetch transcript → Generate all content →
Review/edit → Push to website → /admin/episodes → Manage →
Assign to sections/paths → Edit quotes/enrichments →
/admin/analytics → Track website engagement
```

### Journey 5: Potential Sponsor
```
/sponsor → Read sponsorship page → Fill form →
Admin receives in /admin/submissions → Negotiate →
/admin/media-kit → Generate share link → Send to sponsor →
Sponsor views /media-kit/[slug] with password → See analytics
```

### Journey 6: Potential Guest
```
/guest → Read intro → Fill multi-step application form →
Admin reviews in /admin/submissions → Accept/reject →
Guest appears in /admin/guests → Assigned to episode
```

---

## Content Model

```
Episode (YouTube + DB + Config overrides)
├── Guest (name, bio, photo, links)
├── Quotes (AI-generated or manual)
├── Resources (AI-generated or manual)
├── Timestamps (AI-generated or manual)
├── Enrichments (Why, Central Q, Before You Watch, etc.)
├── YouTube Pack (chapters, clips, SEO)
├── Section assignment (season/category)
├── Emotional Path assignment
├── Conversation data (map, topics)
└── Version snapshots (history of edits)

Home Page
├── Hero Pause Moment (rotating quote)
├── Emotional Paths grid
├── Deep Content Section (featured + recent)
├── "Because You Watched" (personalized)
├── "Recommended for You" (personalized)
├── Daily Reflection
└── Teaser (upcoming episode preview)

Hibr (حبر)
├── Articles (long-form, tagged)
├── Thoughts (short-form)
├── Comments & Replies
├── Likes & Emoji Reactions
├── Bookmarks
├── Author Profiles
└── Moderation Queue
```

---

## Feature Flags

The site uses a feature flag system (`config/site-settings.json`) with these toggles:

| Flag | Purpose |
|------|---------|
| `storeEnabled` | Merchandise store section |
| `hibrEnabled` | Hibr writing community |
| `guestApplicationsEnabled` | Guest application form |
| `maintenanceMode` | Full-site maintenance page |
| `personalizationEnabled` | Visitor tracking & recommendations |
| `adsEnabled` | Ad banner system |
| `studioEnabled` | Studio content pipeline |

Flags are read via `config/site.ts` with 30-second in-memory cache.

---

## Target Audience

- **Primary:** Arabic-speaking podcast listeners (Saudi Arabia focus, `ar_SA` locale)
- **Secondary:** Potential podcast guests, sponsors, and community writers
- **Admin:** Single admin user (the podcast host) managing all content

---

## Key Design Decisions

1. **RTL-first:** `dir="rtl"` on `<html>`, all layout uses logical properties (`start`/`end`)
2. **Arabic typography:** IBM Plex Sans Arabic as primary font
3. **Dark mode default:** Theme system with dark/light/system modes
4. **YouTube as source of truth:** Episodes originate from YouTube; the site enriches them
5. **Config files over DB for some data:** Episode overrides, quotes, enrichments stored in JSON files for fast iteration (no migration needed)
6. **Progressive enhancement:** Site works without Supabase (mock data fallback), without YouTube API (cached data), without OpenAI (manual content)
