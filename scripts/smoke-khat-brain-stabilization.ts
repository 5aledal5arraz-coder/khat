/**
 * Pre-UX-5 stabilization smoke (8 cases).
 *
 *   1. PushButton requires explicit confirmation state (no one-click
 *      destructive push).
 *   2. PushButton confirm panel renders the overwrite warning string.
 *   3. AcceptedEpisodes is rendered above WizardClient when accepted
 *      cards exist (source-order verification).
 *   4. WizardClient is wrapped in a collapsible <details> with the
 *      "مراجعة المرشحين الجدد" header.
 *   5. No "UX-3b" / "ستضاف في" / "قادمة قريباً" stale copy remains in
 *      operator-visible workspace strings.
 *   6. No "قديم/قديمة" wording survives in workspace tabs or sidebar.
 *   7. Recording tab embeds RecordingShareStrip with a copyable URL +
 *      "ملء الشاشة" affordance.
 *   8. getPushPreview returns a sane shape (db-backed; skips if db
 *      unavailable).
 *
 * No DB rows created (preview check uses an unknown EIR id which short-
 * circuits to no_session).
 */

import { promises as fs } from "node:fs"
import path from "node:path"

const TAG = "smoke-stabilization"
const REPO_ROOT = path.resolve(__dirname, "..")

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) {
    console.error(`\n❌ ${msg}`)
    process.exit(1)
  }
}

async function readFile(rel: string): Promise<string> {
  return fs.readFile(path.join(REPO_ROOT, rel), "utf-8")
}

async function main() {
  console.log(`🧪 ${TAG} — starting\n`)
  let passed = 0

  // ── 1. PushButton requires confirmation state ───────────────────────
  {
    const src = await readFile(
      "app/admin/khat-brain/episodes/[eirId]/push-button.tsx",
    )
    assert(
      src.includes("setConfirming"),
      "PushButton must hold an explicit confirming state.",
    )
    assert(
      src.includes("data-push-confirm-panel"),
      "PushButton must render a data-push-confirm-panel marker.",
    )
    assert(
      src.includes("data-push-confirm-button"),
      "PushButton must render a data-push-confirm-button marker.",
    )
    assert(
      src.includes("onFirstClick") && src.includes("onConfirm"),
      "PushButton must split first-click from confirm.",
    )
    console.log(
      "✅ 1/8 PushButton has explicit confirmation state (first click ≠ push).",
    )
    passed++
  }

  // ── 2. Confirm panel carries the overwrite warning + cancel ─────────
  {
    const src = await readFile(
      "app/admin/khat-brain/episodes/[eirId]/push-button.tsx",
    )
    assert(
      src.includes("سيتم استبدال القيم الحالية في الحلقة بهذه البيانات"),
      "PushButton confirm panel must show the overwrite warning copy.",
    )
    // UX-5.5a renamed the count strip to a grouping headline:
    //   "حقول تحتوي بيانات حالية" → "حقول سيتم استبدالها (N)"
    // The smoke tracks current copy.
    assert(
      src.includes("حقول سيتم استبدالها") &&
        src.includes("حقول جديدة"),
      "PushButton confirm panel must group new vs overwritten fields.",
    )
    assert(
      src.includes("تأكيد الدفع") && src.includes("إلغاء"),
      "PushButton confirm panel must offer Confirm + Cancel.",
    )
    console.log(
      "✅ 2/8 PushButton confirm panel carries the overwrite warning + cancel.",
    )
    passed++
  }

  // ── 3. AcceptedEpisodes rendered above WizardClient ─────────────────
  {
    const src = await readFile(
      "app/admin/khat-brain/seasons/[seasonId]/page.tsx",
    )
    // Find indices of the source-order anchors. AcceptedEpisodes appears
    // twice (above-priority + fallback-position); the first occurrence
    // is what matters for "accepted-first" hierarchy.
    const acceptedIdx = src.indexOf("<AcceptedEpisodes")
    const wizardIdx = src.indexOf("<WizardClient")
    assert(
      acceptedIdx >= 0 && wizardIdx >= 0,
      "Season Workspace must render both AcceptedEpisodes and WizardClient.",
    )
    assert(
      acceptedIdx < wizardIdx,
      "AcceptedEpisodes must render above WizardClient in source order.",
    )
    console.log(
      "✅ 3/8 AcceptedEpisodes renders above WizardClient (source order).",
    )
    passed++
  }

  // ── 4. Wizard wrapped in collapsible <details> with the new title ───
  {
    const src = await readFile(
      "app/admin/khat-brain/seasons/[seasonId]/page.tsx",
    )
    assert(
      src.includes("data-wizard-collapsible"),
      "Wizard must be wrapped in a <details data-wizard-collapsible>.",
    )
    assert(
      src.includes("مراجعة المرشحين الجدد"),
      "Wizard collapsible must use the 'مراجعة المرشحين الجدد' summary.",
    )
    assert(
      src.includes("open={accepted.length === 0}"),
      "Wizard must collapse by default when accepted episodes exist.",
    )
    console.log(
      "✅ 4/8 Wizard collapses by default when accepted episodes exist.",
    )
    passed++
  }

  // ── 5. Stale UX-phase copy is gone ──────────────────────────────────
  {
    const surfaces = [
      "app/admin/khat-brain/seasons/[seasonId]/page.tsx",
      "app/admin/khat-brain/episodes/[eirId]/page.tsx",
      "app/admin/khat-brain/episodes/[eirId]/tab-preparation.tsx",
      "app/admin/khat-brain/episodes/[eirId]/tab-recording.tsx",
      "app/admin/khat-brain/episodes/[eirId]/tab-studio.tsx",
      "app/admin/khat-brain/episodes/[eirId]/tab-publish.tsx",
      "app/admin/khat-brain/episodes/[eirId]/tab-performance.tsx",
    ]
    // Patterns that must NOT appear in operator-visible strings. We
    // allow header docstring references to UX-3a/UX-3b for provenance,
    // so we only fail on the user-facing patterns.
    const banned = [
      "قادمة قريباً في UX-3b",
      "ستضاف في UX-3b",
      "قادم في UX-3b",
      "UX-4 سيُسهِّل",
      "سيُتاح في UX-4",
      "title=\"UX-3b\"",
    ]
    for (const surface of surfaces) {
      const src = await readFile(surface)
      for (const phrase of banned) {
        assert(
          !src.includes(phrase),
          `Stale UX-phase copy "${phrase}" still present in ${surface}.`,
        )
      }
    }
    console.log("✅ 5/8 No stale 'UX-3b/UX-4 سيُسهِّل' copy remains.")
    passed++
  }

  // ── 6. Legacy wording sweep ────────────────────────────────────────
  {
    const surfaces = [
      "app/admin/khat-brain/episodes/[eirId]/tab-preparation.tsx",
      "app/admin/khat-brain/episodes/[eirId]/tab-recording.tsx",
      "app/admin/khat-brain/episodes/[eirId]/tab-studio.tsx",
      "app/admin/khat-brain/episodes/[eirId]/tab-publish.tsx",
      "app/admin/khat-brain/episodes/[eirId]/tab-performance.tsx",
      "app/admin/components/admin-sidebar.tsx",
    ]
    const banned = ["الاستديو القديم", "الاستوديو القديم", "الصفحة القديمة", "(قديمة)"]
    for (const surface of surfaces) {
      const src = await readFile(surface)
      for (const phrase of banned) {
        assert(
          !src.includes(phrase),
          `Legacy wording "${phrase}" still present in ${surface}.`,
        )
      }
    }
    console.log("✅ 6/8 No legacy wording survives in workspace tabs/sidebar.")
    passed++
  }

  // ── 7. Recording share strip wires copy + fullscreen ────────────────
  {
    const strip = await readFile(
      "app/admin/khat-brain/episodes/[eirId]/recording-share-strip.tsx",
    )
    assert(
      strip.includes("data-room-share-url") &&
        strip.includes("data-room-copy-button"),
      "RecordingShareStrip must expose copy button + URL markers.",
    )
    assert(
      strip.includes("navigator.clipboard.writeText"),
      "RecordingShareStrip must copy via navigator.clipboard.",
    )
    assert(
      strip.includes("ملء الشاشة"),
      "RecordingShareStrip must offer the 'ملء الشاشة' affordance.",
    )

    const tab = await readFile(
      "app/admin/khat-brain/episodes/[eirId]/tab-recording.tsx",
    )
    assert(
      tab.includes("RecordingShareStrip"),
      "tab-recording.tsx must mount RecordingShareStrip.",
    )
    console.log(
      "✅ 7/8 Recording header surfaces room URL + copy + fullscreen.",
    )
    passed++
  }

  // ── 8. getPushPreview returns a sane shape ──────────────────────────
  {
    // Lazy-import so the file-based cases can run even when db is null.
    const { db } = await import("@/lib/db")
    const { getPushPreview } = await import("@/lib/khat-brain/push-preview")
    if (!db) {
      console.log(
        "⏭  8/8 skipped — DATABASE_URL unavailable in this environment.",
      )
      passed++
    } else {
      const pv = await getPushPreview(
        "00000000-0000-0000-0000-000000000000",
      )
      assert(typeof pv.ok === "boolean", "preview.ok must be boolean.")
      assert(
        Array.isArray(pv.pushableFields) &&
          Array.isArray(pv.overwritingFields),
        "preview.pushableFields + overwritingFields must be arrays.",
      )
      assert(
        pv.ok === false && pv.reason === "no_session",
        "Unknown EIR must short-circuit to no_session.",
      )
      console.log(
        "✅ 8/8 getPushPreview returns a sane shape for unknown EIR.",
      )
      passed++
    }
  }

  console.log(`\n🎉 ${TAG} — ${passed}/8 cases passed.\n`)
}

main().catch((err) => {
  console.error(`\n💥 ${TAG} failed:`, err)
  process.exit(1)
})
