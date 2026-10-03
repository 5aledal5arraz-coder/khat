Khat Podcast Universe & Editorial Brain
Implementation Plan v1

Status: FINAL — approved implementation architecture
Decision owner: Khat Editorial/Architecture
Execution: Engineering team
Live production deployment: Requires Khaled approval
Destructive data deletion: Requires Khaled approval

0. Final Architecture Decision

Do not rebuild Khat.

Build the new editorial/research architecture as new modules inside the existing product.

The current platform remains the foundation:

Next.js / React
PostgreSQL / Drizzle
Job Queue / Worker
AI Router / ai_runs
YouTube API
yt-dlp / Whisper
discovery-v2 verification
CRM
EIR
Preparation / Recording / Publishing

The new modules are:

Podcast Universe Index
↓
People / Guest Exposure Registry
↓
Topic Coverage Map
↓
Story Discovery
↓
Story Card
↓
Editorial Gate
↓
Angle
↓
Title Lab

The old Hybrid Generator and Season Wizard remain isolated during migration and are retired only after the replacement pipeline passes the pilot.

The current production specification confirms that the underlying platform already provides a Postgres-backed worker queue and a centralized runAiTask() router with AI logging, rate limiting, JSON repair and retries. Those should be reused rather than duplicated.

A. FINAL DECISIONS
Decision 1 — FULL_STORY_FOUND
FINAL DECISION

Keep the agreed definition unchanged.

FULL_STORY_FOUND = true only if A + B + C are all true.

A — Long-form ownership

The person is:

the primary guest; or

sole/main speaker;

in audio/video content lasting:

>= 30 minutes

or authored an autobiographical first-person book.

B — Same central experience

The material is substantially dedicated to the same central experience Khat is evaluating.

A long interview about someone's profession does not automatically count as coverage of every life experience that person has had.

C — Story coverage

At least 3 of 5 are substantively covered:

1. Beginning / context
2. Turning point
3. Cost / consequences
4. What happened afterward
5. Conclusion / meaning
Classification
A + B + >=3/5
→ FULL_STORY_FOUND

<30 min
→ PARTIAL_COVERAGE

long-form + same experience + <=2/5
→ UNCLEAR_COVERAGE

long-form exists but content cannot be read
→ UNCLEAR_COVERAGE

nothing qualifying found inside recorded search scope
→ NO_MATCH_FOUND
Why

It is strict enough to protect Khat's "first full telling" rule without incorrectly banning a person merely because they appeared somewhere before.

FINAL. Do not revisit for v1 unless pilot evidence demonstrates a systematic classification problem.

Decision 2 — Long-form episode threshold for the Index
FINAL DECISION

The system stores metadata for all accessible uploads, but classifies them by duration.

CORE_LONGFORM
>= 20 minutes

MIDFORM_CONTEXT
8:00–19:59

SHORT_CLIP
< 8 minutes

Only CORE_LONGFORM enters automatic guest-extraction and long-form podcast analytics by default.

MIDFORM_CONTEXT remains searchable because it can be exactly the partial public footprint Khat wants.

SHORT_CLIP is retained as metadata but receives no AI processing by default.

Why 20 minutes?

Twenty minutes is low enough not to miss meaningful interviews but high enough to remove most clips and promotional fragments.

The 20-minute index threshold and 30-minute FULL_STORY threshold intentionally remain different.

Decision 3 — What counts as a "Kuwaiti male"?

Nationality and gender must be evidence states, not guesses.

Nationality states
VERIFIED
PROBABLE
UNKNOWN
CONFLICTED
VERIFIED

Any of:

existing trusted Khat guest/person record already identifies nationality as Kuwait;

first-party biography/profile explicitly identifies the person as Kuwaiti;

official institutional profile identifies the person as Kuwaiti;

reliable source explicitly identifies the person as Kuwaiti;

two credible independent secondary sources agree.

PROBABLE

Episode metadata explicitly attributes Kuwait nationality/origin to the guest, for example:

"رائد الأعمال الكويتي فلان"
"اللاعب الكويتي فلان"
"ضيفنا من الكويت فلان"

with no contradictory evidence.

NOT sufficient

These do not count:

channel is Kuwaiti
episode was filmed in Kuwait
description mentions Kuwait generally
Arabic name looks Kuwaiti
family name sounds Kuwaiti
person appeared on a Kuwaiti podcast

Those may trigger verification but cannot assign nationality.

Male status

Use:

VERIFIED_MALE
PROBABLE_MALE
UNKNOWN
CONFLICTED

Explicit masculine descriptions in source metadata can create PROBABLE_MALE.

Existing trusted identity data or first-party/official identity evidence can create VERIFIED_MALE.

Name alone is never sufficient.

Registry behavior

The UI may show:

Likely Kuwaiti male

for PROBABLE + PROBABLE_MALE.

But the strict filter:

Verified Kuwaiti Men

must require verified states.

Decision 4 — Rehost thresholds
FINAL FOR v1
Old appearance threshold
4 years / 1460 days

Old appearance alone never qualifies a guest for rehosting.

There must additionally be:

NEW_STORY
OR
NEW_CHAPTER
OR
previous PARTIAL coverage
High recent exposure

Raise:

HIGH_EXPOSURE_WARNING

when either:

>= 3 qualifying long-form podcast appearances
within trailing 24 months

or:

>= 3 distinct podcast channels
within trailing 24 months

This is a warning, not rejection.

Views

Views are:

EXPOSURE SIGNAL

not:

EDITORIAL QUALITY SIGNAL

No person may be rejected solely because of views.

Later calculate exposure relative to:

channel
+
episode age

rather than raw lifetime views.

Decision 5 — M1 Channel Scope
FINAL DECISION

M1 does not start with Kuwait only.

A Kuwait-only index would falsely mark Kuwaitis who appeared on major Saudi/Gulf podcasts as "new."

M1 begins with the currently verified channels below.

CORE_INTERVIEW
Kuwait
@bidonwaraq
@bymahfoof
@badersaaj
@JadwaPodcast
UCqb4f_rNvM96zXrIjN7_eYw // Time Keeper
Regional coverage important to Kuwaiti guests
@thmanyahPodcasts
@Alphacast.Official

Total current reported videos:

5,153
CONTEXT_COVERAGE
@falhmrany // سوالف طريق

Current reported videos:

2,066

Total seed metadata universe:

~7,219 videos

Pending channels such as Ghamd, Daera, Etlaq, Areeka, Petroly, Shoghla, Mics, Mukhtalif, Karak and Mazeej should be verified during M1 but are not blockers for M1 completion.

Decision 6 — Sowalif Tareeq
FINAL DECISION

سوالف طريق = CONTEXT_COVERAGE

not:

CORE_INTERVIEW
Why

Its value to Khat is substantial for:

story saturation;

themes;

public familiarity;

narrative coverage;

but the presenter narrating stories is fundamentally different from a guest telling his own firsthand experience.

Therefore:

crawl all metadata;

retain it for Topic Coverage later;

do not run default primary-guest extraction across all episodes;

if an individual episode genuinely contains a guest, it may be manually/automatically reclassified.

Decision 7 — Existing Hybrid System During Migration
FINAL DECISION

Do not delete or migrate the Hybrid data.

During M1–M5:

Hybrid Generator = unchanged legacy production path
New Podcast Universe = isolated new path

The new system must not consume Hybrid-generated candidates as Story evidence.

Existing:

khat_map_episode_candidates
hybrid_topic_generations
existing EIRs
accepted topics
published episodes

remain intact.

At successful M6 acceptance:

Hybrid generation buttons
→ feature flagged / disabled

old data
→ read-only historical compatibility

No existing EIR is rewritten automatically.

The old architecture currently converts accepted topic candidates into EIRs before guest discovery; that handoff remains untouched until the replacement is ready.

Decision 8 — Person storage
FINAL DECISION

Create:

podcast_people

as a new entity separate from guests.

Why

guests represents people who became official Khat guests.

Podcast Universe contains:

thousands of external people;

people Khat may never invite;

rejected people;

unresolved identities;

non-Kuwaiti people.

Putting them in guests would corrupt the semantics of the existing product.

Use nullable links:

podcast_people.khat_guest_id
podcast_people.khat_guest_candidate_id

when the same real person enters Khat's CRM/workflow.

Decision 9 — AI models in M1
FINAL DECISION

M1 uses:

Luna only

for guest metadata extraction.

No Sol.

No Gemini grounding.

No embeddings.

Wikidata / existing identity logic may be used where needed.

Why

M1 is primarily structured extraction, not editorial reasoning.

Decision 10 — Transcripts in M1
FINAL DECISION

Do not download transcripts during the bulk M1 crawl.

M1 extraction uses:

title
description
channel
duration
date

Transcripts begin in M2 when evaluating actual story coverage.

Why

Avoid unnecessary IO, storage and AI processing before knowing which appearances matter.

Decision 11 — Channel Registry roles

Every channel must have one of:

CORE_INTERVIEW
CONTEXT_COVERAGE
CANDIDATE
REJECTED
DORMANT

Only CORE_INTERVIEW automatically enters guest extraction.

Decision 12 — Podcast Universe completeness

Never expose:

"has never appeared on a podcast"

unless qualified.

Correct UI terminology:

No indexed podcast appearance found

because the registry can never prove universal absence.

Decision 13 — Search quota usage

search.list is reserved for:

channel discovery;

resolving unknown channels;

occasional targeted fallback.

Never use it to crawl registered channels.

Current YouTube documentation places search.list in a separate default bucket of 100 calls/day; playlistItems.list and videos.list remain 1-unit read operations.

Application caps for Khat v1:

Podcast Universe search.list:
MAX 20 calls/day

Podcast Universe general YouTube read calls:
MAX 2,000 units/day

The actual project's Google Cloud quota configuration is the final operational source of truth if it differs from Google's default.

Decision 14 — AI budget enforcement

The existing AI infrastructure records costs but production configuration has historically included report-only limits.

Therefore Podcast Universe must have its own enforced run budget.

Do not rely solely on the shared AI rate limiter.

Every long research/indexing job gets:

budget_limit_usd
spent_usd
status

and must refuse the next paid call if it would exceed the hard limit.

Decision 15 — New Guest is preference, not database exclusion

Default discovery ranking:

1. NEW_TO_PODCASTS
2. REHOST_ALLOWED_NEW_STORY
3. REHOST_ALLOWED_NEW_CHAPTER
4. REHOST_ALLOWED_PARTIAL
5. REHOST_REVIEW_OLD
6. DO_NOT_PRIORITIZE_HIGH_EXPOSURE

Only:

EXCLUDED_SAME_STORY

is a story-level hard exclusion.

B. MILESTONE 1
Podcast Universe Foundation + Kuwaiti Guest Registry

This is the first implementation milestone and starts immediately.

B1. Database Model
1. podcast_channels
type PodcastChannel = {
id: UUID;

platform: "youtube";

youtube_channel_id: string;
handle: string | null;
name: string;

country_code: string | null;
default_language: string | null;

registry_type:
| "core_interview"
| "context_coverage"
| "candidate"
| "rejected"
| "dormant";

registry_source:
| "khaled"
| "marzouq"
| "manual"
| "youtube_search"
| "index_expansion";

verification_status:
| "pending"
| "verified"
| "rejected";

uploads_playlist_id: string | null;

subscriber_count: bigint | null;
reported_video_count: bigint | null;

last_crawled_at: timestamptz | null;
last_successful_crawl_at: timestamptz | null;

latest_known_video_id: string | null;
latest_known_published_at: timestamptz | null;

crawl_status:
| "never"
| "running"
| "complete"
| "partial"
| "failed";

metadata: jsonb;

created_at: timestamptz;
updated_at: timestamptz;
}
Constraints / indexes
UNIQUE youtube_channel_id

UNIQUE handle
WHERE handle IS NOT NULL

INDEX registry_type
INDEX verification_status
2. podcast_episodes

Persist all accessible upload metadata.

type PodcastEpisode = {
id: UUID;

channel_id: UUID;

youtube_video_id: string;

title: string;
description: string | null;

published_at: timestamptz;

duration_seconds: integer;

view_count: bigint | null;
view_count_checked_at: timestamptz | null;

language: string | null;

duration_class:
| "core_longform"
| "midform_context"
| "short_clip";

availability_status:
| "public"
| "unavailable"
| "deleted"
| "private"
| "unknown";

guest_extraction_status:
| "pending"
| "running"
| "succeeded"
| "no_guest"
| "skipped"
| "failed";

content_kind:
| "guest_interview"
| "panel"
| "solo_host"
| "narrated_story"
| "documentary"
| "other"
| "unclear"
| null;

metadata_hash: string | null;

raw_metadata: jsonb | null;

first_seen_at: timestamptz;
last_seen_at: timestamptz;

created_at: timestamptz;
updated_at: timestamptz;
}
Duration class
>=1200 seconds
→ core_longform

480–1199
→ midform_context

<480
→ short_clip
Constraints / indexes
UNIQUE youtube_video_id

INDEX (channel_id, published_at DESC)

INDEX (duration_class, guest_extraction_status)

INDEX published_at
3. podcast_people

Do not reuse guests.

type PodcastPerson = {
id: UUID;

canonical_name: string;
normalized_name_key: string;

identity_status:
| "unverified"
| "probable"
| "verified"
| "conflicted";

nationality_code: string | null;

nationality_status:
| "unknown"
| "probable"
| "verified"
| "conflicted";

gender_marker:
| "male"
| "female"
| "unknown";

gender_status:
| "unknown"
| "probable"
| "verified"
| "conflicted";

life_status:
| "alive"
| "deceased"
| "unknown";

wikidata_id: string | null;

khat_guest_id: UUID | null;
khat_guest_candidate_id: UUID | null;

needs_identity_review: boolean;

identity_notes: string | null;

first_seen_at: timestamptz;
last_seen_at: timestamptz;

last_verified_at: timestamptz | null;

created_at: timestamptz;
updated_at: timestamptz;
}
Indexes
INDEX normalized_name_key
INDEX nationality_code
INDEX (nationality_code, gender_marker)
INDEX khat_guest_id
INDEX khat_guest_candidate_id
INDEX needs_identity_review
4. podcast_person_aliases

Required from M1.

type PodcastPersonAlias = {
id: UUID;

person_id: UUID;

alias: string;
normalized_alias: string;

source:
| "episode"
| "manual"
| "wikidata"
| "khat_guest"
| "verification";

created_at: timestamptz;
}

Indexes:

INDEX normalized_alias
UNIQUE (person_id, normalized_alias)
5. podcast_guest_appearances
type GuestAppearance = {
id: UUID;

person_id: UUID;
episode_id: UUID;

is_primary_guest: boolean;

role_text: string | null;

extraction_source:
| "metadata_ai"
| "metadata_rule"
| "transcript"
| "manual";

extraction_confidence: numeric;

evidence_field:
| "title"
| "description"
| "transcript"
| "manual";

evidence_text: string | null;

nationality_claim_code: string | null;
nationality_claim_text: string | null;

gender_signal:
| "male"
| "female"
| "unknown";

gender_evidence_text: string | null;

topic_hint: string | null;

verification_status:
| "extracted"
| "verified"
| "review"
| "rejected";

ai_run_id: UUID | null;

created_at: timestamptz;
updated_at: timestamptz;
}

Constraint:

UNIQUE (person_id, episode_id)

Indexes:

INDEX person_id
INDEX episode_id
INDEX verification_status
INDEX is_primary_guest
6. podcast_crawl_runs

Operational support table.

type PodcastCrawlRun = {
id: UUID;

channel_id: UUID | null;

run_type:
| "initial"
| "incremental"
| "metadata_refresh"
| "channel_verify";

status:
| "queued"
| "running"
| "succeeded"
| "partial"
| "failed"
| "budget_stopped";

started_at: timestamptz | null;
completed_at: timestamptz | null;

playlist_pages: integer;
video_ids_seen: integer;
episodes_inserted: integer;
episodes_updated: integer;

youtube_read_units: integer;
youtube_search_calls: integer;

ai_cost_usd: numeric;

cursor_state: jsonb | null;

error_summary: string | null;

created_at: timestamptz;
}
B2. M1 Crawl Pipeline
Step 1 — Channel verification

For every registry seed:

handle/channel ID
→ channels.list
→ resolve canonical channel ID
→ resolve uploads playlist
→ store channel metadata

If already provided as channel ID, do not use search.list.

If provided as verified handle, resolve directly through the API where supported.

search.list is fallback only.

Step 2 — Upload playlist crawl

For each verified channel:

uploads playlist
→ playlistItems.list(maxResults=50)
→ paginate until exhaustion

Persist the video IDs immediately so a failure can resume from checkpoint.

Every page updates:

podcast_crawl_runs.cursor_state
Step 3 — Video metadata

Fetch IDs through:

videos.list

in batches of up to 50.

Request only required fields:

snippet
contentDetails
statistics
status

Parse:

title
description
publishedAt
duration
viewCount
language
availability

Then compute duration_class.

Step 4 — Idempotent upsert

Every episode write is:

UPSERT ON youtube_video_id

Do not create duplicates on retries.

Metadata updates should refresh:

title
description
view_count
availability
last_seen_at
metadata_hash

without resetting downstream verified data.

B3. Expected YouTube Quota

Current seed videos:

CORE: ~5,153
CONTEXT: ~2,066
TOTAL: ~7,219

For the seven CORE channels, the currently reported counts require approximately:

~107 playlist pages
~104–107 videos.list batches

depending on how batches are grouped.

Including Sowalif Tareeq adds roughly another:

~84 read calls

Therefore the initial seed crawl should remain approximately:

< 350 general read units

plus a few channel-resolution calls.

This is far below the application's v1 Podcast Universe limit of:

2,000 read units/day

and the default general API quota documented by Google. playlistItems.list and videos.list each have a 1-unit quota cost.

B4. Daily Quota Allocation

Podcast Universe may consume at most:

General YouTube reads:
2,000/day

YouTube search.list:
20/day

The remainder stays available to existing Khat functionality.

Implement application-side counters.

Do not simply wait for Google to reject the request.

If the Podcast Universe quota is exhausted:

job → paused/budget_stopped

not failed.

B5. Initial vs Weekly Crawl
Initial

Read entire uploads playlist.

Weekly incremental

Start from newest uploads.

Always read at least:

2 pages / 100 uploads

for overlap.

Continue until:

an entire page consists of already-known video IDs; and

those items are older than the last successful crawl boundary.

Then stop.

This gives enough overlap to handle delayed processing or metadata changes.

Do not rewalk all historical pages weekly.

B6. Guest Extraction with Luna

Only process:

registry_type = CORE_INTERVIEW
AND
duration_class = CORE_LONGFORM
AND
guest_extraction_status = pending

No transcripts in M1.

Batch size

Default:

40 episodes / call

Maximum:

50

Fallback after schema/size failure:

20
Input Contract

Descriptions should be normalized and capped before sending.

Recommended maximum:

title: full
description excerpt: <= 1,200 characters

The extractor may preserve metadata lines that explicitly introduce a guest even if they occur slightly later in the description.

Input:

{
"episodes": [
{
"episode_id": "uuid",
"channel_name": "string",
"title": "string",
"description_excerpt": "string",
"duration_seconds": 5400,
"published_at": "2026-01-01T00:00:00Z"
}
]
}
System Rules for Luna

The prompt must explicitly state:

You extract only what is explicitly supported by the supplied metadata.

Do not use outside knowledge.

Do not guess a guest from the subject.

Do not infer nationality from the channel.

Do not infer nationality from a name.

Do not assume every named person is the guest.

Hosts, sponsors, producers and people merely discussed are not guests.

If no identifiable guest exists, return an empty guests array.

Every extracted guest MUST include evidence_text copied verbatim from the supplied title or description.

If there are multiple genuine guests, return each separately.

Return exactly one result for every input episode.
Exact Output Contract
{
"episodes": [
{
"episode_id": "uuid",
"content_kind": "guest_interview",
"guests": [
{
"display_name": "اسم الضيف",
"role_text": "رائد أعمال",
"is_primary_guest": true,
"evidence_field": "title",
"evidence_text": "اسم الضيف",
"nationality_claim": {
"country_code": "KW",
"evidence_text": "رائد الأعمال الكويتي اسم الضيف"
},
"gender_signal": "male",
"gender_evidence_text": "رائد الأعمال الكويتي",
"confidence": 0.96
}
],
"topic_hint": "تجربته في تأسيس وإغلاق المشروع"
}
]
}

Allowed content_kind:

guest_interview
panel
solo_host
narrated_story
documentary
other
unclear
Deterministic validation after Luna

No Luna result is persisted blindly.

For each extracted guest:

episode_id exists
AND
evidence_text is exact substring of title/description
AND
display_name appears within evidence_text

Otherwise:

reject extraction
log validation failure

For nationality claim:

nationality_claim.evidence_text

must also be an exact substring.

For gender evidence:

gender_evidence_text

must be an exact substring.

This makes hallucinated extraction structurally difficult.

B7. Name Normalization

Preserve original display name.

Create separate comparison key.

Arabic normalization

Apply:

Unicode NFKC
remove tashkeel
remove tatweel
أ / إ / آ → ا
ى → ي
normalize whitespace
strip punctuation
lowercase Latin portions

Do not normalize:

ة → ه

Do not perform aggressive phonetic substitutions.

Honorifics

Strip for comparison only:

د.
دكتور
المهندس
الشيخ
الكابتن
الأستاذ
أ.
م.

Do not alter stored aliases.

B8. Identity Merge Rules

Names are candidate keys, not identities.

Never auto-merge solely because two people share the same name.

Safe auto-link

Automatic link is permitted when one of these holds:

Case A

Existing internal Khat guest/person relation provides an exact identity match.

Case B

Exact normalized full name plus an independent corroborating identifier:

same verified social/profile URL;

same verified profession/employer context;

same Wikidata identity;

another stable source identifier.

Case C

Repeated appearance on the same channel with exact full name plus identical distinguishing role/descriptor and no conflict.

Review required
same name
but insufficient corroboration

common two-token name

different profession

different age/generation

different nationality signal

Wikidata profession contradiction

These produce:

needs_identity_review = true

No destructive merge.

Reuse discovery-v2's namesake contradiction logic where available.

B9. Aliases

Aliases are additive.

Example:

د. فلان الفلاني
فلان الفلاني
فلان محمد الفلاني

All may point to one person after identity resolution.

Search must query aliases as well as canonical name.

B10. Kuwaiti-Male Verification Flow

After extraction:

Person
↓
internal Khat match?
↓
explicit metadata nationality?
↓
existing identity evidence?
↓
Wikidata / discovery-v2 identity resolver when useful
↓
status

Deep web/Gemini verification is not required for every person during M1.

Unknowns are allowed.

M1 should prefer:

correct UNKNOWN

over:

incorrect VERIFIED
B11. Background Jobs

Use existing Postgres queue/worker.

Recommended jobs:

podcast.channel.verify
podcast.channel.initial_crawl
podcast.channel.incremental_crawl
podcast.episode.guest_extract
podcast.person.resolve
podcast.weekly_sync
podcast.channel.verify

Lane:

youtube_io

Attempts:

3

Dedupe:

podcast-channel-verify:<channel-key>
podcast.channel.initial_crawl

Lane:

youtube_io

Attempts:

3

Dedupe:

podcast-initial:<channel-id>:v1

Checkpoint after each playlist page.

podcast.episode.guest_extract

Lane:

ai_structural

Model:

luna

Attempts:

2

Dedupe by extraction version + episode batch.

Prompt version:

podcast-universe-guest-extract-v1
podcast.person.resolve

Lane:

verification

Use deterministic/local data first.

External verification only when necessary.

podcast.weekly_sync

Schedule once weekly.

It only enqueues incremental crawls.

B12. Retry Policy
Retry

Automatically retry:

network failures
HTTP 429
HTTP 5xx
transient AI errors
JSON/schema failure once

with exponential backoff.

Do not immediately retry
YouTube quota exhausted
daily app budget exhausted
403 permanent permission error
invalid/deleted channel
invalid video
policy/schema invariant violation

Quota exhaustion should reschedule after quota reset rather than burn retry attempts.

B13. AI Budget — Milestone 1
Hard cap
$3.00 total AI cost

for the initial M1 seed indexing/extraction run.

Target
<= $1.50

No Sol.

No Gemini.

No embeddings.

If:

spent + estimated_next_call > $3

the worker stops AI extraction and leaves remaining episodes as:

pending

Nothing is silently skipped.

B14. Admin UI — Channel Registry

Route:

/admin/podcast-universe/channels

Display:

Channel
Country
Registry type
YouTube ID / handle
Reported videos
Indexed videos
Long-form videos
Last crawl
Crawl status
Extraction progress

Actions:

Verify
Initial crawl
Incremental sync
Pause
Change registry type

No destructive delete button in v1.

B15. Admin UI — Guest Registry

Route:

/admin/podcast-universe/guests
Search

Search across:

canonical name
aliases
Filters
Nationality:
Verified KW
Probable KW
Unknown
Other

Gender:
Verified male
Probable male
Unknown

Identity:
Verified
Probable
Unverified
Needs review

Channel
Appearance count
Last appearance range
Main table

Columns:

Person

Nationality
with confidence badge

Gender
with confidence badge

Identity status

Podcast appearances

Unique channels

First appearance

Last appearance

Latest channel

Latest episode

Aggregate visible exposure
(labelled Exposure, never Popularity)

Khat link
if linked to guests / guest_candidates

Review flag

Do not show a fake Rehost Score in M1.

That belongs to M3.

B16. Person Detail Page

Route:

/admin/podcast-universe/guests/[personId]

Sections:

Identity
Canonical name
Aliases
Nationality
Gender
Living status
Wikidata
Khat guest/CRM link
Evidence status
Podcast appearances

For every appearance:

Date
Channel
Episode title
Episode link
Duration
Views snapshot
Primary guest?
Role
Extraction confidence
Evidence excerpt
Verification status
Identity Review

Allow authorized admin to:

add alias
unlink wrong appearance
merge verified duplicate identity
split mistaken identity
link to Khat guest
link to guest candidate
mark nationality status
mark gender status

All changes must be audited.

No row deletion is necessary for normal corrections.

Use status/unlink rather than deletion.

B17. Search Performance

Required DB indexes must support guest lookup without scanning episode text.

Target on seed dataset:

P95 guest search < 500 ms

under normal local/staging conditions.

B18. Definition of Done — M1

M1 is complete only when all conditions below pass.

Data ingestion

All eight verified seed channels exist in registry:

7 CORE_INTERVIEW
1 CONTEXT_COVERAGE

Every seed channel reaches terminal playlist pagination without unresolved crawl failure.

All accessible upload IDs are persisted uniquely.

At least:

99% of accessible video IDs

have successful videos.list metadata.

Any unresolved remainder is explicitly logged.

Duration classification

100% of successfully indexed episodes have one deterministic duration class.

Guest extraction coverage

100% of:

CORE_INTERVIEW
+
CORE_LONGFORM

episodes are either:

succeeded
no_guest
failed with explicit reason

No silent pending episodes after the completed test run.

Manual gold-set evaluation

Create a stratified manual QA set of:

200 long-form episodes

including:

clear single guest;

multiple guests;

no guest;

host-only;

vague titles;

Arabic names;

English names;

interviews where host and guest both appear in description.

Required:

Primary guest precision >= 97%

Recall >= 92%
for guests explicitly discoverable
from title/description

Hallucinated unsupported guest names = 0
on the gold set

"Hallucinated" means there is no exact supporting evidence substring.

Content-kind accuracy

On the same or additional manually labeled sample:

>= 95%

accuracy for separating:

guest_interview
vs
non-guest format
Identity safety

On a manually reviewed set of at least:

100 cross-episode person matches

required:

false automatic person merges = 0

Duplicate fragmentation is acceptable during M1.

False merging is not.

Nationality safety

No person may receive VERIFIED KW from:

channel nationality alone
name alone
generic Kuwait mention alone

Automated QA tests must cover these negative cases.

Budget
AI cost <= $3.00

and the hard stop must be proven with an automated test.

YouTube quota

Initial seed crawl should remain:

< 400 general read units

unless actual accessible counts materially differ from current reported counts.

All usage is logged.

Reliability

Test:

job retry
job resume from checkpoint
duplicate job
worker restart
AI parse failure
YouTube 429
YouTube quota stop
deleted/private video
re-run same initial crawl

A second complete initial crawl must create:

0 duplicate channels
0 duplicate episodes
0 duplicate appearances
Regression

All existing tests must remain green.

New Podcast Universe tests are additive.

No existing EIR / CRM / guest discovery production behavior changes in M1.

C. MILESTONES 2–6
M2 — Previous Coverage + FULL_STORY
Goal

Turn podcast appearances into evidence of what the person already told.

Depends on

M1.

Build
captions via yt-dlp
Whisper fallback only when justified
CoverageSearchLog
5-element extraction
exact quote verification
FULL_STORY_FOUND
PARTIAL_COVERAGE
UNCLEAR_COVERAGE

Only download/process transcripts for:

relevant potential guests;

long-form appearances requiring story evaluation.

Do not transcript the entire universe.

Success

Every FULL_STORY_FOUND must have:

duration >=30m
same central story
>=3 verified story elements

Each counted element must contain an exact source quote.

Manual evaluation:

100 coverage decisions

Target:

>= 90% agreement with human labels
0 FULL_STORY classifications without evidence
AI budget

Hard cap for initial M2 pilot:

$5

Expected actual cost materially lower if captions are available.

M3 — Rehost Engine
Goal

Answer:

Should Khat invite this person again?

without using a simplistic yes/no appearance filter.

Depends on

M1 + M2.

Output statuses
NEW_TO_PODCASTS
EXCLUDED_SAME_STORY
REHOST_ALLOWED_NEW_STORY
REHOST_ALLOWED_NEW_CHAPTER
REHOST_ALLOWED_PARTIAL
REHOST_REVIEW_OLD
DO_NOT_PRIORITIZE_HIGH_EXPOSURE
UNCLEAR
Build

Add:

appearance counts
24-month exposure
unique channel counts
last appearance
story overlap
new chapter evidence
age-adjusted/channel-relative view exposure
Success

Every state is explainable through deterministic reasons.

No state is based on raw views alone.

EXCLUDED_SAME_STORY can only occur through FULL_STORY_FOUND.

Manual sample:

100 Kuwaiti-person decisions

Human reviewer should agree with system's factual classification/reasoning at:

>= 90%

Editorial override remains available.

AI cost

Mostly deterministic.

Hard initial budget:

$2
M4 — Topic Coverage Map
Goal

Answer:

What has Arabic podcasting covered?

How often?

In what format?

Where are the format gaps?
Depends on

M1.

M2 improves depth but is not required for initial metadata classification.

Build

Add:

TopicCoverage
TopicCoverageStats

Classify episodes by:

constitution door
field
normalized topic
coverage format

Coverage formats:

FIRST_PERSON_STORY
EXPERT_EXPLAINER
OPINION_CONVERSATION
CAREER_PROFILE
NEWS_REPORT
MIXED
Critical rule

Topic Coverage is a map, never an idea-generation feed.

Success

At least:

95% of CORE_LONGFORM indexed episodes

receive coverage classification or explicit UNCLEAR.

Manual gold set:

200 episodes

Targets:

coverage-format accuracy >= 90%

constitution-door accuracy >= 90%

62-field classification >= 80%

The system must distinguish:

HEAVILY_COVERED

from:

FORMAT_GAP

rather than treating episode volume as editorial value.

The old market engine's production ranking was heavily influenced by volume, which is specifically what M4 must avoid recreating.

AI budget

Initial full seed pass:

target <= $5
hard cap $10

using Luna batching.

M5 — New Guest Finder + Story Signals
Goal

Use:

SeasonSlot
+
Podcast Universe
+
Topic/Format Gaps
+
Guest Exposure Registry

to discover actual underexposed people and experiences.

Depends on

M1–M4.

Sources
Podcast Universe
YouTube API
Khaled network / GuestLead
Gemini grounding
Press
Default preference
NEW_TO_PODCASTS

Rehost candidates enter a separate lane.

Pilot slots
بحر / حرف قديمة
رياضة
صمود داخل الكويت وقت الغزو
Success

For all three pilot slots:

at least one real qualified person;

person identity/evidence traceable;

no FULL_STORY_FOUND candidate presented as new;

story has a real human arc or meaningful unanswered experience;

system distinguishes evidence from hypothesis.

Budget

Pilot hard cap:

$5

Full 10-episode-season discovery target:

$5–10
M6 — Story Card + Editorial Gate + Angle + Title Lab
Goal

Complete Khat Editorial Brain.

Depends on

M1–M5.

Build
Story
Evidence
EditorialDecision
Angle
Title
Taste memory
SeasonSlot integration
EIR bridge
Required order
Person
→ Evidence
→ Coverage
→ Story
→ Editorial Gate
→ Angle
→ Title

A title may never exist upstream of Story qualification in the new path.

Models
Luna:
cards / extraction / first-pass angles / title variants

Sol:
only deep editorial review of shortlisted cases
Success

Three-slot pilot runs end-to-end.

Khaled's product view first shows:

Person
What is verified
What has been told
What remains untold
Why Khat
Angle

and only then title options.

No episode opportunity is built from invented premise-only data.

Budget

For a complete 10-episode season:

M5 + M6 combined target:
$8–12

hard cap:
$15
M6 Exit / Hybrid Retirement

After M6 passes QA:

new season discovery
→ Khat Editorial Brain

Hybrid / Season Wizard:

generation disabled via feature flag
historical data retained
existing EIRs retained
existing decisions retained

Production switch requires Khaled approval because it changes the live product.

D. TEAM IMPLEMENTATION RULES
D1. Default authority

The team does not return to Khaled for normal implementation choices covered by this spec.

This document is the default decision.

When something minor is unspecified:

choose the option that preserves:
evidence
reversibility
low cost
auditability
existing production behavior
D2. When Khaled approval is required

Only:

1. Production deployment

Anything changing live khatpodcast.com.

2. Destructive deletion

Including:

deleting production data
dropping populated tables
irreversible bulk cleanup
destructive migration

Everything else should proceed through engineering + QA.

Editorial use of the finished system is naturally Khaled's normal product workflow and is not an engineering approval gate.

D3. Migrations

All new work uses numbered Drizzle migrations consistent with the current repository.

Rules:

additive first
no destructive migration during build
foreign keys explicit
indexes added with schema
migrations tested on clean DB
migrations tested on copy of existing schema

No table rename of existing production entities for this project.

D4. Feature Isolation

All new code lives under clear module boundaries, e.g.:

lib/podcast-universe/
lib/khat-editorial-brain/

Do not place Podcast Universe logic inside Hybrid generator code.

Do not make new tables depend on khat_map_episode_candidates.

D5. AI Rules

Every call must use:

runAiTask()

No direct model SDK calls.

Every call must include:

task kind
prompt version
subject table/id
input snapshot

where supported.

Models cannot turn an unsupported fact into verified evidence.

D6. Evidence Rule

The following transition is forbidden:

AI says X
→ database marks X verified

Required:

AI extracts X
→ deterministic/source verification
→ verified
D7. QA Gate — Every Milestone

Noura/QA must verify before a milestone is considered complete:

Database
migration clean install
migration existing-schema install
constraints
indexes
idempotency
duplicate handling
Queue
retry behavior
dedupe behavior
worker restart
checkpoint resume
partial failure
budget stop
AI
valid schema
malformed output
missing fields
hallucination tests
exact evidence validation
budget enforcement
prompt-version logging
Data quality
manual gold-set thresholds
false merge tests
source provenance
confidence-state correctness
Security
no API key logging
no unsafe arbitrary URLs
existing SSRF protections reused where URLs are fetched
escaped/safe metadata rendering
admin authorization
Regression
all existing tests pass
new tests pass

The current platform already has substantial tested verification logic; the new system should call those primitives rather than reproduce weaker copies of them.

D8. No Silent Failure

No stage may convert:

failed

into:

not found

Examples:

transcript retrieval failed
≠
story not told

identity verification failed
≠
person not Kuwaiti

YouTube quota stopped
≠
channel fully crawled

AI extraction failed
≠
no guest

These states must remain distinct in the DB and UI.

D9. Auditability

Every automated decision displayed to Khaled must answer:

What data caused this?
What rule caused this?
Which model/version participated?
What remains uncertain?

If the system cannot answer those four questions, the feature is not done.

D10. Cost Accounting

Use existing ai_runs for actual model-cost history.

Additionally maintain per-run budget state for Podcast Universe / Editorial Brain.

All dashboard costs should distinguish:

AI cost
Gemini/search cost
YouTube API quota

YouTube quota units are not dollars and must never be mixed with AI spending.

D11. Views

Never label views as:

quality
worth
guest score

Use terms:

exposure
audience exposure
appearance exposure
D12. Production Safety

M1–M5 are additive.

No existing:

guest
CRM
episode
EIR
Hybrid
published episode

record is rewritten by the new system unless explicitly linked through a nullable relation.

This allows rollback simply by disabling the new feature flags.

E. EXECUTION ORDER

Engineering should now execute in this exact order:

1. M1 schema migrations
2. Seed verified channel registry
3. YouTube channel verification
4. Initial crawl
5. Episode metadata storage
6. Luna guest extraction
7. deterministic extraction validation
8. person resolution / aliases
9. Guest Registry admin UI
10. Gold-set QA
11. M1 acceptance
12. M2
13. M3
14. M4
15. M5 pilot
16. M6
17. Khaled approval
18. production switch from Hybrid

Do not start M4/M5 logic before M1 data quality is proven.

F. M1 FIRST SEED REGISTRY

Seed immediately:

CORE_INTERVIEW

KW @bidonwaraq
KW @bymahfoof
KW @badersaaj
KW @JadwaPodcast
KW UCqb4f_rNvM96zXrIjN7_eYw

SA @thmanyahPodcasts

AE @Alphacast.Official

Context only:

CONTEXT_COVERAGE

KW @falhmrany

Candidate verification backlog:

غمد
دائرة
إطلاق
أريكة
بترولي
شغلة
مايكس
مختلف
جلسة كرك
مزيج

Do not block M1 waiting for those candidate channels.

G. FINAL ARCHITECTURAL RULE

The new system has three clearly separated responsibilities.

PODCAST UNIVERSE
= memory

DISCOVERY-V2
= verification

KHAT EDITORIAL BRAIN
= editorial judgment

The system should never collapse those responsibilities.

Podcast Universe tells us:

What has been said and who has appeared?

Discovery tells us:

Is this person/story/evidence real?

Khat Editorial Brain tells us:

Is this real, insufficiently told human experience worthy of becoming a Khat episode?

Only after that decision does Title Lab ask:

What should we call it?

---

## Addendum — 2026-10-03: Nationality decision after the first real M1 run (ChatGPT, final)

Run facts: 7,172 videos / 309 units; 1,604 CORE long-form extracted for $0.48; 1,388 people; only 2 probable-KW (metadata rarely states nationality).

- Do NOT weaken nationality rules. Never infer from name, family name, channel, or dialect. UNKNOWN is correct.
- **M1 acceptance** depends only on the gold-set DoD (precision ≥97%, recall ≥92%, 0 hallucinations, content-kind ≥95%, 0 false merges). Low verified-nationality rate is NOT an M1 failure.
- **M1 Closeout (before M2):**
  1. **Kuwait Context** — a derived/computed view (not source-of-truth): `kwCoreAppearanceCount`, `kwCoreUniqueChannelCount`, `level` none (0) / weak (1 KW CORE appearance) / strong (≥2 KW CORE appearances, or ≥2 on the same KW CORE channel), `reasons[]`. UI wording: «سياق كويتي قوي — الجنسية غير متحققة», never «Likely Kuwaiti».
  2. **Nationality Review queue** — default filter: nationality UNKNOWN AND Kuwait context ≠ none; ordered by KW CORE channel count, then KW appearance count, then latest appearance. Shows name, aliases, KW appearances, KW channels, latest appearance, episode titles, Khat link, nationality status. Buttons: كويتي / غير كويتي / غير متأكد. Any authorized editor; audited.
  3. New field `nationality_verification_method`: `source_evidence` | `existing_khat_record` | `manual_editorial` | null. A manual «كويتي» = verified + manual_editorial.
  4. Three separate registry filters: verified Kuwaiti men / Kuwait-context men (nationality unverified) / all men appearing on Kuwaiti podcasts.
- The 42 validation failures stay rejected under `EXTRACTION_VALIDATION_FAILED` in their own queue; sample them in the gold set. If they are mostly real guests, fix the extractor/evidence contract — never loosen the validator.
- No bulk Wikidata/X/LinkedIn verification of the 1,388. External verification is targeted only, when a person becomes a real candidate (M5).
- **M2 is re-scoped:** Transcript Evidence Layer → Identity Signals (first 5–8 minutes, exact-quote verified) → Previous Coverage → FULL_STORY.
  - «أنا كويتي» → VERIFIED (self-identification).
  - «ضيفنا الكويتي فلان» → PROBABLE.
  - «أنا من الكويت» → PROBABLE at most.
  - «ولدت/أعيش في الكويت» → proves nothing.

## Addendum 2 — 2026-10-03: gold-set fixes (ChatGPT, final)

Noura's gold set (200 episodes, manual) found:
- Precision 98.0%, content-kind 98.5%, 0 hallucinations across all 1,393 appearances, 0 false merges, P95 100ms.
- Weighted recall 95.2%. On the full sample, which deliberately includes the failed episodes, recall was 86.5%.
- All 42 failed episodes were real guests, lost to text-form differences.

Rule: **tolerant of text form, strict on evidence meaning.**

- **a. Normalization approved.** Before matching, collapse all whitespace to a single space and strip tashkeel, on both sides. Store the original text unchanged and use the normalized copy for comparison only.
- **b. One attached proclitic approved.** Exactly one of و / ب / ل / ف, directly attached to the start of the name in the source. The rest of the name must match fully after normalization. No stacked proclitics, no fuzzy matching.
- **c. Hosts.**
  - Add `host_names` per channel/program, filled manually first.
  - The heuristic (a name appears as guest in more than 30% of a channel's episodes) only produces `HOST_CANDIDATE_REVIEW`. After human review the name enters `host_names` and is then excluded deterministically.
  - The prompt must separate people. The validator rejects any `display_name` that joins two people with a conjunction; re-extract that episode instead.
- **d. Nationality: PROBABLE KW** is allowed only when all of these hold:
  - the guest's name is present;
  - كويتي or كويتية is present;
  - both are in the same clause;
  - at most 6 tokens sit between the end of the name and the adjective;
  - no second person's name sits between them.

  VERIFIED is still manual or from a stronger source only.
- **e. Re-run the 42 failed episodes and the episodes with known issues only.** Then re-score the same gold set.
- **M1 passes** if precision ≥97%, weighted/random recall ≥92%, hallucinations = 0, content-kind ≥95%, and false merges = 0. The stress sample of deliberately failed episodes is tracked separately and is not a gate.
