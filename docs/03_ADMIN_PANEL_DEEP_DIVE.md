# 03 — Admin Panel Deep Dive

## Access

- **URL:** `/admin`
- **Auth:** Supabase auth + `profiles.is_admin = true`
- **Bypass:** `ADMIN_AUTH_BYPASS=true` env var (development only)
- **Layout:** `app/admin/layout.tsx` — collapsible sidebar, no public header/footer, RTL

---

## Navigation Structure

The sidebar (`app/admin/components/admin-sidebar.tsx`) has 4 groups, 15 routes:

### Group 1: الأساسية (Core)
| Route | Label | Icon |
|-------|-------|------|
| `/admin` | الرئيسية | LayoutDashboard |
| `/admin/episodes` | الحلقات | PlayCircle |
| `/admin/studio` | الاستوديو | Mic |

### Group 2: المحتوى (Content)
| Route | Label | Icon |
|-------|-------|------|
| `/admin/home-content` | الصفحة الرئيسية | Home |
| `/admin/guests` | الضيوف | Users |
| `/admin/topics` | المواضيع | Tag |
| `/admin/content` | المحتوى | FileEdit |

### Group 3: التواصل (Communication)
| Route | Label | Icon |
|-------|-------|------|
| `/admin/submissions` | الطلبات | Inbox |
| `/admin/moderation` | الإشراف | Shield |
| `/admin/ads` | الإعلانات | Megaphone |

### Group 4: النظام (System)
| Route | Label | Icon |
|-------|-------|------|
| `/admin/analytics` | الإحصائيات | BarChart3 |
| `/admin/media-kit` | ملف الشراكة | FileText |
| `/admin/settings` | الإعدادات | Settings |

---

## Page-by-Page Walkthrough

### 1. Dashboard — `/admin`
**File:** `app/admin/page.tsx`

Overview page with summary cards. Links to key admin sections.

---

### 2. Episodes — `/admin/episodes`
**File:** `app/admin/episodes/page.tsx` → `episodes-listing.tsx`

**Data fetched (server):** Episodes (all, including hidden), overrides, sections config, guest assignments, guests, quotes config, YouTube pack config.

**Features:**
- Grid/list toggle for episode display
- Search and filter toolbar (`episodes-toolbar.tsx`)
- Episode cards with thumbnails, titles, duration, date
- Three-dot action menu per episode: edit, assign section, assign guest, hide/show, delete
- Bulk actions: select multiple → bulk assign section, bulk delete
- Section management: create/edit/hide/delete sections
- Click episode → detail page

**Key components:**
- `episodes-grid.tsx` — Grid layout
- `episode-card.tsx` — Card with action menu
- `episode-row.tsx` — Row layout alternative
- `episodes-header.tsx` — Page header with section tabs
- `episodes-toolbar.tsx` — Search, filter, view toggle

### 2a. Episode Detail — `/admin/episodes/[id]`
**File:** `app/admin/episodes/[id]/page.tsx` → `episode-detail.tsx`

**Tabs:**
- **Overview** (`detail-overview.tsx`): Edit title, description, section assignment, guest assignment, visibility toggle, delete. Link to public episode page.
- **Quotes** (`detail-quotes.tsx`): View/edit AI-generated quotes. Generate new quotes via OpenAI. Delete individual quotes.
- **YouTube Pack** (`detail-youtube-pack.tsx`): Chapters, clips, SEO data. Generate via AI or edit manually.
- **Conversation** (`detail-conversation.tsx`): Conversation map and topic data.
- **Versions** (`detail-versions.tsx`): Version history with snapshots. Restore previous versions.

**Server actions** (`actions.ts`): `updateEpisodeTitle`, `updateEpisodeDescription`, `assignToSection`, `assignGuest`, `toggleVisibility`, `deleteEpisode`, `bulkAssignSection`, `bulkDeleteEpisodes`

---

### 3. Studio — `/admin/studio`
**File:** `app/admin/studio/page.tsx` → `studio-client.tsx`

**Three stages:**
1. **Prepare** (`stage-prepare.tsx`): Create session, paste YouTube URL, fetch/upload transcript
2. **Content** (`stage-content.tsx`): AI generation of all content, review/edit
3. **Publish** (`stage-publish.tsx`): Push to website, verify

**Key components:**
- `session-header.tsx` — Session title, YouTube link, status
- `audio-tools.tsx` — Audio upload for Whisper transcription
- `generate-all-bar.tsx` — One-click generate all content types
- `edit-suggestions.tsx` — AI edit suggestions review
- `accordion-section.tsx` — Collapsible sections for generated content

**API routes:**
- `POST /api/admin/studio` — Create session
- `GET /api/admin/studio/[id]` — Get session with all data
- `DELETE /api/admin/studio/[id]` — Delete session (+ audio cleanup)
- `POST /api/admin/studio/[id]/transcript` — Fetch YouTube transcript
- `POST /api/admin/studio/[id]/transcript/upload` — Upload transcript file
- `POST /api/admin/studio/[id]/transcript/whisper` — Whisper transcription
- `POST /api/admin/studio/[id]/generate` — Generate website package
- `POST /api/admin/studio/[id]/chapters` — Generate chapters
- `POST /api/admin/studio/[id]/clips` — Generate clips
- `POST /api/admin/studio/[id]/analyzer` — Analyze transcript
- `POST /api/admin/studio/[id]/push` — Push to website config files
- `GET /api/admin/studio/[id]/website-package` — Get website package
- `GET /api/admin/studio/[id]/ai-output` — Get AI output

---

### 4. Home Content — `/admin/home-content`
**File:** `app/admin/home-content/page.tsx` → `home-content-tabs.tsx`

**Tabs:**
- **Quotes:** Manage home page rotating quotes (add, edit, delete, link to episode)
- **Reflections:** Daily reflection content (date, text, thinking question, episode link)
- **Paths:** Emotional path assignments (assign episodes to paths, reorder)
- **Teaser:** Upcoming episode teaser (guest name, topic, video upload)

**Server actions:** `quotes-actions.ts`, `reflections-actions.ts`, `paths-actions.ts`, `teaser-actions.ts`

---

### 5. Guests — `/admin/guests`
**File:** `app/admin/guests/page.tsx` → `guests-list.tsx`

**Features:**
- List all guests with photo, name, bio, episode count
- Add new guest (name, bio, photo upload, title, external links)
- Edit guest details
- Delete guest
- Auto-detect guest from YouTube video description

**API routes:** `GET/POST /api/admin/guests`, `GET/PATCH/DELETE /api/admin/guests/[id]`, `POST /api/admin/guests/upload`

---

### 6. Topics — `/admin/topics`
**File:** `app/admin/topics/page.tsx`

Manage topic categories. Topics stored in `config/topics.json`. CRUD operations via server actions.

---

### 7. Content — `/admin/content`
**File:** `app/admin/content/page.tsx`

Static content editor for pages. Content stored in `config/static-content.json`. Sub-route `/admin/content/analyze` for content analysis.

---

### 8. Submissions — `/admin/submissions`
**File:** `app/admin/submissions/page.tsx` → `submissions-tabs.tsx`

**Three tabs:**
- **Guest Applications:** Review, approve/reject guest applications
- **Sponsor Requests:** Review sponsor form submissions
- **Newsletter Signups:** View newsletter email signups

**API routes:** `/api/admin/submissions/guests/[id]`, `/api/admin/submissions/sponsors/[id]`, `/api/admin/submissions/newsletter/[id]`

---

### 9. Moderation — `/admin/moderation`
**File:** `app/admin/moderation/page.tsx`

**Features:**
- Tabbed view: Pending | Flagged | Reports
- Each item shows content, author, moderation status, flags
- Actions: Approve, Reject, Edit content, Hide, Delete (with confirmation)
- Fetches from `/api/space/admin/moderation`

---

### 10. Ads — `/admin/ads`
**File:** `app/admin/ads/page.tsx` → `ads-form.tsx`

Manage ad banners. Stored in `config/ads.json`. Fields: title, description, CTA text, CTA URL, image upload, position, visibility.

---

### 11. Analytics — `/admin/analytics`
**File:** `app/admin/analytics/page.tsx`

**Two data sources:**
1. **Website analytics** (from `visitor_events` table): Unique visitors, episode views, engagement rate, top episodes, content breakdown, top searches, top paths
2. **Social media stats** (from `config/analytics.json`): YouTube/X/TikTok/Instagram follower counts, post counts, engagement rates

**Features:** Period tabs (7d/30d/90d/all), GlowCard summary stats, ranked episode list, content breakdown with bar visuals, search query pills, emotional path ranking.

---

### 12. Media Kit — `/admin/media-kit`
**File:** `app/admin/media-kit/page.tsx`

Build a shareable media kit for sponsors. Includes podcast stats, audience info, sponsorship options. Can generate a password-protected shareable link at `/media-kit/[slug]`.

---

### 13. Settings — `/admin/settings`
**File:** `app/admin/settings/page.tsx` → `settings-tabs.tsx`

**Tabs:**
- **Site Metadata:** Name, description, tagline, contact email
- **Social Links:** Platform URLs with visibility toggles
- **SEO:** Title template, default description, OG image, keywords
- **Feature Flags:** Toggle all feature flags (store, Hibr, applications, maintenance, personalization, ads, studio)
- **Theme:** Dark/light/system mode selection

**Server actions:** `actions.ts` for all settings updates. Data stored in `config/site-settings.json` and `config/theme.json`.

---

## Shared Admin Components

| Component | File | Purpose |
|-----------|------|---------|
| `AdminSidebar` | `app/admin/components/admin-sidebar.tsx` | Collapsible navigation |
| `Breadcrumbs` | `app/admin/components/breadcrumbs.tsx` | Breadcrumb trail from pathname |
| `GlowCard` | `app/admin/components/glow-card.tsx` | Stat card with glow effect |
| `ActionMenu` | `app/admin/episodes/components/shared.tsx` | Three-dot dropdown menu |
| `MenuItem` | `app/admin/episodes/components/shared.tsx` | Menu item in dropdown |

---

## Server Action Pattern

All admin server actions follow this pattern (from `app/admin/episodes/actions.ts`):

```typescript
"use server"
import { requireAdmin } from "@/lib/api-utils"

export async function updateSomething(id: string, data: Data) {
  await requireAdmin()  // Auth check — throws if not admin

  // Read current state
  const current = await readConfig()

  // Modify
  const updated = { ...current, ...data }

  // Write (atomic via config-store)
  await writeConfig(updated)

  // Invalidate cache
  revalidatePath("/relevant/path")
  revalidatePath("/another/path")

  return { success: true }
}
```
