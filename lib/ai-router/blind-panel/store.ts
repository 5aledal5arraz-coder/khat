/**
 * Blind judgment panel — persistence and the blinding boundary.
 *
 * Storage is a single `config_store` row (`ai_blind_panel`), the same
 * mechanism as `ai_model_overrides` and `ai_benchmark_thresholds`. No new
 * table and no migration: this is one operator-facing session at a time, and
 * a migration for a local-only instrument would cost more than it carries.
 *
 * ── The blinding is enforced HERE, not in the UI ────────────────────────────
 * `toPublicView()` is the only way pairs reach a page, and it strips the
 * source labels until the session is revealed. That placement is the whole
 * point. If the server sent `{ source: "candidate" }` and the component
 * merely declined to render it, the labels would still be sitting in the
 * page payload and in React DevTools — and a blind test you can un-blind by
 * opening the inspector is not a blind test. Nobody has to remember to hide
 * anything; the data is not there to leak.
 *
 * Reveal is one-way per session: once `revealed_at` is set, the verdicts are
 * already recorded and cannot be edited (see `recordVerdict`).
 */

import { eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { configStore } from "@/lib/db/schema/system"
import { PANEL_PAIR_COUNT } from "./stats"
import type {
  BlindPanelPair,
  BlindPanelSession,
  BlindPanelView,
  PanelSource,
  PanelVerdict,
} from "./types"

export type {
  BlindPanelPair,
  BlindPanelSession,
  BlindPanelPairView,
  BlindPanelView,
} from "./types"

export const BLIND_PANEL_KEY = "ai_blind_panel"

/** Bumped when the stored shape changes; an older row is ignored, not migrated. */
export const BLIND_PANEL_VERSION = 1

export function toPublicView(session: BlindPanelSession): BlindPanelView {
  const revealed = session.revealedAt !== null
  return {
    id: session.id,
    createdAt: session.createdAt,
    revealed,
    revealedAt: session.revealedAt,
    ...(revealed
      ? {
          currentModel: session.currentModel,
          candidateModel: session.candidateModel,
          judgeModel: session.judgeModel,
          promptVersion: session.promptVersion,
        }
      : {}),
    pairs: session.pairs.map((p) => ({
      index: p.index,
      episodeTitle: p.episodeTitle,
      section: p.section,
      aText: p.aText,
      bText: p.bText,
      verdict: session.verdicts[String(p.index)] ?? null,
      // Sources and the judge's opinion are BOTH withheld while blind. The
      // judge's verdict is withheld for the same reason as the labels: seeing
      // it before choosing would anchor the human onto the model, and the
      // agreement number would then measure suggestibility, not agreement.
      ...(revealed
        ? { aSource: p.aSource, bSource: p.bSource, judgeVerdict: p.judgeVerdict }
        : {}),
    })),
  }
}

// ─── Read / write ────────────────────────────────────────────────────────────

function isVerdict(v: unknown): v is PanelVerdict {
  return v === "a" || v === "b" || v === "tie"
}

function isSource(v: unknown): v is PanelSource {
  return v === "current" || v === "candidate"
}

/** Parse a stored row defensively — a malformed blob reads as "no session". */
export function parseSession(raw: unknown): BlindPanelSession | null {
  if (!raw || typeof raw !== "object") return null
  const o = raw as Record<string, unknown>
  if (o.version !== BLIND_PANEL_VERSION) return null
  if (!Array.isArray(o.pairs) || o.pairs.length === 0) return null

  const pairs: BlindPanelPair[] = []
  for (const p of o.pairs) {
    if (!p || typeof p !== "object") return null
    const q = p as Record<string, unknown>
    if (
      typeof q.index !== "number" ||
      typeof q.aText !== "string" ||
      typeof q.bText !== "string" ||
      !isSource(q.aSource) ||
      !isSource(q.bSource)
    ) {
      return null
    }
    pairs.push({
      index: q.index,
      episodeId: typeof q.episodeId === "string" ? q.episodeId : "",
      episodeTitle: typeof q.episodeTitle === "string" ? q.episodeTitle : "",
      section: q.section === "description" ? "description" : "titles",
      aText: q.aText,
      aSource: q.aSource,
      bText: q.bText,
      bSource: q.bSource,
      judgeVerdict: isVerdict(q.judgeVerdict) ? q.judgeVerdict : null,
    })
  }

  const verdicts: Record<string, PanelVerdict> = {}
  const rawVerdicts = o.verdicts
  if (rawVerdicts && typeof rawVerdicts === "object") {
    for (const [k, v] of Object.entries(rawVerdicts as Record<string, unknown>)) {
      if (isVerdict(v)) verdicts[k] = v
    }
  }

  return {
    version: BLIND_PANEL_VERSION,
    id: typeof o.id === "string" ? o.id : "unknown",
    createdAt: typeof o.createdAt === "string" ? o.createdAt : new Date(0).toISOString(),
    currentModel: typeof o.currentModel === "string" ? o.currentModel : "?",
    candidateModel: typeof o.candidateModel === "string" ? o.candidateModel : "?",
    judgeModel: typeof o.judgeModel === "string" ? o.judgeModel : "?",
    promptVersion: typeof o.promptVersion === "string" ? o.promptVersion : "?",
    pairs,
    verdicts,
    revealedAt: typeof o.revealedAt === "string" ? o.revealedAt : null,
  }
}

export async function readBlindPanel(): Promise<BlindPanelSession | null> {
  if (!db) return null
  try {
    const rows = await db
      .select({ value: configStore.value })
      .from(configStore)
      .where(eq(configStore.key, BLIND_PANEL_KEY))
      .limit(1)
    if (rows.length === 0) return null
    return parseSession(rows[0]?.value)
  } catch {
    return null
  }
}

export async function writeBlindPanel(session: BlindPanelSession): Promise<void> {
  if (!db) throw new Error("Database not available")
  await db
    .insert(configStore)
    .values({ key: BLIND_PANEL_KEY, value: session })
    .onConflictDoUpdate({
      target: configStore.key,
      set: { value: session, updated_at: new Date() },
    })
}

export interface RecordVerdictResult {
  ok: boolean
  error?: string
}

/**
 * Record one verdict.
 *
 * Refuses after reveal. Once the labels are visible, a changed verdict is no
 * longer a blind judgment, and silently accepting it would let the recorded
 * result drift away from the experiment that produced it. Re-judging is a
 * new session, which is what `--generate` makes.
 */
export async function recordVerdict(
  pairIndex: number,
  verdict: PanelVerdict,
): Promise<RecordVerdictResult> {
  const session = await readBlindPanel()
  if (!session) return { ok: false, error: "لا توجد جلسة تحكيم — ولّد الأزواج أولاً" }
  if (session.revealedAt) {
    return { ok: false, error: "الجلسة انكشفت — لا يمكن تعديل الأحكام بعد كشف المصادر" }
  }
  if (!session.pairs.some((p) => p.index === pairIndex)) {
    return { ok: false, error: "رقم الزوج غير موجود" }
  }
  session.verdicts[String(pairIndex)] = verdict
  await writeBlindPanel(session)
  return { ok: true }
}

/**
 * Reveal the sources. Refuses while any pair is unjudged — the stopping rule
 * is defined on a complete panel, and revealing early turns it into optional
 * stopping (peek, then decide whether to keep judging).
 */
export async function revealPanel(): Promise<RecordVerdictResult> {
  const session = await readBlindPanel()
  if (!session) return { ok: false, error: "لا توجد جلسة تحكيم" }
  if (session.revealedAt) return { ok: true }
  const judged = session.pairs.filter((p) => session.verdicts[String(p.index)]).length
  if (judged < session.pairs.length) {
    return {
      ok: false,
      error: `باقي ${session.pairs.length - judged} زوج بلا حكم — الكشف بعد اكتمال الـ${PANEL_PAIR_COUNT}`,
    }
  }
  session.revealedAt = new Date().toISOString()
  await writeBlindPanel(session)
  return { ok: true }
}
