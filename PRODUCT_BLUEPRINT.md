# KHAT Podcast - Product Blueprint

**Document Purpose:** This document serves as the single source of truth for an AI system (or any new team member) to fully understand the KHAT Podcast website product — its philosophy, architecture, features, user journeys, and design decisions — without needing to ask any further questions.

**Version:** 1.0
**Last Updated:** February 10, 2026

---

## Table of Contents

1. [Product Overview](#1-product-overview)
2. [Website Structure](#2-website-structure)
3. [User Types & Permissions](#3-user-types--permissions)
4. [Episode System](#4-episode-system)
5. [Studio (Admin Panel)](#5-studio-admin-panel)
6. [Guest System](#6-guest-system)
7. [KHAT Space (Hibr)](#7-khat-space-hibr)
8. [SEO & Growth Philosophy](#8-seo--growth-philosophy)
9. [Design Philosophy](#9-design-philosophy)
10. [Technical Summary](#10-technical-summary)

---

## 1. Product Overview

### What Is KHAT Podcast?

KHAT (خط) is an Arabic-language podcast that presents deep, thoughtful, and emotionally honest conversations. The name "خط" means "line" in Arabic — symbolizing a thread that connects human experiences, a path of meaning, and the written word. The podcast features long-form dialogues with guests who share real stories about relationships, self-worth, emotional emptiness, meaning, identity, mental health, career, and the human condition.

The KHAT Podcast website is not a YouTube mirror. It is the **owned home** of the KHAT brand — a distinct, premium digital experience that transforms fleeting video content into a permanent, searchable, and deeply structured library of knowledge. Where YouTube gives you a video, the website gives you the **full intellectual experience** surrounding that video: structured summaries, timestamped chapter navigation, curated quotes, referenced books and resources, guest profiles, and community writing.

### Philosophy

KHAT is built on four core values: **Authenticity** (الأصالة), **Depth** (العمق), **Respect** (الاحترام), and **Impact** (الأثر).

The website embodies a "philosopher's library" aesthetic — calm, spacious, intellectual. It rejects the noise and chaos of typical content platforms. Every element is intentional. Every card in the feed has a purpose. Every page is designed to invite lingering, reflection, and return visits. The browsing experience is structured like a social feed (cards, scrolling, actions) but without the frenzy — Instagram-like in mechanics, but a quiet bookstore in tone.

The platform believes that honest conversation creates impact, and that every person carries a story worth telling. The website is the permanent record of those stories.

### Type of Content

- **Podcast Episodes**: Long-form video conversations hosted on YouTube, embedded on the website with rich surrounding content (summaries, timestamps, quotes, resources, guest profiles).
- **Quotes**: Shareable, saveable, image-exportable quotes extracted from each episode, organized by theme (love, loneliness, ego, purpose, self-worth, meaning).
- **Guest Profiles**: Biographical pages for each guest featuring their episodes, social links, and exclusive post-recording testimonials to KHAT.
- **Community Writing (حبر / Hibr)**: A moderated platform where authenticated users write articles and short thoughts inspired by KHAT's topics. This is community discourse — not comments.
- **Resources**: Books, articles, and links referenced across episodes, forming a cross-episode knowledge library.
- **Curated Collections/Series**: Thematic bundles of episodes, quotes, and articles grouped by topics like "Relationships," "Emotional Emptiness," or "Meaning & Identity."

### Target Audience

KHAT's audience consists of Arabic-speaking young adults and professionals (primarily 18–35) who are:

- Intellectually curious and emotionally mature.
- Interested in personal development, psychology, philosophy, and human stories.
- Seeking content with depth and substance in a media landscape dominated by shallow entertainment.
- Active on YouTube, Spotify, Apple Podcasts, and social media (Instagram, TikTok, X/Twitter).
- Comfortable with digital content but craving something slower, more thoughtful, and more meaningful.

The audience is conscious, engaged, and loyal. They don't just consume — they reflect, share, and return.

### Emotional Experience

When a user visits the KHAT website, they should feel:

- **Calm.** The dark interface, warm ivory text, and generous spacing create a sense of stillness. There is no visual noise, no aggressive popups, no flashing elements.
- **Intellectually stimulated.** The structured episode pages, quotes, and resources invite curiosity and exploration. The user feels they are in a library, not a feed.
- **Respected.** The Arabic-first design, the clean typography, and the absence of manipulative dark patterns communicate that this platform values its audience's intelligence and time.
- **Connected.** Guest stories, community writing, and shareable quotes create a sense of belonging to a community of thoughtful people.
- **Inspired to return.** The depth of content (timestamps, hidden gems, related episodes, curated series) ensures every visit reveals something new.

---

## 2. Website Structure

The KHAT website is organized into public-facing pages, authenticated user areas, and admin-only back office pages. All content is Arabic-first with right-to-left (RTL) layout throughout the entire interface.

### 2.1 Home Page (`/`)

The home page is the heartbeat of the website — a **hybrid feed** that blends structured cards into a social-browsing experience. It is not a landing page with static sections; it is a living, curated stream of content.

**Structure (top to bottom):**

- **Sticky Header**: Logo, global search bar (searches episodes, guests, quotes, articles), and optional sign-in button.
- **Hero Section**: The latest episode displayed as a large featured card with the YouTube thumbnail, episode title, guest name, duration, and a prominent call-to-action button that leads to the full episode page (not to YouTube — this is intentional for SEO and engagement).
- **Continue Watching**: For returning visitors, a horizontal carousel of up to 5 recently viewed episodes with progress indicators, displayed based on localStorage watch history. This section only appears if the user has prior viewing activity.
- **Feed Cards**: A mixed stream of content cards, each designed to drive a specific action (Open, Save, Share, Read, or Subscribe):
  - **Episode cards**: Thumbnail, duration badge, title, guest name, topics, release date, view count.
  - **Quote cards**: Styled blockquotes with copy, share, save, and image-export actions.
  - **Article/Insight cards**: Community writings from Hibr with reading time and reaction counts.
  - **Guest Spotlight cards**: Featured guest profiles linking to their full page.
  - **Sponsored cards**: Admin-managed promotional content, clearly labeled "محتوى مدعوم" (Sponsored Content), with sponsor logo, title, description, and external link.
  - **Banner ads**: Configurable image banners at admin-defined positions in the feed.
- **Hidden Gems Section**: A rotating carousel of lower-view-count episodes that deserve more attention. The selection rotates daily using a seeded random shuffle for consistency, excluding clips under 10 minutes. This ensures quality episodes are resurfaced regardless of YouTube algorithm performance.
- **Platform Links**: Links to YouTube, Apple Podcasts, Spotify, and other listening platforms.
- **Newsletter CTA**: Email signup for the weekly KHAT digest.
- **Mobile Bottom Navigation**: A persistent bottom bar with five tabs — Home, Episodes, Space (حبر), Series, and More/Profile.

**User Interactions:** Every card is actionable. Users can open episodes, save quotes to localStorage, share content via WhatsApp, X/Twitter, or clipboard, read articles, and subscribe to the newsletter. The feed is not infinite-scroll — it is curated and finite, ensuring quality over quantity.

### 2.2 Episodes Hub (`/episodes`)

The central discovery page for all podcast episodes.

**Structure:**

- **Category Filters**: Horizontal row of filter buttons generated from admin-defined sections (e.g., Season 1, Season 2, Clips, Special Episodes). Each button shows the number of episodes in that category. An "All" option shows everything.
- **Sort Controls**: Toggle between "Newest" and "Oldest" ordering.
- **Search**: Global search bar that performs Arabic-normalized search across episode titles, guest names, topics, and descriptions. The search algorithm accounts for Arabic diacritics, alef normalization, taa marbuta, and other linguistic variations.
- **Episodes Grid**: A responsive grid (3 columns on desktop, 2 on tablet, 1 on mobile) displaying episode cards with:
  - YouTube max-resolution thumbnail with hover zoom effect.
  - Duration badge overlaid on the thumbnail.
  - Hover overlay with play button and preview text.
  - Up to 2 topic badges.
  - Episode title (clamped to 2 lines).
  - Guest attribution line ("مع [Guest Name]").
  - Metadata row: release date, view count (Arabic locale), season number.
- **Load More**: Pagination in batches of 9, with a "Load More" button (not infinite scroll) and a counter showing current/total (e.g., "12 / 45").

**Important Detail:** Search results can return both full episodes and matching timestamp chapters, allowing users to find specific moments within conversations. The scoring system weights title matches (+30 points) higher than description matches (+3 points), with bonus points for match position.

### 2.3 Episode Detail Page (`/episodes/[slug]`)

This is the **core value page** of the entire website — the single most important page for delivering non-YouTube value. Every episode detail page is a rich, structured knowledge artifact that goes far beyond what YouTube provides.

**Page Layout (top to bottom):**

1. **Guest Introduction Section**: If the episode features a guest, a large, beautifully styled card appears first showing the guest's photo, bio, social links (Twitter, Instagram, LinkedIn, YouTube, website), and their post-recording testimonial to KHAT. If the guest recorded a testimonial video, it is embedded here as well. A link to the guest's full profile page is provided.

2. **Episode Hero**: The primary content block containing:
   - The episode title as an H1 heading.
   - Metadata row: guest name, release date, duration, season number.
   - Topic badges (clickable, navigating to the episodes page filtered by that topic).
   - Teaser/description text.
   - **YouTube Embed**: The video player using `youtube-nocookie.com` for privacy-enhanced embedding. The player is lazy-loaded (shows thumbnail first, loads iframe on click) to optimize page speed. The player tracks watch progress every 30 seconds, storing it in localStorage for the "Continue Watching" feature on the home page. Start time parameters are supported for timestamp-based links.
   - Share buttons for WhatsApp, X/Twitter, and clipboard copy.

3. **Episode Summary**: A dedicated section with a structured written summary of the conversation — what was discussed, key themes explored, and the emotional arc. This is human-written or AI-assisted text, not auto-generated captions.

4. **Timestamp Chapters**: A clickable list of topic-based chapters with time markers. Clicking a timestamp seeks the YouTube player to that exact moment. Each timestamp entry shows the title of that segment and the time in HH:MM:SS format. This transforms a single long video into a navigable knowledge index.

5. **Quotes Section**: A 2-column grid of the best quotes extracted from the episode. Each quote card supports:
   - **Save** (bookmarks to localStorage with visual toggle).
   - **Copy** (copies the quote text and guest attribution to clipboard).
   - **Share** (uses the browser's native Share API with fallback to clipboard copy).
   - **Image Export** (generates a branded downloadable image using the `modern-screenshot` library with KHAT logo, khatpodcast.com domain, and proper Arabic font rendering — this replaced html2canvas which had poor Arabic support).

6. **Ideas & Key Takeaways**: A 2-column grid showing key ideas (bullet list) and takeaways (numbered list) — 3 to 7 items distilled from the conversation.

7. **Resources Mentioned**: A list of books, articles, and links referenced during the episode. Each resource has an appropriate icon (book, article, external link), opens in a new tab with `rel="noopener noreferrer"`, and links back to the source.

8. **Episode Navigation**: Previous/Next episode links with titles, allowing linear browsing through the catalog.

9. **Related Episodes**: A 3-column grid of recommended episodes based on shared topics, shared guests, or chronological proximity.

**Sharing Behavior (Critical Design Decision):** When users share an episode, the shared link points to the **KHAT website episode page**, not to YouTube. This is intentional. It drives traffic to the owned platform, ensures the rich metadata (summary, timestamps, quotes) is part of the shared experience, and creates proper Open Graph / social card previews that make links look professional on WhatsApp, Twitter, and other platforms.

### 2.4 Guests Directory (`/guests/[slug]` for individual profiles)

The guest directory is accessed through guest cards in the feed and through individual guest profile pages.

**Guest Profile Page:**
- Guest photo (circular avatar with fallback to initials if no photo, configurable ring/glow effects).
- Full bio text.
- Social links (Twitter, Instagram, LinkedIn, YouTube, personal website) rendered as icon buttons.
- **Episodes with this guest**: A grid of all episodes featuring this guest.
- **Key Quotes**: Notable quotes from this guest across all their appearances.
- **Exclusive Testimonial**: A specially styled section with the guest's post-recording message to KHAT — their thoughts on the experience. This is unique content not available anywhere else. Styled as a manuscript-style card (the "Athar Card") with decorative quotation marks, paper grain texture, and fade-in animation.

**Guest Search**: A debounced (300ms) search input that performs Arabic-normalized search across guest names and bios.

### 2.5 KHAT Space / حبر (`/space`)

KHAT Space — rebranded to **حبر** (Hibr, meaning "Ink") to avoid confusion with X/Twitter Spaces — is the community writing platform. The URL paths still use `/space` to avoid breaking links.

This is described in full detail in [Section 7: KHAT Space (Hibr)](#7-khat-space-hibr).

**Key Pages:**
- `/space` — The main feed of articles and thoughts.
- `/space/[id]` — Individual article/thought detail page.
- `/space/write` — The writing editor (requires authentication).
- `/space/author/[id]` — Author profile page showing their contributions.

### 2.6 About Page (`/about`)

The About page introduces the KHAT brand, its mission, and its team.

**Sections:**
- **Host Photo**: A professional photo of the podcast host.
- **Welcome Video**: An introductory video explaining what KHAT is about.
- **Values Section**: The four core values — Authenticity, Depth, Respect, Impact — each with a description.
- **Team Section**: Profiles of the people behind KHAT.
- **Call-to-Action**: Links to listen, subscribe, sponsor, or become a guest.

*Note: Placeholder content needs to be filled in before launch.*

### 2.7 Sponsor Page (`/sponsor`)

The sponsorship page is a business funnel designed to convert potential sponsors into leads.

**Content:**
- Overview of what KHAT is and why it's worth sponsoring.
- Audience demographics and reach metrics.
- Partnership philosophy: "Partnership with Khat is not advertising — it's supporting meaningful dialogue."
- Sponsorship packages and pricing tiers (if applicable).

**Sponsor Inquiry Form:**
- Fields: Company name, contact person, email, phone, company website, budget range (dropdown with ranges: < 5K SAR, 5–10K, 10–25K, 25K+), partnership type (episode sponsorship, series sponsorship, brand integration, other), additional information (textarea).
- All text fields are sanitized using `stripHtml()` before storage.
- Submissions are stored in the `leads` table via Supabase with `type: "sponsor"` and `status: "new"`.

### 2.8 Guest Application Page (`/guest`)

A form for potential guests to apply to appear on the podcast.

**Guest Application Form:**
- Fields: Full name, email, phone (optional), social media links, area of expertise/topic, brief bio, why they want to be a guest, availability notes, and how they heard about KHAT.
- Validated and sanitized before submission.
- Stored in the `leads` table with `type: "guest"` and `status: "new"`.

### 2.9 Series / Collections Page (`/series`)

A curated discovery page that bundles episodes into thematic collections.

**Examples of series/collections:**
- Relationships (العلاقات)
- Emotional Emptiness (الفراغ العاطفي)
- Meaning & Identity (المعنى والهوية)
- Self-Growth (النمو الذاتي)
- Mental Health (الصحة النفسية)

Each collection page shows its bundled episodes, key quotes from those episodes, and related articles — providing a thematic deep-dive experience.

### 2.10 More / Utility Pages (`/more`)

A hub page that links to secondary pages and utility features:

- Settings (notifications, appearance, language, data management).
- Store placeholder ("Coming Soon" with email notification signup).
- Media Kit (shareable, password-protected document with podcast description, host description, vision, values, audience profile, and partnership philosophy — available in both Arabic and English).
- About, Sponsor, and Guest Application links.

### 2.11 Authentication Pages (`/auth/login`)

Authentication is handled via Supabase Auth with three methods:

1. **Google OAuth**: One-click sign-in with Google account.
2. **Email + Password**: Traditional registration and login.
3. **Magic Link**: Passwordless email login via one-time link.

After authentication, users are redirected to their intended destination (defaults to `/space`). The login page uses Arabic UI text throughout ("تسجيل الدخول", "إنشاء حساب", etc.).

### 2.12 Media Kit (`/media-kit/[slug]`)

A shareable, password-protected page containing the KHAT brand kit for potential sponsors and press.

**Content (bilingual Arabic/English):**
- Podcast description.
- Host description.
- Vision statement.
- Core values.
- Audience demographics and description.
- Partnership philosophy.
- Contact information (email, phone, social links).

The media kit is managed through the admin panel and can be shared via a unique slug URL with optional password protection.

---

## 3. User Types & Permissions

### 3.1 Visitor (Anonymous)

A visitor is anyone who lands on the website without being logged in. This is the majority of traffic.

**Can do:**
- Browse all public pages: home feed, episodes, episode details, guests, series, about, sponsor, guest application.
- Watch embedded YouTube videos on episode pages.
- Use global search across episodes, guests, and timestamps.
- Read published articles and thoughts in KHAT Space (حبر).
- View published quotes on episode pages.
- Copy quotes to clipboard.
- Share episodes, quotes, and articles via WhatsApp, X/Twitter, and clipboard.
- Export quote images with KHAT branding.
- Submit sponsor inquiry and guest application forms.
- Use localStorage features: save episodes, save quotes, track watch progress, continue watching.

**Cannot do:**
- Write articles or thoughts in KHAT Space.
- Like, comment, or react to community content.
- Report inappropriate content.
- Access any admin functionality.

### 3.2 Reader (Authenticated User, New)

A reader is an authenticated user who has signed up but has fewer than 3 approved posts. Their content goes through full moderation review before being published.

**Can do (everything a Visitor can, plus):**
- Create articles and thoughts in KHAT Space (all content enters moderation queue).
- Like articles, thoughts, comments, and replies.
- React to articles with emoji reactions (clap, fire, bulb, heart).
- Bookmark articles.
- Comment on articles (comments are moderated).
- Reply to thoughts (replies are moderated).
- Report inappropriate content (rate limited to 10 per day).
- Manage their own drafts (save, edit, delete).
- Follow other authors.

**Restrictions:**
- All created content enters the "pending" moderation queue regardless of content quality, because they haven't yet established trust.
- Rate limited: 5 articles/hour, 20 thoughts/hour, 30 comments/hour, 100 likes/hour.

### 3.3 Contributor (Authenticated User, Trusted)

A contributor is an authenticated user with 3 or more approved posts. The system trusts them to publish directly (unless AI moderation flags their content).

**Can do (everything a Reader can, plus):**
- Publish articles and thoughts that are **auto-approved** (bypasses admin review queue) — unless local profanity/spam detection or AI moderation flags the content.

**How trust is determined:** When a user submits content, the moderation system checks `profiles.article_count` or equivalent metric. If the user has 3+ approved pieces of content, their new submissions are auto-approved as long as they pass local checks and AI moderation.

### 3.4 Guest (Podcast Guest)

A guest is a person who has appeared on the KHAT podcast. Guests do not have user accounts on the website — their profiles are managed by the admin.

**What the admin manages for a guest:**
- Full name and URL-friendly slug.
- Biography text.
- Profile photo URL.
- External social links (Twitter, Instagram, LinkedIn, YouTube, personal website).
- Post-recording testimonial (text message about their experience on KHAT).
- Optional testimonial video URL.
- Episode assignments (which episodes feature this guest).

**Public visibility:** Guests have public profile pages showing their bio, social links, all their episodes, their quotes, and their exclusive testimonial. Guest names appear as attributions throughout the site — on episode cards, in quotes, and in the feed.

### 3.5 Admin

The admin has full control over the entire platform through the admin dashboard at `/admin`.

**Permissions include:**
- **Episode Management**: Add episodes via YouTube URL, auto-fetch metadata, edit titles/summaries/descriptions, manage timestamps/chapters, curate quotes, attach resources, link guests, organize episodes into sections/seasons, hide or delete episodes, publish/unpublish.
- **Studio**: Full AI-assisted episode processing pipeline (transcript upload, AI generation of titles/descriptions/timestamps/clips/SEO keywords/hashtags, website package generation, push to live site).
- **Guest Management**: Create, edit, and delete guest profiles. Assign guests to episodes. Manage guest social links and testimonials.
- **Content Moderation**: Review pending articles/thoughts/comments from KHAT Space. Approve, reject, hide, unhide, edit, or delete any community content. View and resolve reports. All moderation actions are logged in an audit trail.
- **Ads Management**: Configure sponsored cards and banner ads (enable/disable, set content, images, URLs). Managed through `config/ads.json`.
- **Media Kit**: Edit bilingual (Arabic/English) media kit content. Configure shareable links with optional password protection.
- **Settings**: Configure theme (dark/light/system), moderation settings (enable/disable AI moderation), and other platform settings.
- **Submissions Inbox**: View sponsor inquiries and guest applications.
- **Episode Sections**: Create and manage organizational sections (seasons, collections), assign episodes to sections, set display order, hide sections.
- **Quotes Management**: Generate, edit, hide, and publish quotes per episode.
- **YouTube Packs**: Generate and manage YouTube marketing content (alternative titles, descriptions, timestamps, hashtags, clips, tweet suggestions) per episode.

**Admin access is controlled by the `profiles.is_admin` boolean field in the database.** There is no multi-tier admin role system — a user is either admin or not.

---

## 4. Episode System

### 4.1 Overview

Episodes are the central content type of the KHAT platform. Each episode is a YouTube-hosted video conversation that is enriched on the KHAT website with structured metadata, AI-assisted content, and editorial curation.

The philosophy is that every episode on YouTube becomes a **multi-layered knowledge artifact** on the website, offering value that YouTube alone cannot provide: structured summaries, navigable chapters, extractable quotes, linked resources, and guest context.

### 4.2 YouTube Integration

Episodes originate from the KHAT YouTube channel. The system fetches video data through the YouTube Data API:

**Auto-fetched from YouTube:**
- Video ID, title, description, thumbnail URL (max resolution).
- Duration (parsed from ISO 8601 format to minutes).
- Publication date.
- View count.
- Channel playlist membership.

**Intelligent Auto-Detection:**
- **Episode Number**: Parsed from title using patterns: `#123`, `EP123`, `حلقة 123`, or similar Arabic/English numbering formats.
- **Guest Name**: Extracted from title using patterns: `مع فلان` (with someone), `| فلان`, `- فلان`. This allows automatic guest attribution even before the admin manually assigns a guest.
- **URL Slug**: Auto-generated from the episode title with proper Arabic-to-URL-safe transliteration.

**Data Sources:**
- Primary: Channel uploads playlist (fetches all public videos).
- Secondary: Extra playlists (for unlisted or specially organized videos).

### 4.3 Episode Page Content (The Knowledge Layer)

Each episode page is composed of multiple content layers, each adding unique value:

**Layer 1 — Summary & Takeaways:**
A structured written summary of the conversation (paragraph format) plus 3–7 key takeaways as bullet points. This is the "executive summary" of a potentially hours-long conversation. It tells a visitor what they'll learn before they invest time watching.

**Layer 2 — Timestamp Chapters:**
A series of topic-based time markers that transform the episode into a navigable index. Each chapter has a title (e.g., "حديث عن الوحدة والفراغ العاطفي" — "Discussion on loneliness and emotional emptiness") and a clickable timestamp. Clicking seeks the embedded YouTube player to that moment. This is critical for SEO (Google can index individual topics within episodes) and for user experience (jump to the part that matters).

**Layer 3 — Quotes:**
The most memorable, shareable, and impactful lines from the conversation. Quotes are extracted (either manually or via AI), attributed to the speaker (guest or host), tagged with themes, and presented in a grid with full interaction capabilities (save, copy, share, image export).

**Layer 4 — Resources:**
Books, articles, links, and tools mentioned during the conversation. Each resource is typed (book, article, link), has a title and URL, and links back to the episode(s) where it was referenced. Over time, this creates a cross-episode knowledge library.

**Layer 5 — Guest Context:**
If the episode features a guest, their full profile is displayed: bio, social links, testimonial, and links to their other episodes on KHAT.

**Layer 6 — Discovery:**
Related episodes (by topic or guest), previous/next episode navigation, and the "Hidden Gems" system that surfaces quality lower-view episodes.

### 4.4 AI-Assisted Metadata Generation

Through the Studio system (described in Section 5), AI (powered by OpenAI GPT) assists in generating:

- **Episode summaries** and key takeaways.
- **Timestamp chapters** derived from transcript analysis.
- **SEO keywords** and hashtags.
- **Clip suggestions** (notable moments worth extracting as short-form content).
- **Alternative titles** optimized for different platforms (YouTube, social media).
- **Tweet suggestions** and social media copy.

All AI-generated content is presented to the admin for review and editing before publication. The AI is an assistant, not an autonomous publisher.

### 4.5 Episode Organization

Episodes are organized through a flexible section system:

- **Sections**: Admin-defined categories like "Season 1," "Season 2," "Clips," "Special Episodes," etc. Each section has a label, display order, optional color, and visibility toggle.
- **Assignments**: Each episode can be assigned to one section.
- **Visibility Controls**: Individual episodes can be hidden or deleted from the website without affecting YouTube. Entire sections can be hidden.
- **Overrides**: Episode titles and descriptions can be overridden on the KHAT website without changing the YouTube original. This allows platform-specific optimization.

### 4.6 Episode Data Storage

Episode data is assembled from multiple sources at render time:

1. **YouTube API**: Base video metadata (title, thumbnail, duration, views, date).
2. **Episode Sections Config** (`config/episode-sections.json`): Section assignments and visibility.
3. **Episode Overrides** (`config/episode-overrides.json`): Custom title/description replacements.
4. **Episode Enrichments** (`config/episode-enrichments.json`): Additional metadata fields (summary, takeaways, etc.).
5. **Episode Quotes** (`config/episode-quotes.json`): Published quotes per episode.
6. **Episode Guest Assignments** (`config/episode-guest-assignments.json`): Manual guest-to-episode links.
7. **YouTube Packs** (`config/youtube-packs.json`): Generated marketing content per episode.

This multi-source architecture allows incremental enrichment — an episode can be published with just YouTube data and progressively enhanced with summaries, timestamps, quotes, and resources over time.

---

## 5. Studio (Admin Panel)

### 5.1 Overview

The Studio is the internal admin dashboard for managing all KHAT content. It is accessible at `/admin` and requires admin-level authentication (`profiles.is_admin = true`).

The Studio is designed around a core workflow: **Take a YouTube video and transform it into a fully enriched, publish-ready episode page with minimal manual effort.**

### 5.2 Admin Dashboard Home (`/admin`)

The dashboard landing page provides a quick overview and navigation to all admin areas:

- **Episode Management** — Add, edit, organize episodes.
- **Studio** — AI-powered episode processing pipeline.
- **Guest Management** — Create and manage guest profiles.
- **Submissions** — View sponsor and guest application form submissions.
- **Moderation** — Review flagged and pending community content.
- **Ads** — Configure sponsored cards and banner ads.
- **Media Kit** — Edit and share the KHAT brand kit.
- **Settings** — Theme, moderation config, and platform settings.
- **Refresh Button** — Trigger revalidation of cached data across the site.

### 5.3 The Studio Workflow (`/admin/studio`)

The Studio is the most sophisticated part of the admin system. It implements a multi-step pipeline to process episodes from raw YouTube content to fully enriched website pages.

**Step 1 — Create a Studio Session:**
The admin creates a new session by providing either:
- A **YouTube URL** — The system auto-fetches the video ID, title, thumbnail, and duration.
- An **Audio File** — For content not yet on YouTube. Audio is uploaded, validated (format/size checks via `lib/upload-validation.ts`), and stored in `data/studio-audio/`.

Each session has a status, source type, and tracks all generated content.

**Step 2 — Transcript:**
The admin provides a transcript through one of three methods:
- **YouTube Captions**: Auto-fetched using the YouTube InnerTube API (no API key needed). Supports auto-generated and manual captions. Prefers Arabic captions with fallback to other languages. The fetcher handles srv3 XML format and plain text format, cleans noise markers ([music], [applause]), deduplicates repeated lines, and normalizes Arabic text.
- **Whisper Transcription**: For audio uploads, the system uses OpenAI's Whisper API to transcribe audio to text. Supports Arabic language. Max duration of 600 seconds processing time.
- **Manual Upload**: The admin can paste or upload a transcript manually.

**Step 3 — AI Generation:**
Using the transcript, the system sends a structured prompt to OpenAI GPT to generate:
- **Episode Summary**: A concise, structured summary of the conversation.
- **Key Takeaways**: 3–7 bullet points distilling the main insights.
- **SEO Keywords**: Search-optimized terms related to the episode content.
- **Hashtags**: Social media hashtags for promotion.
- **Clip Suggestions**: Notable moments with timestamps worth extracting as short-form content, each with a title, excerpt, and start/end time.
- **Chapter Suggestions**: Topic-based timestamp chapters for navigation.

The AI output is versioned (`STUDIO_PROMPT_VERSION = "v1"`) to track which prompt version generated the content.

**Step 4 — Review & Edit:**
The Studio presents all AI-generated content in organized tabs for the admin to review and edit:

- **Timestamps Tab**: Edit chapter titles and times. Add/remove chapters.
- **Clips Tab**: Review suggested clips with titles, excerpts, and timestamps. Edit or discard.
- **SEO & Topics Tab**: Edit SEO keywords, hashtags, and topic assignments.
- **YouTube Pack Tab**: Review generated YouTube marketing content (alternative titles, descriptions, timestamps, hashtags, tweet suggestions). Copy to clipboard for use on YouTube.
- **Site Pack Tab**: Prepare the website package — summary, takeaways, timestamps, quotes, and resources that will appear on the episode page.
- **Export Tab**: Push the finalized content to the live website.

All fields use inline-editable components — the admin can click on any piece of text, edit it, and save with debounced auto-save.

**Step 5 — Website Package Generation:**
Once the admin is satisfied with the AI output, they generate a "Website Package" containing:
- Title, summary, and key takeaways.
- Timestamps (formatted as HH:MM:SS with labels).
- Quotes (extracted from notable transcript moments).
- Resources (books, articles, and links mentioned).
- Topics (thematic tags).

**Step 6 — Push to Live:**
The admin pushes the finalized website package to the live site. This:
- Saves episode enrichments to `config/episode-enrichments.json`.
- Saves quotes to `config/episode-quotes.json`.
- Updates episode overrides if the title was customized.
- Logs the push action in `config/studio-push-log.json`.

The push is non-destructive — it can be re-done to update content without losing previous data.

### 5.4 Episode Management (`/admin/episodes`)

Beyond the Studio, the admin can directly manage episodes:

- **Episode Listing**: View all episodes with search, filtering by section, and sorting.
- **Episode Detail Editing** (`/admin/episodes/[id]`): Edit individual episode fields — title override, custom description, summary, takeaways, guest assignment, topic tags, section assignment, visibility (show/hide/delete), featured flag.
- **Quotes Management**: Per-episode quotes editor with add, edit, hide, and delete actions.
- **Section Management**: Create sections (seasons, collections), assign episodes to sections, set display order, manage section visibility.
- **YouTube Pack Actions**: Generate and manage YouTube marketing content per episode using transcript data and AI.

### 5.5 Guest Management (`/admin/guests`)

- **Guest Listing**: View all guests with search.
- **Create Guest**: Name, slug (auto-generated from name), bio, photo URL, social links, testimonial text.
- **Edit Guest**: Update any field.
- **Assign Guest to Episode**: Link a guest to one or more episodes. This overrides the auto-detected guest name from the YouTube title.
- **Delete Guest**: Remove a guest profile.

### 5.6 Content Moderation (`/admin/moderation`)

The moderation panel has three tabs:

1. **Pending**: Content from new/untrusted users awaiting review. Admin can approve, reject, or edit.
2. **Flagged**: Content auto-flagged by the profanity filter, spam detection, or AI moderation. Admin can approve (false positive), reject, or delete.
3. **Reports**: User-submitted reports of inappropriate content. Admin can resolve (take action on the content) or dismiss (mark as invalid report).

All moderation actions are logged in `hibr_moderation_log` with moderator ID, action type, target, reason, and timestamp — creating a complete audit trail.

### 5.7 Ads Management (`/admin/ads`)

Two ad formats are configurable:

1. **Sponsored Card**: A styled content card that appears in the home feed. Configurable fields: sponsor name, logo URL, title, description, destination URL, and image URL. Toggle enabled/disabled.
2. **Banner Ad**: An image banner that can be placed at various positions. Configurable fields: image URL, destination URL, alt text. Supports sizes: small (90px), medium (120px), large (250px). Toggle enabled/disabled.

Both are stored in `config/ads.json` and are server-rendered (no client-side ad scripts).

### 5.8 Media Kit Management (`/admin/media-kit`)

Edit bilingual content for the KHAT brand kit:
- Podcast description (AR/EN).
- Host description (AR/EN).
- Vision statement (AR/EN).
- Core values (AR/EN).
- Audience description (AR/EN).
- Partnership philosophy (AR/EN).
- Contact email and phone.
- Social links.
- Shareable link configuration (slug, password protection).

---

## 6. Guest System

### 6.1 Overview

Guests are central to KHAT's identity. Each guest brings their own story, audience, and credibility to the podcast. The guest system is designed to give every guest a permanent, dignified presence on the KHAT website — both as a gesture of respect and as an SEO / discovery tool.

### 6.2 Guest Profile Structure

Each guest profile contains:

- **Name** (full name in Arabic).
- **Slug** (URL-friendly version for the guest page URL, e.g., `/guests/mohammed-al-shami`).
- **Bio** (paragraph-length biography describing who the guest is, their expertise, and their significance).
- **Photo URL** (circular avatar with fallback to a gradient background with the guest's initials if no photo is provided; supports multiple sizes: sm, md, lg, xl, 2xl).
- **External Links** (a key-value map of social platform names to URLs: Twitter, Instagram, LinkedIn, YouTube, personal website, etc.).
- **Testimonial** (an exclusive post-recording message from the guest to KHAT — their reflections on the conversation, formatted as an elegant manuscript-style card).
- **Testimonial Video URL** (optional YouTube link to a recorded testimonial message).

### 6.3 Guest-Episode Linking

Guests are linked to episodes through two mechanisms:

1. **Auto-Detection**: When episodes are fetched from YouTube, the system parses the video title for guest name patterns (e.g., "مع محمد الشامي", "| Mohammed Al Shami"). This provides initial guest attribution even without manual configuration.

2. **Admin Assignment**: The admin can explicitly assign a guest to an episode via `config/episode-guest-assignments.json`. Admin assignments always take precedence over auto-detection. This handles cases where the title format doesn't match auto-detection patterns or where the guest was detected incorrectly.

A guest can appear on multiple episodes, and their profile page shows all of their appearances.

### 6.4 The Athar Card (أثر)

The "Athar Card" is a specially designed component that displays guest testimonials in a manuscript-like aesthetic. The Arabic word "أثر" means "impact" or "trace" — fitting for a guest's lasting impression.

**Visual Design:**
- Decorative quotation mark watermark in the background.
- Paper grain texture overlay for a physical, tactile feeling.
- Intersection Observer-based fade-in animation as the card scrolls into view.
- Arabic date formatting for when the testimonial was given.
- Two modes: compact (admin preview) and full (public display).

### 6.5 Guest Discovery

Guests are discoverable through:
- The Guests Directory page with Arabic-normalized search.
- Guest Spotlight cards in the home feed.
- Guest Introduction sections at the top of each episode page.
- Guest attribution on episode cards in the grid.
- Quote attributions throughout the site.

---

## 7. KHAT Space (Hibr)

### 7.1 Overview

KHAT Space — branded as **حبر** (Hibr, "Ink") — is a community-driven Arabic writing platform integrated into the KHAT website. It enables authenticated users to create, share, and engage with long-form articles and micro-posts (thoughts). The platform is designed with a quality-first philosophy: content is moderated before (or shortly after) publication, interactions are meaningful (not superficial), and the writing experience is clean and distraction-free.

Hibr is not a comments section. It is a space where KHAT's audience can express their own reflections, insights, and creative writing — inspired by the podcast's themes.

### 7.2 Content Types

**Articles (Long-Form):**
- Title, content (rich HTML with allowed tags: p, br, strong, em, ul, ol, li, h2, h3, blockquote, a), and auto-generated excerpt (300 characters max).
- Up to 5 topic tags per article.
- Optional episode association (linking the article to a specific KHAT episode, creating "episode companion" pieces).
- Auto-calculated reading time based on word count.
- Cover image (optional).
- Interactions: likes, comments (500 char max), emoji reactions (clap, fire, bulb, heart), bookmarks.

**Thoughts (Micro-Posts):**
- Plain text only, maximum 280 characters (enforced at the database level).
- Optional topic tags.
- Interactions: likes, replies (280 char max).
- Can be captured as branded images using the `modern-screenshot` library — creating shareable quote-like images with KHAT branding.

### 7.3 The Writing Experience (`/space/write`)

The writing editor requires authentication and provides:

- **Title Input**: Clean, large text input for the article title.
- **Content Editor**: A textarea with preview toggle (write/preview modes). Content supports basic HTML formatting.
- **Tag Selection**: Choose from predefined tags or add custom ones (up to 5).
- **Episode Linking**: Optional dropdown to associate the article with a specific KHAT episode.
- **Draft System**: Auto-save to drafts (both localStorage and server-side via API). Drafts can be loaded, edited, and deleted. Up to 10 local drafts supported.
- **Preview Mode**: Toggle between writing and seeing how the article will look when published.
- **Submit for Review**: When ready, submit the article for publication. New users' content enters the moderation queue; trusted users' content is auto-approved (unless flagged).

### 7.4 Moderation Workflow

The moderation system is a multi-layered pipeline that balances creative freedom with platform safety:

**Layer 1 — Local Validation (Synchronous, Instant):**
- **Profanity Filter**: Checks against a combined Arabic and English bad word list. Content containing profanity is immediately rejected with a clear error message.
- **Spam Detection**: Flags content with more than 3 URLs, excessive character repetition (e.g., "ههههههههههه"), or excessive word repetition. Flagged content enters the moderation queue.

**Layer 2 — AI Moderation (Asynchronous, Optional):**
- Uses OpenAI's Moderation API to analyze content for: hate speech, harassment, threats, self-harm content, sexual content, and violence.
- Three verdicts:
  - **Clean**: Content passes. Combined with Layer 3 trust check.
  - **Suspicious** (moderate scores): Content enters moderation queue for admin review.
  - **Harmful** (high scores, > 0.7 threshold): Content is immediately blocked with a 422 error asking the user to edit.
- AI moderation can be disabled via admin settings if needed.
- Falls back gracefully to "clean" if the OpenAI API key is missing or the API call fails — local moderation still protects the platform.

**Layer 3 — Trust-Based Auto-Approval:**
- **New users** (fewer than 3 approved posts): All content enters the "pending" moderation queue regardless of content quality. This prevents new account abuse.
- **Trusted users** (3+ approved posts): Content that passes Layers 1 and 2 is auto-approved and immediately visible.

**Status Workflow:**
```
User Submits Content
    |
    v
Local Checks (Profanity / Spam)
    |-- FLAGGED --> Status: "auto_flagged" (blocked, ask user to edit)
    |-- PASS --> AI Check (if enabled)
         |-- HARMFUL --> Status: "auto_flagged" (blocked)
         |-- SUSPICIOUS --> Status: "pending" (admin queue)
         |-- CLEAN
              |-- New User (<3 approved posts) --> Status: "pending" (admin queue)
              |-- Trusted User (3+ approved posts) --> Status: "approved" (auto-published)
```

**Admin Actions:**
- **Approve**: Move content to "approved" status (visible to all).
- **Reject**: Move to "rejected" (hidden from public, author can still see).
- **Hide**: Soft-hide (author can see, public cannot).
- **Unhide**: Restore hidden content.
- **Edit**: Admin can modify content and auto-approve.
- **Delete**: Soft delete (sets `deleted_at` timestamp; content is not permanently removed).

Every admin action is logged in the `hibr_moderation_log` table with: moderator ID, action type, target type, target ID, reason, and timestamp. This audit trail ensures accountability and allows review of moderation decisions.

### 7.5 Content Reporting

Any authenticated user can report content they find inappropriate. Reports require:
- Target type (article, thought, comment, or reply).
- Reason (spam, harassment, inappropriate, misinformation, or other).
- Optional details text.

Reports are rate-limited to 10 per day per user. Duplicate reports (same user + same content) are prevented. Reports appear in the admin moderation panel under the "Reports" tab with status tracking (pending, reviewed, resolved, dismissed).

### 7.6 Rate Limiting

To prevent spam and abuse, all user actions are rate-limited:

| Action | Limit |
|--------|-------|
| Create Article | 5 per hour |
| Create Thought | 20 per hour |
| Create Comment | 30 per hour |
| Create Report | 10 per day |
| Toggle Like | 100 per hour |

Rate limits are stored in the `rate_limits` table (per user, per action, with timestamp) for authenticated users, and in-memory for IP-based public endpoints. In-memory storage auto-cleans every 5 minutes to prevent memory leaks.

### 7.7 Feed System

The Space feed (`/space`) displays articles and thoughts in a unified stream.

**Sorting Options:**
- **Newest** (default): Cursor-based pagination by creation date, descending.
- **Popular**: Offset-based pagination, sorted by likes then date.
- **Discussed**: Offset-based pagination, sorted by comments/replies count then date.

**Featured Display:**
- First featured item: Large hero layout with image and full card.
- Next 2 featured items: 2-column grid layout.
- Regular items: Standard card list below.

**Filtering:**
- By topic tag.
- By author.

### 7.8 Interactions

- **Likes**: Toggle like/unlike on any content type (articles, thoughts, comments, replies). Polymorphic via `target_type` + `target_id`.
- **Emoji Reactions**: Article-specific reactions: clap (تصفيق), fire (نار), bulb (فكرة), heart (قلب). One of each type per user per article.
- **Comments**: Up to 500 characters on articles. Go through full moderation pipeline.
- **Replies**: Up to 280 characters on thoughts. Go through full moderation pipeline.
- **Bookmarks**: Save articles for later reading (stored per user).
- **Follows**: Follow other authors to see their content.
- **Share**: Native share API with clipboard fallback.

### 7.9 Dual Storage Architecture

Hibr operates in two modes controlled by the `NEXT_PUBLIC_HIBR_USE_DB` feature flag:

- **Mock Mode** (`false`, default): Uses localStorage and in-memory mock data. Includes 5 regular mock authors and 5 bot authors that generate seed content (articles, thoughts, comments) to populate the feed. This mode is used for development and demo purposes.
- **Database Mode** (`true`): Uses Supabase with full relational database, Row Level Security, and server-side storage. This is the production mode.

The transition from mock to database mode requires:
1. Running the database migration: `supabase/migrations/001_hibr_tables.sql`.
2. Enabling the feature flag.
3. Optionally seeding initial community data.

---

## 8. SEO & Growth Philosophy

### 8.1 Why the Website Exists Beyond YouTube

YouTube is a discovery engine — it introduces new viewers to KHAT through recommendations and search. But YouTube does not let KHAT **own** its audience. Subscribers can be lost to algorithm changes. Videos are ephemeral in the feed. There is no way to structure content as a searchable knowledge base.

The KHAT website exists to:

1. **Own the audience relationship.** Email subscribers and direct visitors belong to KHAT, not to YouTube's algorithm.
2. **Create a searchable knowledge base.** Structured summaries, timestamps, quotes, and resources make each episode's content discoverable by search engines long after the video is published.
3. **Enable content recycling.** A single 2-hour episode becomes dozens of SEO-indexable pages: the episode page, individual timestamp links, quote pages, guest profile pages, and related articles.
4. **Build a premium brand.** The website's design, depth, and community convey quality and intentionality that a YouTube channel page cannot.
5. **Enable business funnels.** Sponsor inquiries, guest applications, newsletter signups, and media kit distribution all require an owned platform.

### 8.2 How the Website Increases Episode Longevity

On YouTube, most views happen in the first 48 hours. On the KHAT website:

- **Timestamps create evergreen entry points.** Someone searching "كيف تتعامل مع الفراغ العاطفي" (how to deal with emotional emptiness) might land on a specific chapter within an episode, not the episode as a whole. This creates long-tail traffic.
- **Summaries and takeaways create standalone value.** A Google search for a concept discussed in an episode can land on the summary, which then drives video views.
- **Quotes are social media fuel.** Branded quote images shared on Instagram, Twitter, and WhatsApp include the website URL, driving backlinks and traffic.
- **Guest profiles attract cross-audience traffic.** When a guest shares their KHAT profile page with their own audience, it drives new visitors who discover the broader KHAT ecosystem.
- **Related episodes create internal journeys.** A visitor who arrives for one episode discovers related episodes, curated series, and community writing — turning a single-page visit into a multi-page session.

### 8.3 How Content Becomes Searchable

The website's SEO foundation includes:

- **Clean URLs**: `/episodes/[slug]`, `/guests/[slug]`, `/space/[id]` — human-readable, keyword-rich.
- **Structured Metadata**: Each page has proper title tags, meta descriptions, and Open Graph / Twitter Card tags for rich social previews.
- **Arabic-First Optimization**: The site is fully RTL with proper `lang="ar"` attributes, allowing Arabic search engines to correctly index and rank the content.
- **AI-Generated SEO Keywords**: The Studio generates SEO keywords and hashtags per episode, which can be used in meta tags and structured data.
- **Content Density**: Each episode page contains hundreds of words of structured text (summary, takeaways, timestamps, quotes, resources) — far more indexable content than a YouTube video page provides.
- **Internal Linking**: Related episodes, guest profiles, topic-based collections, and cross-references between articles and episodes create a rich internal link graph that search engines favor.

### 8.4 Website and Social Media Relationship

The KHAT website sits at the center of a content distribution ecosystem:

- **YouTube**: Primary video hosting and discovery. Episode pages embed YouTube videos but add value beyond the video.
- **Instagram / TikTok**: Branded quote images (generated from the website) and clip highlights drive traffic back to the website.
- **X/Twitter**: Share buttons on every episode, quote, and article create easy one-click sharing. Tweet suggestions are generated in the Studio.
- **WhatsApp**: Share buttons optimized for WhatsApp sharing (common in Arabic-speaking markets). Links include rich previews.
- **Apple Podcasts / Spotify**: Platform links in the footer and home page for audio listeners.
- **Newsletter**: Email digest drives repeat visits and deepens the audience relationship beyond social media algorithms.

---

## 9. Design Philosophy

### 9.1 The Emotional Intention

The KHAT website is designed to feel like entering a **quiet, well-curated library** — not a social media feed, not a news site, not a marketplace. The design serves the content, not the other way around.

The emotional goals of every design decision are:

- **Stillness over stimulation.** Dark backgrounds, minimal motion, generous whitespace. The user's eye rests; it is not chased.
- **Warmth over coldness.** Ivory text on charcoal (not harsh white on black). Gold accents that feel luxurious but not gaudy. The palette evokes candlelight, old paper, and ink.
- **Clarity over cleverness.** Typography is clean and highly readable. Arabic text is given proper spacing and line heights. No decorative fonts — just well-chosen, modern Arabic typefaces.
- **Depth over noise.** Content is layered (summary, timestamps, quotes, resources) but never cluttered. Information is progressively disclosed, not dumped on the user at once.
- **Respect over manipulation.** No popups, no countdown timers, no aggressive CTAs, no dark patterns. The user is trusted to explore at their own pace.

### 9.2 Color Palette

The design uses a carefully chosen dark color palette inspired by late-night study sessions — the kind of atmosphere where deep conversations happen naturally.

| Token | Hex Code | Usage |
|-------|----------|-------|
| **Background** | `#0B0F14` | The deepest layer. Page background. Near-black with a subtle blue undertone that prevents it from feeling lifeless. |
| **Surface / Card** | `#121A23` | Card backgrounds, modal backgrounds, and any elevated content area. Slightly lighter than the background to create depth without harsh contrast. |
| **Elevated** | `#182332` | Elements that sit above cards — tooltips, dropdowns, hover states. Creates a layered, three-dimensional feel. |
| **Border** | `#223041` | Subtle borders that separate elements without demanding attention. Never harsh. |
| **Text Primary** | `#F3EDE2` | Main body text and headings. Warm ivory (not pure white) to reduce eye strain and evoke the feeling of aged paper. |
| **Text Secondary** | `#B8B1A6` | Secondary text, descriptions, and metadata. Muted but still readable. |
| **Text Muted** | `#8E8A84` | Tertiary text — timestamps, captions, labels. Visible but understated. |
| **Gold Accent** | `#C9A24A` | The primary brand accent. Used sparingly for CTAs, active states, highlights, and interactive elements. Evokes luxury, wisdom, and the tradition of Arabic calligraphy. |
| **Purple Signature** | `#6A4C93` | A secondary accent for special elements — badges, tags, or visual variety. Complements the gold without competing. |

### 9.3 Typography

- **Arabic-First**: All type sizing, line heights, and spacing are optimized for Arabic script first, with Latin text as secondary consideration.
- **RTL Layout**: The entire interface is right-to-left, from navigation to content flow to form layouts.
- **Clean Sans-Serif**: A modern Arabic sans-serif typeface that is highly readable at small sizes and elegant at large sizes. Avoids decorative or calligraphic fonts that sacrifice readability.
- **Generous Line Heights**: Arabic text requires more vertical space than Latin text. Line heights are set to accommodate diacritics and ensure readability.
- **Responsive Typography**: Font sizes scale gracefully from mobile (where most users browse) to desktop.

### 9.4 Component Design Language

- **Cards**: Rounded corners, subtle borders (`border-primary/30`), with hover states that include shadow elevation and border color shift. Cards never feel "boxy" — they feel like floating pages.
- **Buttons**: Primary buttons use the gold accent. Secondary buttons are outlined. Destructive actions use a muted red. All buttons have accessible sizes and touch targets.
- **Badges**: Small, pill-shaped labels for topics, categories, and status indicators. Use purple for categories and gold for featured/premium content.
- **Dialogs / Modals**: Centered, with backdrop blur, used sparingly. Never for interruptive advertising.
- **Toast Notifications**: Non-intrusive notifications for save, copy, share, and form submission confirmations. Appear briefly and auto-dismiss.
- **Inputs**: Clean, borderless-looking inputs with subtle bottom borders that become gold on focus. Placeholder text in muted tone.

### 9.5 Iconography

The website uses the Lucide icon library supplemented by custom SVG icons for social platforms:

**Custom Social Icons:**
Discord, Facebook, Pinterest, Snapchat, SoundCloud, Spotify, Telegram, Threads, TikTok, Twitch, WhatsApp.

These custom icons ensure consistent styling with the design system while accurately representing each platform's brand.

### 9.6 Mobile-First Design

The website is designed mobile-first, as the majority of the Arabic-speaking audience accesses content from smartphones.

- **Mobile Bottom Navigation**: A persistent 5-tab navigation bar (Home, Episodes, Space, Series, More) with icons and Arabic labels.
- **Touch-Friendly**: All interactive elements have minimum 44px touch targets.
- **Responsive Grid**: Episode grids adapt from 1 column (mobile) to 2 columns (tablet) to 3 columns (desktop).
- **Viewport Fix**: A dedicated viewport fix component handles iOS Safari's dynamic viewport height issues, ensuring full-screen layouts work correctly.
- **Optimized Thumbnails**: YouTube thumbnails lazy-load with proper aspect ratios to prevent layout shift.

---

## 10. Technical Summary

*This section describes the architecture at a high level without code. It is intended to help an AI system understand how the pieces fit together and what constraints exist.*

### 10.1 Frontend

The KHAT website is built with **Next.js** (App Router) and **TypeScript**. The App Router provides:

- **Server Components**: Most pages are server-rendered for optimal performance and SEO. Episode pages, guest profiles, and the home feed are all server-rendered with data fetched at request time.
- **Client Components**: Interactive elements (video player, search, form inputs, localStorage-dependent features like watch history and saves) use client-side React components.
- **Styling**: **Tailwind CSS** with a custom component system (using shadcn/ui as a base). The design tokens (colors, spacing, typography) are defined in CSS custom properties and Tailwind config.
- **State Management**: React Context for auth state and episode player context. localStorage for user preferences, watch history, saves, bookmarks, and drafts.

### 10.2 Database

The database is **PostgreSQL** hosted on **Supabase**. The schema covers:

- **KHAT Space (Hibr)**: `hibr_articles`, `hibr_thoughts`, `hibr_comments`, `hibr_replies`, `hibr_drafts`, `hibr_likes`, `hibr_follows`, `hibr_bookmarks`, `hibr_reactions`, `hibr_reports`, `hibr_moderation_log`, `rate_limits`.
- **Profiles**: `profiles` table with `is_admin`, `is_banned`, display name, avatar, and article count fields.
- **Studio**: `studio_sessions`, `studio_transcripts`, `studio_ai_outputs`, `studio_chapters`, `studio_clips`, `studio_website_packages` (covered by migrations 002–006).
- **Leads**: Sponsor inquiries and guest applications.

**Security**: Row Level Security (RLS) is enabled on all tables. Policies enforce that:
- Users can only read published, non-deleted, approved/pending content.
- Users can only modify their own content (articles, thoughts, drafts, likes, bookmarks).
- Admins can read and modify all content.
- Reports are insert-only for users, read/update-only for admins.
- Moderation logs are insert/read-only for admins.

An `is_admin()` database function checks the `profiles` table for admin status. A trigger auto-creates profile rows on user signup. An `update_updated_at()` trigger automatically maintains `updated_at` timestamps.

### 10.3 Content Management

Content is managed through a **hybrid system**:

- **YouTube API**: Base episode metadata is fetched from YouTube automatically.
- **JSON Config Files**: Episode enrichments, overrides, quotes, guest assignments, sections, ads settings, and media kit content are stored in JSON files under `config/`. These files are managed through the admin UI via Server Actions and API routes.
- **Supabase Database**: Community content (articles, thoughts), user profiles, moderation data, studio sessions, and form submissions are stored in Supabase.

This hybrid approach means the core podcast content (episodes, quotes, guests) can operate without a database connection (using JSON files and YouTube API), while community features and admin workflows use the full database.

### 10.4 AI Features

AI capabilities are powered by **OpenAI** and include:

- **Content Moderation**: OpenAI's Moderation API analyzes user-submitted content for hate speech, harassment, self-harm, sexual content, and violence. Results are categorized with Arabic-localized labels and scored against configurable thresholds.
- **Studio AI Generation**: OpenAI GPT processes episode transcripts to generate summaries, takeaways, chapters, clips, SEO keywords, hashtags, and social media copy. Prompts are versioned for consistency.
- **Whisper Transcription**: OpenAI's Whisper model transcribes uploaded audio files to Arabic text for episodes that originate from audio recordings rather than YouTube.

All AI features are optional and gracefully degrade when API keys are not configured. AI is always an assistant to the admin, never an autonomous publisher.

### 10.5 Security Considerations

The platform implements multiple layers of security:

- **Authentication**: Supabase Auth with email/password, Google OAuth, and magic link options. Sessions are managed via secure cookies with middleware-based route protection.
- **Authorization**: RBAC through the `profiles.is_admin` flag. RLS policies on all database tables enforce access control at the database level.
- **CSRF Protection**: All mutation API routes require an `X-Requested-With: khat` custom header to prevent cross-site request forgery.
- **Input Sanitization**: All user input is sanitized through dedicated sanitization functions that strip HTML (for plain text fields) or whitelist allowed HTML tags (for rich content). Unicode normalization (NFC) prevents homograph attacks. Links are forced to include `rel="noopener noreferrer"`.
- **XSS Prevention**: Content is sanitized using DOMPurify-compatible sanitization. Only a strict whitelist of HTML tags is allowed in article content.
- **Rate Limiting**: Dual rate limiting — database-backed for authenticated users and in-memory for IP-based public endpoints. Prevents spam, abuse, and denial-of-service on form submissions.
- **Spam Detection**: Automated detection of URL stuffing, character repetition, and word repetition patterns.
- **Ban System**: Admins can ban users by setting `profiles.is_banned = true`. Banned users cannot create any content. The ban check happens on every mutation request.
- **Soft Deletes**: Content is never permanently deleted through the UI — `deleted_at` timestamps are used, preserving data for audit and recovery.
- **Security Headers**: Content Security Policy (CSP) configured to allow YouTube embeds while restricting other external resources. Secrets are managed through environment variables.
- **YouTube Embed Security**: Videos use `youtube-nocookie.com` domain for privacy-enhanced embedding. Iframes have proper sandbox attributes.
- **Upload Validation**: Audio file uploads in the Studio are validated for file type and size before processing.

### 10.6 Hosting and Deployment

- **Hosting**: Vercel (optimized for Next.js, with edge functions and automatic HTTPS/HSTS).
- **Database**: Supabase (managed PostgreSQL with built-in auth, storage, and real-time capabilities).
- **CDN**: Vercel Edge Network for static assets and server-rendered pages.
- **Environment**: All secrets (Supabase keys, OpenAI API key, YouTube API key) are stored as environment variables, never in code.

### 10.7 Key Dependencies

- **Next.js**: Full-stack React framework with App Router.
- **TypeScript**: Type safety across the entire codebase.
- **Tailwind CSS**: Utility-first CSS framework.
- **Supabase Client Libraries**: `@supabase/supabase-js` and `@supabase/ssr` for auth and database.
- **OpenAI SDK**: For AI moderation, content generation, and transcription.
- **modern-screenshot**: For generating quote images with proper Arabic font rendering.
- **Lucide React**: Icon library.
- **shadcn/ui**: Base component library for buttons, cards, dialogs, selects, tabs, toasts, popovers, and switches.

---

*This document reflects the state of the KHAT Podcast website as of February 2026. It is designed to be the single reference an AI system needs to understand the product fully and provide informed guidance or decisions.*
