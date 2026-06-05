# scripts/_archive

Historical scripts kept as a record of past schema migrations and one-off
audits. These were moved here in **Cleanup Wave 4** because they were no
longer referenced from `package.json`, no other script imports them, and
they were not part of the current smoke or setup loops — but they
document past changes that may be useful when investigating the
historical state of the system.

Nothing in this directory is wired into npm scripts, CI, or the
boundary smoke.

## Categories

### Already-applied schema migrations
Idempotent in design, but their target schema lives in
`scripts/post-schema.sql` + Drizzle today. Kept as documentation.
- `migrate-khat-map-editorial-controls.ts` — added `editorial_controls`
  jsonb + `quality` columns on khat_map_topic_bank / guest_candidates.
- `migrate-khat-map-performance.ts` — added `khat_map_episode_performance`.
- `migrate-khat-brain-fix-types.ts` — aligned `created_by`/`actor_id`
  column types from uuid → text.

### CTO / fix-sprint audit harness (specific season IDs)
Bound to the season + prep IDs created during the production-readiness
fix sprint. Re-runnable only against that data.
- `qa-cto-deep-audit.ts`
- `qa-cto-prep-v2-dump.ts`
- `qa-cto-probe.ts`
- `qa-fresh-season-test.ts`
- `qa-fresh-prep-v2.ts`
- `qa-audit-fresh.ts`
- `qa-verify-migration.ts`

### Pre-vitest exploratory tests
Standalone runtime probes from before the vitest suite covered these
paths.
- `test-gemini-json-repair.ts`
- `test-preparation-fixes.ts`
- `test-preparation-research-breakdown.ts`
- `test-preparation-research.ts`
- `test-timestamps.ts`
- `test-youtube-only.ts`

## How to revive

If you need to re-run something here:

1. Check whether a current path in `vitest`, an in-tree smoke, or a
   `migrate:*` npm script already covers the same intent.
2. If not, copy the file back to `scripts/` (do not run from inside
   `_archive/`) and add an explicit npm script entry.
