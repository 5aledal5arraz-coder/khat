# Khat Brain — Retention Policy

Phase 1.5. Bounded growth for AI telemetry without losing prompt-version
diversity or cost analytics.

## Tables affected

| Table | Policy |
|---|---|
| `ai_runs` | **Strip-and-keep.** ≥ 90 days old → snapshots nulled, metadata preserved forever. Earliest run per `(task_kind, prompt_version)` is protected. |
| `ai_runs_summary` | **Monotonic roll-up.** Populated by every retention pass. Bounded by months × features × providers × models × prompt versions. |
| `jsonb_validation_events` | **Soft delete.** ≥ 30 days old AND `mode IN ('report','scanner')` → deleted. `mode='enforce'` rows kept forever. |
| `eir_phase_transitions` | **Untouched.** Audit log. |
| `admin_audit_logs` | **Untouched.** Compliance. |
| `khat_map_season_decisions` | **Untouched.** Wizard journal. |

## What gets preserved forever on `ai_runs`

`id`, `eir_id`, `season_id`, `task_kind`, `provider`, `model_name`,
`prompt_version`, `status`, `started_at`, `completed_at`, `latency_ms`,
`tokens_in`, `tokens_out`, `cost_usd`, `error_class`, `stripped_at`.

## What gets nulled out by the strip step

`input_snapshot`, `output_snapshot`, `prompt_hash`, `error_message`.

These are debugging blobs; after 90 days the row's analytics value is
the metadata above. The row itself stays — Phase 2 prompt-version
comparisons remain reproducible from filesystem eval reports.

## Commands

```bash
# Dry-run (default). No writes.
npm run jobs:retention-ai-runs

# Confirmed run. Mutates inside one transaction, advisory-locked.
npm run jobs:retention-ai-runs -- --confirm

# Limit rows per invocation (useful for first run on a large table).
npm run jobs:retention-ai-runs -- --confirm --max-rows 10000
```

## Schedule

Manual command. Cron wiring is **Phase 7** (production hardening).
Until then: run weekly while operating locally; run once per release
while preparing for launch.

## Rollback

| Level | How | What it does |
|---|---|---|
| 1 | Don't run | No retention; growth resumes |
| 2 | Re-run as `--dry-run` | No-op (default behaviour) |
| 3 | `MIGRATE_PHASE1_RETENTION_REVERSE=1 npm run migrate:phase1-retention` | Drops `ai_runs_summary` table + `ai_runs.stripped_at` column. Past stripped rows stay stripped. |
| 4 | DB backup restore | The only way to recover stripped JSONB snapshots |

The strip step is **irreversible at the SQL layer**. That's why the
default behaviour is dry-run and the script prints a destruction
warning when `--confirm` is set.

## Safeguards

- Hostname guard refuses managed-DB endpoints unless `SMOKE_ALLOW_REMOTE=1`.
- `pg_advisory_xact_lock(hashtext('khat-retention'))` prevents concurrent runs.
- All writes in one transaction; partial failure rolls back cleanly.
- `WHERE stripped_at IS NULL` filter makes re-running a no-op.
- `--max-rows` caps the per-invocation batch size.
- Roll-up uses `INSERT ... ON CONFLICT DO UPDATE` — additive merges, no
  double-counting.

## Protected-row contract

The strip step uses `ROW_NUMBER() OVER (PARTITION BY task_kind,
COALESCE(prompt_version, '') ORDER BY completed_at ASC, id ASC)` to
identify the earliest row of each `(task_kind, prompt_version)`
combination. That row has `rn = 1` and is excluded from the strip set;
all other rows in the combo with `rn > 1` are stripped.

The protected row's full snapshots survive forever. This gives
debugging access to *one* canonical example per prompt version even
after years of operation.

## When to tighten the policy

After ~12 months of operation, if the `ai_runs_summary` table grows
beyond expectations, consider:

- Reducing the strip threshold from 90 to 60 days (less debugging
  window, faster strip).
- Adding a per-summary-row deletion rule for combos older than 5 years
  (probably never needed).

Until then, the policy as shipped is the right balance.
