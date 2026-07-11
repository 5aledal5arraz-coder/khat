# Instagram as a guest-discovery source — what's possible, what we built, and why

_Last researched: 2026-07-11. Meta's platform rules change often — re-verify before
expanding this integration._

## TL;DR

There is **no official Meta API that searches Instagram by keyword** — not for
profiles, captions, or locations. What Meta _does_ officially allow is enough for
our per-candidate enrichment model:

- **Business Discovery** — public profile + recent media of any **Business/Creator**
  account, looked up by **exact username**, no authorization from the target needed.
- **Hashtag Search** — top/recent public media for an exact hashtag
  (30 unique hashtags per rolling 7 days, Advanced Access required).

We integrated Instagram the same way X was integrated: Wikidata gives us the
person's **own** Instagram username (property **P2003**, already extracted into
`wiki.social.instagram`), and we enrich it via Business Discovery. Identity-safe,
official, and it feeds ranking + evidence like every other source.

## The official surface (July 2026)

| Capability | API | Status | Notes |
| --- | --- | --- | --- |
| Profile lookup by exact username | Business Discovery (`business_discovery.username(...)`) | ✅ implemented | Followers, bio, website, media count + recent media w/ captions, like/comment counts. Business/Creator accounts only. |
| Recent posts of another account | Business Discovery `media` edge | ✅ implemented | 12 most recent; like counts null when the owner hides them. |
| Hashtag search (top/recent media) | `ig_hashtag_search` → `/{id}/top_media` | ✅ client support (`searchHashtagTopMedia`), not yet in the pipeline | Quota: 30 unique hashtags / 7 days / account. Needs "Instagram Public Content Access" via App Review. |
| Keyword search over users/captions/locations | — | ❌ does not exist | No official endpoint, period. |
| Personal (non-professional) accounts | — | ❌ not accessible | Business Discovery 400s → we degrade to the static Wikidata link. |
| Instagram Basic Display API | — | ❌ shut down Dec 2024 | Do not build on it. |
| CrowdTangle | — | ❌ shut down Aug 2024 | Successor below. |
| Meta Content Library | research API | ❌ not eligible | Vetted academic/nonprofit research via ICPSR only — a commercial podcast doesn't qualify. |
| oEmbed | Meta oEmbed | ➖ not useful here | Embed HTML for a known post URL; no discovery value. |
| Third-party scraper APIs | — | 🚫 excluded on purpose | They violate Meta's Terms (automated collection without permission). Not compliant → not implemented, regardless of how common they are. |

## What we implemented

```
lib/instagram/client.ts              official Graph API client (key-gated, never throws, 9s timeout)
lib/discovery-v2/sources/instagram.ts  per-candidate presence enrichment (mirrors sources/x.ts)
lib/discovery-v2/{types,enrich,score,config}.ts  signal type + parallel fetch + ranking + source-health panel
lib/jobs/handlers/discovery-v2.ts    evidence: live presence link + latest-caption snippet
tests/discovery-instagram.test.ts    offline tests (extraction, ranking lift, degradation, key-gating)
```

**Identity safety (same rule as X):** we only ever look up the exact username from
the person's own Wikidata entry — never fuzzy name search. A Google-index
`site:instagram.com "<name>"` fallback was considered and **rejected**: a same-name
creator with a big account would contaminate the candidate's signals, which the v2
engine's QID-anchor design exists to prevent.

**Ranking impact (modest, non-dominant, mirrors X):**
- notability: +0.05 / +0.10 at 50K / 500K followers — computed on the **best**
  single platform (X vs Instagram), never the sum.
- guestability: +0.15 when actively posting (a live booking channel).
- recency: floor of 0.6 (active) / 0.4 (occasional).
- Arabic reason chip: "نشط على إنستغرام حالياً (120K متابع)".

## Setup (to activate live)

1. Instagram account must be a **professional** account (Business or Creator)
   linked to the podcast's **Facebook Page**.
2. In [Meta for Developers](https://developers.facebook.com): create (or reuse) an
   app → add **Facebook Login for Business** → grant `instagram_basic` (and
   `instagram_manage_insights` if you later want story insights).
3. Generate a **long-lived** access token for a user with a role on that Page
   (Graph API Explorer → extend token), and read the IG professional account id
   from `GET /me/accounts?fields=instagram_business_account`.
4. `.env.local` / PM2 env:
   ```
   IG_GRAPH_TOKEN=<long-lived token>
   IG_BUSINESS_ACCOUNT_ID=<ig professional account id>
   # optional: IG_GRAPH_VERSION=v24.0   (default v23.0)
   ```
5. Verify in the admin: discovery-v2 page → source-health panel → "Instagram"
   flips to configured. Run a discovery on a topic with a well-known guest to see
   the live evidence chip.

Notes:
- **Dev mode** works for testing with accounts that have a role on the app.
  **Advanced Access** (App Review, with a screencast of this exact use) is needed
  before the token can read arbitrary third-party creators at production scale.
- Long-lived tokens expire after ~60 days — refresh them (or wire a Page token,
  which auto-refreshes as long as the user token is valid). If calls start
  returning null slices everywhere, check the token first.

## Accepted limitations (by design)

1. **Coverage**: only Business/Creator accounts resolve. Most Arabic public
   figures/creators we target are professional accounts; personal ones degrade to
   the static Wikidata link (no live boost, nothing breaks).
2. **No keyword discovery**: Instagram cannot _propose_ new names (no user search
   API). It enriches candidates the LLM+Wikidata pipeline already proposed —
   same role as X, OpenAlex, GDELT, etc.
3. **Hashtag quota**: 30 unique hashtags/week makes hashtag search unsuitable for
   per-candidate enrichment; the client function exists for future topic-level
   research (e.g. one hashtag sweep per season topic), where the quota is plenty.
4. **is_verified** is not exposed by Business Discovery — unlike X, no
   verification badge in signals.
