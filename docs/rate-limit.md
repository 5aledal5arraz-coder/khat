# Khat Brain — AI Rate-Limit Policy

Phase 1.6. Two-tier concurrency + daily-cost caps plus a subject-level
double-generation lock for every call that passes through the AI
Router (`lib/ai-router/router.ts`).

## At a glance

| Tier | Task kinds | Concurrent | Daily cost cap |
|---|---|---|---|
| **light** | `structural`, `verification`, `analysis` | 10 | $5 |
| **expensive** | `editorial`, `discovery`, `research` | 3 | $25 |

Subject lock: at most one in-flight call per `(subject_table,
subject_id)` pair. Calls with no subject are exempt.

All thresholds are env-overridable; see "Tuning" below.

## How it fires

The router calls `acquireRateLimitPermit()` BEFORE inserting into
`ai_runs`. The permit function:

1. Reads `KHAT_RATE_LIMIT_MODE` (`off` | `report` | `enforce`).
2. Resolves tier from `task_kind`.
3. Applies bypass rules in order:
   - per-call `bypassRateLimit: true`
   - actor matches `KHAT_RATE_LIMIT_BYPASS_ACTORS`
   - a `enableSessionBypass()` is active (the eval CLI uses this).
4. Tries to acquire a row in `ai_subject_locks` if `subject_table` +
   `subject_id` are present (PATCH: was `pg_try_advisory_lock`, which
   is session-scoped and reentrant under pool reuse — a row-with-
   unique-pk gives real cross-pool exclusion). Conflict →
   `blocked_subject_lock`. Stale rows (>10 min) are pre-deleted.
5. Inside `pg_advisory_xact_lock('khat-rate-limit')`:
   - counts `ai_runs` with `status='running'` in this tier →
     concurrency check;
   - sums `cost_usd` over today (UTC) for this tier → daily-cost check.
6. Writes one row to `ai_rate_limit_events`.
7. In `enforce` mode, throws `RateLimitError` on `blocked_*` outcomes;
   in `report` mode the call proceeds regardless.

The subject lock is released in `runAiTask`'s `finally` block — even
on adapter failure or validation error.

## Modes

| Mode | Audit row written? | Blocks call? | When to use |
|---|---|---|---|
| `off` | no | no | Local development with no telemetry needs. |
| `report` (default) | yes | no | Default at ship. Observe what `enforce` would have blocked. |
| `enforce` | yes | yes | Production. Throws `RateLimitError` on blocks. |

Set with:

```bash
KHAT_RATE_LIMIT_MODE=report npm run dev      # default
KHAT_RATE_LIMIT_MODE=enforce npm run dev     # production
KHAT_RATE_LIMIT_MODE=off npm run dev         # offline / fully bypassed
```

Garbage values fall back to `report` (safe default).

## Decisions

`ai_rate_limit_events.decision` is one of:

| Decision | Meaning |
|---|---|
| `allowed` | Permit granted. Call proceeds. |
| `blocked_concurrency` | Tier concurrency cap reached. |
| `blocked_daily_cost` | Tier daily cost cap reached. |
| `blocked_subject_lock` | Another call holds the subject lock. |
| `bypassed_call` | `bypassRateLimit: true` on the request. |
| `bypassed_actor` | `actor_id` matches the env allowlist. |
| `bypassed_session` | `enableSessionBypass()` is active. |

`enforced` is `'true'` only when the row's `decision` actually
short-circuited the call (i.e. `enforce` mode + a `blocked_*`
decision). All other rows have `enforced='false'`.

## Bypass mechanisms

Three ways to skip rate limiting, all audited:

### 1. Per-call flag

For background workers that have their own throttle, schedulers, and
trusted server-side cron jobs that can't be paged out:

```typescript
await runAiTask({
  taskKind: "editorial",
  actorId: "retention",
  bypassRateLimit: true,
  // ...
})
```

### 2. Actor allowlist

For cron jobs, scheduled tasks, or operators that bypass for an entire
session. Comma-separated:

```bash
KHAT_RATE_LIMIT_BYPASS_ACTORS=retention,discovery-cron,scheduled-tasks
```

A call qualifies when its `actorId` matches one of the listed actors.

### 3. Session bypass

For test harnesses and benchmarks. Programmatic; auto-releases:

```typescript
import { enableSessionBypass } from "@/lib/ai-router/rate-limit"

const release = enableSessionBypass("eval-runner:hybrid-topics")
try {
  await runGenerator("hybrid-topics")
} finally {
  release()
}
```

The eval CLI uses this so baselines reproduce regardless of the
operator's daily-cost ledger.

## Tuning

| Env var | Default | Use |
|---|---|---|
| `KHAT_RATE_LIMIT_MODE` | `report` | `off` / `report` / `enforce` |
| `KHAT_RATE_LIMIT_LIGHT_CONCURRENT` | 10 | Light tier concurrent cap |
| `KHAT_RATE_LIMIT_LIGHT_DAILY_USD` | 5 | Light tier daily cost cap |
| `KHAT_RATE_LIMIT_EXPENSIVE_CONCURRENT` | 3 | Expensive tier concurrent cap |
| `KHAT_RATE_LIMIT_EXPENSIVE_DAILY_USD` | 25 | Expensive tier daily cost cap |
| `KHAT_RATE_LIMIT_BYPASS_ACTORS` | (empty) | Comma-separated allowlist |

Invalid values (NaN, ≤0) fall back to defaults silently.

## Useful queries

```sql
-- What would enforce have blocked in the last 24h?
SELECT decision, COUNT(*)
FROM ai_rate_limit_events
WHERE created_at > now() - interval '24 hours'
  AND decision LIKE 'blocked_%'
GROUP BY decision;

-- Top actors by allowed runs (last 7d).
SELECT actor_id, COUNT(*)
FROM ai_rate_limit_events
WHERE decision = 'allowed'
  AND created_at > now() - interval '7 days'
GROUP BY actor_id
ORDER BY 2 DESC;

-- Subjects thrashing the lock (last 7d).
SELECT subject_table, subject_id, COUNT(*)
FROM ai_rate_limit_events
WHERE decision = 'blocked_subject_lock'
  AND created_at > now() - interval '7 days'
GROUP BY subject_table, subject_id
ORDER BY 3 DESC
LIMIT 20;
```

## Retention

Phase 1.5's retention job deletes `decision='allowed'` rows older than
30 days. Every `blocked_*` and `bypassed_*` row stays forever — they're
audit-trail material. Run:

```bash
npm run jobs:retention-ai-runs              # dry-run
npm run jobs:retention-ai-runs -- --confirm # wet
```

## Commands

```bash
# Forward migration (adds ai_rate_limit_events + ai_runs.actor_id).
npm run migrate:phase1-rate-limit

# Reverse migration. Drops the table; past audit rows are lost.
MIGRATE_PHASE1_RATE_LIMIT_REVERSE=1 npm run migrate:phase1-rate-limit

# Burst smoke. Five scenarios; cleans up after itself.
npm run smoke:rate-limit-burst

# Unit tests (pure-policy only).
npm run test -- tests/ai-router/rate-limit.test.ts
```

## Rollback

| Level | How | What it does |
|---|---|---|
| 1 | `KHAT_RATE_LIMIT_MODE=off` | Stops audit writes + enforcement. Code stays in place. |
| 2 | `KHAT_RATE_LIMIT_MODE=report` | Audits but doesn't enforce. The default ship mode. |
| 3 | `MIGRATE_PHASE1_RATE_LIMIT_REVERSE=1 npm run migrate:phase1-rate-limit` | Drops the table + column. Code must also be reverted. |

## Safeguards

- Audit failure can't block the AI call (try/catch around the INSERT).
- Permit-eval DB failure degrades to "allow" (the router still
  proceeds; the operator notices via missing audit rows).
- `pg_advisory_xact_lock('khat-rate-limit')` serialises permit-eval
  so concurrent acquires don't race past the threshold.
- Subject lock uses a row in `ai_subject_locks` (PK on subject_table +
  subject_id) so it survives pool checkouts. `runAiTask`'s `finally`
  block always releases it; stale rows >10 min are pre-cleaned on the
  next acquire.
- The retention CLI's hostname guard refuses managed-DB hosts unless
  `SMOKE_ALLOW_REMOTE=1`.
- All four `blocked_*` and three `bypassed_*` rows are kept forever —
  policy violations remain auditable indefinitely.
