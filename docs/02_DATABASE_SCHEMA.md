# 02 — Database Schema

## Overview

The database is **Supabase (PostgreSQL)** with 14 migration files defining ~26 tables. The schema spans four domains: core podcast data, Studio production, Hibr community, and personalization.

**Migration files:** `supabase/migrations/001_hibr_tables.sql` through `014_personalization_v2.sql`

---

## Migration Index

| # | File | Domain | Tables Created |
|---|------|--------|----------------|
| 001 | `001_hibr_tables.sql` | Hibr + Core | profiles, hibr_articles, hibr_thoughts, hibr_comments, hibr_likes, hibr_bookmarks, hibr_follows, hibr_reactions, hibr_reports, hibr_drafts, rate_limits, episodes, guests |
| 002 | `002_studio_sessions.sql` | Studio | studio_sessions |
| 003 | `003_studio_transcripts.sql` | Studio | studio_transcripts |
| 004 | `004_studio_ai_outputs.sql` | Studio | studio_ai_outputs |
| 005 | `005_studio_chapters_clips.sql` | Studio | studio_chapters, studio_clips |
| 006 | `006_studio_website_packages.sql` | Studio | studio_website_packages |
| 007 | `007_studio_audio_support.sql` | Studio | (alters studio_sessions) |
| 008 | `008_studio_analyzer.sql` | Studio | studio_analyzers |
| 009 | `009_home_content.sql` | Core | (home content tables) |
| 010 | `010_transcript_processing.sql` | Studio | (alters studio_transcripts) |
| 011 | `011_teaser_questions.sql` | Teaser | teaser_questions |
| 012 | `012_personalization.sql` | Personalization | visitor_events |
| 013 | `013_episode_versions.sql` | Core | episode_versions |
| 014 | `014_personalization_v2.sql` | Personalization | visitor_profiles (expanded event types) |

---

## Core Tables

### `episodes`
Primary content table. Episodes can come from YouTube API, admin creation, or Studio push.

| Column | Type | Notes |
|--------|------|-------|
| `id` | `text` PK | YouTube video ID or UUID |
| `slug` | `text` UNIQUE | URL-friendly slug |
| `title` | `text` NOT NULL | Episode title |
| `description` | `text` | Episode description |
| `youtube_url` | `text` | Full YouTube URL |
| `release_date` | `text` | ISO date string |
| `duration_minutes` | `integer` | Length in minutes |
| `guest_id` | `text` FK → guests.id | Linked guest |
| `created_at` | `timestamptz` | Auto |
| `updated_at` | `timestamptz` | Auto |

### `guests`
Podcast guest profiles.

| Column | Type | Notes |
|--------|------|-------|
| `id` | `text` PK | UUID |
| `name` | `text` NOT NULL | Guest display name |
| `slug` | `text` UNIQUE | URL slug |
| `bio` | `text` | Biography |
| `photo_url` | `text` | Profile photo URL |
| `title` | `text` | Professional title |
| `external_links` | `jsonb` | `{twitter, linkedin, website, ...}` |
| `created_at` | `timestamptz` | Auto |

### `profiles`
User profiles (for Hibr community and admin).

| Column | Type | Notes |
|--------|------|-------|
| `id` | `uuid` PK FK → auth.users.id | Supabase auth user |
| `display_name` | `text` | Public display name |
| `avatar_url` | `text` | Profile picture |
| `bio` | `text` | Short bio |
| `is_admin` | `boolean` DEFAULT false | Admin flag |
| `is_banned` | `boolean` DEFAULT false | Ban flag |
| `followers_count` | `integer` DEFAULT 0 | Follower count |
| `following_count` | `integer` DEFAULT 0 | Following count |
| `articles_count` | `integer` DEFAULT 0 | Published articles |
| `created_at` | `timestamptz` | Auto |
| `updated_at` | `timestamptz` | Auto |

---

## Hibr Community Tables

### `hibr_articles`

| Column | Type | Notes |
|--------|------|-------|
| `id` | `uuid` PK | Auto-generated |
| `user_id` | `uuid` FK → profiles.id | Author |
| `title` | `text` NOT NULL | Article title |
| `content` | `text` NOT NULL | Article body (sanitized HTML) |
| `excerpt` | `text` | Auto-generated or manual |
| `tags` | `text[]` | Up to 5 tags |
| `episode_id` | `text` | Linked episode (optional) |
| `featured` | `boolean` DEFAULT false | Admin-featured |
| `likes` | `integer` DEFAULT 0 | Like count |
| `comments_count` | `integer` DEFAULT 0 | Comment count |
| `moderation_status` | `text` DEFAULT 'pending' | pending/approved/rejected/hidden |
| `moderation_reason` | `text` | Reason if rejected |
| `created_at` | `timestamptz` | Auto |
| `updated_at` | `timestamptz` | Auto |

### `hibr_thoughts`

| Column | Type | Notes |
|--------|------|-------|
| `id` | `uuid` PK | Auto-generated |
| `user_id` | `uuid` FK → profiles.id | Author |
| `content` | `text` NOT NULL | 280 char max |
| `tags` | `text[]` | Optional tags |
| `likes` | `integer` DEFAULT 0 | Like count |
| `replies_count` | `integer` DEFAULT 0 | Reply count |
| `moderation_status` | `text` DEFAULT 'pending' | Same as articles |
| `created_at` | `timestamptz` | Auto |

### `hibr_comments`

| Column | Type | Notes |
|--------|------|-------|
| `id` | `uuid` PK | Auto-generated |
| `user_id` | `uuid` FK → profiles.id | Commenter |
| `article_id` | `uuid` FK → hibr_articles.id | ON DELETE CASCADE |
| `parent_id` | `uuid` FK → hibr_comments.id | Nested replies |
| `content` | `text` NOT NULL | Comment text |
| `likes` | `integer` DEFAULT 0 | Like count |
| `moderation_status` | `text` DEFAULT 'approved' | Auto-approved for trusted |
| `created_at` | `timestamptz` | Auto |

### `hibr_likes`

| Column | Type | Notes |
|--------|------|-------|
| `id` | `uuid` PK | Auto-generated |
| `user_id` | `uuid` FK → profiles.id | Liker |
| `target_type` | `text` NOT NULL | 'article' / 'thought' / 'comment' |
| `target_id` | `uuid` NOT NULL | ID of liked content |
| `created_at` | `timestamptz` | Auto |
| **UNIQUE** | `(user_id, target_type, target_id)` | One like per user per item |

### `hibr_bookmarks`

| Column | Type | Notes |
|--------|------|-------|
| `id` | `uuid` PK | |
| `user_id` | `uuid` FK → profiles.id | |
| `article_id` | `uuid` FK → hibr_articles.id | |
| `created_at` | `timestamptz` | |
| **UNIQUE** | `(user_id, article_id)` | |

### `hibr_follows`

| Column | Type | Notes |
|--------|------|-------|
| `id` | `uuid` PK | |
| `follower_id` | `uuid` FK → profiles.id | |
| `following_id` | `uuid` FK → profiles.id | |
| `created_at` | `timestamptz` | |
| **UNIQUE** | `(follower_id, following_id)` | |
| **CHECK** | `follower_id != following_id` | Can't follow self |

### `hibr_reactions`

| Column | Type | Notes |
|--------|------|-------|
| `id` | `uuid` PK | |
| `user_id` | `uuid` FK → profiles.id | |
| `article_id` | `uuid` FK → hibr_articles.id | |
| `emoji` | `text` NOT NULL | Emoji character |
| `created_at` | `timestamptz` | |
| **UNIQUE** | `(user_id, article_id, emoji)` | One reaction per emoji per user |

### `hibr_reports`

| Column | Type | Notes |
|--------|------|-------|
| `id` | `uuid` PK | |
| `reporter_id` | `uuid` FK → profiles.id | |
| `target_type` | `text` | 'article' / 'thought' / 'comment' |
| `target_id` | `uuid` | |
| `reason` | `text` NOT NULL | Report reason |
| `status` | `text` DEFAULT 'pending' | pending/resolved/dismissed |
| `created_at` | `timestamptz` | |

### `hibr_drafts`

| Column | Type | Notes |
|--------|------|-------|
| `id` | `uuid` PK | |
| `user_id` | `uuid` FK → profiles.id | |
| `title` | `text` | |
| `content` | `text` | |
| `tags` | `text[]` | |
| `episode_id` | `text` | |
| `updated_at` | `timestamptz` | |

### `rate_limits`

| Column | Type | Notes |
|--------|------|-------|
| `id` | `uuid` PK | |
| `user_id` | `uuid` FK → profiles.id | |
| `action` | `text` NOT NULL | 'article' / 'thought' / 'comment' / 'report' |
| `count` | `integer` DEFAULT 0 | Actions in window |
| `window_start` | `timestamptz` | Start of rate limit window |

---

## Studio Tables

### `studio_sessions`

| Column | Type | Notes |
|--------|------|-------|
| `id` | `uuid` PK | |
| `title` | `text` NOT NULL | Session name |
| `youtube_url` | `text` | Source YouTube URL |
| `youtube_id` | `text` | Extracted video ID |
| `status` | `text` DEFAULT 'draft' | draft/processing/ready/published |
| `audio_path` | `text` | Local audio file path (for Whisper) |
| `created_at` | `timestamptz` | |
| `updated_at` | `timestamptz` | |

### `studio_transcripts`

| Column | Type | Notes |
|--------|------|-------|
| `id` | `uuid` PK | |
| `session_id` | `uuid` FK → studio_sessions.id | ON DELETE CASCADE |
| `content` | `text` | Full transcript text |
| `source` | `text` | 'youtube' / 'whisper' / 'upload' |
| `language` | `text` DEFAULT 'ar' | |
| `processing_status` | `text` | 'pending' / 'processing' / 'completed' / 'failed' |
| `word_count` | `integer` | |
| `summary` | `jsonb` | AI-generated summary |
| `key_quotes` | `jsonb` | Extracted quotes array |
| `created_at` | `timestamptz` | |

### `studio_ai_outputs`

| Column | Type | Notes |
|--------|------|-------|
| `id` | `uuid` PK | |
| `session_id` | `uuid` FK → studio_sessions.id | ON DELETE CASCADE |
| `output_type` | `text` | 'website_package' / 'seo' / 'social' |
| `content` | `jsonb` | Generated content |
| `status` | `text` | 'generating' / 'completed' / 'failed' |
| `model_used` | `text` | OpenAI model identifier |
| `prompt_version` | `text` | Prompt version tracking |
| `created_at` | `timestamptz` | |

### `studio_chapters`

| Column | Type | Notes |
|--------|------|-------|
| `id` | `uuid` PK | |
| `session_id` | `uuid` FK → studio_sessions.id | ON DELETE CASCADE |
| `chapters` | `jsonb` | Array of `{title, timestamp, summary}` |
| `status` | `text` | |
| `created_at` | `timestamptz` | |

### `studio_clips`

| Column | Type | Notes |
|--------|------|-------|
| `id` | `uuid` PK | |
| `session_id` | `uuid` FK → studio_sessions.id | ON DELETE CASCADE |
| `clips` | `jsonb` | Array of `{title, start, end, hook, platform}` |
| `status` | `text` | |
| `created_at` | `timestamptz` | |

### `studio_website_packages`

| Column | Type | Notes |
|--------|------|-------|
| `id` | `uuid` PK | |
| `session_id` | `uuid` FK → studio_sessions.id | ON DELETE CASCADE |
| `package_data` | `jsonb` | Full website package (quotes, resources, timestamps, description) |
| `status` | `text` | |
| `created_at` | `timestamptz` | |

### `studio_analyzers`

| Column | Type | Notes |
|--------|------|-------|
| `id` | `uuid` PK | |
| `session_id` | `uuid` FK → studio_sessions.id | ON DELETE CASCADE |
| `analysis` | `jsonb` | Transcript analysis data |
| `status` | `text` | |
| `created_at` | `timestamptz` | |

---

## Personalization Tables

### `visitor_events`

| Column | Type | Notes |
|--------|------|-------|
| `id` | `uuid` PK | Auto-generated |
| `visitor_id` | `text` NOT NULL | Anonymous visitor fingerprint |
| `event_type` | `text` NOT NULL | See event types below |
| `target_id` | `text` | Episode ID, path slug, search query, etc. |
| `metadata` | `jsonb` | Additional event data |
| `created_at` | `timestamptz` DEFAULT now() | |

**Allowed event types** (from `types/personalization.ts`):
```
episode_view, watch_50, watch_90,
path_click, guest_open, quote_open,
search_used, episode_saved,
theme_change, category_click
```

**Index:** `idx_visitor_events_visitor_id` on `visitor_id`
**Index:** `idx_visitor_events_event_type` on `event_type`
**Index:** `idx_visitor_events_created_at` on `created_at`

### `visitor_profiles`

| Column | Type | Notes |
|--------|------|-------|
| `id` | `uuid` PK | |
| `visitor_id` | `text` UNIQUE NOT NULL | |
| `interest_vector` | `jsonb` | `{topic: score}` map |
| `watch_history` | `text[]` | Episode IDs |
| `favorite_guests` | `text[]` | Guest IDs |
| `total_events` | `integer` DEFAULT 0 | |
| `last_seen` | `timestamptz` | |
| `created_at` | `timestamptz` | |
| `updated_at` | `timestamptz` | |

---

## Other Tables

### `teaser_questions`

| Column | Type | Notes |
|--------|------|-------|
| `id` | `uuid` PK | |
| `teaser_id` | `text` | |
| `question` | `text` | User-submitted question |
| `name` | `text` | Optional submitter name |
| `status` | `text` DEFAULT 'pending' | |
| `created_at` | `timestamptz` | |

### `episode_versions`

| Column | Type | Notes |
|--------|------|-------|
| `id` | `uuid` PK | |
| `episode_id` | `text` NOT NULL | |
| `snapshot` | `jsonb` | Full episode state at version time |
| `change_type` | `text` | Description of what changed |
| `created_at` | `timestamptz` | |

---

## RLS (Row Level Security) Policies

All Hibr tables have RLS enabled. Key patterns:

- **Read policies:** `SELECT` allowed for all on approved content (`moderation_status = 'approved'`)
- **Write policies:** `INSERT` requires `auth.uid() = user_id`
- **Update policies:** `UPDATE` requires `auth.uid() = user_id` OR `is_admin`
- **Delete policies:** `DELETE` requires `auth.uid() = user_id` OR `is_admin`
- **Admin override:** Admin users (via `profiles.is_admin`) bypass most restrictions

Studio tables have RLS allowing access only to authenticated users with admin profiles.

Visitor events table has permissive INSERT for anonymous tracking (no auth required for event recording).

---

## Key Indexes

- `episodes`: `idx_episodes_slug`, `idx_episodes_release_date`
- `guests`: `idx_guests_slug`
- `hibr_articles`: `idx_articles_user_id`, `idx_articles_moderation_status`, `idx_articles_created_at`
- `hibr_thoughts`: `idx_thoughts_user_id`, `idx_thoughts_moderation_status`
- `hibr_likes`: `idx_likes_target` on `(target_type, target_id)`
- `visitor_events`: `idx_visitor_events_visitor_id`, `idx_visitor_events_event_type`, `idx_visitor_events_created_at`
- `studio_sessions`: `idx_studio_sessions_status`
