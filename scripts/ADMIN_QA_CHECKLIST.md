# Admin Page QA Checklist

A reusable QA checklist for auditing any admin page in the Khat Podcast Admin Panel.

Run this checklist whenever you ship a new admin feature, or use the automated script to catch the static issues:

```bash
node scripts/qa-admin-page.mjs <page-name>
# examples:
node scripts/qa-admin-page.mjs guests
node scripts/qa-admin-page.mjs episodes
node scripts/qa-admin-page.mjs all            # audit every admin page
```

The script reports ERRORS (must fix) and WARNINGS (should review) and exits non-zero on errors. Anything not automatable is listed in the manual sections below.

---

## Scope of a full audit

For a single admin page (e.g. `guests`) the audit covers:

- `app/admin/<page>/**` — UI components, server actions (`actions.ts`)
- `app/api/admin/<page>/**` — API routes
- Shared domain logic in `lib/` that is exclusive to this page

Cross-page libraries (e.g. `lib/api-utils.ts`, shared UI primitives) are out of scope for a per-page audit — they should be covered by their own checks.

---

## 1. Automated static checks

These are run by `scripts/qa-admin-page.mjs`. You do not need to check them by hand.

### 1.1 Auth & authorization
- Every handler in `app/api/admin/<page>/**/route.ts` calls `requireAdminAPI()` before reading the request body.
- Every exported function in `app/admin/<page>/**/actions.ts` that mutates state calls `requireAdmin()`.
- No handler bypasses auth with an early `return` before `requireAdminAPI()`.

### 1.2 Silent failures
- No empty `catch {}` or `catch { /* ignore */ }` blocks in client components.
- Every `await fetch(...)` is followed (in the same function body) by a `res.ok` check OR a `response.ok` check OR an explicit `throw`.
- No `.then(...)` without a paired `.catch(...)`.
- No mutation action that returns `void` where errors cannot be surfaced — prefer `Promise<{ success: boolean; error?: string }>`.

### 1.3 UX anti-patterns
- No `alert(` calls in client components — use in-app toast/error state.
- No `confirm(` calls — use a proper confirmation dialog.
- No `window.location.reload()` — use `router.refresh()` from `next/navigation`.
- No `window.location.href = ...` for in-app navigation — use `router.push(...)`.

### 1.4 Next.js 16 patterns
- Dynamic params are always awaited: `const { id } = await params` (not `await params // consume`).
- Server actions are in files with `"use server"` at the top.
- Client components are in files with `"use client"` at the top.

### 1.5 Data persistence
- Every mutating API route / server action calls at least one of:
  - `revalidatePath(...)` for relevant public and admin routes
  - `invalidate(...)` for the app cache layer
  - `invalidateEpisodeCache()` where applicable
- No raw SQL concatenation with user input (use Drizzle or parameterized queries).

### 1.6 Type safety
- No `any` type annotations in new code (warning).
- No `@ts-ignore` / `@ts-expect-error` comments (warning — must justify).

### 1.7 Hygiene
- No `console.log` in admin code (warning) — use `console.info` / `console.error` deliberately.
- No `TODO` / `FIXME` without a tracking reference (warning).
- No `.env` keys hardcoded in files.

---

## 2. Manual functional tests

The script cannot verify behavior — a human must walk through each flow against a real dev server. For every admin page, run through each applicable section.

### 2.1 Listing / read path
- [ ] Page loads without errors for an admin user.
- [ ] Empty state renders correctly when there are 0 items.
- [ ] Search / filter (if present) narrows results correctly.
- [ ] Pagination / infinite scroll (if present) loads next page without duplicates.
- [ ] Arabic text + RTL layout render correctly.

### 2.2 Create flow
- [ ] "Add" button opens the form.
- [ ] Required fields are enforced client-side (submit disabled when invalid).
- [ ] Submit with valid data:
  - [ ] Persists to DB (verify with `psql` or Drizzle Studio)
  - [ ] Returns success response
  - [ ] Closes the dialog
  - [ ] New item appears in the list immediately
  - [ ] Success toast is shown
- [ ] Submit with invalid data shows an inline error without closing the dialog.
- [ ] Network failure shows a retryable error message.
- [ ] Double-click on submit does not create duplicate rows (button disabled during request).

### 2.3 Edit flow
- [ ] Clicking edit pre-populates the form with current values.
- [ ] Cancel discards changes without saving.
- [ ] Save:
  - [ ] Persists to DB
  - [ ] Updates the item in the list immediately
  - [ ] Success toast is shown
  - [ ] Public-facing page reflects the change (verify by opening in another tab)
- [ ] Partial updates do not clobber unrelated fields.
- [ ] Editing while another user edits the same row does not silently overwrite.

### 2.4 Delete flow
- [ ] Delete action shows a confirmation dialog (never a browser `confirm()`).
- [ ] Confirmation lists what will be affected (e.g. cascade targets).
- [ ] Cancel closes the dialog without deleting.
- [ ] Confirm:
  - [ ] Removes the row from DB
  - [ ] Cascades or sets-null on related rows per schema
  - [ ] Removes the row from the list immediately
  - [ ] Success toast is shown
- [ ] Deleting the currently-edited item closes the edit dialog.

### 2.5 Media upload (if applicable)
- [ ] Only allowed file types are accepted.
- [ ] File size limit is enforced client- and server-side.
- [ ] Upload progress is visible.
- [ ] On success:
  - [ ] File is stored (filesystem / object storage)
  - [ ] DB path is updated
  - [ ] UI shows the new asset without manual refresh
- [ ] Replacing an asset cleans up the previous file (or schedules cleanup).
- [ ] Upload failure shows a clear error and leaves the previous asset intact.

### 2.6 Relationships (if applicable)
- [ ] Linking a related entity updates both sides of the relationship.
- [ ] Unlinking removes the relationship without deleting either entity.
- [ ] Counts / badges that show relationship cardinality update in real time.
- [ ] Deleting one side of a relationship handles orphans per schema (`ON DELETE SET NULL` / `CASCADE`).

### 2.7 Auth & authorization
- [ ] Opening the page without a session redirects to `/admin/login`.
- [ ] VIEWER role cannot perform mutations (buttons hidden or disabled).
- [ ] EDITOR role can perform its allowed mutations.
- [ ] Admin audit log records the action (if audit is enabled for this page).

### 2.8 Data consistency
- [ ] After every mutation, the public site reflects the change (check a relevant public page).
- [ ] Cache layers (`lib/cache`, Next.js route cache) are invalidated.
- [ ] Refreshing the admin page keeps the displayed state — no ghost data.
- [ ] Data displayed in the admin panel matches what `psql` reports.

---

## 3. Edge cases

### 3.1 Empty / null / missing
- [ ] Empty string inputs are treated as `null` server-side.
- [ ] Optional fields default to sensible values.
- [ ] Missing avatar / image shows a placeholder, not a broken icon.

### 3.2 Large / long data
- [ ] Very long strings (names, bios) are enforced to sensible max length.
- [ ] Long lists scroll within the container without breaking the layout.
- [ ] Large image uploads are rejected with a clear message.

### 3.3 Special characters
- [ ] Arabic characters with diacritics (`ً`, `ٌ`, `ٍ`) are preserved.
- [ ] URLs with query strings, fragments, and special chars are stored intact.
- [ ] HTML / script tags in input are sanitized (no XSS on render).

### 3.4 Concurrency
- [ ] Two simultaneous submissions for the same row don't both succeed silently.
- [ ] Optimistic UI updates are rolled back if the server rejects the request.

### 3.5 Network
- [ ] Slow network shows loading states.
- [ ] Offline submissions show a clear error and can be retried.

---

## 4. Report template

When finishing an audit, fill out this template and commit it with the feature (or paste it into the PR):

```markdown
## QA Audit Report — <page-name>

Date: YYYY-MM-DD
Audited by: <name>

### Automated checks
Ran `node scripts/qa-admin-page.mjs <page-name>`:
- Errors: X
- Warnings: Y

### Manual tests
- [ ] Listing / read path
- [ ] Create flow
- [ ] Edit flow
- [ ] Delete flow
- [ ] Media upload (if applicable)
- [ ] Relationships (if applicable)
- [ ] Auth & authorization
- [ ] Data consistency

### Issues found
1. <severity> — <description> — <file:line> — <status: fixed / deferred>
2. ...

### Fixes applied
- <file> — <what changed>
- ...

### Deferred / follow-ups
- <item> — <reason> — <tracking link>

### Suggestions
- <ux / performance / structure improvement>
```

---

## 5. When to run the audit

- Before merging any PR that touches `app/admin/**` or `app/api/admin/**`.
- After refactors that touch shared admin infrastructure (`lib/api-utils.ts`, `lib/admin/**`).
- When bringing up a new admin page.
- As a periodic sweep — run `node scripts/qa-admin-page.mjs all` monthly.
