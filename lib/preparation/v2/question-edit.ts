/**
 * Prep V2 — question-bank edits (pure).
 *
 * Replaces the «أسئلة لا بد منها» textarea and its position-based merge
 * (`mergeMustAskQuestions`, removed). That merge flattened the must-ask
 * questions to lines, then re-attached id / section / purpose / fact cards to
 * the new lines BY POSITION — so inserting, deleting or reordering a line
 * moved every later question's metadata and support cards onto the wrong
 * text, a shorter list silently dropped the tail questions, new lines all
 * landed in one hard-coded section, and every save re-sorted the bank.
 *
 * Every function here finds its question BY ID and touches only that
 * question. An unknown id is `changed: false` (the question was deleted or
 * replaced by a regeneration) — never a guess. All are immutable: they return
 * a new bank and never mutate the input, so the server action (load → transform
 * → validate → write under a row lock) and the editor's optimistic update run
 * the SAME code. Same pattern as insight-review.ts.
 *
 * Order within a section = array order in `question_bank`. The bank's order
 * ACROSS sections carries no meaning (every reader groups by section), so a
 * question moved or added into a section is placed right after that
 * section's last question.
 */

import { courseSafeTypes } from "./format"
import {
  QUESTION_PRIORITIES,
  QUESTION_TYPES,
  insightLiveStatus,
  type PrepV2Insight,
  type PrepV2Payload,
  type PrepV2Question,
  type QuestionOrigin,
  type QuestionPriority,
  type QuestionType,
  type SectionKind,
} from "./types"

type Bank = PrepV2Question[]

export type QuestionEditReason =
  /** No question with that id (deleted, or replaced by a regeneration). */
  | "not_found"
  /** The stored text is not the text the editor last saw — someone else edited it. */
  | "stale"
  /** Target section is not one of the prep's `episode_sections`. */
  | "bad_section"
  /** Empty question text. */
  | "empty"
  /** An add whose id already exists — the same add, repeated (double click). */
  | "exists"
  /** Valid request that changes nothing (same text, top of the section…). */
  | "noop"

export interface QuestionEditResult {
  bank: Bank
  changed: boolean
  reason?: QuestionEditReason
  /** On `stale`: the text currently stored, so the editor can show it. */
  current?: string
}

/** The prep context an edit is checked against. */
export interface QuestionEditContext {
  /** `episode_sections` kinds, in order. */
  sections: readonly SectionKind[]
  format?: PrepV2Payload["format"]
}

export function questionEditContext(p: Pick<PrepV2Payload, "episode_sections" | "format">): QuestionEditContext {
  return { sections: (p.episode_sections ?? []).map((s) => s.kind), format: p.format }
}

/** Longest question text accepted from the editor. */
export const QUESTION_TEXT_MAX = 1000
/** Longest purpose / follow-up accepted from the editor. */
export const QUESTION_NOTE_MAX = 1000

/** The review note a generated card gets when its question's text changes. */
export const TEXT_CHANGED_REVIEW_NOTE = "نص السؤال تغيّر"

/** Manual question ids: `manual-` + a UUID (client-generated, so the optimistic row and the server agree). */
export const MANUAL_QUESTION_ID = /^manual-[0-9a-f-]{8,36}$/

export function newManualQuestionId(): string {
  const uuid =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now().toString(16)}-${Math.random().toString(16).slice(2, 10)}`
  return `manual-${uuid}`
}

// ─── Text comparison ──────────────────────────────────────────────────

/** NFC + collapsed whitespace + trimmed: the text as a reader sees it. */
export function canonicalQuestionText(s: string): string {
  return String(s ?? "").normalize("NFC").replace(/\s+/g, " ").trim()
}

/** Canonical text with punctuation (Arabic and Latin) removed. */
function wordsOnly(s: string): string {
  return canonicalQuestionText(s)
    .replace(/[\p{P}\p{S}]/gu, "")
    .replace(/\s+/g, " ")
    .trim()
}

/**
 * How much a text edit really changes:
 *   - `none`        — whitespace only: nothing is written.
 *   - `punctuation` — «؟» added, a comma moved: saved, cards keep their review.
 *   - `words`       — the question says something else: generated cards that
 *                     were approved against the OLD wording go back to review.
 */
export function classifyTextChange(before: string, after: string): "none" | "punctuation" | "words" {
  if (canonicalQuestionText(before) === canonicalQuestionText(after)) return "none"
  if (wordsOnly(before) === wordsOnly(after)) return "punctuation"
  return "words"
}

// ─── Card helpers ────────────────────────────────────────────────────

export interface QuestionCardCounts {
  total: number
  approved: number
  /** Generated (not manual) cards currently approved — the ones a text edit resets. */
  approvedGenerated: number
}

export function questionCardCounts(q: Pick<PrepV2Question, "insights">): QuestionCardCounts {
  const all = q.insights ?? []
  return {
    total: all.length,
    approved: all.filter((i) => insightLiveStatus(i) === "approved").length,
    approvedGenerated: all.filter((i) => !i.manual && insightLiveStatus(i) === "approved").length,
  }
}

function resetGeneratedApprovals(insights: PrepV2Insight[] | undefined): PrepV2Insight[] | undefined {
  if (!insights) return insights
  return insights.map((i) =>
    !i.manual && insightLiveStatus(i) === "approved"
      ? { ...i, live_status: "pending", review_note: TEXT_CHANGED_REVIEW_NOTE }
      : i,
  )
}

/**
 * Id prefixes of questions a person added BEFORE `origin` existed: `inline-*`
 * (the old textarea merge), `guest-*` (the old guest-suggestion add) and
 * `manual-*`. The pipeline never writes these prefixes. Without this, those
 * questions (live preps carry them) would read as generated and be dropped by
 * the first regeneration.
 */
const AUTHORED_ID = /^(inline|guest|manual)-/

/** Effective origin: the stored field, else inferred from a legacy id, else generated. */
export function questionOrigin(q: Pick<PrepV2Question, "origin" | "id">): QuestionOrigin {
  if (q.origin) return q.origin
  const m = AUTHORED_ID.exec(q.id ?? "")
  if (!m) return "generated"
  return m[1] === "guest" ? "guest" : "manual"
}

// ─── Placement helpers ───────────────────────────────────────────────

/** Index right after the last question of `section` (or the end of the bank). */
function endOfSection(bank: Bank, section: SectionKind): number {
  for (let i = bank.length - 1; i >= 0; i--) {
    if (bank[i].section === section) return i + 1
  }
  return bank.length
}

function insertAt(bank: Bank, index: number, q: PrepV2Question): Bank {
  return [...bank.slice(0, index), q, ...bank.slice(index)]
}

function checkStale(q: PrepV2Question, expectedText: string | undefined): QuestionEditResult | null {
  if (expectedText === undefined) return null
  if (canonicalQuestionText(q.text) === canonicalQuestionText(expectedText)) return null
  return { bank: [], changed: false, reason: "stale", current: q.text }
}

// ─── Edit ────────────────────────────────────────────────────────────

export interface QuestionEditPatch {
  text?: string
  purpose?: string
  follow_up_prompt?: string
  priority?: QuestionPriority
}

/**
 * Edit one question's text / purpose / follow-up / priority.
 *
 * `expectedText` is the text the editor was looking at; when the stored text
 * differs, the edit is refused (`stale`, with the current text) instead of
 * overwriting someone else's change.
 */
export function editQuestion(
  bank: Bank,
  id: string,
  patch: QuestionEditPatch,
  expectedText?: string,
): QuestionEditResult {
  const idx = bank.findIndex((q) => q.id === id)
  if (idx < 0) return { bank, changed: false, reason: "not_found" }
  const q = bank[idx]
  const stale = checkStale(q, expectedText)
  if (stale) return { ...stale, bank }

  const next: PrepV2Question = { ...q }
  let changed = false

  if (patch.text !== undefined) {
    const text = String(patch.text).normalize("NFC").trim().slice(0, QUESTION_TEXT_MAX)
    if (!text) return { bank, changed: false, reason: "empty" }
    const kind = classifyTextChange(q.text, text)
    if (kind !== "none") {
      next.text = text
      changed = true
      if (kind === "words") next.insights = resetGeneratedApprovals(q.insights)
    }
  }
  if (patch.purpose !== undefined) {
    const v = String(patch.purpose).normalize("NFC").trim().slice(0, QUESTION_NOTE_MAX)
    if (v !== q.purpose) {
      next.purpose = v
      changed = true
    }
  }
  if (patch.follow_up_prompt !== undefined) {
    const v = String(patch.follow_up_prompt).normalize("NFC").trim().slice(0, QUESTION_NOTE_MAX)
    if (v !== q.follow_up_prompt) {
      next.follow_up_prompt = v
      changed = true
    }
  }
  if (patch.priority !== undefined) {
    if (!(QUESTION_PRIORITIES as readonly string[]).includes(patch.priority)) {
      return { bank, changed: false, reason: "noop" }
    }
    if (patch.priority !== q.priority) {
      next.priority = patch.priority
      changed = true
    }
  }

  if (!changed) return { bank, changed: false, reason: "noop" }
  if (next.insights === undefined) delete next.insights
  return { bank: bank.map((x, i) => (i === idx ? next : x)), changed: true }
}

// ─── Move / reorder ──────────────────────────────────────────────────

/**
 * Move a question into `toSection`, before `beforeId` (a question already in
 * that section) or — `null` — to the end of it. Its cards travel with it.
 */
export function moveQuestion(
  bank: Bank,
  id: string,
  toSection: SectionKind,
  beforeId: string | null,
  ctx: QuestionEditContext,
): QuestionEditResult {
  if (!ctx.sections.includes(toSection)) return { bank, changed: false, reason: "bad_section" }
  const q = bank.find((x) => x.id === id)
  if (!q) return { bank, changed: false, reason: "not_found" }
  if (beforeId === id) return { bank, changed: false, reason: "noop" }

  const rest = bank.filter((x) => x.id !== id)
  let at: number
  if (beforeId !== null) {
    at = rest.findIndex((x) => x.id === beforeId)
    if (at < 0 || rest[at].section !== toSection) return { bank, changed: false, reason: "not_found" }
  } else {
    at = endOfSection(rest, toSection)
  }
  const next = insertAt(rest, at, q.section === toSection ? q : { ...q, section: toSection })
  const same = next.every((x, i) => x === bank[i])
  return same ? { bank, changed: false, reason: "noop" } : { bank: next, changed: true }
}

/** Swap with the previous / next question OF THE SAME SECTION. */
export function reorderQuestion(bank: Bank, id: string, dir: "up" | "down"): QuestionEditResult {
  const idx = bank.findIndex((q) => q.id === id)
  if (idx < 0) return { bank, changed: false, reason: "not_found" }
  const section = bank[idx].section
  let other = -1
  if (dir === "up") {
    for (let i = idx - 1; i >= 0; i--) if (bank[i].section === section) { other = i; break }
  } else {
    for (let i = idx + 1; i < bank.length; i++) if (bank[i].section === section) { other = i; break }
  }
  if (other < 0) return { bank, changed: false, reason: "noop" }
  const next = [...bank]
  next[idx] = bank[other]
  next[other] = bank[idx]
  return { bank: next, changed: true }
}

// ─── Add / delete ────────────────────────────────────────────────────

export interface NewQuestionInput {
  text: string
  /** Default: `manual-<uuid>`. A caller-chosen id makes the add idempotent. */
  id?: string
  priority?: QuestionPriority
  purpose?: string
  follow_up_prompt?: string
  types?: QuestionType[]
  origin?: Exclude<QuestionOrigin, "generated">
}

/**
 * Add a question to `section`, after `afterId` (a question in that section)
 * or — `null` — at the end of the section. An id that already exists is the
 * same add repeated (`exists`, bank unchanged): a double click, or a guest
 * suggestion added twice, never produces two questions.
 */
export function addQuestion(
  bank: Bank,
  section: SectionKind,
  afterId: string | null,
  input: NewQuestionInput,
  ctx: QuestionEditContext,
): QuestionEditResult & { question?: PrepV2Question } {
  if (!ctx.sections.includes(section)) return { bank, changed: false, reason: "bad_section" }
  const text = String(input.text ?? "").normalize("NFC").trim().slice(0, QUESTION_TEXT_MAX)
  if (!text) return { bank, changed: false, reason: "empty" }
  const id = input.id?.trim() || newManualQuestionId()
  if (bank.some((q) => q.id === id)) return { bank, changed: false, reason: "exists" }

  let at: number
  if (afterId !== null) {
    const i = bank.findIndex((q) => q.id === afterId)
    if (i < 0 || bank[i].section !== section) return { bank, changed: false, reason: "not_found" }
    at = i + 1
  } else {
    at = endOfSection(bank, section)
  }

  const rawTypes = (input.types ?? ["reflective"]).filter((t) =>
    (QUESTION_TYPES as readonly string[]).includes(t),
  )
  const baseTypes: QuestionType[] = rawTypes.length ? rawTypes : ["reflective"]
  const priority: QuestionPriority =
    input.priority && (QUESTION_PRIORITIES as readonly string[]).includes(input.priority)
      ? input.priority
      : "must_ask"

  const question: PrepV2Question = {
    id,
    section,
    text,
    // A course never carries confrontational / emotional questions.
    types: ctx.format === "course" ? courseSafeTypes(baseTypes) : baseTypes,
    priority,
    purpose: String(input.purpose ?? "").normalize("NFC").trim().slice(0, QUESTION_NOTE_MAX),
    follow_up_prompt: String(input.follow_up_prompt ?? "").normalize("NFC").trim().slice(0, QUESTION_NOTE_MAX),
    risk_level: "low",
    origin: input.origin ?? "manual",
  }
  return { bank: insertAt(bank, at, question), changed: true, question }
}

/** Delete one question — and its support cards with it (they belong to it). */
export function deleteQuestion(
  bank: Bank,
  id: string,
  expectedText?: string,
): QuestionEditResult & { removed?: PrepV2Question } {
  const q = bank.find((x) => x.id === id)
  if (!q) return { bank, changed: false, reason: "not_found" }
  const stale = checkStale(q, expectedText)
  if (stale) return { ...stale, bank }
  return { bank: bank.filter((x) => x.id !== id), changed: true, removed: q }
}

// ─── Regeneration carry-over ─────────────────────────────────────────

/**
 * Regeneration writes a whole new prep. Questions a PERSON added — manual or
 * from the guest — are not the model's to throw away: carry each one whose
 * section still exists in the new structure (appended to the end of that
 * section, cards and all). A question whose section is gone (e.g. a story
 * prep regenerated as a 3-module course) has nowhere meaningful to go and is
 * reported in `dropped`.
 */
export function carryOverAuthoredQuestions(
  previous: Pick<PrepV2Payload, "question_bank"> | null | undefined,
  next: PrepV2Payload,
): { payload: PrepV2Payload; carried: number; dropped: number } {
  const authored = (previous?.question_bank ?? []).filter((q) => questionOrigin(q) !== "generated")
  if (authored.length === 0) return { payload: next, carried: 0, dropped: 0 }
  const ctx = questionEditContext(next)
  let bank = [...(next.question_bank ?? [])]
  let carried = 0
  let dropped = 0
  for (const q of authored) {
    if (bank.some((x) => x.id === q.id)) continue
    if (!ctx.sections.includes(q.section)) {
      dropped += 1
      continue
    }
    const types = ctx.format === "course" ? courseSafeTypes(q.types ?? []) : q.types
    bank = insertAt(bank, endOfSection(bank, q.section), { ...q, types })
    carried += 1
  }
  return { payload: { ...next, question_bank: bank }, carried, dropped }
}
