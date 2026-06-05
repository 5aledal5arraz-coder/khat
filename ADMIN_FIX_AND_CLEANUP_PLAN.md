# Khat — Fix & Cleanup Plan

**Date:** 2026-06-05
**Scope:** Resolve the two QA failures, verify the fix, and clean up the project.
**Source of truth:** This plan is grounded in reading the actual failing files — the code is correct; the failures are environment/build state.

---

## TL;DR

Both QA bugs (season workspace crash + manual-signal 503) have the **same root cause: a stale Turbopack dev build**. The `.next` cache is dated **May 28** while source was last edited **Jun 4**, and the failing modules (`wizard-client.tsx`, `ManualSignalForm` → `createManualSignalAction`) are well-formed. The fix is a clean rebuild, not a code change. Separately, the repo has **723 uncommitted changes** that should be reviewed, committed, and tidied.

Work in three phases: **(A) Fix & verify the runtime → (B) Confirm no real code defect → (C) Clean the repo.**

---

## Phase A — Fix the runtime (unblocks Bugs #1 & #2)

> These are operator steps to run in the project terminal. They are the highest priority.

**A1. Stop the dev server.** Ctrl-C the running `npm run dev`.

**A2. Clear stale build + caches.**
```bash
cd /root/khat        # or your local path: ~/Desktop/khat
rm -rf .next
rm -rf node_modules/.cache   # turbopack/webpack cache
```

**A3. Restart dev.**
```bash
npm run dev
```

**A4. Re-test the two failures (should now pass):**
- Open a season → `/admin/khat-brain/seasons` → "فتح مساحة العمل". Expect the workspace, not the error boundary.
- `/admin/khat-brain/market/signals` → "إضافة إشارة يدوية" → fill title + summary → "حفظ الإشارة". Expect a success toast and a new "approved/manual" signal row. (Delete the test row afterward.)

**A5. If failures persist after a clean rebuild,** then it *is* a code/runtime defect — proceed to Phase B diagnostics and capture the full server-side terminal stack trace (the browser only shows "Failed to fetch"; the real error prints in the `next dev` console).

---

## Phase B — Confirm no real code defect

**B1. Type-check + production build** (catches anything HMR was hiding):
```bash
npm run build
```
A clean `next build` is the definitive proof the server actions and pages compile. If it surfaces errors, fix those first — they would explain the 503s.

**B2. Lint:**
```bash
npm run lint
```

**B3. Targeted server-action sanity (only if A4 still fails):**
- Confirm `lib/api-utils.ts` `requireAdmin()` / `getAdminAuthUser()` resolve a session (the 503 could also be an auth/DB throw inside the action).
- Confirm `DATABASE_URL` is reachable from the dev process (`createManualSignal` writes to Postgres; a dead DB connection would throw on submit).
- Confirm `enqueueJob` / `lib/jobs/queue` isn't throwing synchronously (it's wrapped in try/catch, so it shouldn't — but verify).
- Check the `next dev` terminal for the real stack trace at the moment of submit.

---

## Phase C — Clean up the repository

The working tree currently has **723 changes** (215 modified, 167 deleted, 341 untracked). This is the "clean everything" work.

**C1. Resolve the stuck git lock first.**
A `.git/index.lock` is present (left by a crashed/locked git process or an editor). With no git running:
```bash
rm -f .git/index.lock
```

**C2. Review what changed before committing anything.**
```bash
git status
git diff --stat
```
Expect to see, among others:
- **Intentional removals** (already deleted, just not committed): `app/admin/ads/*`, `app/admin/content/*` — the old CMS/ads surfaces replaced by Khat Brain. Confirm these are truly dead, then stage the deletions.
- **The Khat Brain feature set** (new untracked files under `app/admin/khat-brain/**`, `lib/market-intelligence/**`, etc.).
- **Modified shared files** (sidebar, breadcrumbs, episodes, analytics, etc.).

**C3. Commit in logical groups** (don't make one giant commit). Suggested grouping:
1. Remove dead surfaces — `git rm -r app/admin/ads app/admin/content` (+ any other confirmed-dead files).
2. Khat Brain admin (seasons, market, discovery, episodes pipeline).
3. Shared/admin chrome changes (sidebar, header, breadcrumbs, glow-card).
4. Library/domain changes (`lib/**`).
5. Docs/config.

**C4. Identify orphaned / dead files.**
```bash
# files referencing removed systems
grep -rn "firebase" app lib --include=*.ts --include=*.tsx   # CLAUDE.md says Firebase is removed
# unused exports (optional tooling)
npx knip            # or: npx ts-prune
```
Delete anything confirmed unused. CLAUDE.md already states Firebase and `ADMIN_AUTH_BYPASS` are gone — verify no stragglers remain.

**C5. Verify `.gitignore` covers build artifacts** (`.next/`, `node_modules/`, `.env*`). Ensure no `.env` is staged (it holds DB/OpenAI/Resend keys — must never be committed).

**C6. Re-run build + lint after cleanup** to confirm nothing was over-deleted:
```bash
npm run build && npm run lint
```

---

## Phase D — Data & operational cleanup (optional but recommended)

**D1. Seed one Khat Brain episode** so the empty pipeline can be QA'd end-to-end (episode detail, Studio, AI generation). The Khat Brain episode list is currently empty while the live site has 66 episodes via the existing system — the two are separate.

**D2. Investigate background-worker health** (from the Ops dashboard, informational — not a UI bug):
- **9 jobs in `dead` state.**
- Repeated **`market.extract` handler timeouts** ("timed out after ~6,488,000ms vs 300,000ms budget"). Either the handler is hanging or the timeout/budget is misconfigured. Worth a look in the job-queue handler for `market.extract`.

**D3. Minor UX:** the Episodes season-filter dropdown only lists "All Seasons". Confirm whether it should list individual seasons or only seasons with materialized episodes.

---

## Phase E — Prevent recurrence

- **Add a clean-restart script** to `package.json`:
  ```json
  "dev:clean": "rm -rf .next node_modules/.cache && next dev"
  ```
  Use it whenever HMR gets weird (the symptom: "module factory is not available... deleted in an HMR update").
- **Document the symptom** in `CLAUDE.md` under a troubleshooting note so future sessions reach for the clean rebuild immediately.
- Consider whether Turbopack dev (`next dev`) instability warrants pinning to webpack dev for now (`next dev` without `--turbopack`), if these HMR desyncs recur.

---

## Execution order (checklist)

1. [ ] A1–A3: stop server, `rm -rf .next node_modules/.cache`, restart
2. [ ] A4: re-test season workspace + manual signal (delete the test row)
3. [ ] B1–B2: `npm run build` + `npm run lint` clean
4. [ ] C1: remove `.git/index.lock`
5. [ ] C2–C3: review and commit changes in logical groups
6. [ ] C4–C5: prune dead files, verify `.gitignore` / no `.env` staged
7. [ ] C6: re-run build + lint
8. [ ] D1: seed a Khat Brain episode and re-QA the pipeline
9. [ ] D2: investigate dead jobs + `market.extract` timeouts
10. [ ] E: add `dev:clean` script + document

---

## What this plan deliberately does NOT do

- No code rewrite of the form/action — they are correct as written.
- No permanent deletion of real content (episodes, guests, signals) — only the throwaway QA test row.
- No git history rewrite — only committing the existing working tree in a clean, reviewable way.
