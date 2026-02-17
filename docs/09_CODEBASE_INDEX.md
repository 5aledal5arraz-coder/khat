# 09 — Codebase Index

## File Map

A human-readable map of every significant file in the codebase, organized by domain.

---

## App — Pages (`app/`)

### Root
| File | Purpose |
|------|---------|
| `app/layout.tsx` | Root layout: RTL, Arabic font, AuthProvider, Header/Footer, ThemeSync |
| `app/page.tsx` | Home page: hero quote, paths, deep content, personalization sections |
| `app/globals.css` | Tailwind imports + CSS custom properties (colors, spacing) |
| `app/loading.tsx` | Global loading fallback (spinner) |

### Public Pages
| File | Purpose |
|------|---------|
| `app/about/page.tsx` | About page: host photo, video, values, team |
| `app/about/about-video.tsx` | Welcome video component |
| `app/contact/page.tsx` | Contact page |
| `app/episodes/page.tsx` | Episodes listing with section grouping |
| `app/episodes/[slug]/page.tsx` | Episode detail: YouTube embed, quotes, resources, enrichments |
| `app/guest/page.tsx` | Guest application form page |
| `app/media-kit/[slug]/page.tsx` | Password-protected media kit view |
| `app/more/page.tsx` | Hub page linking to all sections |
| `app/paths/page.tsx` | All emotional paths listing |
| `app/paths/[slug]/page.tsx` | Path detail with assigned episodes |
| `app/resources/page.tsx` | Resources page |
| `app/resources/resources-client.tsx` | Resources client component |
| `app/saved/page.tsx` | Saved episodes (localStorage) |
| `app/saved/layout.tsx` | Saved page layout |
| `app/series/page.tsx` | Series/seasons listing |
| `app/settings/page.tsx` | User settings |
| `app/settings/settings-client.tsx` | Settings client component |
| `app/sponsor/page.tsx` | Sponsorship info page |
| `app/sponsor/sponsor-hero-cta.tsx` | Sponsor CTA component |
| `app/auth/login/page.tsx` | Supabase auth login page |

### Hibr (Space)
| File | Purpose |
|------|---------|
| `app/space/page.tsx` | Hibr feed page |
| `app/space/layout.tsx` | Hibr layout with sub-navigation |
| `app/space/[id]/page.tsx` | Article detail page |
| `app/space/[id]/article-detail.tsx` | Article detail client component |
| `app/space/author/[id]/page.tsx` | Author profile page |
| `app/space/author/[id]/author-profile.tsx` | Author profile client component |
| `app/space/write/page.tsx` | Write/compose page |
| `app/space/write/write-editor.tsx` | Write editor client component |

### Admin Pages
| File | Purpose |
|------|---------|
| `app/admin/layout.tsx` | Admin layout: sidebar, breadcrumbs, no public chrome |
| `app/admin/page.tsx` | Admin dashboard overview |
| `app/admin/episodes/page.tsx` | Episodes management listing |
| `app/admin/episodes/episodes-listing.tsx` | Episodes listing client component |
| `app/admin/episodes/actions.ts` | Episode server actions (edit, assign, delete) |
| `app/admin/episodes/quotes-actions.ts` | Quote management server actions |
| `app/admin/episodes/youtube-pack-actions.ts` | YouTube pack server actions |
| `app/admin/episodes/conversation-actions.ts` | Conversation data server actions |
| `app/admin/episodes/version-actions.ts` | Version snapshot server actions |
| `app/admin/episodes/[id]/page.tsx` | Episode detail (server, data fetch) |
| `app/admin/episodes/[id]/episode-detail.tsx` | Episode detail client component |
| `app/admin/episodes/components/shared.tsx` | Shared types, ActionMenu, MenuItem |
| `app/admin/episodes/components/episode-card.tsx` | Episode card in grid view |
| `app/admin/episodes/components/episode-row.tsx` | Episode row in list view |
| `app/admin/episodes/components/episodes-grid.tsx` | Episodes grid layout |
| `app/admin/episodes/components/episodes-header.tsx` | Page header with section tabs |
| `app/admin/episodes/components/episodes-toolbar.tsx` | Search, filter, view toggle |
| `app/admin/episodes/components/detail-overview.tsx` | Episode detail: overview tab |
| `app/admin/episodes/components/detail-quotes.tsx` | Episode detail: quotes tab |
| `app/admin/episodes/components/detail-youtube-pack.tsx` | Episode detail: YouTube pack tab |
| `app/admin/episodes/components/detail-conversation.tsx` | Episode detail: conversation tab |
| `app/admin/episodes/components/detail-versions.tsx` | Episode detail: versions tab |
| `app/admin/studio/page.tsx` | Studio page (server) |
| `app/admin/studio/studio-client.tsx` | Studio main client component |
| `app/admin/studio/components/session-header.tsx` | Session header |
| `app/admin/studio/components/stage-prepare.tsx` | Stage 1: Prepare |
| `app/admin/studio/components/stage-content.tsx` | Stage 2: Content generation |
| `app/admin/studio/components/stage-publish.tsx` | Stage 3: Publish |
| `app/admin/studio/components/audio-tools.tsx` | Audio upload tools |
| `app/admin/studio/components/generate-all-bar.tsx` | Generate all button |
| `app/admin/studio/components/edit-suggestions.tsx` | AI edit suggestions |
| `app/admin/studio/components/accordion-section.tsx` | Collapsible content section |
| `app/admin/studio/components/tab-site-pack.tsx` | Site pack tab |
| `app/admin/studio/components/tab-export.tsx` | Export tab |
| `app/admin/studio/components/shared.tsx` | Studio shared utilities |
| `app/admin/studio/components/studio-context.tsx` | Studio React context |
| `app/admin/home-content/page.tsx` | Home content management |
| `app/admin/home-content/home-content-tabs.tsx` | Tabbed home content editor |
| `app/admin/home-content/quotes-actions.ts` | Home quotes server actions |
| `app/admin/home-content/reflections-actions.ts` | Reflections server actions |
| `app/admin/home-content/paths-actions.ts` | Paths server actions |
| `app/admin/home-content/teaser-actions.ts` | Teaser server actions |
| `app/admin/home-content/teaser-tab.tsx` | Teaser management tab |
| `app/admin/guests/page.tsx` | Guests management |
| `app/admin/guests/guests-list.tsx` | Guests list client component |
| `app/admin/topics/` | Topics management |
| `app/admin/content/` | Static content management |
| `app/admin/submissions/page.tsx` | Submissions management |
| `app/admin/submissions/submissions-tabs.tsx` | Tabbed submissions view |
| `app/admin/moderation/page.tsx` | Content moderation panel |
| `app/admin/ads/page.tsx` | Ad management |
| `app/admin/ads/ads-form.tsx` | Ad form component |
| `app/admin/ads/actions.ts` | Ad server actions |
| `app/admin/analytics/page.tsx` | Website analytics dashboard |
| `app/admin/media-kit/page.tsx` | Media kit builder |
| `app/admin/settings/page.tsx` | Settings page |
| `app/admin/settings/settings-tabs.tsx` | Settings tabs |
| `app/admin/settings/actions.ts` | Settings server actions |
| `app/admin/settings/theme-setting-form.tsx` | Theme settings form |
| `app/admin/settings/feature-flags-form.tsx` | Feature flags form |
| `app/admin/settings/seo-form.tsx` | SEO settings form |
| `app/admin/settings/site-metadata-form.tsx` | Site metadata form |
| `app/admin/settings/social-links-form.tsx` | Social links form |
| `app/admin/components/admin-sidebar.tsx` | Sidebar navigation (4 groups, 15 routes) |
| `app/admin/components/breadcrumbs.tsx` | Breadcrumb trail |
| `app/admin/components/glow-card.tsx` | Stat card with glow effect |

---

## App — API Routes (`app/api/`)

### Admin APIs
| File | Methods | Purpose |
|------|---------|---------|
| `api/admin/analytics/route.ts` | GET, POST | Social media stats CRUD |
| `api/admin/analytics/website/route.ts` | GET | Website visitor analytics |
| `api/admin/episodes/[episodeId]/enrichments/route.ts` | GET, POST | Episode enrichment data |
| `api/admin/guests/route.ts` | GET, POST | Guest CRUD |
| `api/admin/guests/[id]/route.ts` | GET, PATCH, DELETE | Single guest operations |
| `api/admin/guests/upload/route.ts` | POST | Guest photo upload |
| `api/admin/guests/auto-detect/` | POST | Auto-detect guest from video |
| `api/admin/media-kit/route.ts` | GET, POST | Media kit config |
| `api/admin/media-kit/share/route.ts` | POST | Generate shareable link |
| `api/admin/studio/route.ts` | GET, POST | Studio sessions list + create |
| `api/admin/studio/upload/route.ts` | POST | Audio file upload |
| `api/admin/studio/youtube-proxy/route.ts` | GET | YouTube caption proxy |
| `api/admin/studio/[id]/route.ts` | GET, DELETE | Session CRUD |
| `api/admin/studio/[id]/transcript/route.ts` | GET, POST | YouTube transcript fetch |
| `api/admin/studio/[id]/transcript/upload/route.ts` | POST | Manual transcript upload |
| `api/admin/studio/[id]/transcript/whisper/route.ts` | POST | Whisper transcription |
| `api/admin/studio/[id]/transcript/process/route.ts` | POST | Transcript processing |
| `api/admin/studio/[id]/transcript/youtube-audio/route.ts` | POST | YouTube audio download |
| `api/admin/studio/[id]/generate/route.ts` | POST | Generate website package |
| `api/admin/studio/[id]/chapters/route.ts` | GET, POST, PATCH | Chapters CRUD |
| `api/admin/studio/[id]/clips/route.ts` | GET, POST | Clips generation |
| `api/admin/studio/[id]/analyzer/route.ts` | POST | Transcript analysis |
| `api/admin/studio/[id]/ai-output/route.ts` | GET | AI output retrieval |
| `api/admin/studio/[id]/website-package/route.ts` | GET | Website package retrieval |
| `api/admin/studio/[id]/push/route.ts` | POST | Push to website |
| `api/admin/studio/[id]/audio-intro/` | POST | Audio intro generation |
| `api/admin/studio/[id]/edit-suggestions/` | POST | AI edit suggestions |
| `api/admin/submissions/guests/[id]/route.ts` | PATCH, DELETE | Guest submission management |
| `api/admin/submissions/newsletter/[id]/route.ts` | DELETE | Newsletter sub management |
| `api/admin/submissions/sponsors/[id]/route.ts` | PATCH, DELETE | Sponsor submission management |
| `api/admin/content/` | Various | Static content management |
| `api/admin/content/upload-video/route.ts` | POST | Video file upload |
| `api/admin/teaser/` | Various | Teaser management |
| `api/admin/ads/upload/route.ts` | POST | Ad image upload |

### Public APIs
| File | Methods | Purpose |
|------|---------|---------|
| `api/guest-application/route.ts` | POST | Guest application submission |
| `api/newsletter/route.ts` | POST | Newsletter signup |
| `api/sponsor/route.ts` | POST | Sponsor form submission |
| `api/events/route.ts` | POST | Visitor event tracking |
| `api/personalization/route.ts` | GET | Visitor profile + recommendations |
| `api/teaser/` | GET | Public teaser data |

### Hibr APIs (`api/space/`)
| File | Methods | Purpose |
|------|---------|---------|
| `api/space/feed` | GET | Unified feed (articles + thoughts) |
| `api/space/articles/route.ts` | GET, POST | Article CRUD |
| `api/space/articles/[id]/route.ts` | GET, PATCH, DELETE | Single article |
| `api/space/thoughts` | GET, POST | Thought CRUD |
| `api/space/thoughts/[id]` | DELETE | Delete thought |
| `api/space/thoughts/[id]/replies` | GET, POST | Thought replies |
| `api/space/comments/route.ts` | GET, POST | Comment CRUD |
| `api/space/comments/[id]/route.ts` | DELETE | Delete comment |
| `api/space/likes/route.ts` | POST | Toggle like |
| `api/space/reactions/route.ts` | POST | Toggle emoji reaction |
| `api/space/bookmarks/route.ts` | GET, POST | Toggle bookmark |
| `api/space/follows/route.ts` | GET, POST | Toggle follow |
| `api/space/drafts` | GET, POST | Draft CRUD |
| `api/space/reports` | POST | Report content |
| `api/space/admin/moderation` | GET | Moderation queue |
| `api/space/admin/moderation/[id]` | PATCH | Moderation action |

---

## Components (`components/`)

### Layout
| File | Purpose |
|------|---------|
| `components/layout/header.tsx` | Desktop header with nav, search, theme toggle |
| `components/layout/footer.tsx` | Footer with links, social, copyright |
| `components/layout/mobile-nav.tsx` | Mobile bottom navigation bar |
| `components/layout/viewport-fix.tsx` | Mobile viewport height fix |

### Episodes
| File | Purpose |
|------|---------|
| `components/episodes/episode-card.tsx` | Episode card with thumbnail |
| `components/episodes/episodes-grid.tsx` | Responsive episode grid |
| `components/episodes/episode-hero.tsx` | Episode page hero section |
| `components/episodes/youtube-embed.tsx` | YouTube IFrame player with tracking |
| `components/episodes/episode-player-context.tsx` | Player state context |
| `components/episodes/episode-page-client.tsx` | Episode page client wrapper |
| `components/episodes/guest-intro-section.tsx` | Guest introduction section |
| `components/episodes/resources-list.tsx` | Resources list |
| `components/episodes/episode-connections.tsx` | Related episodes |
| `components/episodes/why-this-conversation.tsx` | Enrichment: why this conversation |
| `components/episodes/central-question.tsx` | Enrichment: central question |
| `components/episodes/before-you-watch.tsx` | Enrichment: before you watch |
| `components/episodes/conversation-map.tsx` | Visual conversation map |
| `components/episodes/unsaid-reflections.tsx` | Enrichment: unsaid reflections |
| `components/episodes/exclusive-clip.tsx` | Enrichment: exclusive clip |

### Home
| File | Purpose |
|------|---------|
| `components/home/hero-pause-moment.tsx` | Hero rotating quote |
| `components/home/emotional-paths-section.tsx` | Emotional paths grid |
| `components/home/deep-content-section.tsx` | Featured + recent episodes |
| `components/home/featured-episode-card.tsx` | Large featured episode card |
| `components/home/because-you-watched.tsx` | Personalized: similar episodes |
| `components/home/recommended-for-you.tsx` | Personalized: interest-based |
| `components/home/ask-the-guest.tsx` | Guest interaction prompt |

### Space (Hibr)
| File | Purpose |
|------|---------|
| `components/space/feed-card.tsx` | Article/thought card in feed |
| `components/space/unified-feed.tsx` | Infinite scroll feed |
| `components/space/emoji-reactions.tsx` | Emoji reaction picker |

### Forms
| File | Purpose |
|------|---------|
| `components/forms/guest-application-form.tsx` | Multi-step guest form |
| `components/forms/newsletter-form.tsx` | Newsletter signup form |
| `components/forms/sponsor-form.tsx` | Sponsor inquiry form |

### Other
| File | Purpose |
|------|---------|
| `components/actions/save-button.tsx` | Save/bookmark toggle |
| `components/ads/ad-banner.tsx` | Ad banner display |
| `components/ads/sponsored-card.tsx` | Sponsored content card |
| `components/media-kit/media-kit-view.tsx` | Media kit display |
| `components/quotes/quote-card.tsx` | Quote display with share |
| `components/personalization/` | Recommendation UI components |
| `components/providers/auth-provider.tsx` | Supabase auth context |
| `components/theme/theme-sync.tsx` | Theme preference sync |
| `components/ui/` | Primitive components (button, card, toaster, etc.) |

---

## Library (`lib/`)

### Core
| File | Purpose |
|------|---------|
| `lib/api-utils.ts` | Auth, CSRF, error responses |
| `lib/config-store.ts` | Atomic JSON config file read/write |
| `lib/utils.ts` | `cn()`, YouTube URL parsing, formatters |
| `lib/theme.ts` | Theme config read/write |
| `lib/saved.ts` | localStorage save/unsave episodes |

### Episode Data
| File | Purpose |
|------|---------|
| `lib/supabase/queries.ts` | Episode/guest queries with 3-source merge |
| `lib/supabase/server.ts` | Supabase server client factory |
| `lib/supabase/browser.ts` | Supabase browser client factory |
| `lib/episode-overrides.ts` | Config store: custom titles/descriptions |
| `lib/episode-quotes.ts` | Config store: episode quotes |
| `lib/episode-enrichments.ts` | Config store: rich episode content |
| `lib/episode-sections.ts` | Config store: section assignments, hidden/deleted |
| `lib/episode-guests.ts` | Config store: episode-guest assignments |
| `lib/episode-knowledge.ts` | Episode knowledge map |
| `lib/episode-versions.ts` | Episode version snapshots |
| `lib/episodes/merge.ts` | Merge YouTube + DB + override data |
| `lib/cache/episode-cache.ts` | Episode cache layer |

### YouTube
| File | Purpose |
|------|---------|
| `lib/youtube/client.ts` | YouTube Data API client |
| `lib/youtube/queries.ts` | Episode fetch by slug, latest, most viewed |
| `lib/youtube/transcript-client.ts` | YouTube caption fetching |
| `lib/youtube/download.ts` | YouTube audio download |

### Content
| File | Purpose |
|------|---------|
| `lib/home-quotes.ts` | Config store: home page quotes |
| `lib/daily-reflections.ts` | Config store: daily reflections |
| `lib/emotional-paths.ts` | Config store: emotional paths |
| `lib/ads.ts` | Config store: ad banners |
| `lib/topics-config.ts` | Config store: topics |
| `lib/static-content.ts` | Config store: static page content |
| `lib/teaser.ts` | Config store: episode teaser |
| `lib/media-kit.ts` | Media kit config |
| `lib/media-kit-share.ts` | Media kit sharing + password |
| `lib/youtube-pack.ts` | Config store: YouTube chapters/clips/SEO |

### Studio & AI
| File | Purpose |
|------|---------|
| `lib/studio.ts` | Studio session CRUD, mock store |
| `lib/openai.ts` | All AI generation (website package, chapters, clips, analysis, moderation) |
| `lib/whisper.ts` | Whisper transcription client |
| `lib/studio-push-log.ts` | Push audit log |

### Security & Moderation
| File | Purpose |
|------|---------|
| `lib/validation.ts` | Input validation functions |
| `lib/sanitize.ts` | HTML sanitization via DOMPurify |
| `lib/moderation.ts` | Content moderation pipeline |
| `lib/moderation-config.ts` | Moderation config store |
| `lib/rate-limit.ts` | Rate limiting (IP + DB-based) |
| `lib/video-validation.ts` | Audio/video file validation |

### Hibr (Space)
| File | Purpose |
|------|---------|
| `lib/space-queries.ts` | Hibr DB queries (articles, thoughts, feed) |
| `lib/space-articles.ts` | Mock article helpers |
| `lib/space-authors.ts` | Mock author helpers |
| `lib/space-thoughts.ts` | Mock thought helpers |
| `lib/space-feed.ts` | Mock feed + tags |
| `lib/mocks/` | Mock data directory |

### Personalization
| File | Purpose |
|------|---------|
| `lib/personalization/tracker.ts` | Client-side event tracker |
| `lib/personalization/profile-builder.ts` | Server-side profile builder |
| `lib/personalization/ranking.ts` | Recommendation ranking engine |

### Admin
| File | Purpose |
|------|---------|
| `lib/admin/queries.ts` | Admin-specific queries (guests, submissions, moderation) |
| `lib/admin/analytics.ts` | Social media analytics config |
| `lib/site-settings.ts` | Site settings + feature flags |

---

## Types (`types/`)

| File | Key Types |
|------|-----------|
| `types/database.ts` | `Episode`, `Guest`, `Topic`, `Quote`, `Resource`, `Timestamp`, `EpisodeWithRelations`, `GuestWithRelations`, `StudioSession`, `StudioTranscript`, `StudioAiOutput`, `StudioChapters`, `StudioClips`, `StudioWebsitePackage`, `StudioAnalyzer` |
| `types/episodes.ts` | `EpisodeOverride`, `EpisodeSectionsConfig`, `EpisodeSection`, `EpisodeQuotesConfig` |
| `types/home-content.ts` | `HomeQuote`, `DailyReflection` |
| `types/personalization.ts` | `EventType`, `ALLOWED_EVENT_TYPES`, `VisitorProfile` |
| `types/site-settings.ts` | `SiteMetadata`, `SocialLinkConfig`, `SEODefaults`, `FeatureFlags`, `SiteSettingsConfig` |
| `types/ads.ts` | `AdConfig`, `AdPosition` |
| `types/media-kit.ts` | `MediaKitConfig` |
| `types/moderation.ts` | `ModerationResult`, `ModerationConfig` |
| `types/teaser.ts` | `TeaserConfig`, `TeaserQuestion` |
| `types/theme.ts` | `ThemeConfig`, `ThemeMode` |
| `types/topics.ts` | `TopicConfig` |
| `types/youtube-pack.ts` | `YouTubePackConfig`, `ChapterItem`, `ClipItem` |
| `types/youtube-iframe.d.ts` | YouTube IFrame API type declarations |
| `types/static-content.ts` | `StaticContentConfig` |

---

## Config (`config/`)

| File | Purpose | Managed By |
|------|---------|------------|
| `config/episode-overrides.json` | Custom episode titles/descriptions | Studio push, admin episodes |
| `config/episode-quotes.json` | AI-generated quotes per episode | Studio push, admin quotes |
| `config/episode-enrichments.json` | Rich episode content (Why, Central Q, etc.) | Studio push |
| `config/episode-sections.json` | Section assignments, hidden/deleted episodes | Admin episodes |
| `config/episode-guest-assignments.json` | Episode → guest mapping | Admin episodes |
| `config/episode-knowledge-map.json` | Episode knowledge data | Admin |
| `config/emotional-paths.json` | Path definitions + episode assignments | Admin home content |
| `config/home-quotes.json` | Home page rotating quotes | Admin home content |
| `config/daily-reflections.json` | Daily reflections | Admin home content |
| `config/ads.json` | Ad banner configurations | Admin ads |
| `config/analytics.json` | Social media follower stats | Admin analytics |
| `config/site-settings.json` | Feature flags, SEO, metadata, social links | Admin settings |
| `config/studio-push-log.json` | Studio push audit log | Auto (Studio push) |
| `config/topics.json` | Topic categories | Admin topics |
| `config/teaser.json` | Upcoming episode teaser | Admin home content |
| `config/static-content.json` | Static page content | Admin content |
| `config/theme.json` | Theme mode (dark/light/system) | Admin settings |
| `config/site.ts` | Feature flag reader with in-memory cache | Runtime |

---

## Database Migrations (`supabase/migrations/`)

14 SQL files applied in order. See `02_DATABASE_SCHEMA.md` for full details.
