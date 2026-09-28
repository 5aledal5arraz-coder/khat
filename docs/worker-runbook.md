# Khat Worker — Operator Runbook

**Phase 2.2 — last revised 2026-05.**

This is the single-page reference for supervising `khat-worker` (the
background job daemon) on the DO droplet. Web app (`khat`) supervision
hasn't changed from prior phases.

---

## What the worker does

Polls the `jobs` table, claims `pending` rows via `FOR UPDATE SKIP LOCKED`,
runs the registered handler, writes results back. Bootstraps two
recurring schedules on startup:

| Schedule | Type | Cadence |
|---|---|---|
| Market intelligence | `market.scheduler` | Daily tick (existing) |
| Stale `ai_runs` sweeper | `ai-runs-sweeper` | Every `KHAT_AI_RUNS_SWEEP_INTERVAL_MS` (default 30 min) (P2.1.f) |

Single instance per droplet today. Multi-worker is safe at the queue
level (`SKIP LOCKED`), not enabled by config until queue depth + latency
demonstrate it's needed.

---

## Process model

```
PM2 (already managing `khat` web from prior phases)
 ├── khat          ← Next.js web + API; existing
 └── khat-worker   ← new under P2.2; supervises lib/jobs/worker.ts
```

Config: `ecosystem.config.js` at repo root. Edit there; never use ad-hoc
`pm2 start` commands.

---

## First-time setup on the droplet

> **For routine deploys, use `docs/deploy-runbook.md`** (canonical, A11).
> The steps below are FIRST-TIME bootstrap only — the project files
> must already be on the droplet via SCP before running them. The
> `git pull` line that used to be here was incorrect: the GitHub
> remote is empty; project files arrive via `rsync` from a laptop
> (see deploy-runbook §D for the canonical flow).

```bash
ssh root@khatpodcast.com
cd /root/khat
# Files are already present (SCP'd from laptop on first setup).
npm ci
npm run build

# P2.2 — create the log directory ONCE.
mkdir -p /var/log/khat

# Start (or re-import) both processes via the ecosystem file.
pm2 start ecosystem.config.js
pm2 save
pm2 startup            # follow the printed command to enable boot-time startup

# Verify.
pm2 status             # khat + khat-worker both `online`
pm2 logs khat-worker --lines 30
```

Expected first-30-lines of worker log:

```
[<worker-id>] starting (poll=2000ms lease=120000ms renew=20000ms lanes=heavy+interactive db_pool_max=4)
[<worker-id>] startup: previous worker <id> (pid <n>) is gone — reclaimed <n> job(s) it held   ← after a crash / kill -9
[<worker-id>] startup: reclaimed <n> stale job(s)           ← only if any leaked
[<worker-id>] market scheduler <status> (job=<8-char prefix>)
[<worker-id>] ai-runs-sweeper schedule <status> (job=<8-char prefix>)
```

If you see `crashed` or `errored` in `pm2 status`, jump to **Crash-loop diagnosis** below.

---

## Day-to-day commands

```bash
pm2 status                          # both processes online
pm2 logs khat-worker --lines 100    # tail worker stdout+stderr
pm2 logs khat-worker --err          # stderr only
pm2 restart khat-worker             # hard restart; in-flight job may retry
pm2 reload khat-worker              # gentler — SIGTERM then restart
pm2 stop khat-worker                # halt (queue accumulates pending)
pm2 start khat-worker               # resume
```

Logs live at:

```
/var/log/khat/web.out.log
/var/log/khat/web.err.log
/var/log/khat/worker.out.log
/var/log/khat/worker.err.log
```

Rotation is managed by `pm2-logrotate` per the install in
`docs/deploy-runbook.md` §I "Log rotation". Default config: 10MB
per file, 7 gzipped rotations retained, daily safety rotation at
midnight. Rotated files land alongside the live logs as
`/var/log/khat/<process>.<stream>.log.<YYYY-MM-DD_HH-mm-ss>.gz`.
Inspect via `zcat`/`zgrep`. To uninstall (logs grow unbounded
again): `pm2 uninstall pm2-logrotate`.

---

## Inspection (no PM2 needed)

Two ad-hoc commands. Both read-only. Both hostname-guard the local DB
to prevent accidental remote queries.

### Quick queue snapshot

```bash
npm run jobs:inspect
```

Shows: counts by status, last 7d activity, oldest pending, oldest running,
stale-lease count, pending-by-type, last 5 dead jobs with truncated
error messages. Use this for "is the worker keeping up?" questions.

### Full Phase-1+ health surface

```bash
npm run observe:phase-1-report
```

Includes the P2.2 "worker / queue health" section alongside every other
Phase-1+ observation. Use this for the broader picture or when filing
the 7-day observation snapshot into the closure doc.

---

## Restart contracts

| Path | Semantics |
|---|---|
| `pm2 restart khat-worker` | Hard restart. SIGTERM → 1.5s grace → exit. An in-flight job stays `running`, locked by the old worker id. The new worker reads the previous heartbeat at boot: same host + that pid is gone ⇒ the old worker is proven dead and its jobs go back to `pending` **immediately**, before the first claim. |
| `pm2 reload khat-worker` | Gentler. PM2 sends SIGTERM and waits longer. Same crash-window practically. |
| `pm2 stop khat-worker` | Halt. Queue accumulates `pending` rows; backlog drains when restarted. Web app continues to enqueue normally. |
| Worker process crash | PM2 detects, waits `restart_delay: 4000`, restarts. Same boot reclaim as above (measured locally with `kill -9`: job back in the queue and re-running ~14s after the kill). |

### Leases, the reaper, and the one automatic re-run (2026-09-28)

- The owning worker renews `locked_at` of every job it runs every **20s**, from
  its own timer (not the handler), so a quiet handler never looks orphaned.
- The reaper runs every **30s on its own timer** (never behind a busy claim
  loop) and returns any `running` job whose lease was not renewed for
  `WORKER_LEASE_MS` (default **120000**, floor 60000) to `pending`. Worst case
  without the boot path (e.g. another host): ~2.5 min.
- **Re-run cap.** A reclaimed job runs again only while `attempts ≤
  max_attempts` — one extra run beyond its budget (an AI job with
  `max_attempts 1` runs at most twice). Orphaned again, it is dead-lettered
  with «توقّف عامل المهام أثناء تنفيذ هذه المهمة مرتين…» and the admin card
  offers «أعد المحاولة». A job that kills its worker every time can therefore
  never loop, and a second paid re-run is always the operator's click.
- The status card shows «العامل أُعيد تشغيله — نعيد المهمة للطابور» while a
  running job's owner is gone (lease not renewed, or a live worker under a
  different id not running it).

**Key contract**: no job is lost short of someone manually deleting from
the `jobs` table. Worst case: a job retries until it hits `max_attempts`
and becomes `dead`. Dead jobs accumulate visibly in `jobs:inspect`.

---

## Crash-loop diagnosis

If `pm2 status` shows `errored` (PM2's `min_uptime + max_restarts` guard
fired):

```bash
pm2 logs khat-worker --err --lines 200
```

Common causes:

| Symptom | Likely cause |
|---|---|
| `DATABASE_URL is not set` | env var not loaded; check `/root/khat/.env` and PM2's env override |
| `OPENAI_API_KEY is not set` | same; required by AI Router |
| Handler throws on a specific job's payload | one bad job; will mark itself `dead` after `max_attempts` retries |
| `EADDRINUSE` etc. | should not happen — worker doesn't bind a port |
| Memory bloat → `max_memory_restart: 768M` fired | rare; investigate the handler that ran just before |

After fixing, restart cleanly:

```bash
pm2 restart khat-worker
pm2 status                 # confirm `online`
```

If you need to stop the daemon entirely (e.g., emergency drain):

```bash
pm2 stop khat-worker       # web app continues; queue accumulates
```

Re-enable when ready:

```bash
pm2 start khat-worker
```

---

## What's NOT in the runbook

Per scope discipline, P2.2 deliberately does NOT include:

- **Mutating CLIs** (`requeue-dead`, `drain-pending`, `cancel-job`). Build
  when a real operator need arises, not before. If you need to mutate
  the queue today, write the SQL by hand — `psql $DATABASE_URL` works.
- **Worker clustering**. Single instance is enough at our scale. The
  Postgres queue is multi-worker-safe, but `instances: 1` is the config.
- **External queue brokers** (BullMQ, Redis Streams, SQS). Out of scope
  by the Phase 2 proposal.
- **Auto-scaling, multi-region, blue/green deploys**. Not Phase 2 work.

---

## Crash-recovery quick-reference

When the worker is missing and you don't know why:

1. `pm2 status` — does it say `errored`?
2. `pm2 logs khat-worker --err --lines 100` — what's the failure mode?
3. `npm run jobs:inspect` — has the queue accumulated? Are there stale
   `running` rows that need reaping?
4. Fix → `pm2 restart khat-worker` → re-verify with steps 1+3.

The eager-reclaim on startup means a fresh worker picks up where the
old one crashed without operator intervention.

---

## When to bump worker instances to 2+

Re-evaluate clustering only when ALL of the following are true for ≥3
consecutive days:

- `jobs:inspect` shows ≥50 pending jobs continuously.
- `Oldest pending` age regularly exceeds 1 hour.
- The single worker is at >70% CPU sustained.

Until then: one worker. Less is more.
