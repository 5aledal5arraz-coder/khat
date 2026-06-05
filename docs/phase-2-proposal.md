# Khat Brain — Phase 2 Architecture Proposal

**Status:** PROPOSAL — pending operator review.
**Date opened:** 2026-05-23
**Author:** Phase 1 acting CTO (Khat Brain agent)
**Predecessor:** [`docs/phase-1-closure.md`](./phase-1-closure.md) (GO, 2026-05-23)
**Scope:** Phase 2 architectural direction. No code. No migrations. No scaffolding. Planning only.

---

## 0. Framing

Phase 1 hardened the substrate. It did **not** finish the editorial system — it gave us the observability and rate-limit floor that lets Phase 2 work be honest rather than mystical. The job of this proposal is to convert Phase 1's substrate into operational reality: every AI call accounted for, every state transition legal, every long-running task replayable, and one canonical guest identity that every subsystem can trust.

This document is brutally honest about where the codebase actually is. It avoids hype patterns. It explicitly refuses several technologies that would be appropriate at 100× the current scale but are debt at today's scale.

---

## 1. Architectural diagnosis after Phase 1

### 1.1 What Phase 1 left us with

- **AI Router exists and is wired**, but only **5 of 26 features** route through it. The other 21 still call `getClient()` or `new OpenAI()` directly. Concrete evidence: `Grep "getClient(|new OpenAI("` returns 21 files in `lib/`, including `lib/ai/studio.ts`, `lib/ai/preparation/generate.ts`, `lib/ai/deep-analysis.ts`, `lib/ai/guest-intelligence.ts`, `lib/ai/episode-intelligence.ts`, `lib/khat-map/v2/openai-engine-ai.ts`, `lib/guest-candidates/ai-analysis.ts`, and several more. Every claim about "we have cost observability / rate limiting / prompt versioning" is only true for 19% of the AI surface today.
- **EIR is a label, not a state machine.** `episode_intelligence_records` carries a 15-phase enum and `eir_phase_transitions` is a write-log, but no code enforces legal transitions. A phase write goes through whoever holds a DB connection.
- **Background-job substrate is more mature than I expected.** `lib/jobs/worker.ts` exists (129 LOC) with FOR UPDATE SKIP LOCKED claim semantics, lease-based stale reclaim, registered-handler pattern, graceful shutdown, and 6 handlers wired (`demo`, `youtube-performance`, `discovery`, `market-intelligence`, `market-scoring`, `original-thinking`). This is a real queue. It is **not** running as a daemon in production yet, and only 6 handlers exist out of dozens of potential job-types.
- **Guest identity is fragmented.** Three competing surfaces: `guests` (public), `guest_candidates` (discovery output), `guest_application_*` (apply-form). The Phase-1 allowlist (`cross-3`) acknowledges 2 stale candidate pointers in `khat_map_episode_candidates.suggested_guest_candidate_id`. There is no single resolver.
- **JSONB validators are intentionally lenient.** Five schemas in `lib/db/validators/schemas/` are `.loose()`. REPORT-mode drift is being collected. Tightening is queued.
- **No event log.** Each subsystem writes its own audit log shape (`admin_audit_logs`, `eir_phase_transitions`, `market_signal_review_events`, `khat_map_user_feedback`, etc.). There is no general-purpose "X happened to Y at T" surface.
- **Stale `ai_runs.status='running'` leak.** Documented in P1.6 risks. Counts against the rate limit forever. No sweeper.
- **`tsc --noEmit` clean. `eslint` clean.** 21 acknowledged FK drift entries. Five locked baselines. No new technical debt introduced by Phase 1.

### 1.2 What Phase 1 did NOT touch (intentionally)

- Generator migration beyond the five baseline-scored prompts.
- EIR state-machine enforcement.
- Cross-system orchestration semantics.
- Production deployment.
- Worker daemon promotion to PM2.
- Cost / quality dashboard.
- Cron wiring (Phase 7).
- Anything in the legacy `/lib/ai/*` surface (untouched by design).

Phase 2's job is to close exactly these gaps, in the order least likely to surface cascading regressions.

---

## 2. Biggest remaining architectural risks

Ranked by severity. Every one is real, current, and grounded in the codebase as it stands today.

| # | Risk | Severity | Why it's hot |
|---|---|---|---|
| R1 | **21/26 generators bypass the AI Router.** Cost telemetry, rate limiting, prompt versioning, retention, audit — all only apply to 5 features. | CRITICAL | The Router is the chokepoint. Until every generator goes through it, every Phase-1 guarantee is partial truth. |
| R2 | **EIR phase transitions are unenforced.** Code paths can advance an EIR forward, backward, or skip phases. The 15-phase enum exists as labels, not a guard. | HIGH | Production data integrity. One careless `update` call corrupts the editorial lifecycle. |
| R3 | **Guest identity is split across 3+ tables with no resolver.** `guests`, `guest_candidates`, `guest_application_*`. EIR points at one; Studio at another; Khat Map at a third. | HIGH | Every Phase 2+ feature that touches "the guest" picks a shape, adding to the fragmentation. |
| R4 | **Worker daemon not promoted.** The substrate exists (`lib/jobs/worker.ts`) but the operator runs `npm run worker` manually. PM2 supervision is set up for the web app, not the worker. If the worker dies, work stops silently. | HIGH | Every scheduled cron task plus all queue-claim work depends on this process running. |
| R5 | **No event log.** Replay is impossible. "What happened to episode X between 14:00 and 16:00" cannot be answered without spelunking five log shapes. | MEDIUM | Foundation for learning, debugging, and operator trust. |
| R6 | **Stale running `ai_runs` leak.** A generator crash leaves a `running` row forever, eating a rate-limit slot. | MEDIUM | Today's traffic is low so the leak is theoretical. Phase 2 traffic will surface it. |
| R7 | **JSONB validators are lenient.** Content drift slips through. | MEDIUM | Phase 2 will write more JSONB. Tightening blocks Phase 2.7. |
| R8 | **Cost is recorded but not visible.** `ai_runs.cost_usd` and `ai_runs_summary` exist. There is no operator dashboard. | MEDIUM | We're flying with cost data we can't read. |
| R9 | **Connection pool is sized for script-mode (max=2).** Production traffic + worker daemon + admin browsing will saturate this immediately. | MEDIUM | Pure config — easy to fix but only after we know production-mode shape. |
| R10 | **No deployment pipeline.** Files uploaded via SCP, `pm2 restart khat` by hand. No smoke gate, no version bump, no rollback. | LOW (only because traffic is low) | A change-management gap, not an architecture gap. Will hurt at production scale. |
| R11 | **Prompt VERSION constants are honor-system.** `tests/prompts/snapshots.test.ts` exists but does NOT enforce "if snapshot changed, VERSION must bump." | LOW | Phase 0 culture, fixable by a single test addition. |
| R12 | **No model-level cost ceiling.** Tier limits cap total daily cost per category, but a single oversized prompt can still consume a tier's daily budget in one call. | LOW | Theoretical at current scale. Worth tracking. |

R1–R4 are the spine of Phase 2. The rest are downstream.

---

## 3. Proposed target architecture

Eight subsystems. Each one bounded, owner-clear, with explicit GO/NO-GO. None are net-new architecture — every one is a hardening or completion of something Phase 1 left half-done.

### 3.1 P2.0 — Universal AI Router migration

**Purpose.** Every AI call in the system flows through `runAiTask`. No exceptions. No `getClient()` / `new OpenAI()` survives in `lib/ai/*`, `lib/khat-map/*`, `lib/guest-candidates/*`, `lib/discovery/*` (where not already), `lib/studio/*`, `lib/preparation/*`.

**What it replaces.** Direct provider clients in 21 files (enumerated by grep at proposal time). Per-feature provider/model selection scattered across modules.

**Scope.**
- Migrate each generator one-by-one. Each migration: replace `chat.completions.create` with `runAiTask`, attach `prompt_version` from a builder in `lib/ai/prompts/<feature>.ts`, set `actor_id`, set `subject_table` + `subject_id`.
- Each migration ships with a snapshot test (extends `tests/prompts/snapshots.test.ts`).
- No prompt content changes during migration — pure plumbing. Quality must not move.
- Eval re-baseline after each migration to prove "no quality regression."

**Dependencies.** None. This is the precondition for everything else.

**Owner.** Substrate / @khalid.

**GO/NO-GO.** **GO** — critical path. Nothing in Phase 2 lands cleanly until this is done.

**Estimated surface.** ~21 migrations. Group into 5 batches of ~4 each (one per feature domain) to keep PR review tractable.

### 3.2 P2.1 — EIR state machine enforcement

**Purpose.** Convert the 15-phase enum from a label into a guard. Every phase transition must declare its `from → to` and pass a transition predicate. Illegal transitions throw.

**What it replaces.** Ad-hoc `update episode_intelligence_records set phase = ...` calls. The current `eir_phase_transitions` log becomes the audit of legal transitions only.

**Scope.**
- A single `transitionEir({ from, to, actor, reason })` API in `lib/eir/service.ts`.
- A static transition table: which phases can legally precede which.
- A row-level lock on EIR during transition (`SELECT ... FOR UPDATE`) so two writers can't race.
- Backfill of the new API into every existing transition write site (5–10 call sites).
- A stale-running sweeper for `ai_runs` (P2.1's natural home — same domain).

**Dependencies.** P2.0 lightly — some transitions happen as a side effect of AI runs, and the sweep is cleaner once every AI run is identifiable via `runAiTask`.

**Owner.** Substrate / @khalid.

**GO/NO-GO.** **GO** — closes a real correctness gap. Can run partially in parallel with P2.0 (different files).

### 3.3 P2.2 — Job substrate promotion + handler expansion

**Purpose.** Make the existing `lib/jobs/worker.ts` a production-grade daemon, expand handler coverage from 6 to N, and standardize the contract every long-running task uses.

**What it replaces.** Operator-driven `npm run` invocations. Manual cron-by-shell. Ad-hoc retry logic per feature.

**Scope.**
- Promote worker to PM2 as a separate process (`pm2 start npm --name khat-worker -- run worker`).
- New handler contract: every handler takes an idempotency key, supports a retry-with-backoff policy, and emits structured progress (no `console.log` spam).
- Migrate every operator-driven cron into a handler: retention pass, discovery cron-check, performance ingestion, market scheduler (already there). Aim for **0 manual cron invocations** at exit.
- Worker health endpoint or admin-page tile (see P2.5).
- Add the stale `ai_runs.status='running'` sweeper as a recurring handler.

**Dependencies.** P2.0 (handlers will invoke the Router for any AI work). P2.1 (sweeper lives here but reaches into EIR).

**Owner.** Substrate / @khalid.

**GO/NO-GO.** **GO** — biggest operational lift in Phase 2. The substrate is already excellent; we're just turning it on.

**Explicit non-goals.** Do NOT migrate to pg-boss, BullMQ, RabbitMQ, Kafka, SQS, or any external queue system. The current Postgres-based queue is appropriate for our scale and has zero dependency surface. The temptation to "graduate" to a fancier queue should be resisted hard.

### 3.4 P2.3 — Canonical event log

**Purpose.** A single `system_events` table that every subsystem emits to. Foundation for replay, learning, debugging, and Phase 6+ operator dashboard.

**What it replaces.** Nothing immediately — it sits alongside existing audit logs. Over Phase 2/3, the per-feature audit shapes can be replaced by views over `system_events`.

**Scope.**
- One table, simple shape: `(id, occurred_at, entity_table, entity_id, event_type, payload jsonb, actor_id, source)`.
- An emit helper (`emitSystemEvent`) used in 4–6 high-value sites: EIR phase transition, AI run completion (success + fail), guest application received, rate-limit block, retention strip.
- No replay engine yet — Phase 2.3 is *write-only* from the system's perspective. Replay is Phase 3+ and out of scope.
- Indexed for entity-lookup (`entity_table + entity_id + occurred_at desc`).

**Dependencies.** P2.1 (EIR transitions are the headline event source). P2.0 (AI run completion events come from the Router).

**Owner.** Substrate / @khalid.

**GO/NO-GO.** **GO** — small, additive, high value. Builds the foundation we'll be glad we have in Phase 3.

### 3.5 P2.4 — Guest identity unification

**Purpose.** Collapse the three current guest surfaces (`guests`, `guest_candidates`, `guest_application_*`) into one canonical identity table with a stable id. Every other table points at it.

**What it replaces.** Today's identity fragmentation. `khat_map_episode_candidates.suggested_guest_candidate_id` orphans (`cross-3` allowlist entry).

**Scope.**
- One canonical `guest_identities` table with stable id.
- Three "source" tables (`guests_legacy`, `guest_candidates`, `guest_applications`) survive as inputs that *resolve* to a canonical identity through a deterministic merge function.
- A `resolveGuestIdentity({ source, source_id })` API that every Phase 2+ feature uses.
- Backfill script (idempotent, dry-run by default — same pattern as P1.5 retention) that walks the three sources and creates canonical rows.
- The deterministic merge uses: name + role + country + at most 1 outbound link. No ML, no embeddings. Conflicts surface to operator review.

**Dependencies.** P2.0 (any AI-driven guest enrichment routes through the Router with `subject_table = 'guest_identities'`). P2.3 (a guest identity merge emits a `system_event`).

**Owner.** Guests / @khalid.

**GO/NO-GO.** **GO with sequencing care** — touches many tables. Sequence after P2.0 is at least 50% done so the AI-driven enrichment paths target the new shape.

**Explicit non-goals.** Do NOT introduce embedding-based de-duplication. Do NOT introduce a "trust score" for guests. Deterministic merge only. Operator-reviewed conflicts.

### 3.6 P2.5 — Cost + quality + health dashboard

**Purpose.** Surface the telemetry Phase 1 collected. One admin page tile per substrate piece, plus a unified system-health page.

**What it replaces.** SSH + SQL. Operator should never need to query `ai_runs_summary` by hand.

**Scope.**
- One admin page (`/admin/system-health`) with tiles for:
  - Daily cost (light tier + expensive tier) — sourced from `ai_runs_summary`.
  - Last 7d quality scores (per feature, from `evals/baselines.json` + latest report).
  - Rate-limit `would-have-been-blocked` counts (7d, sourced from `ai_rate_limit_events`).
  - JSONB drift counts (7d, sourced from `jsonb_validation_events`).
  - Worker health (last claim, queue depth, recent failures).
  - Stale `ai_runs.status='running'` count.
- One CSV export per tile for offline analysis.
- Wire `npm run observe:phase-1-report` data into the page (same queries, surfaced as UI).

**Dependencies.** P2.0 (most telemetry only gets richer once all generators flow through the Router). P2.2 (worker tile needs the daemon running). P2.3 (a unified event timeline tile is nice-to-have).

**Owner.** Substrate / @khalid.

**GO/NO-GO.** **GO** — the operator visibility we owe ourselves. Modest LOC, high leverage.

### 3.7 P2.6 — Production deployment pipeline

**Purpose.** Replace `scp + pm2 restart` with a reproducible deploy. Git-based, smoke-gated, rollback-able.

**What it replaces.** Today's manual upload-then-pm2 cycle.

**Scope.**
- Git-based deploy script: `git pull` on server, `npm ci`, `npm run build`, `pm2 restart khat khat-worker`.
- Pre-deploy gate: `npm run smoke:phase-1-all` must exit 0 against the local-shape DB before promotion.
- Versioning: every deploy stamps a `deploy_id` row in `system_events` (P2.3) — `{event_type: "deploy", payload: { sha, deployer, smoke_run_log }}`.
- Rollback: `git checkout <prev-sha> && pm2 restart`. Pre-tested in a snapshot once.

**Dependencies.** P2.5 (so post-deploy verification has a visible surface). Otherwise independent.

**Owner.** DevOps / @khalid (single-operator team for now).

**GO/NO-GO.** **GO** — runs as an independent parallel workstream. Doesn't block any AI work.

**Explicit non-goals.** Do NOT introduce Docker, Kubernetes, Terraform, GitHub Actions deploy automation, blue/green deployments. One DO droplet + git + PM2 is fine for this scale.

### 3.8 P2.7 — JSONB schema tightening + prompt-version enforcement

**Purpose.** Convert the five lenient `.loose()` schemas to `.strict()` where REPORT-mode data justifies, and enforce VERSION-bump-on-snapshot-change in CI.

**What it replaces.** Current "drift gets logged, never blocks" posture. Today's honor-system prompt versioning.

**Scope.**
- Per-schema audit: for each of the five `lib/db/validators/schemas/*`, review 30 days of `jsonb_validation_events` data, decide which fields can be tightened, ship a v2 schema, leave `KHAT_JSONB_VALIDATORS_MODE=report` until drift drops to near-zero on the new schema, then flip to `enforce` per-schema.
- New test: `tests/prompts/version-bump.test.ts` that diffs `VERSION` constants against the snapshot file. Snapshot changed → version must bump.

**Dependencies.** P2.0 (every AI write must be flowing through the validator wrapper). P2.5 (operator sees the drift counts).

**Owner.** Substrate / @khalid.

**GO/NO-GO.** **GO** — final hardening step. Last in the sequence by design.

---

## 4. Subsystems explicitly NOT proposed (declined / deferred)

| Subsystem | Why declined for Phase 2 | Re-evaluate at |
|---|---|---|
| **External message broker** (Kafka / RabbitMQ / SQS / Redis Streams) | Postgres-backed queue is appropriate at our scale and adds zero dependency surface. | When daily AI calls exceed ~10k or workers need geographic distribution. |
| **Embedding-based guest dedup** | Deterministic merge handles current scale. ML dedup is operator-review-by-another-name with worse failure modes. | When operator review queue exceeds ~50 conflicts/week. |
| **Long-running AI task checkpointing** (resume from mid-call) | Current 120 s timeout + full-retry pattern handles every observed task. | When Phase 2.0 surfaces a task that legitimately exceeds 5 min. |
| **Multi-region, multi-node workers** | One DO droplet handles current traffic. | When sustained queue depth > 50 with 1 worker maxed. |
| **OpenTelemetry / Datadog / New Relic** | Cardinality nightmare without an operator dashboard first. P2.5 is the local-first version. | When P2.5 dashboard data justifies external visualization. |
| **GraphQL / tRPC / Hasura** | REST + Drizzle queries are clean today. A schema-layer migration adds debt for hypothetical flexibility. | Probably never. |
| **NestJS / Fastify / framework migration** | Next.js 16 App Router is fine. | Probably never. |
| **WebSocket-based admin live updates** | Polling at 30 s is fine. WebSockets introduce reconnection bugs. | When operators ask for real-time. They haven't. |
| **Multi-model routing intelligence** (cost-aware A/B over model choices) | Two-model split (4o-mini vs 4o) is the right granularity for current quality signal. Smarter routing is debt in disguise — it adds three variables (model, cost, latency) to every quality bug. | When eval baselines + cost-per-feature data give 30 days of evidence that the simple split is suboptimal. |
| **Multi-tenant** (other podcasts) | Single team, single brand. | Out of scope for the visible roadmap. |
| **Anthropic Claude adapter / Gemini production use** | Adapters exist (`lib/ai-router/providers/`). Production model selection is OpenAI 4o/4o-mini. Adding a third active provider in Phase 2 is premature without a quality reason. | When eval data shows a feature where another provider beats OpenAI by ≥10%. |
| **Custom drift fixes for the 21 allowlist entries** | All owner-tagged. `test_actor` are permanent by design. `legacy_content` is Phase 5. `phase4_guest` collapses into P2.4. | Phase 4/5 as scheduled. |
| **EIR replay engine** | Write-only event log first (P2.3). Replay belongs to Phase 3. | After P2.3 ships and 30 days of events accumulate. |
| **Schema redesign** | `lib/db/schema/` is healthy at 33 files. No file has structural debt warranting a refactor. | When a single domain has obvious confusion (none currently). |

The discipline is: every "no" here is a "no for Phase 2", not a "no forever". Each row names the re-evaluation trigger.

---

## 5. Migration strategy

### 5.1 Generator migration (P2.0) is the structural bottleneck

The 21 unmigrated generators are not equally costly. Order them by **blast radius** (how many features depend on this generator's output) and **AI weight** (how often it runs, how expensive its model):

| Priority | Generator file | Why this order |
|---|---|---|
| 1 | `lib/ai/episode-intelligence.ts` | Global EIR-wide intelligence; consumed by Studio, Prep, Editorial. Highest blast radius. |
| 2 | `lib/ai/studio.ts` | Already 1 prompt baselined. Migrating the remaining studio package surface gives full per-EIR cost visibility. |
| 3 | `lib/ai/preparation/generate.ts` + `lib/ai/interview-cards.ts` | Phase 2.b lifecycle — preparation pipeline. |
| 4 | `lib/ai/deep-analysis.ts` + `lib/ai/analysis.ts` | Studio-side intelligence. |
| 5 | `lib/ai/guest-intelligence.ts` + `lib/ai/guest.ts` + `lib/ai/guest-application.ts` + `lib/guest-candidates/ai-analysis.ts` + `lib/guest-candidates/outreach.ts` | The guest-AI cluster. Migrate together so P2.4 unification doesn't fight with mid-migration state. |
| 6 | `lib/khat-map/v2/openai-engine-ai.ts` + `lib/khat-map/learning/embeddings.ts` | Khat Map's own AI surface. |
| 7 | `lib/ai/website.ts` + `lib/ai/transcript.ts` + `lib/ai/youtube-pack.ts` + `lib/ai/sponsorship.ts` + `lib/whisper.ts` | Lower blast radius; tail of the migration. |

Each migration is a self-contained PR-shaped change: extract a `lib/ai/prompts/<feature>.ts` builder with `VERSION`, swap the call site to `runAiTask`, add a snapshot test, re-run eval to confirm score doesn't move.

### 5.2 Order of operations across all of Phase 2

```
┌──────────────────────────────────────────────────────────────────┐
│ P2.0  Router universalization (5 batches)        ████████████████│
│ P2.1  EIR state machine + sweeper                    ████████    │
│ P2.2  Worker daemonization + handler expansion         ██████████│
│ P2.3  System_events log                                    ██████│
│ P2.4  Guest identity unification                       ██████████│
│ P2.5  Operator dashboard                                       ██│
│ P2.6  Deploy pipeline (independent track)         ██████████     │
│ P2.7  JSONB tightening + version-bump CI                       ██│
└──────────────────────────────────────────────────────────────────┘
       ◄── P2.0 must reach 50% before P2.1/P2.2 start ──►
```

Concrete sequence:

1. **P2.0 (Router universalization).** Batches 1–3 (~12 files). Must reach 50% before any other P2 work starts.
2. **P2.6 (Deploy pipeline).** Parallel from day 1 — independent workstream, no dependency on AI work.
3. **P2.0 batches 4–5.** Finish Router universalization.
4. **P2.1 (EIR state machine).** Once all generators that touch EIR are routed.
5. **P2.2 (Worker daemonization).** Promote `lib/jobs/worker.ts` to PM2. Add stale-run sweeper handler.
6. **P2.3 (System_events log).** Wire emits in EIR transitions + Router completions + rate-limit blocks.
7. **P2.4 (Guest identity).** Backfill + migration. Sequence after P2.0 finishes guest-AI cluster (priority 5 above).
8. **P2.5 (Dashboard).** Surface the data Phase 1 + Phase 2.0–2.4 generated.
9. **P2.7 (JSONB tightening + VERSION-bump CI).** Final hardening.

**Gate before Phase 3.** All eight subsystems GREEN. `npm run smoke:phase-2-all` (new orchestrator analogous to `smoke:phase-1-all`) exits 0. 7-day observation window after P2.0 completes, before declaring "Phase 2 closed".

---

## 6. "Do NOT do yet" — premature complexity register

A short list of attractive ideas that would damage Phase 2 maintainability:

| Idea | Why not yet |
|---|---|
| Pre-build a "plugin system" for AI providers | We have two. Two doesn't need a plugin system. |
| Refactor `lib/db/schema/` into per-domain subdirs | Current single-directory layout works. Refactor cost > savings. |
| Switch Drizzle → Prisma / Kysely / raw SQL builder | Drizzle is fine. The friction we hit was learnable. Moving costs months. |
| Introduce class-based services / dependency injection | Functions + closures + module imports work. DI is for testing complexity we don't have. |
| Set up a "feature flag" service | `KHAT_*` env vars work for the substrate. Application-level flags can wait for actual A/B needs. |
| Wire a generic retry framework into every Router call | Already handled by per-feature logic. Generic retry is the wrong abstraction. |
| Pre-emptively split web + API into separate apps | One Next.js app serves both. Splitting is for traffic shapes we don't have. |
| Introduce a "saga" library for cross-system orchestration | Sequential handler chaining via the job queue handles every flow we have. |
| Build an in-house schema migration tool | Drizzle-kit + per-feature migration scripts work and are reviewable. |
| Migrate to TypeORM / Sequelize / Mongoose | No. |
| Add Sentry / Bugsnag | After P2.5 dashboard exists. Until then, server logs + admin tile are sufficient. |
| Generate types from OpenAPI / proto | We don't have an external API surface. |
| Switch session store from Postgres to Redis | The 12h+slide pattern works at current load. |
| Introduce `pino` / structured logging globally | `console.log` is sufficient for current operator scale. P2.5 dashboard reduces log dependence. |

Every item here will eventually be reconsidered. None of them earns inclusion in Phase 2.

---

## 7. Per-subsystem GO / NO-GO summary

| ID | Subsystem | Recommendation | Sequencing | Owner |
|---|---|---|---|---|
| P2.0 | Universal AI Router migration | **GO** — critical path | Start first | Substrate / @khalid |
| P2.1 | EIR state machine + stale-run sweeper | **GO** | Parallel with late P2.0 | Substrate / @khalid |
| P2.2 | Worker daemonization + handler expansion | **GO** | After P2.0 ≥ 50% | Substrate / @khalid |
| P2.3 | Canonical `system_events` log | **GO** — small, additive | After P2.0 + P2.1 | Substrate / @khalid |
| P2.4 | Guest identity unification | **GO with care** — many touchpoints | After P2.0 guest cluster done | Guests / @khalid |
| P2.5 | Cost + quality + health dashboard | **GO** | After P2.0, P2.2, P2.3 | Substrate / @khalid |
| P2.6 | Production deployment pipeline | **GO** — independent track | Parallel from day 1 | DevOps / @khalid |
| P2.7 | JSONB schema tightening + VERSION-bump CI | **GO** — final hardening | Last | Substrate / @khalid |
| —  | External message broker | **NO-GO** for Phase 2 | Reconsider at 10k daily AI calls | — |
| —  | Embedding-based guest dedup | **NO-GO** for Phase 2 | Reconsider at 50 conflicts/week | — |
| —  | Long-running AI checkpointing | **NO-GO** for Phase 2 | Reconsider when a task legitimately exceeds 5 min | — |
| —  | Multi-region workers | **NO-GO** for Phase 2 | Reconsider at sustained queue depth > 50 | — |
| —  | OpenTelemetry / Datadog | **NO-GO** for Phase 2 | Reconsider after P2.5 in production | — |
| —  | Multi-model routing intelligence | **NO-GO** for Phase 2 | Reconsider with 30 days of cost-per-feature data | — |
| —  | Third active provider (Claude / Gemini) | **NO-GO** for Phase 2 | Reconsider with eval evidence | — |

---

## 8. Data ownership boundaries (proposed)

A short architectural contract for Phase 2. Each row says: **this subsystem is the owner of this concept; every other subsystem reads via a contract, never writes directly.**

| Concept | Owner subsystem | Other subsystems may | Other subsystems may NOT |
|---|---|---|---|
| EIR row + phase | `lib/eir/*` | Read; request transition via `transitionEir()` | Update `phase` directly |
| Guest identity | `lib/guest-identity/*` (new in P2.4) | Resolve via `resolveGuestIdentity()`; read merged shape | Insert into `guest_identities` directly; merge guests |
| AI run | `lib/ai-router/*` | Read; query roll-up | Insert `ai_runs` outside `runAiTask` |
| Rate-limit policy | `lib/ai-router/rate-limit.ts` | Read decisions from `ai_rate_limit_events` | Bypass without an audited flag |
| Job queue | `lib/jobs/*` | Enqueue via the API; register handlers | Insert directly into the queue table |
| System event | `lib/events/*` (new in P2.3) | Emit via `emitSystemEvent()`; read | Insert directly into `system_events` |
| Retention | `lib/jobs/retention.ts` | Read the report | Delete from `ai_runs` outside the job |
| Eval baselines | `lib/evals/*` | Read; re-record after their own feature's prompt change | Edit `evals/baselines.json` by hand |

Phase 2's discipline is: if a feature wants to mutate another domain's data, it goes through that domain's API. No "convenient" cross-domain `update` calls.

---

## 9. Event taxonomy proposal (for P2.3)

Six event families. Each one names its `event_type`, what triggers it, who emits, and who consumes.

| Family | Event type | Emitter | Consumer |
|---|---|---|---|
| EIR lifecycle | `eir.phase_transitioned` | `lib/eir/service.ts` `transitionEir()` | P2.5 dashboard; future replay |
| EIR lifecycle | `eir.created`, `eir.archived` | Same | Same |
| AI run | `ai.run_succeeded`, `ai.run_failed`, `ai.run_timed_out` | `lib/ai-router/router.ts` on completion | P2.5 dashboard; cost reports |
| Rate limit | `rate_limit.blocked`, `rate_limit.bypassed` | `lib/ai-router/rate-limit.ts` | P2.5 dashboard; tuning |
| Guest | `guest.identity_merged`, `guest.application_received` | `lib/guest-identity/*` | P2.5 dashboard; learning |
| Worker | `worker.job_failed_terminal` (after max retries) | `lib/jobs/worker.ts` | P2.5 dashboard; operator alert |
| Deploy | `deploy.released`, `deploy.rolled_back` | Deploy script (P2.6) | P2.5 dashboard; correlation |

Phase 2 does NOT define a `Quality` event family — that requires per-call quality scoring which is Phase 3. The taxonomy above is intentionally small.

---

## 10. Production deployment architecture (proposed for P2.6)

Single-region, single-node, plus a dedicated worker process. Honest scale.

```
                    Cloudflare / DNS
                          │
                          ▼
              ┌───────────────────────┐
              │  DO Droplet (existing) │
              │  ┌──────────────────┐ │
              │  │  pm2: khat       │ │   Next.js web + API
              │  │       khat-worker│ │   ← NEW under P2.2/P2.6
              │  └──────────────────┘ │
              │                       │
              │  Local filesystem:    │
              │   /root/khat (code)   │
              │   /root/khat/logs/    │
              └───────────────────────┘
                          │
                          ▼
              ┌───────────────────────┐
              │  DigitalOcean         │
              │  Managed Postgres     │
              │  (existing)           │
              │                       │
              │  Backup: DO automatic │
              │  daily snapshots      │
              └───────────────────────┘

External:  OpenAI API, Resend (email), YouTube Data API
```

No load balancer. No CDN beyond Cloudflare. No autoscaling. No staging environment until Phase 6+.

Deploy flow:
1. Operator runs `npm run smoke:phase-1-all` locally → exit 0.
2. Operator runs `npm run smoke:phase-2-all` locally → exit 0 (added under P2.5 / P2.7).
3. Operator pushes to `main`.
4. Operator SSHes, runs `./deploy.sh` (new script under P2.6) which: `git pull`, `npm ci`, `npm run build`, `pm2 restart khat khat-worker`, writes a `deploy.released` event (P2.3).
5. Post-deploy: `curl /admin/system-health` returns 200 and shows fresh data.
6. Rollback: `git checkout <prev sha> && pm2 restart khat khat-worker`.

---

## 11. Horizontal scalability boundaries

Where we live today vs. where Phase 2 stays vs. when to revisit:

| Axis | Today | Phase 2 target | Re-evaluate when |
|---|---|---|---|
| Web nodes | 1 | 1 | Sustained p95 web latency > 1s |
| Worker nodes | 0 (manual) | 1 (daemon) | Queue depth > 50 sustained |
| DB nodes | 1 (managed primary) | 1 | DB CPU > 60% sustained |
| Connection pool max (script) | 2 | 2 | n/a |
| Connection pool max (web) | 10 | tune by observation | Pool exhaustion warnings appear |
| Redis | none | none | When session-store or queue grows past Postgres-comfort |
| Cache layer | per-request only | per-request + a small in-memory layer for `config/*.json` | Read amp > 10× on the same data |

Phase 2 stays single-node deliberately. The whole proposal is sized for a system that supports one editorial team. When that assumption changes, the boundaries change.

---

## 12. Open questions for the operator

Before P2.0 implementation begins, three answers shape execution:

1. **Migration batch size.** Do you prefer 5 batches of ~4 generators each (smaller, more eval re-runs), or 3 batches of ~7 each (bigger, fewer eval re-runs)? Trade-off is review cadence vs. quality-regression detection latency.
2. **PM2 supervision shape.** Is it acceptable to run `khat-worker` on the same droplet as `khat` (the web app), or should we provision a second droplet now for worker isolation? **Recommendation: same droplet. Costs and complexity both lose to one box at this scale.**
3. **Event log retention.** Phase 1.5 set `ai_runs` strip at 90 days. `system_events` will accumulate fast. **Recommendation: same 90-day retention with the same "earliest per event_type forever" preservation. Closes the question without invention.**

---

## 13. Phase 2 exit criteria

Phase 2 is closed when all of the following hold:

1. `Grep "getClient(|new OpenAI("` in `lib/**/*.ts` returns 2 files only: `lib/ai-router/router.ts` and `lib/ai-router/providers/openai.ts`. Every other surface routes via `runAiTask`.
2. Every EIR phase transition goes through `transitionEir()`. No direct `update episode_intelligence_records set phase = ...` in the codebase.
3. `pm2 list` on the production droplet shows `khat` AND `khat-worker` both online for ≥7 days continuously.
4. `system_events` is populated with ≥1000 rows of ≥3 distinct families.
5. A single `guest_identities` row exists per unique guest across `guests`, `guest_candidates`, `guest_application_*`. Zero orphaned `khat_map_episode_candidates.suggested_guest_candidate_id` (cross-3 allowlist entry removed).
6. `/admin/system-health` is live and shows the 6 tiles named in P2.5.
7. Deploy script exists and has been used at least once for a non-emergency release.
8. ≥3 of 5 lenient JSONB schemas tightened to `.strict()` with zero new drift for 7 days at the tightened mode.
9. `npm run smoke:phase-2-all` exits 0 (new orchestrator analogous to `smoke:phase-1-all`).
10. Eval baselines re-recorded post-migration; no feature regressed by more than 2% from its Phase-1-ship value.

---

## 14. Final recommendation

**GO** for Phase 2 planning approval as proposed.

The proposal is intentionally **a closing operation**, not an opening one. Every subsystem listed completes something Phase 1 began; none introduces a net-new architectural concept. The "Do NOT do yet" section is as important as the GO list — it names the temptations that would damage the system at our scale.

Phase 2.a implementation should begin with **P2.0 batch 1** (`lib/ai/episode-intelligence.ts` migration to the Router) only after explicit operator green-light. The same scope-discipline pattern used throughout Phase 1 applies here: plan → green-light → implement → typecheck → operator validation → close-as-GREEN.

---

## 15. Sign-off

| Role | Name | Date | Status |
|---|---|---|---|
| Substrate owner | @khalid | TBD | Pending review |
| Phase 2 acting CTO | (Khat Brain agent) | 2026-05-23 | Recommended GO above |
| Phase 2 lead | TBD | TBD | Awaiting kickoff approval |

---

*End of Phase 2 architecture proposal. No implementation will begin without explicit operator green-light.*
