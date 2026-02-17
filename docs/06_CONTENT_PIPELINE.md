# 06 — Content Pipeline

## Overview

The content pipeline transforms a raw YouTube podcast episode into fully enriched website content. It flows through the **Studio** system in the admin panel.

```
YouTube URL → Transcript → AI Generation → Review/Edit → Push to Website → Published Episode
```

---

## Pipeline Stages

### Stage 1: Session Creation

**Entry point:** `/admin/studio` → "جلسة جديدة" (New Session)

**API:** `POST /api/admin/studio`

**Process:**
1. Admin pastes a YouTube URL
2. System extracts YouTube video ID
3. Creates `studio_sessions` row with status `draft`
4. Fetches video metadata (title, thumbnail) from YouTube

**Data stored:**
```json
{
  "id": "uuid",
  "title": "Episode Title (from YouTube)",
  "youtube_url": "https://youtube.com/watch?v=...",
  "youtube_id": "video-id",
  "status": "draft"
}
```

---

### Stage 2: Transcript Acquisition

Three methods available:

#### Method A: YouTube Captions
**API:** `POST /api/admin/studio/[id]/transcript`

1. Fetches available captions via YouTube proxy (`/api/admin/studio/youtube-proxy`)
2. Downloads Arabic captions (preferred) or English with auto-translate
3. Parses XML/VTT caption format into plain text
4. Stores in `studio_transcripts` with `source: 'youtube'`

#### Method B: Whisper Transcription
**API:** `POST /api/admin/studio/[id]/transcript/whisper`

1. Admin uploads audio file or system downloads from YouTube
2. Audio stored in `data/studio-audio/` directory
3. Sent to OpenAI Whisper API for transcription
4. Result stored with `source: 'whisper'`

**Audio support:** Added in migration `007_studio_audio_support.sql`. Audio path stored in `studio_sessions.audio_path`. Cleanup on session delete.

#### Method C: Manual Upload
**API:** `POST /api/admin/studio/[id]/transcript/upload`

1. Admin uploads `.txt`, `.srt`, or `.vtt` file
2. Parsed and stored with `source: 'upload'`

**Transcript processing** (migration `010`):
- `processing_status`: pending → processing → completed / failed
- `word_count`: Auto-calculated
- `summary`: AI-generated summary (stored as JSONB)
- `key_quotes`: Extracted notable quotes (stored as JSONB)

---

### Stage 3: AI Content Generation

**Core AI module:** `lib/openai.ts`

The system generates multiple content types from the transcript. Each has its own generation function and can be regenerated independently.

#### Website Package
**API:** `POST /api/admin/studio/[id]/generate`
**Function:** `generateWebsitePackage()` in `lib/openai.ts`

**Input:** Full transcript text + episode metadata
**Output:**
```json
{
  "description": "SEO-optimized Arabic description",
  "quotes": [
    { "text": "...", "speaker": "...", "timestamp": "00:15:30" }
  ],
  "resources": [
    { "title": "...", "url": "...", "type": "book|article|tool" }
  ],
  "timestamps": [
    { "time": "00:05:00", "label": "...", "description": "..." }
  ],
  "tags": ["tag1", "tag2"],
  "seo_title": "...",
  "seo_description": "..."
}
```

**Prompt structure:**
- System prompt: Role as Arabic podcast content producer
- User prompt: Full transcript + instructions for each content type
- Model: GPT-4o (or configured model)
- Response format: Structured JSON

#### Chapters
**API:** `POST /api/admin/studio/[id]/chapters`
**Function:** `generateChapters()` in `lib/openai.ts`

**Output:**
```json
{
  "chapters": [
    { "title": "...", "timestamp": "00:00:00", "summary": "..." }
  ]
}
```

#### Clips
**API:** `POST /api/admin/studio/[id]/clips`
**Function:** `generateClips()` in `lib/openai.ts`

**Output:**
```json
{
  "clips": [
    {
      "title": "...",
      "start": "00:12:30",
      "end": "00:14:45",
      "hook": "Social media caption text",
      "platform": "youtube_shorts|tiktok|instagram"
    }
  ]
}
```

#### Transcript Analysis
**API:** `POST /api/admin/studio/[id]/analyzer`
**Function:** `analyzeTranscript()` in `lib/openai.ts`

**Output:** Deep analysis including:
- Main themes and topics
- Speaker patterns
- Emotional arc
- Key moments
- Content quality assessment

#### Edit Suggestions
**Component:** `app/admin/studio/components/edit-suggestions.tsx`

AI-powered suggestions for improving generated content before publishing.

### Rate Limiting

AI generation routes use in-memory rate limiting:
```typescript
const recentCalls = new Map<string, number>()
const MIN_INTERVAL = 10_000 // 10 seconds between calls per session
```

---

### Stage 4: Review and Edit

**UI:** `app/admin/studio/components/stage-content.tsx`

Admin reviews all generated content in expandable accordion sections:
- Description — editable text area
- Quotes — list with edit/delete per quote
- Resources — list with edit/delete per resource
- Timestamps — list with edit/delete per timestamp
- Chapters — editable chapter list
- Clips — editable clip list
- Analysis — read-only analysis view

Each section can be individually regenerated.

**Save:** `PATCH /api/admin/studio/[id]/chapters` (and similar for other content types)

---

### Stage 5: Push to Website

**API:** `POST /api/admin/studio/[id]/push`
**Function:** `pushToWebsite()` in `lib/studio.ts` (orchestrates)

**What happens:**

1. **Read website package** from `studio_website_packages`

2. **Write to config files:**
   - `config/episode-overrides.json` — Custom title/description
   - `config/episode-quotes.json` — Quotes array
   - `config/episode-enrichments.json` — Resources, timestamps, description, enrichment sections

3. **Log the push:**
   - Append to `config/studio-push-log.json` with timestamp, session ID, episode ID

4. **Update session status:**
   - `studio_sessions.status = 'published'`

5. **Revalidate paths:**
   - `revalidatePath('/episodes/[slug]')`
   - `revalidatePath('/episodes')`
   - `revalidatePath('/')`

**Audit log entry:**
```json
{
  "sessionId": "uuid",
  "episodeId": "youtube-video-id",
  "pushedAt": "2026-02-13T...",
  "contentTypes": ["description", "quotes", "resources", "timestamps"]
}
```

---

## Data Storage

### Studio Tables (Supabase)

| Table | Purpose | Lifecycle |
|-------|---------|-----------|
| `studio_sessions` | Session metadata | Created → Processing → Published |
| `studio_transcripts` | Raw transcript text | One per session |
| `studio_ai_outputs` | Raw AI generation outputs | Multiple per session |
| `studio_chapters` | Generated chapter data | One per session |
| `studio_clips` | Generated clip data | One per session |
| `studio_website_packages` | Final website-ready content | One per session |
| `studio_analyzers` | Transcript analysis | One per session |

### Config Files (Destination)

| File | What Gets Written |
|------|------------------|
| `config/episode-overrides.json` | `{ id, originalTitle, customTitle }` entries |
| `config/episode-quotes.json` | `{ [episodeId]: { quotes: [...] } }` |
| `config/episode-enrichments.json` | `{ [episodeId]: { description, resources, timestamps, ... } }` |
| `config/studio-push-log.json` | Append-only audit log |

---

## Mock Data Support

When Supabase is not configured (`USE_MOCK_DATA = true`), the Studio uses file-based mock storage:

**File:** `lib/studio.ts` → `readMock()` / `writeMock()`
**Storage:** `data/studio-mock/store.json`

The mock store mirrors the DB schema structure:
```typescript
interface MockStore {
  sessions: StudioSession[]
  transcripts: StudioTranscript[]
  aiOutputs: StudioAiOutput[]
  chapters: StudioChapters[]
  clips: StudioClips[]
  websitePackages: StudioWebsitePackage[]
  analyzers: StudioAnalyzer[]
}
```

---

## Session Lifecycle

```
┌──────────┐     ┌──────────────┐     ┌────────────┐     ┌──────────┐
│  draft    │────→│  processing  │────→│   ready     │────→│ published│
└──────────┘     └──────────────┘     └────────────┘     └──────────┘
     │                  │                    │
     │           Transcript acquired    AI content generated
     │           (any method)            & reviewed
     │
     └── Delete: removes session + audio files + DB rows (CASCADE)
```

---

## Audio Pipeline

**File:** `lib/whisper.ts`

1. Audio uploaded via `POST /api/admin/studio/upload` (raw binary, up to 200MB)
2. Stored in `data/studio-audio/{session-id}.{ext}`
3. Validated: magic bytes, file size, MIME type (`lib/video-validation.ts`)
4. Sent to OpenAI Whisper API via `lib/whisper.ts`:
   ```typescript
   const transcription = await openai.audio.transcriptions.create({
     file: audioFile,
     model: "whisper-1",
     language: "ar",
     response_format: "text"
   })
   ```
5. Result saved as transcript with `source: 'whisper'`

**Cleanup on session delete:** Audio file deleted from `data/studio-audio/` directory.

---

## YouTube Proxy

**API:** `GET /api/admin/studio/youtube-proxy?url=...`

Proxies requests to YouTube's caption API to avoid CORS issues. Used when fetching caption tracks from YouTube.

---

## Key Files

| File | Purpose |
|------|---------|
| `lib/studio.ts` | Session CRUD, mock store, all DB operations |
| `lib/openai.ts` | All AI generation functions (website package, chapters, clips, analysis) |
| `lib/whisper.ts` | Whisper transcription client |
| `lib/video-validation.ts` | Audio/video file validation (magic bytes, size, MIME) |
| `lib/youtube/client.ts` | YouTube Data API client |
| `lib/youtube/queries.ts` | Episode fetching from YouTube |
| `lib/youtube/transcript-client.ts` | YouTube caption fetching |
| `lib/youtube/download.ts` | YouTube audio download |
| `app/admin/studio/studio-client.tsx` | Main Studio UI |
| `app/admin/studio/components/` | Stage components (prepare, content, publish) |
| `app/api/admin/studio/` | All Studio API routes |
