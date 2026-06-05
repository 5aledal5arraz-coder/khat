# Khat Brain — Schema Spine (P1.2 snapshot)

Last reviewed: 2026-05-22 (Phase 1.2 — Foundation Hardening).
Source of truth: `lib/db/schema/*.ts` files.

This document captures the **editorial spine** as the codebase currently
defines it. It is hand-written, human-reviewable, and intentionally
narrow: ten tables, four hard foreign keys, six soft `text` pointers, and
ten canonical join queries exercised by `npm run smoke:spine-joins`.

`docs/schema.md` is **not** auto-generated. Any schema PR that changes a
spine column, table, or relationship should update this file in the
same commit.

---

## 1. The spine — ASCII map

```
                      ┌──────────────────────┐
                      │   khat_map_seasons   │  ◀── seasons (planning unit)
                      │  PK: id  (text)      │
                      └──────────┬───────────┘
                                 │  FK (set null)
                                 │
       ┌─────────────────────────┼──────────────────────────────┐
       │                         │                              │
       │                         ▼                              │
       │      ┌──────────────────────────────────────┐          │
       │      │   episode_intelligence_records       │          │
       │      │              (EIR)                   │          │
       │      │  PK: id (text)                       │          │
       │      │  FK: season_id → khat_map_seasons    │          │
       │      │  FK: guest_id  → guests              │          │
       │      └────┬─────┬─────┬─────┬─────┬─────────┘          │
       │           │     │     │     │     │                    │
       │           ▼     ▼     ▼     ▼     ▼                    │
       │      ┌──────┐┌──────┐┌──────┐┌──────┐┌──────────────┐  │
       │      │khat_ ││prep  ││collab││studio││  episodes    │  │
       │      │map_  ││ar_   ││orati ││sess  ││ (public site)│  │
       │      │cand. ││tions ││on_   ││ions  ││              │  │
       │      │      ││      ││rooms ││      ││              │  │
       │      └──────┘└──────┘└──────┘└──────┘└──────────────┘  │
       │       all six columns above are SOFT `text eir_id`     │
       │       columns. NULL is OK; non-null-but-orphan is NOT. │
       │                                                        │
       │      ┌──────────────────────────────────┐              │
       │      │   eir_phase_transitions          │              │
       │      │   FK eir_id → EIR (cascade)      │              │
       │      └──────────────────────────────────┘              │
       │      ┌──────────────────────────────────┐              │
       │      │   episode_performance_signals    │              │
       │      │   FK eir_id → EIR (cascade)      │              │
       │      └──────────────────────────────────┘              │
       │      ┌──────────────────────────────────┐              │
       │      │   ai_runs                        │              │
       │      │   FK eir_id    → EIR (set null)  │◀─────────────┘
       │      │   FK season_id → seasons         │
       │      └──────────────────────────────────┘

       ┌──────────────────────────────────────────────────────┐
       │   guests (canonical, episode-linked public table)    │
       │   PK: id                                             │
       └──────┬───────────────────────────────────────────────┘
              │  SOFT `text promoted_guest_id`
              ▼
       ┌──────────────────────────────────┐
       │   guest_discovery_candidates     │
       │   FK discovery_run_id → discovery_runs (set null)
       └──────────────────────────────────┘
                        ▲
                        │
       ┌────────────────┴─────────────────┐
       │   discovery_runs                 │
       │   FK season_id → seasons         │
       └──────────────────────────────────┘
```

Read it once and the rule jumps out: every domain table holds its own
state but **does not own EIR state**. EIR is the spine; the rest are
either lenses (read-side) or producers that stamp `eir_id` on themselves.

---

## 2. The ten tables — fields that matter for spine queries

(Listing only columns relevant to the joins; full column lists live in
the schema files.)

### 2.1 `episode_intelligence_records` (EIR — the spine)

- `id` text, PK
- `phase` text — current state-machine position
- `season_id` text → `khat_map_seasons.id` (FK, set null)
- `guest_id` text → `guests.id` (FK, set null)
- `working_title`, `final_title`
- `created_at`, `updated_at`, `archived_at`

### 2.2 `khat_map_seasons`

- `id` text, PK
- `name` text
- `status`, `v2_mode`, `target_episode_count`
- (no inbound spine FKs of its own — it's a root)

### 2.3 `guests`

- `id` text, PK
- `name`, `slug`, `bio`, `image_url`
- (no inbound spine FKs — root for the public-guest concept)

### 2.4 `khat_map_episode_candidates`

- `id` text, PK
- `season_id` text → `khat_map_seasons.id` (FK)
- **`eir_id` text — SOFT (no .references())**
- `working_title`, `status`

### 2.5 `episode_preparations`

- `id` text, PK
- **`eir_id` text — SOFT (no .references())**
- `prep_v2` jsonb
- `status`

### 2.6 `collaboration_rooms`

- `id` text, PK
- **`eir_id` text — SOFT (no .references())**
- `status` (waiting / live / paused / ended)
- `preparation_id` text — links to `episode_preparations`

### 2.7 `studio_sessions`

- `id` text, PK
- **`eir_id` text — SOFT (no .references())**

### 2.8 `episodes` (public site)

- `id` text, PK
- **`eir_id` text — SOFT (no .references())** — NULL for the 77
  YouTube-imported historical episodes; stamped only when a studio
  push attaches a new EIR-backed episode.
- `youtube_url`, `slug`, `release_date`

### 2.9 `eir_phase_transitions`

- `id` text, PK
- `eir_id` text → `episode_intelligence_records.id` (FK, **cascade**)
- `from_phase`, `to_phase`, `actor_id`

### 2.10 `episode_performance_signals`

- `id` text, PK
- `eir_id` text → `episode_intelligence_records.id` (FK, **cascade**)
- `views_at_7d`, `views_at_28d`, `signal_score`
- Unique index `uq_episode_performance_signals_eir` on `eir_id`

### 2.11 `ai_runs` (also relevant — telemetry per call)

- `id` text, PK
- `eir_id` text → `episode_intelligence_records.id` (FK, set null)
- `season_id` text → `khat_map_seasons.id` (FK, set null)
- `task_kind`, `provider`, `model_name`, `prompt_version` (P0 addition)

### 2.12 Adjacent tables for context

- `discovery_runs` — `season_id` → `khat_map_seasons.id` (FK, set null)
- `guest_discovery_candidates` — `discovery_run_id` → `discovery_runs.id` (FK, set null), `promoted_guest_id` SOFT → `guests.id`

---

## 3. The ten canonical spine joins

Each query is exercised by `npm run smoke:spine-joins`. Healthy result
is described per-row; the smoke exits non-zero if any soft-FK orphan
appears.

| # | Join | Type | Healthy outcome |
|---|------|------|-----------------|
| 1 | `khat_map_episode_candidates.eir_id` → `episode_intelligence_records.id` | SOFT | Every non-null `eir_id` must resolve. Orphans = 0. |
| 2 | `episode_preparations.eir_id` → `episode_intelligence_records.id` | SOFT | Same. |
| 3 | `collaboration_rooms.eir_id` → `episode_intelligence_records.id` | SOFT | Same. |
| 4 | `studio_sessions.eir_id` → `episode_intelligence_records.id` | SOFT | Same. |
| 5 | `episodes.eir_id` → `episode_intelligence_records.id` | SOFT | Same. NULL is **expected** for the 77 pre-EIR YouTube imports; only non-null orphans count as violations. |
| 6 | `guest_discovery_candidates.promoted_guest_id` → `guests.id` | SOFT | Every non-null `promoted_guest_id` must resolve to a published guest. |
| 7 | `episode_intelligence_records.season_id` → `khat_map_seasons.id` | HARD (set null) | Joinable count = total EIRs with a season. Orphans impossible. |
| 8 | `episode_intelligence_records.guest_id` → `guests.id` | HARD (set null) | Joinable count = total EIRs with a guest. Orphans impossible. |
| 9 | `ai_runs.eir_id` → `episode_intelligence_records.id` | HARD (set null) | Joinable count = total EIR-attributed runs. Orphans impossible. |
| 10 | `eir_phase_transitions.eir_id` → `episode_intelligence_records.id` | HARD (cascade) | Joinable count ≥ total EIRs (every EIR has at least an initial-phase row). Orphans impossible by FK; the smoke also asserts every EIR has ≥ 1 transition (initial state was logged). |

---

## 4. Notes on production realities surfaced

The system-map document already observed:

- `episodes` has 77 rows from YouTube imports with NULL `eir_id`. This
  is **expected** until backfill (which the roadmap explicitly defers).
  The smoke must not flag NULL as orphan.
- `khat_map_episode_candidates` has many rows with `eir_id` set, and a
  matching unique partial index `idx_kmec_eir_id` ensures one-to-one.
  The smoke counts the pair.
- The four soft-FK tables (`episode_preparations`, `collaboration_rooms`,
  `studio_sessions`, `episodes`) are the candidates for hard-FK promotion
  during the Phase 4 guest unification + Phase 5 legacy retirement.
  P1.2 produces the data to inform that promotion safely.

---

## 5. Running the smoke

```bash
npm run smoke:spine-joins
```

Exits 0 on clean run, 1 on any soft-FK orphan, 2 on a query error.
The script enforces a production-hostname guard — it refuses to run
against `DATABASE_URL`s containing common managed-DB hostnames unless
`SMOKE_ALLOW_REMOTE=1` is set.

---

## 6. How `smoke:fk-orphans` extends the spine smoke (Phase 1.4)

`scripts/smoke-spine-joins.ts` (Phase 1.2) is the narrow canary —
10 joins centred on EIR. `scripts/smoke-fk-orphans.ts` (Phase 1.4) is
the wide sweep — every soft `text` foreign key in the schema, ~28
checks grouped by referenced-target domain.

| Aspect | `smoke:spine-joins` (P1.2) | `smoke:fk-orphans` (P1.4) |
|---|---|---|
| Scope | 10 spine-centric joins (6 soft + 4 hard) | ~28 soft text FKs across the whole schema |
| Hard FKs included | Yes (informational counts) | No — hard FKs cannot orphan |
| Domains | EIR + seasons + guests + ai_runs + transitions | EIR + Guests + Admin users + Episodes + Studio sessions + Cross-domain |
| Question answered | "Is the EIR spine internally consistent?" | "Does any soft pointer anywhere point to nothing?" |
| When to run | Before Phase 4 work, before any spine-touching PR | Weekly, before retention design, before structural work |
| Output | Flat list of 10 lines | Grouped by referenced-target domain |
| Overlap | 5 of P1.4's checks match P1.2's soft-FK rows | Yes — the wider smoke necessarily includes them |

Both share:
- Production-hostname guard (refuses managed-DB endpoints by default).
- Read-only SELECTs; never writes anywhere.
- Exit 0 / 1 / 2 convention.
- "Discovery, not cleanup" posture — neither smoke fixes anything.

Use both. P1.2 is the tight canary you keep running locally while editing
the spine. P1.4 is the wide net you sweep before promoting soft FKs to
hard, designing the retention job, or shipping a release.

```bash
# Narrow canary
npm run smoke:spine-joins

# Wide sweep
npm run smoke:fk-orphans
```

---

## 7. Managing the soft-FK orphan allowlist (Phase 1.4-ALLOW)

`evals/known-fk-drift.json` records the acknowledged soft-FK drift the
operator has reviewed and accepted. Without this, the wide smoke would
exit 1 forever because the dev DB has legitimate non-data orphans
(test-actor labels, legacy content references). With it, the smoke
exits 0 when observed drift matches the allowlist, and exits 1 the
moment a *new* orphan appears.

### When to edit the file

| Situation | Action |
|---|---|
| Phase 4/5 reduces an `ep-*` / `cross-*` orphan count | Lower `max_orphans` to the new count. The smoke nudges you with "improving — consider tightening allowlist." |
| A new test runner or system actor stamps `created_by` | Add the label to the `allow_values` regex array of the affected `admin-*` entries. |
| A real new orphan appears that should NOT be acknowledged | Investigate. Do NOT add to the allowlist — fix the data or the schema instead. |
| All drift in a bucket is resolved | Remove the entry entirely. The next run will surface a fresh failure if anything regressed. |

### Allowlist semantics (cheat-sheet)

- `allow_values` — array of regex source strings; any orphan whose pointer value matches one of them is acknowledged.
- `max_orphans` — integer cap; up to this many *unmatched* orphans are also acknowledged.
- Both fields are optional. With neither, every orphan in the check is new drift.
- Acknowledged orphans never affect the exit code.
- New drift always exits 1.

### Output marks

- `✓` clean — 0 orphans on this check.
- `~` acknowledged — orphans present but all within the allowlist.
- `✗` new drift — orphans beyond the allowlist; exit 1.
- `·` skip — the catalogue referenced a table that doesn't exist locally.

### Why this beats "ignore = exit 1 forever"

A smoke that always exits 1 stops being signal. After a week of red,
the operator stops reading the output. The allowlist keeps the smoke
GREEN on known-drift days and visibly RED only when something *new*
breaks. Phase 4 + Phase 5 progress is then measurable as the
`max_orphans` numbers fall toward zero and entries get removed.
