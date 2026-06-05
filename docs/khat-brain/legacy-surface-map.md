# Legacy Surface Map — Phase B Decommission Readiness

> First written in UX-5.6 (planning only). Re-issued in Phase B with
> per-route migration status + decision. Phase B still removes nothing —
> it adds soft redirects and discoverability banners. Actual deletions
> belong to Phase C and are tagged `SAFE_TO_DELETE_PHASE_C` here.

## Migration status legend

| State | Meaning |
|---|---|
| **active** | Operator-traffic destination today; workspace does NOT cover it. |
| **shadowed** | Workspace covers it; legacy route still loads, no redirect yet. |
| **deprecated** | Soft redirect routes operators away when an EIR exists; legacy route loads only via `?legacy=1` escape or for orphan rows. |
| **removable** | Workspace covers it 100%; route can be deleted without operator impact. |
| **removed** | Source files deleted. |

## Decision legend

| Decision | Meaning |
|---|---|
| **KEEP** | Permanent feature — not legacy. |
| **HIDE** | Sidebar-demoted; route stays reachable for power users. |
| **REDIRECT** | Operator URL → workspace URL with escape hatch. |
| **DELETE** | Removable in Phase C. |

---

## Per-route audit

### `/admin/preparation/[id]` — **deprecated · REDIRECT (live)**
- **Current purpose** — Full preparation editing surface: input fields, prep_v2 viewer, manual prep_v2 regeneration trigger, transcript review.
- **Replacement** — Episode Workspace → Preparation tab. UX-5.1 added inline editing for the seven highest-traffic prep_v2 fields. UX-5.4 added a workspace "إعادة توليد الإعداد" button.
- **Phase B status** — Soft redirect already in place: `if (legacy !== "1" && eir_id) redirect("/admin/khat-brain/episodes/${eirId}?tab=preparation")`. Orphan rows (no eir_id) still load the page.
- **Removable now?** — **No.** The full page still owns: `PreparationInputs` PATCH form (title / guest_name / key_questions inputs) and transcript review.
- **Hidden fallback required?** — Yes. The `?legacy=1` escape preserves access; the sidebar demotes the link under "أدوات متقدمة" (B.3 — collapsed by default).

### `/admin/studio` (list) — **shadowed → soft-banner · KEEP for now**
- **Current purpose** — Studio session list. Each row links to a session view rendered through `<StudioClient>`.
- **Replacement** — Episode Workspace → Studio tab (summary + UX-5.2 inline edits for title / hero / takeaways / quotes / timestamps).
- **Phase B status** — No redirect yet; workspace parity covers high-frequency edits only. Phase B adds a discoverability banner above `<StudioClient>`: *"كل جلسة مرتبطة بحلقة لها مساحة عمل موحّدة في Khat Brain."*
- **Removable now?** — **No.** The Studio SPA still owns: full transcript editor, chapter editor, clip generation, deep-analysis review.
- **Blocker** — Workspace-native transcript / chapter editing is multi-week work. Targets UX-7.
- **Hidden fallback required?** — Yes. Linked from `tab-studio.tsx` as "فتح صفحة الاستديو الكاملة"; sidebar entry under "أدوات متقدمة" (collapsed).

### `/admin/studio/[id]` — **does not exist**
- The current Studio SPA is list-only; per-session views render inside `<StudioClient>` via internal state, not as separate routes. No banner needed.

### `/admin/episodes` (list) — **shadowed · HIDE**
- **Current purpose** — Legacy CMS-style episode list.
- **Replacement** — `/admin/khat-brain/episodes` (UX-3a unified workspace index).
- **Phase B status** — Already hidden from sidebar by default (gated behind `NEXT_PUBLIC_KHAT_LEGACY_EPISODES_VISIBLE`). Sidebar entry moves under "أدوات متقدمة" with neutral label "الحلقات".
- **Removable now?** — **Yes for the route**, since the workspace index is the replacement. Defer to Phase C; flag-gated entry stays as an emergency reveal.

### `/admin/episodes/[id]` — **deprecated · REDIRECT (Phase B)**
- **Current purpose** — Per-episode admin editor: episode override, hidden flag, guest assignment, quotes config, YouTube pack, enrichment, partner sponsor, episode sponsor brand-line.
- **Replacement** — Episode Workspace → Publish tab (push action + summary) and the rest of the workspace tabs.
- **Phase B status** — **NEW** soft redirect: when `episodes.eir_id IS NOT NULL` and `?legacy=1` is not set, redirects to `/admin/khat-brain/episodes/${eirId}?tab=publish`. Orphan episodes (no eir_id) still load the legacy page.
- **Removable now?** — **No.** The detail page still owns: hidden-flag toggle, sponsor selection UI, quotes config UI, YouTube pack config, partner brand-line edit. Targets a future workspace-native sponsor / quotes-config block.
- **Hidden fallback required?** — Yes. Reachable via `?legacy=1` and via the workspace's "فتح صفحة الحلقة" link (UX-3b).

### `/admin/recording/[roomId]/v2` — **active · KEEP**
- **Current purpose** — Fullscreen Recording V2 surface: timer, flow tracker, markers, chapter cues. Designed for second-monitor / share-screen recording.
- **Replacement** — Embedded inside Episode Workspace → Recording tab.
- **Phase B status** — Permanent feature, not legacy. UX-5 surfaces this URL via `RecordingShareStrip` for share-with-cohost flows.
- **Removable now?** — N/A. This is the canonical fullscreen surface.

### `/admin/collab/[roomId]` — **shadowed · REDIRECT (Phase C)**
- **Current purpose** — Original room surface (pre-V2). Banner inside it points at `/admin/recording/[roomId]/v2`.
- **Replacement** — Episode Workspace → Recording tab + the V2 fullscreen URL.
- **Phase B status** — Still loads. Phase B does not redirect: workspace parity for the cohost-join flow needs verification on real participant traffic before flipping the redirect.
- **Removable now?** — Phase C: replace with 308 to `/admin/recording/${roomId}/v2`. Mark `SAFE_TO_DELETE_PHASE_C` once the V2 cohost path has worn its training wheels.

### `/admin/khat-map/v2` (new-season form) — **DELETED in Wave 3**
- **Replacement (now official)** — `/admin/khat-brain/seasons/new` mounts the moved `SetupClient` + `EditorialControlsForm`.
- **Wave 3 status** — Source files deleted. `next.config.ts` 307-redirects `/admin/khat-map/v2` → `/admin/khat-brain/seasons/new`.

### `/admin/khat-map/v2/[seasonId]` — **DELETED in Wave 3**
- **Replacement** — `/admin/khat-brain/seasons/[seasonId]` (UX-2 / Wave 2).
- **Wave 3 status** — Source files deleted. `next.config.ts` redirects `/admin/khat-map/v2/:seasonId` → `/admin/khat-brain/seasons/:seasonId`.

### `/admin/khat-map` (v1 dashboard) — **DELETED in Wave 3**
- **Replacement** — Command Center (`/admin/khat-brain`) + Season Workspace.
- **Wave 3 status** — Source files deleted. `next.config.ts` redirects `/admin/khat-map` → `/admin/khat-brain/seasons`.

### `/admin/khat-map/topics`, `/admin/khat-map/guests`, `/admin/khat-map/fingerprint` — **DELETED in Wave 3**
- **Replacement** — Topic bank lives per-season inside the Season Workspace; guest bank is `/admin/guests`; fingerprint matrix is unused in v2.
- **Wave 3 status** — Source files deleted alongside the rest of `app/admin/khat-map/*`.

### `.bak` files — **removable · DELETE (Phase C)**
- `app/admin/_legacy-home-page.tsx.bak` (UX-1 redirect content recovery reference).
- `app/admin/khat-brain/_legacy-minimal-page.tsx.bak` (UX-1 Command Center content reference).
- **Removable now?** — **Yes, both.** UX-1 already cherry-picked everything the new home needed.

---

## Phase B summary

| Action | Routes |
|---|---|
| **REDIRECT (live this phase)** | `/admin/episodes/[id]` — when `eir_id` resolves and `?legacy=1` not set. |
| **REDIRECT (already live)** | `/admin/preparation/[id]` (UX-3a). |
| **BANNER** | `/admin/studio` — discoverability strip pointing into Khat Brain. |
| **HIDE / RENAME** | Sidebar "أدوات متقدمة" group: collapsed by default; neutral labels (الإعداد / الاستديو / المرشحون / الحلقات). |
| **TAG** | All `removable` rows above carry `SAFE_TO_DELETE_PHASE_C`. |
| **NO CHANGE** | `/admin/recording/[roomId]/v2` (KEEP), `/admin/collab/[roomId]` (workspace parity not yet proven), `/admin/studio/[id]` (does not exist). |

## Phase C order of operations (suggested)

1. ~~Delete the `removable` set (`khat-map` v1 + topics/guests/fingerprint, khat-map/v2/[seasonId] source, both `.bak` files).~~ **Done in Wave 3** — entire `app/admin/khat-map` tree deleted; redirects remain in `next.config.ts`.
2. ~~Build a workspace-native season-create dialog and redirect `/admin/khat-map/v2` to it.~~ **Done in Wave 2/3** — official route is `app/admin/khat-brain/seasons/new`.
3. Redirect `/admin/collab/[roomId]` → `/admin/recording/[roomId]/v2` once cohost flow is exercised on real traffic.
4. Continue workspace coverage of preparation inputs (title / guest_name / key_questions) and Studio transcript editing — those unblock removing `/admin/preparation/[id]` and the Studio SPA respectively. Out of Wave 3 scope.

## What this document is NOT

- It is not a delete list for Phase B. UX-5 ended without removing routes; Phase B adds redirects and tags but still removes nothing.
- It is not authoritative for which routes external bookmarks reference. Confirm via web logs before Phase C's first deletion lands.
- It is not a schema audit. Tables backing each route remain authoritative; this maps URLs only.
