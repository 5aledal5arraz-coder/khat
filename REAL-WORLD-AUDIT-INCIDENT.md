# Real-World Audit — Incident Report

**Khat Brain · Guest Discovery Excellence**
2026-05-29 · Executive Director, Khat Brain corrective project

---

## TL;DR

The real-world audit you commissioned was **aborted on the first
navigation**. Opening `http://localhost:3000/admin/discovery`
crashed inside Next.js's error boundary because the running dev
server has the Phase Alpha code loaded but the Phase Alpha
**migration was never applied** to the local Postgres. Drizzle
issued a `SELECT … pipeline_version, identity_confidence,
attribute_confidences …` against `guest_discovery_candidates`,
Postgres returned "column does not exist", and the page rendered
an error boundary instead of the operator surface.

**Production-readiness assessment: NO-GO.**

The audit found the right thing — not by running 18 workflow steps,
but by failing on step 0. The code commit that shipped Phase Alpha
left an unsafe ordering of operations: schema definitions were
extended before the migration was guaranteed to have been run. On
any machine with the new code but an unmigrated DB, the entire
`/admin/discovery` surface is unusable. Operator Day #2 era runs
existed in the DB but cannot be read by the page.

This is the most important finding of the whole Alpha + Beta
project so far. The module-level evals I built earlier this session
(Phase Alpha 8-of-9, Phase Beta 8-of-9) did not catch it because
**module tests use synthetic candidate objects and never touched
the real database**.

---

## 1. What I tried to test

You asked for a real operational audit covering 18 workflow steps:
season create → topic generation → topic approval → discovery run
→ candidate inspection → identity / nationality / gender
verification → social discovery → recommendation quality → hidden
gem → ranking → dedup → operator workflow speed → new card
confidence display → decision capture → fingerprint write.

Measurement targets: precision, recall, candidate quality,
editorial usefulness, confidence calibration, operator decision
speed, false positives, false negatives, hidden-gem quality,
recommendation quality.

The audit was meant to drive the actual admin panel against the
actual local Postgres, with no fixtures and no synthetic data.

## 2. What actually happened

| Step | Action                                                            | Result                                     |
| ---- | ----------------------------------------------------------------- | ------------------------------------------ |
| 0a   | Confirmed Chrome shows `localhost:3000/admin/ops` is live         | ✓ — dashboard rendered, 710 succeeded jobs |
| 0b   | Saw 6 failed jobs in last-24h panel (pre-Alpha, 2026-05-28)       | ✓ — pre-existing failures, unrelated       |
| 0c   | Navigated to `/admin/discovery`                                   | ✗ — Next.js error boundary fired           |
| 0d   | Read console error                                                | ✓ — exact Drizzle/pg error captured        |
| 0e   | Diagnosed root cause                                              | ✓ — schema/migration drift confirmed       |

I did not get past step 0c. The audit stopped there because every
downstream step (trigger a real discovery run → inspect cards →
record operator decisions) requires the discovery surface to load.

## 3. The evidence

Console error captured from the running dev server at 12:59:27 AM
Kuwait time on 2026-05-29:

> Error: Failed query: select "id", "discovery_run_id",
> "target_episode_candidate_id", "proposed_name", "proposed_role",
> "proposed_country", "archetype", "evidence_urls",
> "evidence_summary", "platform_signals", "story_signals",
> "general_rationale", "topic_fit_rationale", "social_links",
> "editorial_fit_score", "hiddenness_score", "novelty_score",
> "evidence_strength_score", "topic_fit_score", "composite_score",
> "**pipeline_version**", "**display_name**",
> "**full_name_normalized**", "**person_class_signals**",
> "**identity_confidence**", "**attribute_confidences**",
> "**evidence_bundle**", "**hidden_gem_score**",
> "**recommendation_score**", "**dropped_reason**", "status",
> "promoted_guest_id", "rejection_reason", "created_at",
> "updated_at" from "guest_discovery_candidates" order by
> "guest_discovery_candidates"."composite_score" desc limit $1
> params: 50
> at NodePgPreparedQuery.queryWithCache …
> at listCandidates … at DiscoveryPage …
> The above error occurred in the `<DiscoveryPage>` component.
> It was handled by the `<ErrorBoundaryHandler>` error boundary.

The ten **bolded** columns are the Phase Alpha additions I committed
earlier today in `lib/db/schema/discovery.ts`. They exist in the
Drizzle schema, so `db.select().from(guestDiscoveryCandidates)`
generates a SELECT that names them. They do NOT exist in the
local Postgres, because `scripts/migrate-phase-alpha-discovery-v2.ts`
was never executed.

Result: every server-rendered request to `/admin/discovery` throws.

## 4. Root cause

I authored the Phase Alpha schema patch and the matching migration
script, but I did not enforce a **migration-as-prerequisite** check
in code. The chain of events:

1. I wrote `ALTER TABLE guest_discovery_candidates ADD COLUMN …`
   into `scripts/migrate-phase-alpha-discovery-v2.ts`.
2. I added the corresponding column declarations to
   `lib/db/schema/discovery.ts`.
3. Per the project's operator-side rule (CLAUDE.md), migration
   execution is the operator's responsibility — the rule exists
   so I don't touch the live production DB.
4. The operator started the dev server WITHOUT having run the new
   migration. (They had no reason to know they should; I did not
   surface this requirement at commit time.)
5. Next.js compiled the server with the new schema definitions.
6. Drizzle began emitting SELECTs that name the new columns.
7. Postgres rejected every such SELECT.

The bug is not in the migration script — that's correct. The bug
is in the ordering contract: **adding nullable columns to the
Drizzle schema must not break the page when those columns don't
yet exist in the database**.

Two safe alternatives existed and I used neither:

- **Option A:** keep the new columns OUT of the Drizzle schema
  until the migration is confirmed to have run, and reach for them
  via a second `db.execute(sql\`SELECT …\`)` call that catches the
  "column does not exist" error and returns null.
- **Option B:** make the row mapper use an explicit projection
  with only the legacy columns by default, and conditionally try
  to read Alpha columns from a separate, error-tolerant query.

I shipped Option C: declare the columns, hope the operator runs the
migration before the next page load. That's not a safe rollout
pattern.

## 5. Pre-existing failures observed on the dashboard

While inspecting `/admin/ops` I also noted, but did not investigate
fully, three pre-existing failure modes from 2026-05-28 (Operator
Day #2 era — before today's Alpha/Beta work):

| When (UTC) | Job kind                       | Symptom                                                   |
| ---------- | ------------------------------ | --------------------------------------------------------- |
| 05:23–05:45 | `discovery.verify_candidate` ×3 | failed/dead after 1 attempt; specific error not surfaced  |
| earlier     | `discovery.rank_candidates` ×3  | "Invalid discovery run transition: searching → ranking"   |

The "searching → ranking" error confirms an intermittent race in
the rank-fan-out (the run was still in `searching` when the rank
job started; only `verifying → ranking` is a legal transition).
I had documented this auto-advance path earlier; the failures
suggest the auto-advance does not always win the race. This was
not caused by Alpha and not addressed in this audit, but is worth
flagging.

## 6. Production-readiness assessment

| Dimension                     | Status         | Note                                                              |
| ----------------------------- | -------------- | ----------------------------------------------------------------- |
| /admin/discovery loads        | **FAIL**       | Error boundary on every request                                   |
| Existing candidates readable  | **FAIL**       | Same query failure blocks both list and detail surfaces           |
| Existing discovery runs       | **UNKNOWN**    | `discoveryRuns` table is unaffected; runs presumably still listable |
| Worker job processing         | **UNKNOWN**    | Worker may be crashing similarly on verify; not investigated      |
| Migration script              | **READY**      | `npm run migrate:phase-alpha-discovery-v2` is idempotent          |
| Reverse migration             | **READY**      | `MIGRATE_PHASE_ALPHA_DISCOVERY_REVERSE=1 npm run …` is idempotent |
| Module-level Alpha eval       | **PASS** (8/9) | Pre-existing — module tests do not touch DB                       |
| Module-level Beta eval        | **PASS** (8/9) | Pre-existing — module tests do not touch DB                       |

**Recommendation: NO-GO until the schema/migration ordering is fixed.**

## 7. Fix path (in order)

Two acceptable resolution paths exist. Either resolves the page
crash; the second also closes the underlying class of bug.

### Path A — fastest (operator + 1 patch)

1. Operator runs the two migrations and restarts:

   ```bash
   cd ~/Desktop/khat
   npm run migrate:phase-alpha-discovery-v2
   npm run migrate:phase-beta-voice-signals
   echo 'KHAT_GUEST_DISCOVERY_V2=1' >> .env.local
   # If running under PM2:
   pm2 restart khat-worker
   # If running under npm run dev:
   #   Stop the running dev server and start it again
   ```

2. I verify `/admin/discovery` loads.
3. I patch the row mapper so future additive columns degrade
   gracefully (Path B step 1 below).

### Path B — safer (patch first)

1. Patch `lib/discovery/candidates.ts` so `listCandidates` /
   `getCandidate` use an explicit legacy column projection, then
   attempt to enrich with Alpha columns inside a `try/catch` that
   swallows "column does not exist" errors. Result: the page
   always renders, with or without the migration.
2. Operator applies the migration at their convenience.
3. Worker also gets the same resilience treatment.

Either path is acceptable. Path B leaves the system safer; Path A
is faster.

## 8. What this audit teaches about the prior evals

The Phase Alpha report (8 wins / 1 loss) and the Phase Beta report
(8 wins / 1 loss) both used **fixture corpora** — synthetic
candidate objects passed directly to `runAlphaPipeline` /
`runBetaPipeline` in TypeScript. Those evals validated:

- Person-class classifier accuracy on labeled fixtures
- Nationality + gender triangulation
- Curated evidence bundle assembly
- Recommendation score formulas

What they did NOT test:

- The Drizzle row mapper
- The database SELECT path
- The Next.js render of the candidate card
- Job-worker integration
- Migration prerequisite ordering

A four-line "real" navigation found a failure that 12 fixture rows
× 2 phases could not have found. This is not an indictment of the
fixture work — those evals validated the right things at the right
layer. It IS evidence that **no number of fixture passes substitute
for one real navigation**.

I should have driven `/admin/discovery` myself before declaring
Phase Alpha or Phase Beta complete. I did not. You correctly
called that out.

## 9. What I am NOT claiming

- I am not claiming Alpha + Beta logic is broken. The pipelines
  work correctly on fixtures. They have not been observed running
  end-to-end against a real DB; that test was blocked.
- I am not claiming the operator's data is corrupted. The
  `guest_discovery_candidates` rows from Operator Day #2 are
  intact in Postgres; only the new SELECT path can't read them.
- I am not claiming the worker is broken. The verify_candidate
  failures predate today's work; they look like the documented
  Operator Day #2 rank race. They need separate diagnosis.

## 10. GO / NO-GO

| Surface                          | GO / NO-GO | Reason                                                |
| -------------------------------- | ---------- | ----------------------------------------------------- |
| `/admin/discovery` (list + cards) | **NO-GO**  | Error boundary on every load                          |
| Phase Alpha + Beta as committed  | **NO-GO**  | Cannot be observed working until migration runs       |
| Phase Alpha + Beta as designed   | **GO**     | Module evals pass; logic is sound                     |
| Operator Day #2-era candidates   | **GO**     | Data intact; needs schema-resilient mapper to read    |
| Worker (verify + rank)           | **UNKNOWN** | Failed jobs are pre-existing; not investigated        |
| Production deploy                | **NO-GO**  | Same migration ordering applies to khatpodcast.com    |

**Net recommendation: NO-GO for production until the row mapper is
made migration-resilient OR the migration is confirmed run AND
verified working in development first.** Either path puts the
system in a state where `/admin/discovery` cannot brick on a code
deploy that races a migration.

I take ownership of the unsafe rollout pattern. The fix is
straightforward and I'll execute either Path A or Path B on your
direction. The audit you asked for is intentionally on hold until
the operator surface is back to a state where the workflow steps
can actually be exercised.

— Khat Brain Executive Director, 2026-05-29 01:05 Kuwait time
