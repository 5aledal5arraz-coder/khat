/**
 * Studio 3-phase journey — Phase-2 EDIT REVIEW algorithm (Stage 3, pure core).
 *
 * After Khaled edits his audio (removing pre-roll, breaks, filler) the system
 * compares the EDITED transcript against the RAW transcript + the Phase-1 map
 * and reports, per Phase-1 note, whether the cut was actually applied.
 *
 * The edited audio is SHORTER — he only REMOVES content, never adds or reorders
 * — so the edited token stream is a SUBSEQUENCE of the raw one. The timelines do
 * NOT align (a cut at 40:00 shifts everything after it), so the comparison is by
 * CONTENT (normalized text), never by timestamp. Raw segments carry the real
 * absolute seconds; a detected cut is mapped BACK to the raw timeline through
 * those segments.
 *
 * 🔴 THE HONESTY PRINCIPLE (the same anti-fabrication spine as the Phase-1 map —
 * do not weaken):
 *   A false ✅ "applied" that sends Khaled to publish an un-cut break is exactly
 *   the failure this must prevent. So where the alignment is LOW-confidence or
 *   ambiguous, this reports `uncertain` («غير متأكد») — NEVER a confident verdict
 *   it cannot prove. Boundaries are fuzzy (he cuts on video frames, not exact
 *   seconds), so "was the break removed" means "is MOST of the break content
 *   absent, within a documented tolerance", not "is every second gone".
 *
 * This module is PURE and deterministic (no DB, no AI, no I/O), styled after
 * `lib/studio/segments.ts`: it THROWS on malformed input rather than emit a
 * verdict it cannot stand behind. Transcribing the edited audio, the review job,
 * storage, the endpoint, and the UI are LATER steps — this file only computes.
 *
 * Normalization REUSES the existing tools (no new `normalizeArabic`):
 *   - `normalizeArabic` (lib/search.ts)     — tashkeel/alef/taa-marbuta/
 *     alef-maqsura/tatweel folding + lowercase.
 *   - `jaccardSimilarity` (lib/khat-map/v2/title-similarity.ts) — all window
 *     similarity math; the "drop tokens < 2 chars" rule below mirrors that
 *     module's `normalizeTitleTokens`.
 *   - Eastern→Western digit folding is done by a tiny local `foldEasternDigits`
 *     helper. It is NOT reused from `lib/ai-router/benchmark/scoring.ts` on
 *     purpose: that function's tashkeel range `[ً-ٰ]` (U+064B–U+0670) swallows
 *     the Arabic-Indic digits (U+0660–U+0669), so it DELETES them instead of
 *     folding — verified: `٣٠`→`` while `30`→`30`. Reusing it would break the
 *     exact cross-pass digit case Rashid flagged. (Latent bug filed separately.)
 */

import { normalizeArabic } from "@/lib/search"
import { jaccardSimilarity } from "@/lib/khat-map/v2/title-similarity"
import { formatTimeSeconds } from "@/lib/shared/formatters"
import type { TimedSegment } from "@/lib/studio/segments"

// ─── Calibration constants ───────────────────────────────────────────────────
// Sensible defaults. Every one of these is a JUDGMENT CALL that CANNOT be fixed
// without a real raw/edited pair — Noura calibrates them in verification against
// a genuine Khaled edit (Rashid's flag). They are named + documented, never
// magic numbers inlined at the call site.

/**
 * Window-Jaccard at/above which a raw segment's content is judged PRESENT in the
 * edited transcript. NEEDS CALIBRATION on a real raw/edited pair.
 */
export const SIMILARITY_PRESENT_THRESHOLD = 0.6

/**
 * Window-Jaccard below which a raw segment's content is judged ABSENT (cut).
 * The band `[ABSENT, PRESENT)` is the ambiguous zone → `uncertain`, never a
 * false verdict. NEEDS CALIBRATION on a real raw/edited pair.
 */
export const SIMILARITY_ABSENT_THRESHOLD = 0.3

/**
 * Fraction of a region's content (weighted by overlap-seconds) that may deviate
 * from a single verdict and still count as fully applied / not_applied. He cuts
 * on video frames, not exact seconds, so region boundaries are fuzzy — this much
 * of the region may disagree before we downgrade to `partial`.
 *
 * CALIBRATED on a REAL raw/edited pair 2026-07-23 (Noura): a FULLY-removed break
 * came out `partial` at absent=0.80 because a few short removed segments scored
 * just above the ABSENT threshold. Raised 0.15 → 0.20 so absent=0.80 reads
 * `applied`. This is honesty-safe: a KEPT break scores absent≈0.00 / present≈1.0,
 * nowhere near the 0.80 boundary, so a wider tolerance CANNOT flip a kept break
 * to a false ✅ — it only rescues genuine full removals from a false `partial`.
 * (The false-✅ direction lives in SIMILARITY_ABSENT_THRESHOLD, left untouched.)
 */
export const REGION_REMOVAL_TOLERANCE = 0.2

/**
 * If at least this fraction of a region's content aligns ambiguously (or the
 * region has no transcribable content at all), the verdict is `uncertain` —
 * never a false ✅. This is the honesty floor. NEEDS CALIBRATION.
 */
export const REGION_UNCERTAIN_FRACTION = 0.34

/**
 * A contiguous absent run shorter than this (raw seconds) is treated as ASR
 * jitter / trivial filler removal, not a reportable cut. NEEDS CALIBRATION.
 */
export const MIN_EXTRA_CUT_SECONDS = 3

/**
 * A detected absent run counts as "explained by a note" when at least this
 * fraction of its duration overlaps that note's region; otherwise it is an
 * `extra_cut`. NEEDS CALIBRATION.
 */
export const EXTRA_CUT_EXPLAINED_OVERLAP = 0.5

/**
 * Minimum content tokens for a raw segment to carry alignment evidence. Below
 * this the segment is `neutral` (excluded from every verdict) — a 1-token
 * Jaccard is noise, not proof.
 */
export const MIN_SEGMENT_CONTENT_TOKENS = 2

/**
 * How far PAST the monotonic cursor (in edited tokens) to search for a segment's
 * match. This covers ASR boundary jitter, NOT cut size: because a cut leaves the
 * cursor un-advanced, edited content resumes right at the cursor after any cut.
 * NEEDS CALIBRATION.
 */
export const ALIGN_LOOKAHEAD_TOKENS = 60

/**
 * Small backward tolerance from the cursor for within-sentence ASR reordering.
 * Kept tiny so a phrase repeated much later in the episode cannot false-match.
 */
export const ALIGN_BACKTRACK_TOKENS = 8

/** Light filler words dropped before alignment (post-`normalizeArabic` forms).
 *  Conservative on purpose — أه/يعني/يمكن/إيه only (Rashid's guidance): إيه→ايه,
 *  أه/آه→اه after alef folding. Over-dropping would erase real content. */
const FILLER_WORDS = new Set(["اه", "يعني", "يمكن", "ايه"])

/** Eastern Arabic (U+0660–U+0669) + Extended/Persian (U+06F0–U+06F9) digits. */
const EASTERN_DIGITS = /[٠-٩۰-۹]/g

// ─── Public types ────────────────────────────────────────────────────────────

export interface RawRange {
  /** Absolute seconds on the RAW (original) timeline. */
  start: number
  end: number
}

export type ReviewNoteType = "pre_roll" | "break"

export type ReviewNoteStatus =
  /** ✅ region content fully absent from the edited transcript. */
  | "applied"
  /** ⚠️ region content still present in the edited transcript — he forgot it. */
  | "not_applied"
  /** ℹ️ region partially cut — part gone, part remains; needs a look. */
  | "partial"
  /** 🔶 alignment too weak/ambiguous (or no transcribable content) to judge. */
  | "uncertain"

export interface ReviewedNote {
  type: ReviewNoteType
  /** The note's region on the RAW timeline. */
  raw_range: RawRange
  status: ReviewNoteStatus
  /** Human-readable Arabic explanation of the verdict. */
  detail: string
  /** Evidence fractions (of region content-seconds) — for transparency + calibration. */
  absent_fraction: number
  present_fraction: number
  uncertain_fraction: number
  /** Transcribable content-seconds found in the region (0 ⇒ no evidence). */
  content_seconds: number
}

export interface ExtraCut {
  /** The removed span on the RAW timeline. */
  raw_range: RawRange
  /** Arabic note — informational (filler he removed), not a problem. */
  note: string
}

export interface ReviewSummary {
  applied: number
  not_applied: number
  partial: number
  uncertain: number
  /** Count of extra (unmarked) cuts detected. */
  extra: number
}

export interface EpisodeReview {
  notes: ReviewedNote[]
  extra_cuts: ExtraCut[]
  /** Duration (seconds) of the edited audio, from its segments. */
  edited_duration: number
  /** Duration (seconds) of the raw audio, from its segments. */
  raw_duration: number
  summary: ReviewSummary
  /**
   * Global alignment confidence in [0,1]: the share of classified content that
   * aligned confidently (present or absent). Low ⇒ treat the whole review with
   * suspicion. This is a signal, not a promise.
   */
  overall_confidence: number
}

/**
 * The Phase-1 map fields this algorithm consumes. Declared as a structural
 * subset so a real `EpisodeMap` (lib/ai/episode-map.ts) is assignable to it,
 * while tests can pass a minimal object.
 */
export interface ReviewMapInput {
  /** Real seconds where the episode content actually begins (pre-roll ends). */
  episode_true_start: number
  /** ffmpeg-detected breaks, each with real raw-timeline seconds. */
  breaks: ReadonlyArray<{ start_seconds: number; end_seconds: number }>
}

// ─── Normalization / tokenization (composition of REUSED tools) ──────────────

/** Fold Eastern-Arabic + Persian digits to Western (٣→3, ۳→3). */
function foldEasternDigits(text: string): string {
  return text.replace(EASTERN_DIGITS, (d) => {
    const code = d.codePointAt(0) as number
    const base = code >= 0x06f0 ? 0x06f0 : 0x0660
    return String(code - base)
  })
}

/**
 * Ordered content tokens for alignment. Composes the REUSED normalizers, then
 * folds digits, strips punctuation, drops fillers and sub-2-char tokens (the
 * last rule mirrors `normalizeTitleTokens`). Order is preserved because the
 * subsequence alignment depends on it — that is why `normalizeTitleTokens`
 * (which returns an unordered Set and skips taa-marbuta/alef-maqsura folding)
 * is NOT the tokenizer here.
 */
export function alignmentTokens(text: string): string[] {
  const normalized = foldEasternDigits(normalizeArabic(text))
  return normalized
    .split(/\s+/)
    .map((t) => t.replace(/[^\p{L}\p{N}]/gu, ""))
    .filter((t) => t.length >= 2 && !FILLER_WORDS.has(t))
}

// ─── Input validation (throws — never review malformed input) ────────────────

function assertSegments(name: string, segs: TimedSegment[]): void {
  if (!Array.isArray(segs) || segs.length === 0) {
    throw new Error(`episode-review: ${name} must be a non-empty segment array`)
  }
  for (let i = 0; i < segs.length; i++) {
    const s = segs[i]
    if (!s || !Number.isFinite(s.start) || !Number.isFinite(s.end)) {
      throw new Error(`episode-review: ${name}[${i}] has non-finite start/end`)
    }
    if (s.start < 0) {
      throw new Error(`episode-review: ${name}[${i}] has negative start ${s.start}`)
    }
    if (s.end < s.start) {
      throw new Error(
        `episode-review: ${name}[${i}] ends ${s.end}s before it starts ${s.start}s`,
      )
    }
    if (i > 0 && s.start < segs[i - 1].start - 1e-6) {
      throw new Error(
        `episode-review: ${name} is not monotonic — [${i}] starts ${s.start}s, ` +
          `before [${i - 1}] ${segs[i - 1].start}s`,
      )
    }
  }
}

function assertMap(map: ReviewMapInput): void {
  if (!map || !Number.isFinite(map.episode_true_start) || map.episode_true_start < 0) {
    throw new Error(
      "episode-review: map.episode_true_start must be a finite, non-negative number",
    )
  }
  if (!Array.isArray(map.breaks)) {
    throw new Error("episode-review: map.breaks must be an array")
  }
  map.breaks.forEach((b, i) => {
    if (!b || !Number.isFinite(b.start_seconds) || !Number.isFinite(b.end_seconds)) {
      throw new Error(`episode-review: break[${i}] has non-finite seconds`)
    }
    if (b.start_seconds < 0 || b.end_seconds < b.start_seconds) {
      throw new Error(
        `episode-review: break[${i}] range [${b.start_seconds}, ${b.end_seconds}] is invalid`,
      )
    }
  })
}

// ─── Presence classification (monotonic subsequence alignment) ───────────────

type Presence = "present" | "absent" | "uncertain" | "neutral"

interface SegmentPresence {
  seg: TimedSegment
  presence: Presence
  /** Best window-Jaccard found (NaN for `neutral`). */
  similarity: number
}

/**
 * Classify every raw segment as present / absent / uncertain / neutral in the
 * edited token stream. edited is a SUBSEQUENCE of raw, so we walk raw in order
 * with a monotonic `cursor` into the edited tokens: a confident match advances
 * the cursor; an absent or uncertain segment leaves it, so the content after a
 * cut resumes matching right where it should. The lookahead absorbs ASR jitter,
 * NOT cut size (the cursor already holds across a cut).
 */
function classifyPresence(
  rawSegments: TimedSegment[],
  editedTokens: string[],
): SegmentPresence[] {
  const out: SegmentPresence[] = []
  const maxStart = Math.max(0, editedTokens.length - 1)
  let cursor = 0

  for (const seg of rawSegments) {
    const tokens = alignmentTokens(seg.text)
    if (tokens.length < MIN_SEGMENT_CONTENT_TOKENS) {
      out.push({ seg, presence: "neutral", similarity: Number.NaN })
      continue
    }

    const R = new Set(tokens)
    const w = tokens.length
    const windowCeil = Math.max(0, editedTokens.length - w)
    const from = Math.max(0, Math.min(windowCeil, cursor - ALIGN_BACKTRACK_TOKENS))
    const to = Math.min(Math.max(from, windowCeil, maxStart), cursor + ALIGN_LOOKAHEAD_TOKENS)

    let best = 0
    let bestPos = -1
    for (let p = from; p <= to; p++) {
      const sim = jaccardSimilarity(new Set(editedTokens.slice(p, p + w)), R)
      if (sim > best) {
        best = sim
        bestPos = p
      }
    }

    let presence: Presence
    if (best >= SIMILARITY_PRESENT_THRESHOLD) {
      presence = "present"
      if (bestPos >= 0) cursor = bestPos + w // advance ONLY on a confident match
    } else if (best < SIMILARITY_ABSENT_THRESHOLD) {
      presence = "absent"
    } else {
      presence = "uncertain"
    }
    out.push({ seg, presence, similarity: best })
  }

  return out
}

// ─── Region verification ─────────────────────────────────────────────────────

function overlapSeconds(seg: TimedSegment, start: number, end: number): number {
  return Math.max(0, Math.min(seg.end, end) - Math.max(seg.start, start))
}

const pctOf = (frac: number): string => `${Math.round(frac * 100)}%`

/**
 * Verify one Phase-1 region (pre-roll or a break) against the presence-classified
 * raw segments. Aggregates evidence by overlap-seconds so a segment straddling a
 * fuzzy boundary contributes only its in-region portion. The `uncertain` check
 * comes FIRST — a shaky alignment is never dressed up as a confident verdict.
 */
function verifyRegion(
  type: ReviewNoteType,
  start: number,
  end: number,
  presences: SegmentPresence[],
): ReviewedNote {
  let absent = 0
  let present = 0
  let uncertain = 0

  for (const p of presences) {
    if (p.presence === "neutral") continue
    const ov = overlapSeconds(p.seg, start, end)
    if (ov <= 0) continue
    if (p.presence === "present") present += ov
    else if (p.presence === "absent") absent += ov
    else uncertain += ov
  }

  const content = absent + present + uncertain
  const raw_range: RawRange = { start, end }
  const base = { type, raw_range, content_seconds: content }

  if (content <= 0) {
    return {
      ...base,
      status: "uncertain",
      detail:
        "لا يوجد محتوى قابل للتفريغ في هذا المقطع — تعذّر إثبات القص نصياً، راجعه يدوياً",
      absent_fraction: 0,
      present_fraction: 0,
      uncertain_fraction: 0,
    }
  }

  const aF = absent / content
  const pF = present / content
  const uF = uncertain / content
  const fractions = { absent_fraction: aF, present_fraction: pF, uncertain_fraction: uF }

  if (uF >= REGION_UNCERTAIN_FRACTION) {
    return {
      ...base,
      ...fractions,
      status: "uncertain",
      detail: `تطابق غامض على ${pctOf(uF)} من المقطع — تعذّر التأكد، راجعه يدوياً`,
    }
  }
  if (aF >= 1 - REGION_REMOVAL_TOLERANCE) {
    return {
      ...base,
      ...fractions,
      status: "applied",
      detail: `تم الحذف — ${pctOf(aF)} من محتوى المقطع غير موجود في النسخة المعدّلة`,
    }
  }
  if (pF >= 1 - REGION_REMOVAL_TOLERANCE) {
    return {
      ...base,
      ...fractions,
      status: "not_applied",
      detail: `لم يُحذف — ${pctOf(pF)} من المقطع لا يزال موجوداً في النسخة المعدّلة`,
    }
  }
  return {
    ...base,
    ...fractions,
    status: "partial",
    detail: `قُص جزئياً — ${pctOf(aF)} محذوف و${pctOf(pF)} باقٍ، يحتاج مراجعة`,
  }
}

// ─── Extra-cut detection ─────────────────────────────────────────────────────

/**
 * Contiguous runs of ABSENT raw segments that are NOT explained by any note
 * region — filler he removed. Informational only. Neutral/present segments break
 * a run (conservative: we split rather than over-merge an extra cut). Runs below
 * `MIN_EXTRA_CUT_SECONDS`, or those mostly inside a note region, are dropped.
 */
function detectExtraCuts(
  presences: SegmentPresence[],
  regions: Array<{ start: number; end: number }>,
): ExtraCut[] {
  const cuts: ExtraCut[] = []
  let runStart: number | null = null
  let runEnd = 0

  const flush = () => {
    if (runStart === null) return
    const duration = runEnd - runStart
    const start = runStart
    runStart = null
    if (duration < MIN_EXTRA_CUT_SECONDS) return

    // Explained by a note region? (≥ EXTRA_CUT_EXPLAINED_OVERLAP of the run).
    let explained = 0
    for (const r of regions) {
      explained = Math.max(
        explained,
        Math.max(0, Math.min(runEnd, r.end) - Math.max(start, r.start)),
      )
    }
    if (duration > 0 && explained / duration >= EXTRA_CUT_EXPLAINED_OVERLAP) return

    cuts.push({
      raw_range: { start, end: runEnd },
      note: `قص غير مُعلَّم بطول ~${Math.round(duration)}ث (${formatTimeSeconds(
        start,
      )}–${formatTimeSeconds(runEnd)}) — على الأرجح حشو حذفته`,
    })
  }

  for (const p of presences) {
    if (p.presence === "absent") {
      if (runStart === null) runStart = p.seg.start
      runEnd = p.seg.end
    } else {
      flush()
    }
  }
  flush()

  return cuts
}

// ─── Orchestrator ────────────────────────────────────────────────────────────

function lastEnd(segs: TimedSegment[]): number {
  return segs.reduce((mx, s) => Math.max(mx, s.end), 0)
}

/**
 * Compare an EDITED transcript against the RAW transcript + Phase-1 map and
 * report whether each Phase-1 note (pre-roll + each break) was applied.
 *
 * PURE + deterministic. Throws on malformed input. A returned review is fully
 * computed; where evidence is weak the verdict is `uncertain`, never a false ✅.
 */
export function reviewEpisodeEdits(
  rawSegments: TimedSegment[],
  map: ReviewMapInput,
  editedSegments: TimedSegment[],
): EpisodeReview {
  assertSegments("rawSegments", rawSegments)
  assertSegments("editedSegments", editedSegments)
  assertMap(map)

  const editedTokens = editedSegments.flatMap((s) => alignmentTokens(s.text))
  const presences = classifyPresence(rawSegments, editedTokens)

  // ── Phase-1 note regions on the RAW timeline ────────────────────────────────
  const regions: Array<{ type: ReviewNoteType; start: number; end: number }> = []
  if (map.episode_true_start > 0) {
    regions.push({ type: "pre_roll", start: 0, end: map.episode_true_start })
  }
  for (const b of map.breaks) {
    if (b.end_seconds > b.start_seconds) {
      regions.push({ type: "break", start: b.start_seconds, end: b.end_seconds })
    }
  }

  const notes = regions.map((r) => verifyRegion(r.type, r.start, r.end, presences))
  const extra_cuts = detectExtraCuts(
    presences,
    regions.map((r) => ({ start: r.start, end: r.end })),
  )

  const summary: ReviewSummary = {
    applied: notes.filter((n) => n.status === "applied").length,
    not_applied: notes.filter((n) => n.status === "not_applied").length,
    partial: notes.filter((n) => n.status === "partial").length,
    uncertain: notes.filter((n) => n.status === "uncertain").length,
    extra: extra_cuts.length,
  }

  // ── Global alignment confidence: share of classified content aligned firmly ──
  let firm = 0
  let classified = 0
  for (const p of presences) {
    if (p.presence === "neutral") continue
    const dur = Math.max(0, p.seg.end - p.seg.start)
    classified += dur
    if (p.presence !== "uncertain") firm += dur
  }
  const overall_confidence = classified > 0 ? firm / classified : 0

  return {
    notes,
    extra_cuts,
    edited_duration: lastEnd(editedSegments),
    raw_duration: lastEnd(rawSegments),
    summary,
    overall_confidence,
  }
}
