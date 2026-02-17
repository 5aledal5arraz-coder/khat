# 05 — Personalization Engine

## Overview

The personalization engine tracks anonymous visitor behavior to build interest profiles and deliver personalized content recommendations. It operates entirely without requiring authentication.

**Feature flag:** `personalizationEnabled` in `config/site-settings.json`

---

## Architecture

```
Browser (Client)                          Server
─────────────────                         ──────
PersonalizationTracker                    /api/events
  │                                         │
  ├─ episode_view                          visitor_events table
  ├─ watch_50                                 │
  ├─ watch_90                           /api/personalization
  ├─ path_click                              │
  ├─ guest_open                        ProfileBuilder
  ├─ quote_open                              │
  ├─ search_used                       visitor_profiles table
  ├─ episode_saved                           │
  └─ category_click                    RankingEngine
                                             │
                                       Recommendations
```

---

## Event Types

Defined in `types/personalization.ts`:

| Event | Target ID | When Fired | Weight |
|-------|-----------|------------|--------|
| `episode_view` | Episode ID | Page load on `/episodes/[slug]` | 1.0 |
| `watch_50` | Episode ID | YouTube player reaches 50% | 2.0 |
| `watch_90` | Episode ID | YouTube player reaches 90% | 3.0 |
| `path_click` | Path slug | Click on emotional path | 1.5 |
| `guest_open` | Guest ID | Open guest profile/modal | 1.0 |
| `quote_open` | Quote ID | Interact with quote card | 0.5 |
| `search_used` | Search query | Execute search | 1.0 |
| `episode_saved` | Episode ID | Save episode to bookmarks | 2.0 |
| `theme_change` | Theme name | Change theme preference | 0.1 |
| `category_click` | Category ID | Click on topic/category | 1.0 |

---

## Client-Side Tracker

**File:** `lib/personalization/tracker.ts`

### How It Works

1. **Visitor ID:** Generated on first visit, stored in `localStorage` as a random UUID. Persists across sessions but is anonymous.

2. **Event Recording:** Each tracked interaction calls:
   ```typescript
   trackEvent(eventType, targetId, metadata?)
   ```

3. **Debouncing:** Events are batched and sent periodically (not on every interaction) to minimize API calls.

4. **API Call:** Sends events to `POST /api/events`:
   ```json
   {
     "visitor_id": "uuid-string",
     "events": [
       { "event_type": "episode_view", "target_id": "abc123", "metadata": {} }
     ]
   }
   ```

### Integration Points

- **YouTube Embed** (`components/episodes/youtube-embed.tsx`): Fires `episode_view` on load, `watch_50` and `watch_90` based on player progress tracking via `setInterval`.

- **Episode Page** (`app/episodes/[slug]/page.tsx`): Fires `episode_view` on mount.

- **Path Cards** (`components/home/emotional-paths-section.tsx`): Fires `path_click` on click.

- **Save Button** (`components/actions/save-button.tsx`): Fires `episode_saved` on save.

- **Search** (`components/layout/header.tsx`): Fires `search_used` on search execution.

---

## Server-Side: Event Storage

**API Route:** `app/api/events/route.ts`

1. Receives event batch from client
2. Validates event types against `ALLOWED_EVENT_TYPES`
3. Inserts into `visitor_events` table (Supabase)
4. No auth required (anonymous tracking)

**Table:** `visitor_events`
```sql
CREATE TABLE visitor_events (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  visitor_id text NOT NULL,
  event_type text NOT NULL,
  target_id text,
  metadata jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_visitor_events_visitor_id ON visitor_events(visitor_id);
CREATE INDEX idx_visitor_events_event_type ON visitor_events(event_type);
CREATE INDEX idx_visitor_events_created_at ON visitor_events(created_at);
```

---

## Server-Side: Profile Builder

**File:** `lib/personalization/profile-builder.ts`

### Profile Building Process

1. **Query events** for a given `visitor_id` from `visitor_events`
2. **Build interest vector** — a `Record<string, number>` mapping topics/categories to scores:
   - For each event, look up what topic/category the target belongs to
   - Weight the event by its type weight (see table above)
   - Accumulate scores: `vector[topic] += weight`
3. **Decay:** Recent events weighted more heavily than old ones (time-based decay)
4. **Normalize:** Vector values normalized to 0-1 range
5. **Store** in `visitor_profiles` table:
   ```json
   {
     "visitor_id": "uuid",
     "interest_vector": { "self-discovery": 0.8, "relationships": 0.6, ... },
     "watch_history": ["ep1", "ep2", ...],
     "favorite_guests": ["guest1", ...],
     "total_events": 47,
     "last_seen": "2026-02-13T..."
   }
   ```

### Interest Vector Construction

The interest vector maps **emotional paths** and **topics** to scores. Episodes are linked to paths and topics, so watching an episode boosts the scores of its associated paths/topics.

```
episode_view("ep-abc")
  → episode "ep-abc" is assigned to path "self-discovery"
  → vector["self-discovery"] += 1.0 (episode_view weight)

watch_90("ep-abc")
  → vector["self-discovery"] += 3.0 (deep watch weight)

path_click("relationships")
  → vector["relationships"] += 1.5 (path_click weight)
```

---

## Server-Side: Ranking Engine

**File:** `lib/personalization/ranking.ts`

### Recommendation Algorithm

Given a visitor profile, rank episodes by relevance:

1. **Base score:** Each episode starts with a base score
2. **Interest match:** Dot product of episode's topic vector with visitor's interest vector
3. **Recency bonus:** Newer episodes get a boost
4. **Diversity penalty:** Episodes similar to recently watched get penalized
5. **Guest affinity:** Bonus if episode features a guest the visitor has engaged with
6. **Final sort:** Top N episodes returned

### "Because You Watched" Logic

```
Input: visitor's last watched episode
  → Find episode's topics/paths
  → Find other episodes sharing those topics/paths
  → Exclude already-watched episodes
  → Rank by topic overlap score
  → Return top 4-6 recommendations
```

### "Recommended for You" Logic

```
Input: visitor's full interest vector
  → Score all unwatched episodes against interest vector
  → Apply diversity (don't show 5 episodes from same path)
  → Apply recency bias
  → Return top 6-8 recommendations
```

---

## API Endpoints

### `POST /api/events`
Record visitor events.

**Request:**
```json
{
  "visitor_id": "string",
  "events": [
    {
      "event_type": "episode_view",
      "target_id": "episode-id",
      "metadata": {}
    }
  ]
}
```

### `GET /api/personalization?visitor_id=xxx`
Get personalized recommendations.

**Response:**
```json
{
  "profile": {
    "interest_vector": { ... },
    "watch_history": [ ... ],
    "total_events": 47
  },
  "recommendations": {
    "because_you_watched": [ ... ],
    "recommended_for_you": [ ... ]
  }
}
```

### `GET /api/admin/analytics/website?period=30d`
Admin analytics aggregating visitor events. Returns:
- `uniqueVisitors` — Distinct visitor_ids
- `episodeViews` — Count of episode_view events
- `topEpisodes` — Most viewed episodes with deep watch metrics
- `contentBreakdown` — Events grouped by page type
- `topSearches` — Most common search queries
- `topPaths` — Most clicked emotional paths
- `engagementRate` — % of visitors with watch_50 or watch_90

---

## Privacy Considerations

- **Anonymous:** No PII collected. Visitor ID is a random UUID.
- **No cookies for tracking:** Visitor ID stored in localStorage (not sent as cookie header)
- **No cross-site tracking:** Events only recorded for khatpodcast.com activity
- **Data retention:** No automatic cleanup policy (potential issue — events accumulate indefinitely)
- **Opt-out:** Feature can be disabled via `personalizationEnabled` flag

---

## Files

| File | Purpose |
|------|---------|
| `lib/personalization/tracker.ts` | Client-side event tracking |
| `lib/personalization/profile-builder.ts` | Server-side profile construction |
| `lib/personalization/ranking.ts` | Recommendation algorithm |
| `app/api/events/route.ts` | Event recording API |
| `app/api/personalization/route.ts` | Profile + recommendations API |
| `app/api/admin/analytics/website/route.ts` | Admin analytics aggregation |
| `components/personalization/` | UI components for recommendations |
| `components/home/because-you-watched.tsx` | "Because You Watched" section |
| `components/home/recommended-for-you.tsx` | "Recommended for You" section |
| `types/personalization.ts` | Event types, profile types |
| `supabase/migrations/012_personalization.sql` | visitor_events table |
| `supabase/migrations/014_personalization_v2.sql` | visitor_profiles + expanded events |
