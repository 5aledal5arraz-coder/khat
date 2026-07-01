/**
 * System diagnostics for the admin Settings hub.
 *
 * Live, server-computed health probes — not the static "connected/not connected"
 * cards the old settings page hardcoded. Each probe is cheap and fail-safe.
 *
 *   • database — real `SELECT 1` round-trip.
 *   • worker   — most recent `jobs` activity (the worker stamps updated_at on
 *                claim/complete); reported as a relative age so an operator can
 *                tell whether `npm run worker` is alive and chewing through work.
 *   • integrations — presence of the env keys each integration needs.
 */

import { env } from "@/lib/env"
import { sql } from "drizzle-orm"
import { db } from "@/lib/db"
import { humanizeAge } from "@/lib/ops/format"

export type ProbeStatus = "ok" | "warn" | "down"

export interface Diagnostic {
  key: string
  label: string
  status: ProbeStatus
  detail: string
}

const WORKER_FRESH_MS = 10 * 60 * 1000

export async function getDiagnostics(): Promise<Diagnostic[]> {
  const out: Diagnostic[] = []

  // ── Database: real probe ──────────────────────────────────────────────────
  let dbOk = false
  if (db) {
    try {
      await db.execute(sql`SELECT 1`)
      dbOk = true
    } catch {
      dbOk = false
    }
  }
  out.push({
    key: "database",
    label: "قاعدة البيانات",
    status: dbOk ? "ok" : "down",
    detail: dbOk ? "متصلة وتعمل" : "تعذّر الاتصال بقاعدة البيانات",
  })

  // ── Worker heartbeat (last jobs activity) ─────────────────────────────────
  if (db) {
    try {
      const res = (await db.execute(
        sql`SELECT MAX(updated_at) AS t FROM jobs`,
      )) as unknown as { rows: Array<{ t: string | Date | null }> }
      const raw = res.rows[0]?.t
      if (raw) {
        const last = new Date(raw)
        const ageMs = Date.now() - last.getTime()
        out.push({
          key: "worker",
          label: "عامل المهام",
          status: ageMs <= WORKER_FRESH_MS ? "ok" : "warn",
          detail:
            ageMs <= WORKER_FRESH_MS
              ? `نشط — آخر مهمة ${humanizeAge(ageMs)}`
              : `لا نشاط حديث — آخر مهمة ${humanizeAge(ageMs)}`,
        })
      } else {
        out.push({
          key: "worker",
          label: "عامل المهام",
          status: "warn",
          detail: "لا توجد مهام بعد",
        })
      }
    } catch {
      out.push({ key: "worker", label: "عامل المهام", status: "warn", detail: "تعذّر القراءة" })
    }
  } else {
    out.push({ key: "worker", label: "عامل المهام", status: "down", detail: "قاعدة البيانات غير متاحة" })
  }

  // ── Integration keys (presence only — never expose the values) ────────────
  const keyProbe = (
    key: string,
    label: string,
    present: boolean,
    onMissing: string,
  ): Diagnostic => ({
    key,
    label,
    status: present ? "ok" : "warn",
    detail: present ? "المفتاح مضبوط" : onMissing,
  })

  out.push(
    keyProbe("youtube", "YouTube API", !!env.YOUTUBE_API_KEY, "أضف YOUTUBE_API_KEY لجلب الحلقات"),
    keyProbe(
      "openai",
      "OpenAI",
      !!env.OPENAI_API_KEY,
      "أضف OPENAI_API_KEY لتشغيل الذكاء الاصطناعي",
    ),
    keyProbe(
      "gemini",
      "Gemini",
      !!(env.GEMINI_API_KEY || env.GOOGLE_API_KEY),
      "اختياري — أضف GEMINI_API_KEY لتفعيل مزوّد Gemini",
    ),
    keyProbe(
      "email",
      "البريد (Resend)",
      !!env.RESEND_API_KEY,
      "أضف RESEND_API_KEY لإرسال الإشعارات والنشرة",
    ),
  )

  return out
}
