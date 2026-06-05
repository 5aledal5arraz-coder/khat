# Khat — Managed-Postgres Backup-Restore Drill

**Purpose:** convert the assumption "DigitalOcean's automatic backups work" into a tested operational fact. Measure actual RTO. Verify the app boots against a restored snapshot.

**Safety:** this drill **never touches live production**. Every step restores into a brand-new throwaway managed-DB instance, validates against it, and destroys it. Live `DATABASE_URL` is **never** swapped.

**Cost:** ~$15-$25 for one drill, depending on instance size + drill duration (DO bills the throwaway instance hourly). Plan for ~60-90 minutes wall clock.

**Run cadence:** once before public launch (this drill), then quarterly.

---

## §1 — Prerequisites + safety check

Before clicking anything:

1. **Confirm you have:**
   - DigitalOcean console access with `Databases` permission.
   - SSH access to `root@khatpodcast.com`.
   - The current production `DATABASE_URL` value (for the source-snapshot reference — not for swapping).
   - A `psql` client on your laptop (`brew install postgresql@16` or equivalent).
   - This document open.

2. **Confirm production is healthy RIGHT NOW.** A drill during an incident is a bad idea.
   ```bash
   curl -sI https://khatpodcast.com/api/health
   # Expected: HTTP/2 200
   ```

3. **Confirm you are NOT going to swap production.** Read this sentence out loud: *"I will not change `DATABASE_URL` in `/root/khat/.env`. I will not point production at the restored DB."* If you cannot say that confidently, stop.

4. **Open a notes file** (any text file) to record timings as you go. The results template is in §7 below — copy it into your notes file.

---

## §2 — Snapshot the source (what we're restoring FROM)

DigitalOcean managed Postgres takes automatic daily backups. By default, retention is 7 days for basic plans. Confirm:

1. Open DO console → **Databases** → `khat-main-db` → **Backups** tab.
2. Record the **most recent backup timestamp** in your notes — this defines the **RPO** ceiling for this drill (the data loss between that timestamp and "now" if you ever had to use it).
3. Note the **DB size** shown in the cluster summary. Record it. This roughly predicts restore duration.

**RPO measurement (record now):**
- Most recent backup timestamp: `_____________`
- Current time: `_____________`
- Implied RPO (current - backup): `___ hours ___ minutes`
- Production DB size (GB): `___`

---

## §3 — Create the restored instance (DO console)

**SAFETY: every action in this section creates NEW resources. None of them touch the source database.**

1. DO console → **Databases** → `khat-main-db` → **Backups** tab.
2. Locate the most recent backup row.
3. Click **"Restore"** (or "Restore from Backup" depending on UI version).
4. **CRITICAL:** the restore form asks for the **target**. Choose:
   - Target type: **"New database cluster"** (NOT "this cluster" — that would be in-place and would CLOBBER PRODUCTION).
   - New cluster name: `khat-drill-YYYYMMDD` (e.g. `khat-drill-20260527`).
   - Same datacenter as production (lowest restore latency).
   - Same plan/size as production (so timing is representative).
5. **Verify the form** before submitting. Re-read the target name. It must end with `-drill-`. If it says `khat-main-db`, **STOP** — that's the production name.
6. Click **Create / Restore**.

**Time-to-restore measurement (start timer when you click Create):**
- Start time (T0): `_____________`

DO will provision the new instance + replay the backup. Wait. On the cluster's status page you'll see phases like `provisioning` → `restoring` → `online`. Do NOT close the browser tab.

Once the new cluster shows **online**:

- End time (T1): `_____________`
- **Measured restore wall-clock (RTO floor): `T1 - T0 = ___ min ___ s`**

---

## §4 — Capture connection string + create temp env

1. DO console → `khat-drill-YYYYMMDD` → **Connection Details** tab → **Public network**.
2. Click **Show** on the connection string. Copy it.
3. **On your laptop**, create a temporary env file in `/tmp` (NEVER inside the repo, NEVER named `.env*`):
   ```bash
   cat > /tmp/khat-drill.env <<'EOF'
   DATABASE_URL=postgresql://doadmin:<the-restored-password>@<the-restored-host>:25060/defaultdb?sslmode=require
   # Add a marker so we never confuse this with prod.
   KHAT_DRILL_MARKER=true
   EOF
   chmod 600 /tmp/khat-drill.env
   ```
4. Sanity check: the host should end with `-drill-…` (the cluster you just created). If it ends with `khat-main-db`, **STOP** — you're about to point at production.

---

## §5 — Verification battery

All commands below use the **temporary** `/tmp/khat-drill.env`. They never touch `.env.local` or `/root/khat/.env`.

### §5.1 — Basic connectivity

```bash
set -a; source /tmp/khat-drill.env; set +a
echo "Pointing at: $(echo $DATABASE_URL | sed -E 's|://[^:]+:[^@]+@|://***:***@|')"
# Expected: the masked URL — confirm the host ends with -drill-

psql "$DATABASE_URL" -c "SELECT version(), current_database(), now();"
# Expected: PostgreSQL version line + database name + current timestamp.
```

Record:
- Connection latency (eyeballed): `___ ms`

### §5.2 — Schema integrity

```bash
# All Khat tables must be present. Count tables in the public schema:
psql "$DATABASE_URL" -c "
  SELECT count(*)::int AS table_count
    FROM information_schema.tables
   WHERE table_schema = 'public';
"
# Expected: 62+ (current count as of Phase 2.4.e).
```

Record:
- Table count on restored DB: `___`
- Table count on production (run same SQL against prod via the droplet for comparison): `___`
- Match? `[ ] yes  [ ] no`

```bash
# Spot-check the most important tables exist + have data:
psql "$DATABASE_URL" -c "
  SELECT 'episodes'::text AS t, count(*) FROM episodes
  UNION ALL SELECT 'guests',                count(*) FROM guests
  UNION ALL SELECT 'guest_candidates',      count(*) FROM guest_candidates
  UNION ALL SELECT 'guest_applications',    count(*) FROM guest_applications
  UNION ALL SELECT 'admin_users',           count(*) FROM admin_users
  UNION ALL SELECT 'jobs',                  count(*) FROM jobs
  UNION ALL SELECT 'ai_runs',               count(*) FROM ai_runs
  UNION ALL SELECT 'system_events',         count(*) FROM system_events
  ORDER BY t;
"
# Expected: row counts matching production at the backup timestamp.
```

Record any counts that look unexpectedly low (data-loss signal).

### §5.3 — App can validate its env

```bash
cd /Users/aishaalkharraz/Desktop/khat
# Run the env validator with the drill env loaded:
env $(cat /tmp/khat-drill.env | xargs) npm run validate-env -- --strict
# Expected: exit 0 — required vars satisfied (DATABASE_URL + OPENAI_API_KEY,
# the latter inherited from your normal shell env).
```

### §5.4 — Phase-1 smoke against the restored DB

The smoke scripts hostname-guard against non-local DBs by default. Use the documented escape hatch:

```bash
cd /Users/aishaalkharraz/Desktop/khat
env $(cat /tmp/khat-drill.env | xargs) SMOKE_ALLOW_REMOTE=1 npm run smoke:phase-1-all
```

Record:
- Smoke result: `[ ] all green  [ ] some failures`
- If failures, list scenarios that failed: `_____________`

### §5.5 — Ops snapshot reads cleanly

```bash
env $(cat /tmp/khat-drill.env | xargs) SMOKE_ALLOW_REMOTE=1 npm run smoke:ops-dashboard
# Expected: all 10 scenarios PASS. Performance gate <2s.
```

### §5.6 — Jobs queue is intact

```bash
env $(cat /tmp/khat-drill.env | xargs) SMOKE_ALLOW_REMOTE=1 npm run jobs:inspect
# Expected: queue snapshot output (counts by status, last 7d activity).
# Worker is NOT running against this DB — so "running" rows reflect what was
# happening in production at the backup timestamp. Lease reaper would
# recover them on a real failover.
```

Record:
- Pending: `___`  Running: `___`  Dead (last 7d): `___`

### §5.7 — App can boot against the restored DB (optional, ~5 min)

This is the most realistic test. Skip if you're constrained on time; the above checks cover the schema + data layer.

```bash
cd /Users/aishaalkharraz/Desktop/khat
env $(cat /tmp/khat-drill.env | xargs) npm run build
# Expected: ✓ Compiled successfully.

env $(cat /tmp/khat-drill.env | xargs) npx next start -p 3001 &
APP_PID=$!
sleep 5

# Health endpoint against the restored DB:
curl -s http://localhost:3001/api/health | jq
# Expected: status="ok" or "degraded" (worker isn't running, so worker.ok=false
# is acceptable here). DB.ok MUST be true.

kill $APP_PID
```

Record:
- App-boot wall-clock from `next start` to first 200 on `/api/health`: `___ s`
- `db.ok` was: `[ ] true  [ ] false`

---

## §6 — Tear down

**This step is required.** A forgotten throwaway instance costs ~$15/day.

1. Stop any local processes still running against the drill DB:
   ```bash
   # If you ran §5.7, make sure the app process is gone:
   pgrep -f 'next start -p 3001' | xargs -I{} kill {} 2>/dev/null || true
   ```
2. **Delete the throwaway instance:**
   - DO console → **Databases** → `khat-drill-YYYYMMDD` → **Settings** → **Destroy**.
   - Confirm with the cluster name (DO requires you to type it exactly).
3. **Remove the temp env file** from your laptop:
   ```bash
   shred -u /tmp/khat-drill.env 2>/dev/null || rm -f /tmp/khat-drill.env
   ```
4. **Confirm production is still healthy** (sanity check that you really didn't touch it):
   ```bash
   curl -sI https://khatpodcast.com/api/health
   # Expected: HTTP/2 200 — exactly as before the drill.
   ```

---

## §7 — Results template

Copy this into your notes file. Fill in as you run.

```
KHAT BACKUP-RESTORE DRILL — RESULTS
═══════════════════════════════════════════
Date:                              ____________
Operator:                          ____________
DO datacenter:                     ____________
Source cluster:                    khat-main-db
Restored cluster name:             khat-drill-____________
Restored cluster size/plan:        ____________

§2 RPO BASELINE
─────────────────────
Most recent backup timestamp:      ____________ (UTC)
Drill start time:                  ____________ (UTC)
Measured RPO (current — backup):   ____________
Production DB size at drill time:  ___ GB

§3 RESTORE TIMING
─────────────────────
T0 (clicked Create):               ____________
T1 (cluster reported online):      ____________
Measured restore wall-clock:       ___ min ___ s
Bottleneck observed (if any):      ____________

§4 CONNECTIVITY
─────────────────────
Connection string captured:        [ ] yes
Host ended with "-drill-":         [ ] yes  [ ] NO STOP
Connection latency (eyeballed):    ___ ms

§5 VERIFICATION
─────────────────────
5.2 Table count on restored:       ___       prod: ___       match: [ ]
5.2 Critical-table row counts:
    episodes:                      restored ___    prod ___
    guests:                        restored ___    prod ___
    guest_candidates:              restored ___    prod ___
    guest_applications:            restored ___    prod ___
    admin_users:                   restored ___    prod ___
    jobs:                          restored ___    prod ___
    ai_runs:                       restored ___    prod ___
    system_events:                 restored ___    prod ___
5.3 validate-env --strict exit 0:  [ ]
5.4 smoke:phase-1-all all green:   [ ]
    (if not: scenarios that failed:____________)
5.5 smoke:ops-dashboard pass:      [ ]
5.6 jobs:inspect rendered:         [ ]
    pending ___  running ___  dead-last-7d ___
5.7 app booted against restored:   [ ] skipped  [ ] yes
    /api/health db.ok:             [ ] true  [ ] false
    boot time:                     ___ s

§6 TEARDOWN
─────────────────────
Throwaway instance destroyed:      [ ] yes
Temp env file removed:             [ ] yes
Production /api/health still 200:  [ ] yes

§7 OPERATOR NOTES
─────────────────────
Surprises / undocumented assumptions / pain points:
  ____________
  ____________
  ____________

What I'd want automated for next time:
  ____________
  ____________
```

---

## §8 — Rollback implications (verified by this drill)

The drill confirms (or refutes) every assumption in `docs/deploy-runbook.md §F` rollback procedure. After completing the drill, share the filled §7 template back — the canonical doc will be updated as follows:

- **`deploy-runbook.md §F` RTO target** — currently states "2 minutes" for the app-tier rollback. That number assumes the DB is healthy. **A full DB-tier rollback** (restore from a snapshot) takes the measured `§3 T1-T0`. Update §F to read: *"App-tier rollback: ~60 seconds. DB-tier failover via snapshot restore: measured `___ min` (Y-MM-DD drill)."*
- **`deploy-runbook.md §J` future notes** — the line about "no automated backup-restore drill" gets replaced with the drill date + measured RTO/RPO + cadence.
- **A new entry** in §I (Observability) referencing this document as the operational playbook for DB-tier recovery.

---

## §9 — Rollback assumptions tested by this drill

These are the production-survivability assumptions that the drill validates. Each MUST be confirmed before declaring the drill complete:

| Assumption | Confirmed by §5 step | Result |
|---|---|---|
| The most recent DO backup actually exists and is restorable. | §3 (Create / Online) | [ ] confirmed |
| The restored cluster accepts the same Drizzle schema as production. | §5.2 table count | [ ] confirmed |
| Critical row counts match the snapshot's claimed timestamp. | §5.2 row-count comparison | [ ] confirmed |
| The app can boot reading from the restored connection string. | §5.7 (if run) | [ ] confirmed |
| Smoke scripts pass against the restored DB. | §5.4, §5.5 | [ ] confirmed |
| `lib/db.ts` SSL/connection-pool config works with a fresh DO cluster. | §5.1 + §5.7 | [ ] confirmed |
| No surprise schema drift between production and the backup (e.g. a migration that was never replayed). | §5.2 | [ ] confirmed |
| DATABASE_URL is the ONLY swap needed for the app — no other env var must change. | §5.3 (`validate-env --strict` exit 0) | [ ] confirmed |
| Worker queue rows survive the restore intact (job IDs, payloads, timestamps). | §5.6 | [ ] confirmed |
| The 5-minute lease reaper can recover any `running` rows from the snapshot. | §5.6 + (operator inference) | [ ] confirmed |

Any line with `[ ]` unchecked at the end of the drill is an unresolved disaster-recovery risk — flag it for follow-up.

---

## §10 — What this drill does NOT prove

Be explicit about scope. The drill validates that **a backup can be restored to a working cluster**. It does NOT prove:

- That you can SAFELY swap production traffic onto the restored cluster in <60s. (That requires a DNS/connection-string swap rehearsal, which is a separate exercise. Out of A12.)
- That backups taken DURING heavy write activity preserve transactional consistency. (DO uses snapshot-based backups which are consistent; spot-checked but not stress-tested here.)
- That you have a documented incident-comms plan. (Out of scope; operational/people task.)
- That restoring overrides RLS / role-grants identically. (DO restores all roles + permissions by default; not exhaustively tested here.)

If any of those become real concerns, schedule a follow-up exercise. None block A12.
