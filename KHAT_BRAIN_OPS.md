# Khat Brain — Operations Runbook

This is the operator's guide for the Khat Brain background subsystem:
the **Postgres-backed jobs worker**, the **scheduled cron entrypoints**, and
the **PM2 process layout** on the production droplet.

> No Redis, no separate queue service. The whole system is Next.js +
> PostgreSQL + a single Node worker process. Multiple workers are safe
> (claims use `FOR UPDATE SKIP LOCKED`).

---

## 1. Processes

PM2 manages two long-running processes (see `ecosystem.config.js`):

| name           | what it does                                | restart policy                  |
| -------------- | ------------------------------------------- | ------------------------------- |
| `khat`         | Next.js production server (port 3000)       | autorestart, 1 GB memory cap    |
| `khat-worker`  | Polls `jobs` table, runs registered handlers| autorestart, 768 MB memory cap  |

### First-time install on the droplet

```bash
cd /root/khat
npm ci
npm run build
pm2 start ecosystem.config.js
pm2 save
pm2 startup            # follow the printed instructions to enable on boot
```

### Day-to-day

```bash
pm2 status                   # see both processes
pm2 logs khat                # web logs
pm2 logs khat-worker         # worker logs
pm2 restart khat             # zero-flush web restart
pm2 restart khat-worker      # restart worker (in-flight job is allowed to finish for ~1.5s)
```

### Graceful worker shutdown

The worker handles `SIGINT` / `SIGTERM` and gives the in-flight job ~1.5
seconds to finish. PM2's default `kill_timeout` (1.6s) is sufficient.
For a clean drain before deploy:

```bash
pm2 stop khat-worker         # stops accepting new claims, lets current job complete
# ... deploy ...
pm2 start khat-worker
```

---

## 2. Worker (`npm run worker`)

Source: `lib/jobs/worker.ts`. Entry point for the `khat-worker` PM2 app.

### Configuration

Environment variables (defaults shown):

| var                 | default     | meaning                                                |
| ------------------- | ----------- | ------------------------------------------------------ |
| `WORKER_POLL_MS`    | `2000`      | sleep between empty polls                              |
| `WORKER_LEASE_MS`   | `300000`    | stale-claim reaper window (5 min)                       |
| `WORKER_ID`         | random      | shows in logs and `jobs.claimed_by`                     |

### Behaviour

1. Calls `claimNextJob(workerId)` — atomic `UPDATE … RETURNING` with
   `FOR UPDATE SKIP LOCKED`. Two workers never grab the same job.
2. Looks up the handler in `lib/jobs/registry.ts`
   (registered by importing `lib/jobs/registered.ts`).
3. On success, writes the result via `completeJob`.
   On failure, `failJob` records the error and re-queues if attempts remain.
4. Every `WORKER_LEASE_MS`, calls `reclaimStaleJobs` to free claims from
   crashed peers.

### Adding a job type

1. Implement the handler under `lib/jobs/handlers/<name>.ts`.
2. Register it in `lib/jobs/registered.ts` (single source of truth).
3. Enqueue from app code with `enqueueJob(type, payload, opts)`.

---

## 3. Scheduled entrypoints (host crontab)

These scripts only **enqueue** jobs — they exit immediately. The worker
does the actual work. Wire them up via the host crontab on the droplet
(`crontab -e` as `root`).

### A. Discovery stalled-run sweep

```text
*/10 * * * *  cd /root/khat && /usr/bin/npm run jobs:discovery-cron-check >> /root/.pm2/logs/khat-cron.log 2>&1
```

- Script: `scripts/discovery-cron-check.ts`
- Enqueues: `discovery.cron_check`
- Handler scans for guest-discovery runs stuck in
  `{seeding, searching, verifying, ranking}` and either fails them or
  recovers them by enqueueing a rank job.
- Cadence: every 10 minutes.

### B. YouTube performance refresh

```text
0 */6 * * *  cd /root/khat && /usr/bin/npm run jobs:schedule-youtube-performance >> /root/.pm2/logs/khat-cron.log 2>&1
```

- Script: `scripts/schedule-youtube-performance.ts`
- Enqueues one `youtube.refresh_performance` job per eligible EIR
  (phase ∈ `{published, analyzing, learned}` with a parseable
  YouTube URL).
- Each job writes a row into `performance_snapshots`. The Phase 8
  performance-learning loop then turns those snapshots into rolling
  metrics on `episode_performance_signals`.
- Cadence: every 6 hours is plenty; YouTube view counts move slowly.

### C. Market signal collection (daily)

Refreshes the YouTube + iTunes signal pool that feeds the Hybrid
Topic Generator. Without this, Hybrid runs against stale market data.

```text
15 4 * * *  cd /root/khat && /usr/bin/npm run market:collect >> /root/.pm2/logs/khat-cron.log 2>&1
```

- Script: `scripts/market-collect.ts`
- Enqueues: `market.collect`
- Handler iterates every preset in `config/market-presets.json` and writes raw signals via the configured adapters.
- Cadence: once a day, off-peak (04:15 droplet time).

### D. Market signal extraction + clustering (nightly)

Fills `theme` / `emotional_trigger` / `controversy_score` on
unextracted signals (AI Router call) and recomputes the
`market_topic_clusters` projection.

```text
45 4 * * *  cd /root/khat && /usr/bin/npm run market:extract >> /root/.pm2/logs/khat-cron.log 2>&1
0  5 * * *  cd /root/khat && /usr/bin/npm run market:cluster >> /root/.pm2/logs/khat-cron.log 2>&1
```

- Scripts: `scripts/market-extract.ts`, `scripts/market-cluster.ts`
- Enqueues: `market.extract`, `market.cluster_signals`
- Cadence: nightly. Extract runs 30m after collect (so collect's worker
  is finished); cluster runs 15m after extract.

### E. Original thinking topic generation (weekly)

Adds fresh "editorial conscience" topics to the Hybrid Generator's
input pool. Without this, the bank empties as the Hybrid Generator
consumes lenses.

```text
0 6 * * 1  cd /root/khat && /usr/bin/npm run original:generate -- ar 10 >> /root/.pm2/logs/khat-cron.log 2>&1
30 6 * * 1 cd /root/khat && /usr/bin/npm run original:generate -- en 8 >> /root/.pm2/logs/khat-cron.log 2>&1
```

- Script: `scripts/original-generate.ts`
- Enqueues: `original.generate_topics`
- Cadence: every Monday morning. Two runs (ar + en) so both languages
  stay fresh.

### F. (Optional) Performance-signals batch recompute

The performance-learning analyzer is idempotent and cheap. If you want
nightly recompute across all published EIRs without waiting for the
next snapshot, add:

```text
30 3 * * *  cd /root/khat && /usr/bin/npx tsx -e "import('./lib/khat-brain/performance-learning').then(m => m.batchAnalyzePerformance().then(r => console.log(JSON.stringify(r))))" >> /root/.pm2/logs/khat-cron.log 2>&1
```

Otherwise the analyzer runs on demand from the YouTube refresh handler
or the `/admin/khat-brain/command` page hit (recommended path:
trigger from the YouTube handler — already wired).

### Cron summary

| time (UTC) | job | cadence |
| --- | --- | --- |
| `*/10 * * * *` | discovery.cron_check | every 10 min |
| `0 */6 * * *` | youtube.refresh_performance | every 6 h |
| `15 4 * * *` | market.collect | daily |
| `45 4 * * *` | market.extract | daily |
| `0 5 * * *` | market.cluster_signals | daily |
| `0 6 * * 1` | original.generate_topics (ar) | weekly Monday |
| `30 6 * * 1` | original.generate_topics (en) | weekly Monday |
| `30 3 * * *` | performance batch recompute (optional) | daily |

---

## 4. Migrations

All Khat Brain migrations are scripted (no Drizzle Kit `push` for
production-sensitive operations). Run from the project root:

```bash
npm run migrate:khat-brain                          # foundation
npm run migrate:khat-brain-eir                      # eir + spine
npm run migrate:khat-brain-downstream               # eir links into legacy tables
npm run migrate:khat-brain-studio                   # studio_analysis_records
npm run migrate:khat-brain-drop-legacy-studio       # drop 9 retired studio_* tables
npm run migrate:khat-brain-discovery                # discovery runs + candidates
npm run migrate:khat-brain-guest-identity           # guest_identity_profiles + links
npm run migrate:khat-brain-performance-loop         # performance signals + guest indexes (Phase 8)
```

After any migration that affects EIR shape, optionally backfill:

```bash
npm run backfill:eir
npm run backfill:eir-downstream
npm run backfill:studio-analysis
npm run backfill:guest-identity
```

---

## 5. Smoke tests

Each phase ships its own smoke. Order matters only loosely — every
smoke cleans up after itself.

```bash
npm run smoke:khat-brain
npm run smoke:khat-brain-eir
npm run smoke:khat-brain-spine
npm run smoke:khat-brain-studio
npm run smoke:khat-brain-studio-done
npm run smoke:khat-brain-discovery
npm run smoke:khat-brain-guests-unif
npm run smoke:khat-brain-write-paths
npm run smoke:khat-brain-command
npm run smoke:khat-brain-performance-loop      # Phase 8
```

---

## 6. `guest_candidates` — legacy table policy

`guest_candidates` is the original prospecting workflow (`/admin/guest-candidates/*`)
with vetting, outreach, and prep-link tooling. Phase 7 introduced the
canonical guest spine (`guest_identity_profiles` + `guest_discovery_links`).

**Decision (Phase 8): keep the table, classify it as a legacy
candidate-stage store, and require all writes to also touch the
canonical profile.**

Why we did **not** drop it:

- 13 admin API routes under `/admin/guest-candidates/*` still drive the
  full vetting flow (analyze, status, outreach, social-links,
  prep-templates, responses).
- The Phase 8 brief explicitly forbids redesigning UI.
- Phase 7 already routes every write through `upsertGuestIdentityFromCandidate`,
  so there is no truth divergence.

What the contract is now:

| layer                          | role                                                       |
| ------------------------------ | ---------------------------------------------------------- |
| `guest_candidates`             | UI-facing candidate-stage record (legacy)                  |
| `guest_identity_profiles`      | canonical identity (single source of truth for `guests`)   |
| `guest_discovery_links`        | provenance — which discovery run/source surfaced them      |

Future phases may collapse `guest_candidates` into the canonical layer,
but that is a UI-replacement project, not a Phase 8 task.

---

## 7. Common operational issues

**Worker is silent.**
Check `pm2 logs khat-worker`. If logs are empty, the worker process is
not running — `pm2 status` should show `online`. Restart with
`pm2 restart khat-worker`.

**Jobs are stuck `claimed_by` a dead worker.**
The reaper runs every `WORKER_LEASE_MS` (5 min). To force-reclaim
immediately, restart any worker — `reclaimStaleJobs` runs at startup.

**`discovery.cron_check` keeps re-queueing the same run.**
Look at the discovery run's `status_log` (jsonb). The handler logs why
it failed to recover. Most often this is a missing seed prompt or an
expired API key.

**`youtube.refresh_performance` is failing.**
Two likely causes:
1. `YOUTUBE_API_KEY` quota exhausted — the handler logs the API error.
2. Video was unlisted/deleted — handler should write `null` view_count;
   if it crashes instead, file a bug.

**Performance signals look stuck.**
`SELECT calculated_at FROM episode_performance_signals ORDER BY calculated_at DESC LIMIT 5;`
If everything is older than a day, the YouTube refresh handler is not
reaching the analyzer. Confirm the cron entry exists and the worker
is running.
