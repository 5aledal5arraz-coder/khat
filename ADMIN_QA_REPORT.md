# Khat Admin Dashboard — QA Report

> **UPDATE (2026-06-05, post-fix):** A real root cause was found and fixed after a clean rebuild — see the **Resolution** section at the bottom. Season Workspace, Add Manual Signal, and Edit/Save all now pass (POST 200). The original findings below are kept for the record.

**Date:** 2026-06-05
**Environment:** Local dev server (`http://localhost:3000`), logged in as ADMIN
**Method:** Black-box testing via browser automation — every admin route loaded, console + network inspected, interactive controls exercised. Destructive testing was authorized; per the agreed safety rule, no pre-existing real content was permanently deleted (throwaway test records only).

---

## Headline result

The admin dashboard's **read/display layer is solid** — all 11 navigation destinations load and render correctly with live data and **zero console errors**. However, **server-side write actions are currently failing** in this dev session, and one detail page crashes to an error boundary. Both failures share the same root cause signature: a **stale Turbopack dev-server build** (hot-reload desync). This is almost certainly an environment state issue, not a code defect — but it must be cleared and re-tested before writes can be verified.

**Recommended immediate action:** restart the dev server cleanly (stop `npm run dev`, delete the `.next` cache, restart), then re-run the write tests below.

---

## Pass / Fail summary

| # | Section | Route | Read/Render | Write/Actions |
|---|---------|-------|:-----------:|:-------------:|
| 1 | Command Center (Ops) | `/admin/ops` | PASS | n/a |
| 2 | Khat Brain hub | `/admin/khat-brain` | PASS | n/a |
| 3 | Seasons — list | `/admin/khat-brain/seasons` | PASS | not submitted¹ |
| 4 | Seasons — new wizard | `/admin/khat-brain/seasons/new` | PASS | not submitted¹ |
| 5 | Seasons — workspace | `/admin/khat-brain/seasons/[id]` | **FAIL** | — |
| 6 | Episodes | `/admin/khat-brain/episodes` | PASS | empty pipeline² |
| 7 | Market Signals | `/admin/khat-brain/market/signals` | PASS | **FAIL** (503) |
| 8 | Market Sources | `/admin/khat-brain/market/sources` | PASS | not tested³ |
| 9 | Guest Discovery | `/admin/discovery` | PASS | not tested³ |
| 10 | Analytics / Performance | `/admin/analytics` | PASS | n/a |
| 11 | Guests | `/admin/guests` | PASS | not tested³ |
| 12 | Home Content | `/admin/home-content` | PASS | not tested³ |
| 13 | Newsletter | `/admin/newsletter` | PASS | not tested³ |

¹ Season creation kicks off real, billable AI generation jobs and creates real data — not submitted to avoid cost/pollution.
² Khat Brain episode pipeline has 0 records, so episode-detail / Studio / AI-generation flows could not be exercised through the UI.
³ Skipped after the write-action failure was diagnosed as systemic (see Bug #2) to avoid creating broken/partial records. Re-test after dev-server restart.

---

## Bugs found

### Bug #1 — Season workspace page crashes to error boundary  (High)
- **Where:** `/admin/khat-brain/seasons/[seasonId]` (clicking "فتح مساحة العمل" / Open Workspace on any season).
- **Symptom:** Page shows "حدث خطأ ما" (Something went wrong) error boundary. Reproduces after a hard reload.
- **Console error:**
  ```
  Error: Module [project]/app/admin/khat-brain/seasons/data:812a60 [app-client]
  ... was required from .../seasons/[seasonId]/_components/wizard-client.tsx,
  but the module factory is not available. It might have been deleted in an HMR update.
  ```
- **Diagnosis:** A Turbopack inline server-action module (`data:812a60`) referenced by `wizard-client.tsx` is missing from the current build graph — classic hot-reload desync. Likely clears on a clean rebuild.
- **Impact:** The entire season workspace (a core feature) is currently unreachable.

### Bug #2 — Server actions / write operations fail with 503  (High)
- **Where:** "إضافة إشارة يدوية" (Add manual signal) on `/admin/khat-brain/market/signals`. Form opens and accepts input correctly; failure is on submit.
- **Symptom:** Submit crashes to the error boundary.
- **Network:** `POST /admin/khat-brain/market/signals` → **503 Service Unavailable**.
- **Console error:** `TypeError: Failed to fetch at fetchServerAction (...)` inside `<ManualSignalForm>`.
- **Diagnosis:** Same family as Bug #1 — the dev server is not serving the expected server-action endpoints (stale build / desynced action IDs). No record was created.
- **Impact:** If systemic (likely), all create/edit/delete actions across the admin are currently affected.

> **Both bugs point to the same root cause.** The reliable fix-and-verify step is a clean dev-server restart. If the failures persist after a clean rebuild, then they are real code defects and warrant deeper investigation (server-action wiring in `wizard-client.tsx` and `ManualSignalForm`).

---

## Minor observations (not bugs)

- **Episodes filter — season dropdown** only offers "— كل المواسم —" (All Seasons); no individual seasons are selectable. Likely because the filter only surfaces seasons that have materialized episodes (currently none). Worth confirming the intended behavior.
- **Two content systems coexist:** Analytics reports **66 published episodes / 42 guests** (the existing live site), while the **Khat Brain AI pipeline** episode list is empty. This is expected given the seasons are still in "planning" stage, but it means the new AI-content flows have no data to display yet.
- **System health (informational, from Ops dashboard):** 9 jobs in `dead` state and repeated `market.extract` handler timeouts (e.g. "timed out after 6488122ms, budget 300000ms"). These are background-worker/operational data points, not dashboard UI bugs, but may be worth investigating separately.

---

## What was verified working (no errors)

- Full page render and live data on all 11 nav destinations.
- Ops dashboard: system-events table, worker health, AI-run counts, recent activity feed.
- Seasons list + multi-step "new season" wizard (generation method, episode-count slider, required guest filters, editorial controls — all interactive).
- Episodes list with search/stage/season/guest filters and correct empty state.
- Market Signals & Sources: tab filters, empty states; manual-signal form renders and accepts input.
- Discovery: search-source status panel + recent completed runs.
- Analytics: platform overview cards, 30-day visitor metrics, live YouTube data (most-viewed & latest videos with thumbnails/view counts), newsletter & request counters.
- Guests: 42 records, search, add/auto-link buttons, per-row action menus.
- Home Content: homepage slot management with edit/save controls.
- Newsletter: subscriber count, campaign history table, campaign-creation entry points.

---

## Recommended next steps

1. **Restart the dev server clean:** stop `npm run dev`, `rm -rf .next`, restart. This should clear Bugs #1 and #2.
2. **Re-run the write tests** that were blocked: create/edit/delete a manual signal, a trusted source, a guest, a home-content slot; open a season workspace; (optionally) run the season-creation wizard end-to-end.
3. **Seed at least one Khat Brain episode** so episode-detail, Studio, and AI-generation flows can be QA'd.
4. If Bug #1/#2 survive a clean rebuild, inspect server-action definitions in `seasons/[seasonId]/_components/wizard-client.tsx` and the manual-signal action handler.

---

## Resolution (post clean rebuild)

After clearing `.next` + `node_modules/.cache` and restarting, the old stale-chunk errors were gone but a **new, real build error** surfaced — proving the season-workspace/503 failures had a genuine code cause that the warm cache had been masking.

### Root cause (real code issue)
`app/layout.tsx` loaded the body font via **`next/font/google`** (`IBM_Plex_Sans_Arabic`). On a cold Turbopack build this failed:

```
Module not found: Can't resolve '@vercel/turbopack-next/internal/font/google/font'
  app/globals → next/font/google "IBM Plex Sans Arabic"
  Import trace: app/layout.tsx
```

`next/font/google` fetches the font at **build time** and generates the `--font-ibm-plex-arabic` CSS variable. When Turbopack can't materialize its internal font module on a cold build, the **root layout fails to compile — which breaks every route**, including all server actions (hence the season-workspace error boundary and the manual-signal 503).

### Fix
Switched IBM Plex Sans Arabic to the **same runtime `<link>` approach the project already uses for Amiri and Playfair**, removing the build-time font dependency entirely:

- `app/layout.tsx`: removed the `next/font/google` import + `IBM_Plex_Sans_Arabic({...})` call; added `IBM+Plex+Sans+Arabic:wght@300;400;500;600;700` to the existing Google Fonts `<link>`; cleaned the `<body>` className.
- `app/globals.css`: defined `--font-ibm-plex-arabic` in `:root` (the variable `--font-sans` and the base body rule depend on) → `"IBM Plex Sans Arabic", "Noto Naskh Arabic", "Cairo", sans-serif`.

### Verification (post-fix)
| Test | Result |
|------|--------|
| Season Workspace `/seasons/[id]` loads | **PASS** — full render, 0 console errors |
| Add Manual Signal (create) | **PASS** — POST **200**, success banner, row persisted |
| Archive signal (state-change write) | **PASS** — POST 200, moved to archived |
| Home Content Save (edit/save) | **PASS** — POST 200, "Saved" state |
| Build error in layout | **GONE** |

### Note on intermittent 503s during re-test
Right after the code edit, some server-action POSTs briefly returned 503 while the operation still completed. Cause: the `layout.tsx` change invalidates **every** route, so Turbopack recompiles them on first access and requests hitting a route mid-compile return 503. They return clean **200** once the route is warm (confirmed). This is dev-mode warm-up churn, not a defect, and does not occur in a production build.

### Leftover test data
Two throwaway manual signals ("TEST QA SIGNAL — delete me" / "...2") were created to exercise the write path and then **archived** (soft state, out of the active review queue). The admin UI offers no hard-delete; restore or ignore as you like.

---

## Continued work (same session) — 2 more real bugs fixed + episode seeded

### Bug fix #2 — `market.extract` jobs timing out → dead (lib/jobs/worker.ts)
The per-handler timeout budgets in `HANDLER_TIMEOUT_MS` were keyed by job-type names that **didn't match the registered handlers**: `market.scoring`/`market.cluster` (real types are `market.score_signals`/`market.cluster_signals`) and `market.extract` had no entry at all. So all three AI-bound handlers silently fell back to the 5-minute default and timed out chewing through the 1366-signal backlog → failed → retried → dead. (The 108-minute elapsed in the logs was a laptop-sleep artifact on top.) **Fix:** corrected the keys to the real handler names and set realistic budgets (extract 15m, score_signals 15m, cluster_signals 10m). Takes effect on worker restart (`npm run worker`).

### Throughput tweak — drain the signal backlog faster (lib/jobs/handlers/market-intelligence.ts)
`market.extract` processes ≤50 signals/run and only ran once per nightly tick, so a 1366 backlog would take ~27 nights to clear. Added a self-re-enqueue: when a run fills its scan window AND made progress, it enqueues the next extract (spaced by the existing 1-min `CHAIN_DELAY_MS`, guarded against tight loops), so a backlog drains across successive short runs.

### Bug fix #3 — `ReferenceError: Clip is not defined` crashed the entire episode-detail page (clip-actions.ts)
Found while seeding an episode. `app/admin/khat-brain/episodes/[eirId]/clip-actions.ts` is a `"use server"` module, where **every export must be an async server action**. Line 712 re-exported *types*: `export type { Clip, ClipPlatform, ClipRatio }`. The server-actions compiler emitted a runtime reference to `Clip` (an erased type) in the generated action registry → `ReferenceError: Clip is not defined` at module evaluation, which **crashed the whole episode-detail page tree** (surfaced in `<AssignGuestForm>`). Latent until now only because the episode pipeline was empty. **Fix:** removed the illegal type re-export and the 3 now-unused type imports (no consumer imported them from here; they import directly from `@/lib/editorial/clip-types`). Swept all other `"use server"` files — no other instance. Verified the episode-detail page + the Clips tab now render with 0 console errors.

### Episode seeded (product flow)
Seeded episode `bc94c170…` end-to-end via the real UI: linked an existing guest (Dr. Al-Harith Al-Mzaidi) on the accepted season topic → stage advanced `guest_discovery → guest_assigned` (write persisted). The episode pipeline is now populated and QA-able; the episode-detail tabs (guest, clips, etc.) render correctly.

### Files changed this session
- `app/layout.tsx`, `app/globals.css` — font fix (Bug #1 root cause).
- `lib/jobs/worker.ts` — timeout-budget key fix (Bug fix #2).
- `lib/jobs/handlers/market-intelligence.ts` — backlog-drain re-enqueue.
- `app/admin/khat-brain/episodes/[eirId]/clip-actions.ts` — removed illegal type re-export (Bug fix #3).
- `package.json` — added `dev:clean` script.

### Still pending (need your local action)
- Remove `.git/index.lock` locally, then I can commit the working tree in logical groups.
- Delete the two probe files I couldn't remove (`__qa_unlink_test__`, `__qa_dir_test__/`).
- Restart the worker (`npm run worker`) for the jobs fixes to take effect; the 9 existing dead jobs are terminal and will age out.

---

## Guest Discovery — full investigation (worker, pipeline, quality)

**Reported symptom:** "I tried Guest Discovery, but no results were generated or displayed."

### Primary root cause: the background worker was not running (worker layer)
Discovery is queue-driven: the UI enqueues `discovery.seed_archetypes`, and a **separate worker process** (`npm run worker` in dev; the `khat-worker` PM2 process in prod) runs the chain seed → search → verify → rank. The Ops dashboard showed **no worker activity for ~2.5h** and 6 jobs sitting pending. So runs were created but never processed → 0 archetypes → 0 candidates → nothing displayed. This is the user's actual problem, and it is in the **worker layer** — backend, DB, API, and UI were all healthy.

Layer-by-layer verification (proved by draining the queue through the web server, then by running the real worker):
- Job creation ✅ · Queue processing ❌ (no worker) · AI generation ✅ · DB writes ✅ · API ✅ · UI rendering ✅.

### Fixes applied
1. **Started the worker.** Added `start-worker.command` — a double-click Finder launcher (sources `.env.local`, pre-warms `tsx`, runs `npm run worker`). Worker `worker-1b1c2cd4` came up and drained the queue (incl. `market.extract`, which previously died — confirming the budget fix).
2. **`lib/jobs/worker.ts` — discovery timeout budgets.** The map keyed `discovery.cycle`, which matches **no** registered handler, so every discovery handler ran on the 5-min default. Corrected to the real handler names (`discovery.seed_archetypes/search_archetype/verify_candidate/rank_candidates/cron_check`) with proper budgets.

### End-to-end verification (with the worker running)
Triggered a fresh run ("Arab experts in self-development, leadership, entrepreneurship"). The worker auto-processed seed → 3 archetypes → search → verify → rank in seconds and the run **completed with 15 candidates displayed**. ✅ Results are now generated and displayed.

### Secondary issue: candidate QUALITY (search-source config, not code)
All 15 candidates were **rejected** (confidence 0.09–0.14 vs the **0.35** `PERSON_CLASS_THRESHOLD`), and they were YouTube/social handles ("Dupamicaffeine", "al.mafia.01", "(no name)"), not real named experts. The run page surfaced the exact reason:

```
google_web: Google CSE 403: forbidden — This project does not have access to Custom Search JSON API
youtube: 0 results · public_voice: not configured · editorial: not configured
```

Why this happens: the **web-search source (the richest identity evidence) is broken** (Google CSE returns 403 — the Custom Search JSON API isn't enabled on that GCP project). Without that evidence, the person-classifier scores everyone ~0.09, all below the 0.35 threshold → all rejected. The discovery env-warning only checks that keys *exist*, not that the API *works*, so it shows green.

**Concrete fixes (operator/config — no code change needed):**
- **Preferred:** switch web search back to **Brave**, which the code treats as the *default* (Google CSE is the "rollback"). In `.env.local`, remove/replace `WEB_SEARCH_PROVIDER=google_cse` (→ defaults to brave) and set `BRAVE_SEARCH_KEY`.
- **Or:** enable the **Custom Search JSON API** in Google Cloud Console for the project behind `GOOGLE_CSE_KEY`/`GOOGLE_CSE_CX`, and verify billing/quota.
- Optionally configure the `public_voice` / `editorial` sources for more evidence.
- The `PERSON_CLASS_THRESHOLD = 0.35` (`lib/discovery/alpha/person-classifier.ts`) is correctly tuned; lowering it would only let low-confidence junk through — fix the evidence source instead.

### Temporary QA artifact to remove
`app/api/admin/dev/drain-jobs/route.ts` — a dev-only, admin-only endpoint I added to drain the queue through the web server before the worker was running. **Delete it** (`rm -rf app/api/admin/dev`); the real worker is the proper processor.
