Khat Podcast Universe
M1 Production Release + M2 Transcript Evidence Layer
Final Implementation Specification

Status: FINAL
M1: Accepted
Next milestone: M2 — Transcript Evidence Layer
Production visibility: Admin-only
Public-facing impact: None

1. M1 Final Status

M1 is officially:

PASS

Final quality:

Precision 100%
Weighted Recall 98.8%
Random Recall 99.3%
Hallucinated guest names 0 / 1,445
Content-kind accuracy 98.5%
False person merges 0
Duplicate appearance 0
Tests 4,692 passing
Build PASS

The three remaining latent issues are release blockers but do not reopen M1's architecture or acceptance criteria.

They must be fixed and covered by regression tests before production deployment:

1. Kuwaiti nationality false-positive guards
2. Host-only episodes → no_guest
3. Remaining 9 KW appearances → re-extraction

After those are green:

M1 = RELEASE READY
2. Production Deployment Decision
FINAL DECISION

Deploy M1 to production before M2.

Do not wait for M2.

Why

M1 is:

additive;

isolated;

admin-only;

independently useful;

already quality-tested;

non-destructive to existing Khat flows.

Waiting for M2 would combine:

schema
crawler
guest extraction
identity
transcripts
coverage
FULL_STORY

into one first production release.

That increases rollback complexity without improving safety.

Ship the proven layer first.

3. What Moves From Local to Production
Move
code
migrations 0037–0043
tests
admin UI
channel seed configuration
program host_names
prompt versions
quota configuration
feature flags
Do NOT move

Do not bulk-copy:

podcast_episodes
podcast_people
guest appearances
AI extraction output
crawl runs
local audit history
local derived identity states

from the development database.

Production must independently rebuild those records.

4. Exception — Curated Control Data

Some local information is not "derived crawl data"; it is configuration.

These should move.

Examples:

verified seed channels
registry types
program-level host_names
manually authored extraction rules
prompt version
quota limits

Prefer representing these through:

seed script
or
idempotent application bootstrap

rather than copying production rows manually.

Host identities must be stable references where possible.

5. Why Production Re-crawl Is Required

The production rebuild proves:

same code
+
same channel registry
+
same rules
=
same quality of universe

It also ensures:

production row IDs are internally consistent;

AI runs are logged in production ai_runs;

production audit history starts cleanly;

quota accounting reflects production usage;

no development-only correction leaks into production unnoticed.

Expected cost:

YouTube quota ~309 units
AI ~US$0.6

based on the local run.

This is trivial compared with the value of deterministic reproduction.

6. Production Release Sequence

Use this exact release order.

Step 1 — Pre-release
close 3 latent defects
run all tests
tsc
lint
production build

QA sign-off required.

Step 2 — Backup

Take database backup before applying migrations.

Record:

backup timestamp
git commit
migration head
production DB migration version
Step 3 — Apply migrations

Apply:

0037–0043

No destructive migration.

Verify expected new tables/indexes immediately afterward.

Step 4 — Deploy code

Build/restart using existing production procedure.

Podcast Universe should initially be behind:

PODCAST_UNIVERSE_ENABLED=true

for admin code only.

There must be no public route.

Step 5 — Seed control data

Insert/verify:

7 CORE channels
1 CONTEXT channel
program host_names
quota settings

Idempotently.

Step 6 — Production canary

Do not launch all eight channels immediately.

First run:

@JadwaPodcast
+
one larger Kuwaiti channel

Recommended second channel:

@bidonwaraq

Validate:

crawler
episode counts
duration classes
Luna extraction
host exclusion
identity behavior
ai_runs costs
quota counter
admin UI
Step 7 — Full production crawl

If canary is clean:

remaining seed channels
→ initial crawl
→ Luna extraction
→ identity resolution

Use low/normal background queue priority so production podcast operations remain more important.

Step 8 — Production smoke QA

Noura checks at least:

20 random extracted appearances
10 no_guest
10 host exclusions
10 Kuwait probable claims
10 similar-name identities

If clean:

M1 PROD = ACCEPTED
7. Production Rollback

Because all M1 schema changes are additive:

rollback means:

disable Podcast Universe feature
stop Podcast Universe jobs
leave tables intact

Do not drop the tables during rollback.

Deleting them requires Khaled approval.

8. M2 Objective
Transcript Evidence Layer

M2 answers:

What did this person actually say?

before trying to answer:

Has this person already told the full story?

The M2 pipeline is:

GuestAppearance
↓
Transcript Acquisition
↓
Transcript Validation
↓
Identity Signals
↓
Coverage Subject
↓
Story Coverage Evidence
↓
FULL_STORY / PARTIAL / UNCLEAR
9. Critical Architectural Decision for M2

FULL_STORY_FOUND must not be stored as a permanent property of a person or episode.

This is wrong:

episode.full_story = true

because "full story" is meaningless without specifying:

full story of WHAT?

Correct model:

Person
+
Central Experience
+
Previous Appearance
=
Coverage Evaluation

Therefore M2 introduces an explicit:

CoverageSubject

representing the central experience being tested.

Example:

Person:
Ahmed X

Coverage Subject:
"His experience being imprisoned during the Iraqi invasion"

Episode:
2-hour business interview

Result:
same_story = NO

That episode cannot disqualify the invasion story merely because it is two hours long.

10. M2 New Tables

M2 adds five main entities.

podcast_episode_transcripts
podcast_identity_signals
coverage_subjects
podcast_coverage_evaluations
podcast_coverage_element_evidence

Plus optional operational run table if not covered cleanly by existing jobs.

11. podcast_episode_transcripts
type PodcastEpisodeTranscript = {
id: UUID;

episode_id: UUID;

source:
| "youtube_manual_captions"
| "youtube_auto_captions"
| "whisper";

language: string | null;

status:
| "pending"
| "available"
| "unavailable"
| "failed"
| "superseded";

raw_text: string | null;

normalized_text: string | null;

segments: jsonb | null;

duration_covered_seconds: integer | null;

word_count: integer | null;
character_count: integer | null;

transcript_hash: string | null;

source_metadata: jsonb | null;

retrieved_at: timestamptz | null;

error_code: string | null;
error_detail: string | null;

created_at: timestamptz;
updated_at: timestamptz;
}

Constraint:

one active transcript per:
episode + language + source priority

Old transcript versions use:

superseded

not deletion.

12. Transcript Segments

Store timestamps.

Recommended shape:

[
{
"start": 152.4,
"end": 156.8,
"text": "..."
}
]

Why timestamps matter:

Later Khaled can see:

Turning point
01:03:17
"..."

and jump directly to that point.

13. Transcript Normalization

Use the same philosophy proven in M1.

Store raw source text unchanged.

Create normalized copy for matching.

Allowed normalization:

Unicode NFKC
all whitespace → single space
remove Arabic tashkeel
remove tatweel
normalize line breaks

Do not:

rewrite words
stem
paraphrase
correct spelling
normalize names semantically

Evidence verification may match against normalized text.

The original quote must still be retained.

14. Transcript Acquisition Priority

Use this order:

1. existing YouTube captions
2. alternate caption language if appropriate
3. Whisper only if coverage evaluation actually needs it

Do not Whisper all missing-caption episodes.

15. yt-dlp Rules

M2 can attempt captions for all relevant long-form guest appearances.

Relevant means:

CORE_INTERVIEW
AND
CORE_LONGFORM
AND
verified/reviewable GuestAppearance

Caption retrieval itself is inexpensive and can be cached.

16. Whisper Policy

Whisper is fallback on demand only.

Run Whisper when:

no usable captions
AND
episode matters to an active coverage evaluation

Do not transcribe a 3-hour old appearance merely because it exists.

Whisper jobs must have a separate operational budget.

17. Transcript Completeness

Determine:

coverage_ratio =
duration_covered_by_transcript / video_duration

Statuses:

COMPLETE
>= 0.90

PARTIAL
0.40–0.899

FRAGMENT
< 0.40

A transcript below 90% may still provide evidence but cannot independently support FULL_STORY_FOUND unless all necessary story evidence is inside the available segment and a human reviews the case.

Default:

PARTIAL transcript
→ coverage result cannot auto-FULL
→ HUMAN_REVIEW

This is deliberately conservative.

18. Identity Signals

Create:

type PodcastIdentitySignal = {
id: UUID;

person_id: UUID;
appearance_id: UUID;
transcript_id: UUID;

signal_type:
| "nationality"
| "place_of_origin"
| "gender"
| "profession"
| "self_name"
| "other";

value: string;

attribution:
| "guest_self"
| "host_about_guest"
| "unknown_speaker";

confidence:
| "high"
| "medium"
| "low";

quote: string;
quote_normalized: string;

start_seconds: numeric | null;

quote_verified: boolean;

effect:
| "none"
| "probable_identity"
| "verified_identity";

ai_run_id: UUID | null;

created_at: timestamptz;
}
19. Identity Scan Window

Do not send entire episodes for identity extraction.

Use:

first 8 minutes

Default.

If the first eight minutes contain no guest introduction and episode metadata suggests an interview, optionally extend to:

first 15 minutes

once.

No further identity search automatically.

20. Identity Signal Prompt

Prompt version:

podcast-transcript-identity-v1

Model:

Luna

Input:

{
"appearance": {
"person_id": "...",
"known_name": "حمود الخضر",
"aliases": ["..."]
},
"transcript_excerpt": [
{
"start": 0,
"end": 5.4,
"text": "..."
}
]
}
21. Identity Prompt Rules

System instructions:

Extract identity claims only when explicitly present.

Never infer nationality from:
- dialect
- surname
- city of recording
- host/channel nationality
- employer
- birthplace alone
- residence alone.

Every signal must include an exact quote copied from the transcript.

Distinguish:
1. guest speaking about himself
2. host introducing the guest
3. unknown speaker

Do not label a statement as guest_self unless the text itself makes speaker identity sufficiently clear.

If speaker attribution is unclear, use unknown_speaker.

Return no signal rather than guess.
22. Nationality Upgrade Rules From Transcript
Automatic VERIFIED KW

Allowed only if:

explicit nationality statement
+
speaker confidently attributable to guest
+
quote verified

Examples:

"أنا حمود الخضر وأنا كويتي"

or speaker-labelled transcript mapped to guest:

Guest: "أنا كويتي"
Automatic PROBABLE KW

Examples:

"ضيفنا الفنان الكويتي حمود الخضر"

"حمود الخضر فنان كويتي"

"أنا من الكويت"

assuming evidence is correctly associated with the guest.

No nationality upgrade
"ولدت في الكويت"
"أعيش في الكويت"
"درست في الكويت"
"الشركات الكويتية..."
"هل تعتبر نفسك كويتي؟"

A question without an affirmative answer provides no nationality claim.

23. coverage_subjects

A CoverageSubject represents one central experience.

type CoverageSubject = {
id: UUID;

person_id: UUID;

label: string;

description: string;

verified_facts: string[];

source:
| "manual"
| "story_signal"
| "guest_lead"
| "editorial_brain"
| "coverage_discovery";

status:
| "draft"
| "active"
| "superseded"
| "rejected";

future_story_id: UUID | null;

created_by: UUID | null;

created_at: timestamptz;
updated_at: timestamptz;
}

Examples:

"Building company X"
"Being captured during the invasion"
"Returning to sport after injury"
"Working as a pearl diver"

Do not create vague subjects such as:

"his life"
"success"
"business"
24. Coverage Evaluation
type PodcastCoverageEvaluation = {
id: UUID;

coverage_subject_id: UUID;
appearance_id: UUID;
transcript_id: UUID | null;

ownership_pass: boolean;

same_story_status:
| "yes"
| "no"
| "unclear";

same_story_reason: string | null;

transcript_completeness:
| "complete"
| "partial"
| "fragment"
| "none";

elements_found_count: integer;

classification:
| "full_story_found"
| "partial_coverage"
| "unclear_coverage"
| "not_same_story"
| "transcript_unavailable";

model_version: string | null;
prompt_version: string | null;

ai_run_id: UUID | null;

requires_human_review: boolean;

reviewed_by: UUID | null;
reviewed_at: timestamptz | null;

created_at: timestamptz;
updated_at: timestamptz;
}

Unique:

coverage_subject_id + appearance_id + active analysis version
25. Coverage Elements

Separate evidence rows.

type PodcastCoverageElementEvidence = {
id: UUID;

evaluation_id: UUID;

element:
| "beginning_context"
| "turning_point"
| "cost_consequences"
| "after_the_experience"
| "conclusion_meaning";

detected: boolean;

quote: string | null;

quote_normalized: string | null;

start_seconds: numeric | null;

quote_verified: boolean;

relevance:
| "direct"
| "weak"
| "unclear";

created_at: timestamptz;
}
26. FULL_STORY Algorithm

The final classifier is deterministic.

ownership_pass =
primary guest
AND
episode duration >= 30 minutes

Then:

FULL_STORY_FOUND
ONLY IF:

ownership_pass = true
AND
same_story_status = YES
AND
transcript_completeness = COMPLETE
AND
verified direct elements >= 3

No AI model may directly output final FULL_STORY_FOUND.

AI supplies:

same-story assessment
+
candidate elements
+
quotes

The application validates and computes the classification.

27. PARTIAL Coverage
PARTIAL_COVERAGE

when any of the following:

episode <30 min

OR

same story but <3 verified elements

OR

person discusses experience only briefly

OR

appearance concerns a broader/different topic
but includes meaningful material about target story
28. UNCLEAR Coverage

Use when:

same_story_status = unclear

transcript incomplete

quotes ambiguous

speaker attribution matters and is unclear

long-form candidate has no readable transcript

AI analyses materially disagree

Never force uncertain cases into FULL or PARTIAL.

29. Coverage Prompt Strategy

Do not send an entire 2–3 hour transcript to one unstructured prompt.

Use a two-stage pipeline.

Stage A — Chunk Evidence Extraction

Split transcript deterministically:

15-minute chunks

with:

30-second overlap

Batch several chunks per Luna call as allowed by context budget.

Recommended initial:

4 chunks per request

≈ 60 minutes of transcript.

Fallback:

2 chunks

if token/context threshold is exceeded.

30. Coverage Chunk Prompt

Prompt:

podcast-coverage-chunk-v1

Input:

{
"person": {
"name": "..."
},
"coverage_subject": {
"label": "...",
"description": "...",
"verified_facts": []
},
"chunks": [
{
"chunk_id": "...",
"start_seconds": 0,
"end_seconds": 900,
"text": "..."
}
]
}

Output:

{
"chunks": [
{
"chunk_id": "...",
"same_story_evidence": [
{
"quote": "...",
"start_seconds": 532.1
}
],
"story_elements": [
{
"element": "turning_point",
"quote": "...",
"start_seconds": 601.4
}
]
}
]
}
31. Chunk Prompt Rules
Extract evidence only.

Do not decide FULL_STORY.

Do not paraphrase quotes.

Every quote must appear exactly in supplied transcript text.

Only include story elements directly related to the CoverageSubject.

Do not count general advice as conclusion/meaning unless it is explicitly tied to the person's experience.

Do not count general biography as beginning/context unless it belongs to the target experience.

Do not turn professional commentary into personal experience.
32. Deterministic Quote Validation

Apply M1 principles:

whitespace normalization
tashkeel removal
word-safe matching

Every returned quote must validate against the transcript.

Invalid quote:

discard evidence item

Do not invalidate the whole episode automatically.

Log validation failure.

33. Stage B — Coverage Finalizer

After all valid candidate evidence has been collected:

send only:

CoverageSubject
+
valid evidence quotes
+
element labels

to Luna.

Do not resend whole transcript.

Prompt:

podcast-coverage-finalize-v1

Output:

{
"same_story_status": "yes",
"reason": "...",
"element_relevance": [
{
"element": "turning_point",
"relevance": "direct"
}
],
"requires_human_review": false
}
34. Finalizer Rule

The finalizer may decide only:

same story?
element relevance?
ambiguity?

It cannot decide the final coverage classification.

Application code calculates that.

35. Human Review Trigger

Automatic review required when:

same_story_status = unclear

OR

transcript completeness != complete
but >=3 candidate elements exist

OR

model says same_story=yes
but evidence is weak

OR

coverage would switch from eligible guest
to EXCLUDED_SAME_STORY

AND confidence conditions are not clean

For safety, any first automatic:

FULL_STORY_FOUND

for a person should be visible in a QA/admin review queue during M2 pilot.

After accuracy is established, clean cases may become automatic.

36. Transcript Jobs

Add:

podcast.transcript.fetch
podcast.transcript.whisper
podcast.identity.extract
podcast.coverage.evaluate
podcast.coverage.chunk
podcast.coverage.finalize
37. Job Lanes

Recommended:

podcast.transcript.fetch
→ youtube_io

podcast.transcript.whisper
→ media_processing

podcast.identity.extract
→ ai_structural

podcast.coverage.*
→ ai_structural

Coverage jobs should have lower priority than existing production episode workflows.

38. Idempotency

Dedupe keys should include versions.

Examples:

transcript:<episodeId>:youtube:v1

identity:<appearanceId>:<transcriptHash>:identity-v1

coverage:<subjectId>:<appearanceId>:<transcriptHash>:coverage-v1

Transcript change automatically permits re-analysis.

39. Superseding

Follow the M1 pattern.

New extraction:

supersedes previous analysis

Do not append duplicate active interpretations.

Historical results remain for audit.

40. Transcript Scope for Initial M2 Run

Do not analyze every indexed video.

Initial M2 cohort:

all active primary GuestAppearances
from CORE_INTERVIEW channels
with duration >=20 minutes

Fetch captions.

Identity signal extraction may run on all transcripts obtained.

Coverage evaluation does not run automatically on all people.

Coverage runs:

on demand
+
M2 gold-set cases
+
M3 rehost candidates

This distinction is important for cost.

41. Why Coverage Is On-Demand

A person's two-hour interview may cover:

business
childhood
marriage
failure
sports

Whether it is "full story" depends on the specific story Khat wants.

Precomputing:

full_story = yes/no

for the whole episode would recreate the exact conceptual mistake we are trying to avoid.

42. M2 Admin UI

Add Transcript section to appearance page.

Display:

Transcript source
Language
Coverage %
Word count
Retrieved at
Status
Open transcript
43. Identity Signals UI

On Person page:

Identity Evidence

Rows:

Type
Claim
Attribution
Exact quote
Timestamp
Source episode
Confidence
Effect

Allow admin review.

44. Coverage UI

Person / Story coverage page:

Coverage Subject

then appearances:

Episode
Duration
Same story?
Elements 0–5
Transcript completeness
Classification
Evidence
Review status

Expanding an episode shows:

✓ Beginning/context
00:12:31 — "..."

✓ Turning point
00:44:08 — "..."

✕ Cost

✓ Aftermath
01:21:19 — "..."

? Meaning

This UI is important because Khaled needs to understand why a story was rejected.

45. M2 Budget

Separate budgets.

Caption retrieval
$0 AI

Network/compute only.

Identity extraction

Hard cap:

$1.50

for the full first production identity pass.

Given M1 cost behavior, expected usage should be comfortably lower, but the cap is authoritative.

Coverage evaluation pilot

Hard cap:

$3.00
Whisper

Separate compute budget.

Do not allow Whisper fallback to consume indefinitely.

Initial rule:

max 20 Whisper episodes
during M2 validation

unless manually expanded.

Overall M2 AI hard cap
$5.00

before explicit engineering review.

Not per run.

Cumulative for M2 initial validation, same philosophy as M1.

46. M2 Gold Set

Noura creates two gold sets.

A — Identity
150 appearances

Include:

Kuwaiti explicit;

non-Kuwaiti;

"from Kuwait";

born in Kuwait;

living in Kuwait;

nationality question without answer;

host introductions;

unclear speakers.

B — Coverage
100 CoverageSubject × Appearance pairs

Stratified:

obvious full story
obvious partial
different topic
same person / different story
missing transcript
long but shallow
short but dense
ambiguous same-story

This is more meaningful than sampling episodes alone.

47. M2 Definition of Done — Transcript Layer

At least:

95% of episodes with publicly available captions

must be successfully acquired.

unavailable must be distinguished from failed.

Transcript re-run must create no duplicate active transcript.

48. Identity DoD

On identity gold set:

Unsupported identity claims = 0

KW probable precision >= 98%

KW verified precision = 100%

No nationality inferred from:
dialect
name
channel
birthplace alone
residence alone
question alone

Recall target is secondary.

Required:

>=90% recall
on explicitly stated nationality claims

A missed identity signal is less dangerous than false nationality.

49. Coverage Element DoD

For candidate element extraction:

All accepted quotes verified against transcript = 100%

No element may count toward 3/5 without:

verified quote
+
direct relevance
50. FULL_STORY DoD

On 100 manually labeled pairs:

FULL_STORY precision >= 95%

FULL_STORY recall >= 90%

NOT_SAME_STORY precision >= 95%

Most important invariant:

False FULL_STORY due to a different central experience = 0

on the gold set.

Because that error would wrongly eliminate a valid Khat guest/story.

51. Coverage Safety DoD

No automatic FULL classification when:

duration <30 min

primary guest = false

same_story != yes

verified direct elements <3

transcript incomplete without human review

Automated tests required for all five.

52. M2 Reliability Tests

QA must test:

captions unavailable
captions partial
duplicate caption language
transcript changes
yt-dlp timeout
Whisper failure
AI timeout
AI truncation
invalid quote
chunk retry
one failed chunk
finalizer failure
job restart
quota/budget stop
superseding old result

No failure state may become:

NO_MATCH_FOUND

or:

PARTIAL

by default.

53. M2 Security

Transcript retrieval must only operate on already verified:

YouTube video IDs

Do not let arbitrary user URLs flow directly into yt-dlp.

Reuse existing process isolation and timeout controls.

Whisper media downloads must have:

maximum duration
maximum file size
temporary storage cleanup
54. Initial Maximum Episode Duration

For automatic M2 processing:

4 hours

Episodes over four hours:

MANUAL_REVIEW / SPECIAL_PROCESSING

Do not let one unusual upload dominate worker resources.

55. Maximum Transcript Size Per AI Call

Never send unlimited transcript text.

Enforce application-side maximum before runAiTask.

Chunk based primarily on timestamps.

Default:

15 minutes per chunk
4 chunks per Luna call

If token estimate exceeds router safety threshold:

reduce to 2 chunks
then 1 chunk

Never truncate the last chunk silently.

56. M2 Cost Logging

Every transcript-related AI call must attach:

personId
appearanceId
episodeId
coverageSubjectId if relevant
promptVersion
transcriptHash

to logging/subject metadata where supported.

This gives us:

cost per appearance
cost per coverage decision

later.

57. No Sol in M2 by Default

M2 remains structural/evidence-oriented.

Use:

Luna

only.

Sol may be introduced later in M6 for actual editorial judgment.

If Luna is uncertain:

human review

is preferable to escalating every evidence case to Sol.

58. What M2 Must NOT Do

M2 must not:

recommend guests
rank story quality
generate episode angles
generate titles
decide whether Khaled should invite someone

Those belong downstream.

M2 answers only:

What evidence exists?
What did this person already tell?
How much of this particular experience was already covered?
59. Transition to M3

M2 completion unlocks Rehost Engine.

M3 consumes:

GuestAppearance
+
CoverageSubject
+
CoverageEvaluation
+
appearance recency
+
channel exposure
+
view exposure

and produces:

NEW_TO_PODCASTS
EXCLUDED_SAME_STORY
REHOST_ALLOWED_PARTIAL
REHOST_ALLOWED_NEW_STORY
REHOST_ALLOWED_NEW_CHAPTER
REHOST_REVIEW_OLD
DO_NOT_PRIORITIZE_HIGH_EXPOSURE

No M3 implementation should start until the FULL_STORY gold set passes.

60. Immediate Execution Order
Now
1. Fahad closes the 3 latent M1 issues
2. Add regression tests
3. Noura verifies
4. Full build/test
Then
5. Backup production
6. Deploy migrations + M1 code
7. Seed channels + program hosts
8. Production canary
9. Full production crawl/extraction
10. Noura smoke-checks production
In parallel after release is stable
11. Start M2 schema
12. Transcript acquisition
13. Transcript caching
14. Identity signal extraction
15. Identity gold set
16. CoverageSubject / CoverageEvaluation
17. Chunk evidence pipeline
18. Coverage finalizer
19. Coverage gold set
20. M2 acceptance
61. Final Decisions
Production deployment
YES

after the three latent guards + QA.

Do not wait for M2.

Local data migration
NO

for derived crawl/extraction data.

Production rebuilds it.

Move only curated configuration.

M2 start
YES

immediately after the M1 production release path is stable.

Architectural principle
M1 established WHO appeared.

M2 establishes WHAT they actually said.

M3 will decide whether that previous exposure matters.

M4 maps WHAT the market has covered.

M5 discovers WHO Khat should pursue.

M6 decides WHY the story deserves Khat,
and only then WHAT to call it.

This separation remains non-negotiable.
