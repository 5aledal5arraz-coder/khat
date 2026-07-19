"use server"

/**
 * UX-5.2 — Workspace-native quick edit for the website package.
 *
 * High-frequency operator edits (title / hero / takeaways / quote text /
 * timestamp titles) used to require a trip to the /admin/studio page. Now
 * they go through `updateWebsitePackage()` directly, with
 * revalidatePath so the workspace tab re-renders.
 *
 * The action delegates to the same persistence helper the legacy
 * Studio API route uses — single source of truth.
 */

import { revalidatePath } from "next/cache"
import { eq, desc } from "drizzle-orm"
import { db } from "@/lib/db"
import { studioSessions } from "@/lib/db/schema/studio"
import { requireAdmin } from "@/lib/api-utils"
import {
  getWebsitePackageForSession,
  updateWebsitePackage,
} from "@/lib/studio/website-packages"
import type {
  StudioWebsitePackage,
  WebsiteQuoteItem,
  WebsiteTimestampItem,
} from "@/types/database"

export type StudioQuickEditField =
  | "custom_title"
  | "hero_summary"
  | "takeaways"
  | "quotes"
  | "timestamps"

export interface StudioQuickEditInput {
  eirId: string
  field: StudioQuickEditField
  value: string
}

export interface StudioQuickEditResult {
  ok: boolean
  message: string
}

export async function updateStudioFieldAction(
  input: StudioQuickEditInput,
): Promise<StudioQuickEditResult> {
  await requireAdmin()
  if (!db) return { ok: false, message: "قاعدة البيانات غير متوفرة." }

  const [session] = await db
    .select({ id: studioSessions.id })
    .from(studioSessions)
    .where(eq(studioSessions.eir_id, input.eirId))
    .orderBy(desc(studioSessions.updated_at))
    .limit(1)
  if (!session) {
    return {
      ok: false,
      message: "لا توجد جلسة استديو لهذه الحلقة.",
    }
  }

  const pkg = await getWebsitePackageForSession(session.id)
  if (!pkg) {
    return {
      ok: false,
      message: "لا توجد حزمة موقع للتعديل عليها.",
    }
  }

  const updates: Partial<StudioWebsitePackage> = {}
  switch (input.field) {
    case "custom_title":
      updates.custom_title = input.value.trim() || null
      break
    case "hero_summary":
      updates.hero_summary = input.value.trim() || null
      break
    case "takeaways":
      updates.takeaways = parseLines(input.value)
      break
    case "quotes":
      updates.quotes = parseQuotes(input.value, pkg.quotes ?? [])
      break
    case "timestamps":
      updates.timestamps = parseTimestamps(
        input.value,
        pkg.timestamps ?? [],
      )
      break
    default:
      return { ok: false, message: "حقل غير مدعوم." }
  }

  const r = await updateWebsitePackage(pkg.id, updates)
  if (!r.success) {
    return { ok: false, message: r.error || "تعذّر حفظ التعديل." }
  }
  revalidatePath(`/admin/khat-brain/episodes/${input.eirId}`)
  return { ok: true, message: "تم حفظ التعديل." }
}

// ─── Parsers ─────────────────────────────────────────────────────────

function parseLines(value: string): string[] {
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
}

/**
 * Quote editing is text-only. We preserve `theme` + `speaker` from the
 * existing package by index when the line count is stable; new lines
 * fall back to null metadata which the operator can fill in via the
 * full Studio page if they care.
 */
function parseQuotes(
  value: string,
  existing: WebsiteQuoteItem[],
): WebsiteQuoteItem[] {
  const lines = parseLines(value)
  return lines.map((text, i) => {
    const carry = existing[i]
    return {
      text,
      theme: carry?.theme ?? null,
      speaker: carry?.speaker ?? null,
    }
  })
}

/**
 * Timestamps are edited line-by-line as `mm:ss — title`. We preserve
 * `description` by index. If the operator omits the time prefix we
 * keep the existing time when index aligns; new lines without a time
 * default to 0 (operator will see 00:00 and fix it on the full page).
 */
function parseTimestamps(
  value: string,
  existing: WebsiteTimestampItem[],
): WebsiteTimestampItem[] {
  const lines = parseLines(value)
  return lines.map((line, i) => {
    const carry = existing[i]
    const m = line.match(/^(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?\s*[—–-]\s*(.*)$/)
    if (m) {
      const h = m[3] ? parseInt(m[1], 10) : 0
      const mm = parseInt(m[3] ? m[2] : m[1], 10)
      const ss = parseInt(m[3] ?? m[2], 10)
      return {
        time_seconds: h * 3600 + mm * 60 + ss,
        title: m[4].trim(),
        description: carry?.description ?? null,
      }
    }
    return {
      time_seconds: carry?.time_seconds ?? 0,
      title: line,
      description: carry?.description ?? null,
    }
  })
}
