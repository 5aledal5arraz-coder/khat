# Pre-baseline archive

`0001_fix_sprint_columns.sql` was a hand-written, un-journaled migration that
predates the versioned-migration setup. It was moved here when the
`0000_baseline_full_schema.sql` baseline was generated (2026-06-16).

**Its schema changes are already in the baseline** — the columns it added
(`khat_map_episode_candidates.composite_score` / `composite_score_rationale`,
`ai_runs.season_id` + FK + index) are part of the current Drizzle schema and were
captured when the baseline was generated and verified.

The one thing the baseline does NOT carry is its **data backfill** (the
`UPDATE ai_runs … SET season_id` statement). That was a one-time historical
backfill; if you ever rebuild a database from migrations and need that data
reconciled, the statement is preserved in the file here. Kept for history only —
do not add it to the journal.
