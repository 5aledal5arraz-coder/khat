# Phase C Deletion Manifest — `SAFE_TO_DELETE_PHASE_C`

> Every path in this file has been verified as removable in Phase B.
> Phase C executes deletion. **Phase B does not delete anything.**
>
> Verification rule for inclusion: route shadowed by workspace + no
> incoming sidebar / workspace / RPC link + redirect or banner already
> in place + `legacy-surface-map.md` row marked `removable`.

## Status — Wave 3 (DONE)

The entire `app/admin/khat-map` route shell has been **deleted**.
Server-side redirects in `next.config.ts` keep legacy URLs resolving:

| Legacy URL                          | Canonical destination                       |
|-------------------------------------|----------------------------------------------|
| `/admin/khat-map`                   | `/admin/khat-brain/seasons`                 |
| `/admin/khat-map/v2`                | `/admin/khat-brain/seasons/new` (official)  |
| `/admin/khat-map/v2/:seasonId`      | `/admin/khat-brain/seasons/:seasonId`       |

Official season-creation route: **`/admin/khat-brain/seasons/new`**.
Engine library `lib/khat-map/v2/*` is preserved (out of scope).

## Source files

| Path | Why safe to delete | Replacement |
|---|---|---|
| `app/admin/_legacy-home-page.tsx.bak` | Content-recovery reference from UX-1; the new home (`app/admin/page.tsx`) cherry-picked everything needed. | `app/admin/page.tsx` (redirect to `/admin/khat-brain`) |
| `app/admin/khat-brain/_legacy-minimal-page.tsx.bak` | Minimal Khat Brain dashboard preserved during UX-1 Command Center build. New Command Center has shipped + replaced its surface. | `app/admin/khat-brain/page.tsx` |
| `app/admin/khat-map/page.tsx` | **DELETED in Wave 3.** Was v1 dashboard; shadowed by `next.config.ts` redirect. | `app/admin/khat-brain/page.tsx` (Command Center) and `app/admin/khat-brain/seasons/page.tsx` (Seasons list) |
| `app/admin/khat-map/topics/page.tsx` | **DELETED in Wave 3** (whole `app/admin/khat-map` tree removed). | Topic bank lives per-season inside Season Workspace. |
| `app/admin/khat-map/guests/page.tsx` | **DELETED in Wave 3.** | `app/admin/guests/page.tsx`. |
| `app/admin/khat-map/fingerprint/page.tsx` | **DELETED in Wave 3.** | None — removed feature. |
| `app/admin/khat-map/v2/[seasonId]/page.tsx` | **DELETED in Wave 3.** Was a redirect-stub after Wave 2; redirect now lives in `next.config.ts` only. | `app/admin/khat-brain/seasons/[seasonId]/page.tsx`. |
| `app/admin/khat-map/v2/page.tsx` | **DELETED in Wave 3.** Replaced by official `app/admin/khat-brain/seasons/new/page.tsx`. | `app/admin/khat-brain/seasons/new/page.tsx`. |

## Routes (request paths to expect 404 after deletion)

After source-file deletion, these URLs will 404 unless an explicit redirect rule replaces them. The redirects in `next.config.ts` already cover the `/admin/khat-map[*]` family; verify no remaining matchers depend on the source-file paths above.

- `/admin/khat-map`
- `/admin/khat-map/topics`
- `/admin/khat-map/guests`
- `/admin/khat-map/fingerprint`
- `/admin/khat-map/v2/[seasonId]` (the matcher already redirects via next.config; deleting the source file is the cleanup)

## NOT safe to delete in Phase C

These look superficially removable but still serve traffic. Phase C must **NOT** touch them:

- `app/admin/preparation/[id]/page.tsx` — owns `PreparationInputs` editing + transcript review. Workspace covers prep_v2 only.
- `app/admin/studio/page.tsx` + `studio-client.tsx` — owns transcript / chapter / clip editing. Workspace covers high-frequency text fields only.
- `app/admin/episodes/[id]/page.tsx` — orphan rows (no `eir_id`) still depend on it. Sponsor / hidden-flag / quotes-config editors live here.
- `app/admin/recording/[roomId]/v2/page.tsx` — permanent canonical fullscreen recording surface; now also the single multi-participant live room.
- ~~`app/admin/collab/[roomId]/*` (11 view/client files)~~ — **DELETED.** Full V1→V2 parity reached on the prep_v2 model (presence/role views, director markers + team notes over live SSE, host energy, materials panel). The remaining `page.tsx` now `redirect()`s to `/admin/recording/[roomId]/v2`. Shared `lib/collaboration/*` + the rooms/cards/notes/markers API routes + `room/contexts/*` are **KEPT** (V2 builds on them).
- ~~`app/admin/khat-map/v2/page.tsx`~~ — superseded by `app/admin/khat-brain/seasons/new/page.tsx` and **deleted in Wave 3**.
- ~~`app/admin/khat-map/components/`~~ — components moved into `app/admin/khat-brain/seasons/[seasonId]/_components/` in Wave 2; the original folder was **deleted in Wave 3**.

## Scripts + artifacts (no expected deletions)

`scripts/` contains the smoke + cycle scripts that exercise the system. None of them are deletion candidates today; the legacy-surface-map's "CLI hint" entries (`prep:v2`, `cycle:khat-brain`, `jobs:schedule-youtube-performance`) refer to operator-facing CLI hints in the UI, not the scripts themselves. The scripts must stay — they back the workspace job-action buttons.

## Phase C order (suggested)

1. Delete the seven `Source files` rows above. Run the full smoke suite — every smoke case must still pass.
2. ~~Add redirect for `/admin/collab/[roomId]` → `/admin/recording/[roomId]/v2` once cohost-join flow is verified.~~ **Done** — parity built + verified live; the 11 V1 view files were deleted and `page.tsx` now `redirect()`s. The shared collaboration backend is retained.
3. Build a workspace-native "موسم جديد" dialog or `/admin/khat-brain/seasons/new` route. After it ships, redirect `/admin/khat-map/v2` to it and mark for deletion.
4. Continue workspace coverage of preparation inputs (title / guest_name / key_questions) and Studio transcript editing — those unblock removing the remaining "NOT safe to delete" entries. Out of Phase B + C scope.
