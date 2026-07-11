# Khat — Deploy & Rollback Runbook

**Audience:** the on-call operator. Written for 2 AM clarity.
**Status:** canonical. Supersedes any deploy steps in `CLAUDE.md` or `worker-runbook.md`.
**Last revised:** Phase A stabilization (A11).

---

## A. Deployment philosophy

1. **Safety first.** Every step is reversible. If you cannot answer "how do I undo this in 60 seconds?", stop.
2. **Verify before restart.** A failed build never restarts a healthy process.
3. **Rollback must always be possible.** The previous working build stays on disk at `/root/khat-prev/` until the new build is verified.
4. **Never deploy from unverified local state.** `npm run build` + `npm run smoke:phase-1-all` must pass locally before SCP.
5. **One change at a time.** Deploy + verify + observe before the next deploy.
6. **Production secrets never leave the droplet.** Local `.env.local` is for dev; the droplet's `/root/khat/.env` is the production source of truth.

---

## B. Architecture overview

```
DigitalOcean droplet  (khatpodcast.com — root@khatpodcast.com)
└── /root/khat/                     ← live build, served + worker reads from here
    ├── .env                         ← production env (NOT in git)
    ├── ecosystem.config.js
    └── … (Next build output, lib/, scripts/, …)
└── /root/khat-prev/                ← previous build, kept for rollback
└── /var/log/khat/                  ← PM2 logs
    ├── web.out.log
    ├── web.err.log
    ├── worker.out.log
    └── worker.err.log

PM2 (system-managed)
├── khat          → Next.js web (next start -p 3000)        — 1 instance
└── khat-worker   → background jobs (tsx lib/jobs/worker.ts) — 1 instance

External
├── DigitalOcean managed Postgres   (khat-main-db, port 25060, SSL required)
├── OpenAI API                      (read OPENAI_API_KEY from .env)
├── Resend                          (read RESEND_API_KEY from .env)
└── YouTube / Google APIs           (read-only, optional, degrades gracefully)
```

**Single-instance assumption.** Today the web and worker are each `instances: 1` in `ecosystem.config.js`. The Postgres job queue is multi-worker-safe (`FOR UPDATE SKIP LOCKED`), but we do not run more than one of either today. Rate-limit state (A8), the per-handler timeout map (A7), and the AI-degraded probe (A10) all assume single-instance.

**Upload storage.** No user-uploaded files persist on the droplet's local FS. Studio audio uploads land in DB (jsonb / dedicated columns) or are referenced by URL. The droplet has no `/uploads/` dependency.

**No CDN in front of the droplet today.** A reverse proxy terminates TLS on the droplet itself; the Next.js process listens on port 3000.

---

## C. Pre-deploy checklist (LOCAL — your laptop)

Run this whole block. If any line fails, **do not deploy**.

```bash
# 1. Clean git tree — make sure nothing uncommitted will get SCP'd by accident
cd /Users/aishaalkharraz/Desktop/khat
git status --short
# Expected: clean. If anything is shown, either commit it or set it aside.

# 2. Local env validates against the strict prod schema
npm run validate-env -- --strict
# Expected: "required=2/2  recommended=3/3 …" + exit 0.

# 3. Local build succeeds
npm run build
# Expected: ✓ Compiled successfully, no warnings.

# 4. Local Phase-1 smoke passes (DB-touching; needs your local Postgres up)
npm run smoke:phase-1-all
# Expected: all scenarios PASS.

# 5. Confirm laptop has enough disk for the new build + SCP staging
df -h ~/Desktop
# Expected: > 2 GB free.

# 6. Confirm the droplet is reachable
ssh -o ConnectTimeout=5 root@khatpodcast.com 'echo ok && date'
# Expected: "ok" + current droplet time.

# 7. Confirm droplet has disk space (you need >2 GB free for safe deploy)
ssh root@khatpodcast.com 'df -h /'
# Expected: > 2 GB available on /. If < 1 GB, free space FIRST (logs, /tmp).

# 8. Confirm DB reachable from droplet (sanity)
ssh root@khatpodcast.com 'cd /root/khat && npm run validate-env -- --strict'
# Expected: exit 0 — current prod env loads and matches schema.

# 9. Confirm prod /api/health right now (BEFORE you deploy — baseline)
curl -sI https://khatpodcast.com/api/health
# Expected: HTTP 200 (or HTTP 503 if currently degraded — note baseline).

# 10. Confirm current production version (anchor for the rollback step)
ssh root@khatpodcast.com 'cd /root/khat && grep -E "^  \"version\"" package.json'
# Note the version string. If the new deploy bumps it, write that down too.
```

**If any step fails:** stop. Address the failure. Do not skip steps.

---

## D. Deployment flow (canonical: SCP)

> **Why SCP, not `git pull`.** This project's GitHub remote is empty — no commits have ever been pushed. The droplet's `/root/khat/` is populated by SCP from your laptop. Any prior runbook line that says `git pull` is obsolete; use the steps below.

Run from your laptop, top to bottom. **Do not skip the snapshot step.**

```bash
# ─── 1. Snapshot the current droplet build for rollback ─────────────────
ssh root@khatpodcast.com '
  set -e
  rm -rf /root/khat-prev
  cp -a /root/khat /root/khat-prev
  echo "snapshot ok: $(du -sh /root/khat-prev | cut -f1)"
'
# Expected: "snapshot ok: <size>" and no other output.

# ─── 2. Stage the new build locally ─────────────────────────────────────
# `npm run build` must have completed in the pre-deploy step.
cd /Users/aishaalkharraz/Desktop/khat
ls .next/BUILD_ID
# Expected: a file with one line.

# ─── 3. SCP the project to the droplet ─────────────────────────────────
# Sync everything EXCEPT: node_modules, .next, .git, .env*, local data.
rsync -avz --delete \
  --exclude='node_modules' \
  --exclude='.next' \
  --exclude='.git' \
  --exclude='.env*' \
  --exclude='/data' \
  --exclude='*.log' \
  --exclude='.DS_Store' \
  ./ root@khatpodcast.com:/root/khat/
# Expected: long file list, ends with "sent X bytes  received Y bytes".

# ─── 4. Install + build on the droplet ─────────────────────────────────
ssh root@khatpodcast.com '
  set -e
  cd /root/khat
  npm ci --omit=dev=false
  # validate-env runs automatically via prebuild (A4) — fails the build
  # if a required env var is missing or malformed.
  npm run build
'
# Expected: "✓ Compiled successfully" and exit 0.
# IF THIS FAILS: do NOT restart PM2. Skip to §G "Build fails" below.

# ─── 5. Restart sequence — order matters ────────────────────────────────
# Web first (visible downtime ~2-3s, fastest restart), then worker.
ssh root@khatpodcast.com '
  pm2 restart khat
  sleep 3
  pm2 restart khat-worker
'
# Expected: both processes report "online" within ~5s.

# ─── 6. Inline status check ─────────────────────────────────────────────
ssh root@khatpodcast.com 'pm2 status'
# Expected: khat + khat-worker both online, restart_count incremented by 1.
```

**Total expected wall time:** ~3-5 minutes. Web is unavailable for ~2-3 seconds during restart.

---

## E. Post-deploy verification

Run all six checks. If ANY fails, jump to §F "Rollback procedure."

```bash
# 1. /api/health returns 200
curl -sI https://khatpodcast.com/api/health
# Expected: HTTP/2 200. If 503 → DB unreachable; see §G "DB unavailable".

curl -s https://khatpodcast.com/api/health | jq
# Expected: {"status":"ok", "db":{"ok":true,...}, "worker":{"ok":true,...}, ...}

# 2. PM2 both processes online + no restart loop
ssh root@khatpodcast.com 'pm2 status; echo "---"; pm2 logs --lines 30 --nostream'
# Expected: both online, no recent error stack traces.

# 3. Worker heartbeat — system_events shows recent worker activity
ssh root@khatpodcast.com 'cd /root/khat && npm run jobs:inspect'
# Expected: counts by status; no pile-up of `running` rows with stale locked_at;
# no pile-up of `dead` jobs newer than the deploy timestamp.

# 4. Admin login works
# Open https://khatpodcast.com/admin/login in a private window.
# Sign in. Confirm you land on /admin (or /admin/ops if A10's promotion lands).

# 5. AI generation smoke — enqueue + run one trivial job
ssh root@khatpodcast.com 'psql "$DATABASE_URL" <<SQL
  INSERT INTO jobs (type, payload, status, priority, max_attempts, attempts, run_after)
  VALUES ('"'"'demo.echo'"'"', '"'"'{"echo":"deploy-smoke"}'"'"'::jsonb, '"'"'pending'"'"', 5, 3, 0, NOW());
SQL'
sleep 5
ssh root@khatpodcast.com 'psql "$DATABASE_URL" -c "
  SELECT id, status, completed_at, result
    FROM jobs
   WHERE type = '"'"'demo.echo'"'"'
     AND (payload->>'"'"'echo'"'"') = '"'"'deploy-smoke'"'"'
   ORDER BY created_at DESC LIMIT 1;
"'
# Expected: status='succeeded', completed_at within last few seconds.

# 6. Ops dashboard renders + AI-degraded banner state matches expectation
# Open https://khatpodcast.com/admin/ops in your admin session.
# Confirm sections render. The amber AI-degraded banner should NOT be
# present unless the system is genuinely degraded (≥3 ai-router/rate-limit
# rejections in last 5 min — see A10).
```

**If all six pass:** deploy verified. Move on. Leave `/root/khat-prev/` in place for at least 1 hour; remove only after sustained stability.

---

## F. Rollback procedure

### When to roll back

- Post-deploy step E fails on any of: `/api/health` returning 503 sustained, PM2 restart loop, admin login broken, AI smoke fails, sustained 5xx rate on public pages.
- Operator reports a critical regression in the first 30 minutes.
- Worker enters crash loop and the cause isn't fixable in <5 minutes.

### Rollback steps (~60 seconds RTO target)

```bash
# 1. Preserve the failed build for forensics (do NOT just overwrite)
ssh root@khatpodcast.com '
  set -e
  mv /root/khat /root/khat-failed-$(date +%Y%m%d-%H%M%S)
  cp -a /root/khat-prev /root/khat
  echo "rollback ok: $(ls -la /root/khat | head -3 | tail -1)"
'
# Expected: "rollback ok: <directory listing>"

# 2. Restart the same way as a deploy (web first, then worker)
ssh root@khatpodcast.com '
  pm2 restart khat
  sleep 3
  pm2 restart khat-worker
  pm2 status
'

# 3. Re-run the §E verification checklist against the rolled-back build
curl -sI https://khatpodcast.com/api/health
ssh root@khatpodcast.com 'pm2 status'
```

### Rollback verification

- `/api/health` returns 200.
- PM2 status: both online, no restart loop.
- The "deploy-smoke" job from §E.5 succeeds again.
- Admin login works.

### RTO target: **2 minutes wall-clock from rollback decision to verified-restored.**

> The 2-minute target applies to **app-tier rollback** (swap `/root/khat-prev/`
> back into place + restart PM2). **DB-tier rollback** (restoring a managed
> Postgres snapshot) is a separate operation with its own measured RTO —
> see `docs/backup-restore-drill.md` for the verified procedure, the
> measured restore wall-clock, and the assumptions confirmed against a
> real restored snapshot.

### After successful rollback

1. **Do not deploy again immediately.** Investigate the failure with the preserved `khat-failed-*` directory.
2. Pull the failed-build logs from `/var/log/khat/web.err.log` and `worker.err.log`.
3. Reproduce locally before attempting a second deploy.

---

## G. Failure scenarios

### G.1 Build fails on the droplet
- **Symptom:** step §D.4 returns non-zero.
- **Cause:** missing env var (most common), missing dependency, TypeScript error that didn't appear locally.
- **Recovery:**
  ```bash
  ssh root@khatpodcast.com 'cd /root/khat && npm run validate-env -- --strict'
  # Inspect the env failure list.
  # Fix /root/khat/.env (NEVER commit changes to it locally).
  # Re-run: ssh root@khatpodcast.com 'cd /root/khat && npm run build'
  ```
- **Do not restart PM2** during this state — the old build is still running normally.

### G.2 DB unavailable after deploy
- **Symptom:** `/api/health` returns 503; `db.ok: false`.
- **Quick check:** `ssh root@khatpodcast.com 'cd /root/khat && psql "$DATABASE_URL" -c "SELECT 1"'`.
- **If psql fails:** check DigitalOcean console → khat-main-db status. Could be a managed-DB maintenance window. Restart of `khat` will not help.
- **If psql succeeds but `/api/health` 503s:** DATABASE_URL on droplet might be wrong. Re-check `/root/khat/.env`. Restart `khat` after fixing.

### G.3 Worker stuck (no progress, `pending` queue growing)
- **Check:** `ssh root@khatpodcast.com 'cd /root/khat && npm run jobs:inspect'`.
- **Look for:** oldest-running age, stale-lease count, dead-job pile.
- **If worker is alive but stuck on a single hung job:** A7's per-handler timeout (5-15 min depending on type) will eventually fire. If you cannot wait, `pm2 restart khat-worker` — the lease reaper will recover the in-flight row within 5 min.
- **If worker process is in restart loop:** `pm2 logs khat-worker --err --lines 100`. Common cause: missing env var, DB unreachable.

### G.4 OpenAI quota / API dead
- **Symptom:** AI-degraded banner appears (A10); recent `ai-router.rejected` events in ops dashboard; operator clicks Generate, nothing happens.
- **Check:** OpenAI dashboard for quota / billing status.
- **No code action needed.** The router (P1.6) and worker (A7) already fail-soft: jobs retry up to `max_attempts` and then go dead. The AI-degraded banner tells operators what's happening. When quota recovers, click Generate again; queued jobs that died are not auto-replayed — they can be re-enqueued from the admin UI.

### G.5 Disk full
- **Symptom:** `pm2 status` may show errored; build fails; logs not writing.
- **Check:** `ssh root@khatpodcast.com 'df -h /'`.
- **Fix:**
  ```bash
  ssh root@khatpodcast.com '
    # Logs are normally rotated by pm2-logrotate (see §I.Log rotation).
    # In a real disk-full emergency, you can truncate live logs directly:
    : > /var/log/khat/web.out.log
    : > /var/log/khat/web.err.log
    : > /var/log/khat/worker.out.log
    : > /var/log/khat/worker.err.log
    # Remove old gzipped rotations beyond the retain window
    find /var/log/khat -maxdepth 1 -name "*.log.gz" -mtime +7 -delete
    # Remove failed-deploy snapshots older than 7 days
    find /root -maxdepth 1 -name "khat-failed-*" -mtime +7 -exec rm -rf {} \;
    # Clear node-modules from the prev snapshot if disk is critical
    rm -rf /root/khat-prev/node_modules
  '
  ```

### G.6 PM2 restart loop
- **Symptom:** `pm2 status` shows `errored`, restart count climbing.
- **Diagnose:** `pm2 logs <name> --err --lines 200`.
- **Most common causes:**
  - Missing env var (run `validate-env --strict`).
  - DB unreachable.
  - Port 3000 already taken (unlikely on the droplet but worth checking with `ss -tlnp | grep 3000`).
- **If unfixable in <5 minutes:** roll back (§F).

### G.7 CSP breakage (A6)
- **Symptom:** admin or public page renders but interactivity is broken; browser console shows red "Refused to load … Content Security Policy" lines.
- **Diagnose:** open DevTools console on the failing page. Note the directive that blocked (e.g. `img-src`, `script-src`).
- **Fix:** edit `middleware.ts` `CSP_DIRECTIVES`, add the required origin to the right directive. Local build + smoke. Re-deploy.
- **Emergency override:** if the breakage is severe and you cannot deploy a fix quickly, roll back (§F). Do NOT delete the CSP entirely as a hack — log the regression and address properly.

### G.8 A8 rate-limit false positives
- **Symptom:** operator hitting 429 on `/api/admin/*` during normal flow.
- **Diagnose:** check whether the operator was running a batch action (e.g. accepting 60+ submissions in one minute). The mutation tier is 60 burst + 1/sec sustained.
- **Quick mitigation:** raise the mutation capacity in `lib/middleware/rate-limit.ts` (constant `MUTATION_POLICY.capacity`). Build + deploy.
- **Permanent fix:** per-route specialization — out of scope today; track as a follow-up.

---

## H. Secrets handling

### `.env.local` (local laptop, dev only)
- Lives at the repo root. **Never** committed (caught by `.gitignore` rule `.env*`).
- Used by `npm run dev` and local smokes.
- Source: hand-edited from `.env.local.example` template.

### `/root/khat/.env` (droplet, production)
- The single source of truth for production credentials.
- **Never** transmitted via git. **Never** SCP'd from a laptop's `.env.local`.
- Updated only by editing in place on the droplet:
  ```bash
  ssh root@khatpodcast.com 'vi /root/khat/.env'
  # After save: pm2 restart khat && pm2 restart khat-worker
  ```
- If `.env` is overwritten or lost, restore from the most recent backup (see below).

### No secrets in git
- `.gitignore` line 34 (`.env*`) catches every variant.
- Pre-commit hook at `.githooks/pre-commit` (A14, tracked + shared)
  rejects any commit containing a high-confidence secret pattern in
  staged additions. Detects: OpenAI / Stripe / Resend keys, Google
  API keys, DigitalOcean managed-DB passwords (`AVNS_…`), DO API
  tokens (`dop_v1_…`), GitHub PATs, AWS access keys, Slack tokens,
  Postgres URLs with embedded credentials, and PRIVATE KEY blocks.
  Also blocks newly-tracked `.env*`, `*.pem`, `*_rsa`, `*.key`, and
  Firebase service-account JSON files.

#### Pre-commit hook — install (one-time per clone)

```bash
# From the repo root, on every developer's laptop:
cd /Users/aishaalkharraz/Desktop/khat
git config core.hooksPath .githooks
# Verify the hook is now active:
ls -la .githooks/pre-commit              # rwx, ~7-8KB
git config --get core.hooksPath          # → .githooks
```

A test commit with a placeholder should pass; a test commit with a
real-looking secret should fail with a redacted error message + a
remediation pointer. Verification command:

```bash
# Force-test: stage a fake "real" secret, attempt commit, expect block.
cd $(mktemp -d) && git init -q && \
  git config core.hooksPath /Users/aishaalkharraz/Desktop/khat/.githooks
# Synthetic value shaped like a real key — NEVER paste an actual key here.
echo "OPENAI_API_KEY=sk-proj-$(openssl rand -hex 40 | head -c 80)" > test.env.example
git add -f test.env.example
git commit -m "test" 2>&1 | grep -E 'secret-detect|blocked' && echo "✓ HOOK WORKS"
cd - && rm -rf "$OLDPWD"
```

#### Bypass for genuine false positives

```bash
git commit --no-verify
# Logged in your shell history. Use only when the hook flagged a
# placeholder it didn't recognize (e.g., a long base64 fixture in a
# test file).
```

#### Uninstall

```bash
git config --unset core.hooksPath
```

#### What the hook does NOT protect against

- A push made from a clone where the hook was never installed.
- Secrets in binary files (images, sqlite DBs, etc.).
- Secrets that don't match the documented patterns (custom internal
  formats, base64-encoded raw bytes with no recognisable prefix).
- A `git commit --no-verify` invocation.
- A secret already in git history (the hook only guards future
  additions; for past leaks, see the git-history scrub plan in the
  A1 incident-classification report).

These are documented limitations. The hook is one layer in defense-in-depth, not a complete solution.

### Backup of production secrets
- The `/root/khat/.env` file is NOT backed up by DigitalOcean's automatic snapshots (those are DB-only). Keep a copy in your password manager — e.g. 1Password "khat-prod-env" item — and update it whenever you rotate a credential.

### SSH key expectations
- The operator uses `ssh root@khatpodcast.com` keyed against a private key on their laptop (`~/.ssh/id_*`).
- If you cannot SSH, you cannot deploy. Recovery: DigitalOcean console (web-based shell), then re-add your public key to `/root/.ssh/authorized_keys`.

---

## I. Observability

| Source | Command / URL | What to look at |
|---|---|---|
| Web logs | `ssh root@khatpodcast.com 'pm2 logs khat --lines 100'` | Recent 5xx, route handler exceptions. |
| Worker logs | `ssh root@khatpodcast.com 'pm2 logs khat-worker --lines 100'` | Handler errors, timeouts, schedule ticks. |
| PM2 process status | `ssh root@khatpodcast.com 'pm2 status'` | Both online; restart count; mem usage. |
| `/api/health` | `curl https://khatpodcast.com/api/health` | App + DB + worker heartbeat (A2). |
| Ops dashboard | https://khatpodcast.com/admin/ops | All sections, last-24h activity. |
| AI-degraded banner | Visible at top of `/admin/*` | Auto-appears when ≥3 AI rejects in 5min (A10). |
| Queue inspection | `ssh root@khatpodcast.com 'cd /root/khat && npm run jobs:inspect'` | Queue counts, oldest pending/running, dead pile. |
| Phase-1 observation | `ssh root@khatpodcast.com 'cd /root/khat && npm run observe:phase-1-report'` | All Phase-1+ telemetry in one report. |

### Healthy baseline (what "normal" looks like)
- `/api/health` returns `status: "ok"`.
- PM2: both online, restart_count stable.
- `jobs:inspect`: `pending` < 20, `running` ≤ 1, `dead` < 5 across last 7 days.
- Ops dashboard: AI-degraded banner ABSENT.

### Log rotation (`pm2-logrotate`)

`pm2-logrotate` is the canonical log rotator. It rotates the live
log files configured in `ecosystem.config.js` (`/var/log/khat/*.log`)
when they hit `max_size`, gzip-compresses rotated copies, and keeps
the last `retain` of them. No application restart is required — PM2
swaps file descriptors transparently.

#### One-time install on the droplet

Run once per droplet. Idempotent — re-running with the same values
is safe.

```bash
ssh root@khatpodcast.com '
  set -e

  # Install the module (no-op if already installed).
  pm2 install pm2-logrotate

  # Conservative defaults — bounded disk footprint per process:
  #   live log up to 10MB + 7 gzipped rotations (~1MB each) = ~17MB max.
  #   Across 4 streams (web.out/err + worker.out/err) = ~70MB total cap.
  pm2 set pm2-logrotate:max_size 10M
  pm2 set pm2-logrotate:retain 7
  pm2 set pm2-logrotate:compress true

  # Lexically sortable timestamp — easy to inspect rotated archives.
  pm2 set pm2-logrotate:dateFormat YYYY-MM-DD_HH-mm-ss

  # Check every 30 seconds whether any log exceeded max_size.
  pm2 set pm2-logrotate:workerInterval 30

  # Safety rotation: daily at midnight even if max_size not yet hit.
  # Bounds the "low-volume but very old timestamps" case.
  pm2 set pm2-logrotate:rotateInterval "0 0 * * *"

  # Persist so a reboot picks up the same config.
  pm2 save
'
```

#### Verify install + config

```bash
ssh root@khatpodcast.com '
  pm2 list pm2-logrotate
  echo "---"
  pm2 conf pm2-logrotate
'
```

Expected output:

```
pm2-logrotate: online
---
max_size: 10M
retain: 7
compress: true
dateFormat: YYYY-MM-DD_HH-mm-ss
workerInterval: 30
rotateInterval: 0 0 * * *
```

#### Inspect rotated logs

```bash
ssh root@khatpodcast.com 'ls -lah /var/log/khat/'
# Expected: 4 live *.log files + N gzipped *.log.<timestamp>.gz files

# Read a rotated archive without uncompressing:
ssh root@khatpodcast.com 'zcat /var/log/khat/worker.out.log.2026-05-27_00-00-00.gz | tail -100'

# Search across all rotations:
ssh root@khatpodcast.com 'zgrep -h "TIMEOUT" /var/log/khat/worker.*.log.*.gz | tail -20'

# Total disk used by logs (should stay under ~80MB at steady state):
ssh root@khatpodcast.com 'du -sh /var/log/khat/'
```

#### Forced-rotation test (one-time validation after install)

Confirm rotation actually fires without waiting for natural growth.

```bash
ssh root@khatpodcast.com '
  # Temporarily lower the threshold to 1KB so any log line triggers.
  pm2 set pm2-logrotate:max_size 1K

  # Generate some log volume by emitting a noisy demo job.
  psql "$DATABASE_URL" <<SQL
    INSERT INTO jobs (type, payload, status, priority, max_attempts, attempts, run_after)
    VALUES ('"'"'demo.echo'"'"', '"'"'{"echo":"rotation-test"}'"'"'::jsonb, '"'"'pending'"'"', 5, 1, 0, NOW());
SQL

  # Wait up to 60 seconds for pm2-logrotate to detect and rotate.
  sleep 45

  # Verify at least one gzipped rotation now exists.
  ls -lah /var/log/khat/*.log.*.gz | head -5

  # Restore production threshold.
  pm2 set pm2-logrotate:max_size 10M
  pm2 save
'
```

Expected: at least one `worker.out.log.<timestamp>.gz` file appears.
If none appears within 60 seconds, run `pm2 logs pm2-logrotate
--lines 30` to inspect the module's own log (it lives inside PM2 like
any other process and records its rotation decisions).

#### Uninstall (rollback)

```bash
ssh root@khatpodcast.com '
  pm2 uninstall pm2-logrotate
  pm2 save
'
```

After uninstall, logs grow unbounded again. Manual `:> /var/log/khat/*.log`
truncation is the fallback (covered in §G.5).

#### Expected disk behavior

- Steady state: ~30–80 MB total in `/var/log/khat/`.
- Worst case (sustained worker activity, all 7 retained slots full
  at the post-compress ceiling): ~120 MB.
- A 10 GB droplet disk has ample headroom; the rotation prevents
  unbounded growth.
- pm2-logrotate's own rotation log goes to PM2's default log
  directory (`~/.pm2/logs/pm2-logrotate-out.log`) and is also rotated
  by itself — no recursion, no leak.

#### What pm2-logrotate does NOT do

- Does not aggregate logs across instances (we have one instance).
- Does not ship logs to a remote system (out of scope; future note §J).
- Does not rotate files outside PM2's awareness (e.g. nginx access
  logs, if you later add a reverse proxy — those need their own
  logrotate config).

---

## J. Future notes (intentionally deferred)

These items are KNOWN limitations of the current single-instance architecture. They are deliberately NOT addressed in v1. Each has a triggering condition for future work.

| Limitation | Triggering condition |
|---|---|
| **Rate limiter is per-process (A8).** Multiple PM2 instances would have independent token buckets — operator can effectively double their limit by alternating between instances. | Trigger if/when scaling to `instances: 2+`. Mitigation: Redis-backed shared counter, or HAProxy / nginx rate-limit at the reverse-proxy layer. |
| **AI-degraded banner uses a 5-min lazy probe per admin page render (A10).** Operator must navigate to see updates. | Trigger if operator feedback indicates the banner stale-ness is confusing. Mitigation: lightweight client-side re-fetch every N minutes (not WebSocket). |
| **CSP retains `'unsafe-inline'` for script-src and style-src (A6).** Reflected-XSS via inline-script injection is theoretically possible. | Trigger if a real XSS vector is found, or if a security audit requires it. Mitigation: nonce-based CSP — requires touching every `dangerouslySetInnerHTML` site (~5 files). |
| **Single PM2 web instance.** A wedged Next.js process drops 100% of traffic until PM2 restarts it. | Trigger if uptime SLO becomes a real requirement, OR if web CPU sustains >70%. Mitigation: `instances: 2`, requires session sharing (DB-backed already — OK). |
| **Single worker.** Queue depth grows if any handler is slow. | Trigger if `jobs:inspect` shows `pending > 50` sustained for 3+ days. Mitigation: bump `instances: 2` in ecosystem.config.js; queue is already `SKIP LOCKED`-safe. |
| **No CDN.** Every public-page request hits the droplet. | Trigger if traffic patterns produce sustained > 100 req/s on the droplet. Mitigation: Cloudflare in front of the droplet. |
| **No external uptime monitor.** A2 exposes `/api/health`; nothing polls it externally. | Trigger before public launch. Mitigation: Better Stack or DO Monitoring with `/api/health` HTTP check. |
| **No log aggregation.** Logs live on the droplet only. | Trigger if multi-instance becomes a need, or if 30-day log retention becomes a compliance requirement. Mitigation: structured-log shipping (Loki, Better Stack Logs). |

---

## Quick reference card

Save this for your phone.

```text
DEPLOY (laptop)
  1. git status         → clean
  2. validate-env       → green
  3. npm run build      → green
  4. smoke:phase-1-all  → green
  5. ssh: snapshot /root/khat → /root/khat-prev
  6. rsync to /root/khat
  7. ssh: npm ci + npm run build
  8. ssh: pm2 restart khat ; sleep 3 ; pm2 restart khat-worker
  9. verify: /api/health 200 + pm2 status + jobs:inspect + admin login

ROLLBACK (~60s)
  ssh: mv /root/khat /root/khat-failed-TS
  ssh: cp -a /root/khat-prev /root/khat
  ssh: pm2 restart khat ; sleep 3 ; pm2 restart khat-worker
  verify

DAILY HEALTH CHECKS
  curl https://khatpodcast.com/api/health | jq
  https://khatpodcast.com/admin/ops
  ssh root@khatpodcast.com 'pm2 status'

EMERGENCY
  worker stuck:        pm2 restart khat-worker (lease reaper recovers in 5min)
  web 5xx:             pm2 logs khat --err --lines 100  → roll back if no fix in 5min
  DB down:             DigitalOcean console → khat-main-db → status; nothing on droplet helps
  OpenAI dead:         no action needed; A10 banner shows it; queue retries automatically
  disk full:           truncate /var/log/khat/*.log ; clean /root/khat-failed-*
```
