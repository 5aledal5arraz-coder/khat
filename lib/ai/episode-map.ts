/**
 * Khat Brain — Raw-episode TIME MAP generator (Studio Wave 2, Stage 1).
 *
 * Turns the foundation (whisper-timed segments + ffmpeg-detected silence) into
 * the map Khaled applies to his editor:
 *   - episode_true_start ("the episode actually starts at 3:34")
 *   - breaks[]            ("40:00–43:00 was a break")
 *   - hook_candidates[]   ranked, each with code-derived platform fit
 *
 * THE ANTI-FABRICATION SPINE (rashid's design — do not weaken):
 *   1. Break numbers come from ffmpeg (`detectBreaks`), NEVER the model. The
 *      model only LABELS each gap by its `GAP_n` id; code re-attaches the real
 *      start/end/duration.
 *   2. true_start + hooks: the model returns SEGMENT IDS (`Sxxx`), never
 *      seconds; code converts id → the window's real seconds.
 *   3. true_start ships with `first_real_sentence` copied verbatim; code
 *      verifies it is an actual substring of that window's text.
 *   4. platform_fit is DERIVED by code from `opens_with` via a fixed rule
 *      (marzouq's finding) — the model classifies the opening, code decides fit.
 * Any unknown id, bad label, or non-substring sentence THROWS — an unvalidated
 * map is never emitted. A confidently-wrong map sends the editor to the wrong
 * frame, so we refuse rather than guess.
 */

import { runAiTask } from "@/lib/ai-router"
import { detectBreaks } from "@/lib/audio/silence"
import {
  mergeIntoWindows,
  renderWithIds,
  type TimedSegment,
} from "@/lib/studio/segments"
import {
  filterDegenerateSegments,
  assessTranscriptDegeneracy,
  DEGENERATE_TRANSCRIPT_MESSAGE,
  MAX_DEGENERATE_DROP_FRACTION,
  MIN_CLEAN_SEGMENTS,
  SUSPECT_LOOP_RUN_LENGTH,
  HARD_LOOP_RUN_LENGTH,
  type TimeInterval,
} from "@/lib/studio/transcript-quality"
import { formatTimeSeconds } from "@/lib/shared/formatters"
import {
  EPISODE_MAP_SYSTEM,
  EPISODE_MAP_PROMPT_VERSION,
  buildEpisodeMapUser,
  GAP_LABELS,
  HOOK_OPENS_WITH,
  type GapLabel,
  type HookOpensWith,
  type EpisodeMapModelOutput,
} from "@/lib/ai/prompts/episode-map"

/** Actor id stamped on the ai_runs row when the worker runs the generator. */
const EPISODE_MAP_ACTOR = "worker:episode-map"

/** Merge-window span (seconds) for the transcript the model reads. */
const DEFAULT_WINDOW_SECONDS = 20

// ─── Platform fit (code-derived, NOT model-guessed) ──────────────────────────

export type PlatformFitLevel = "strong" | "moderate" | "weak"

export interface PlatformFit {
  tiktok: PlatformFitLevel
  youtube: PlatformFitLevel
  instagram: PlatformFitLevel
  /** Platforms where fit is "strong" — the code-derived recommendation. */
  recommended: Array<"tiktok" | "youtube" | "instagram">
}

/**
 * Fixed opens_with → platform-fit rule. Folds in marzouq's verified finding
 * (2026, خط بودكاست TikTok data): a hook LEADING WITH THE GUEST'S NAME died
 * (838 views) while a hook leading with a STAKE (91.7K) or a DIRECT "أنت"
 * COMMAND (25.5K) won; YouTube is the opposite (name/context leads work in
 * long-form). instagram (Reels) is short-form so it mirrors TikTok — noted as
 * inference, not a separately measured number.
 *
 * This is a CONSTANT, not a model output: the model classifies the opening,
 * code decides the strategy.
 */
const PLATFORM_FIT_RULE: Record<HookOpensWith, Omit<PlatformFit, "recommended">> = {
  stake: { tiktok: "strong", youtube: "moderate", instagram: "strong" },
  direct_you: { tiktok: "strong", youtube: "moderate", instagram: "strong" },
  guest_name: { tiktok: "weak", youtube: "strong", instagram: "weak" },
  context: { tiktok: "weak", youtube: "strong", instagram: "moderate" },
}

/** Derive full platform fit (incl. `recommended`) from an `opens_with`. */
export function derivePlatformFit(opensWith: HookOpensWith): PlatformFit {
  const base = PLATFORM_FIT_RULE[opensWith]
  const recommended = (["tiktok", "youtube", "instagram"] as const).filter(
    (p) => base[p] === "strong",
  )
  return { ...base, recommended }
}

// ─── Final map shape (REAL seconds — code-owned) ─────────────────────────────

export interface EpisodeMapBreak {
  gap_id: string
  start_seconds: number
  end_seconds: number
  duration_seconds: number
  label: GapLabel
  label_reason: string
}

export interface EpisodeMapHook {
  rank: number
  start_seconds: number
  end_seconds: number
  opens_with: HookOpensWith
  platform_fit: PlatformFit
  why: string
}

/**
 * Honesty payload: what whisper degeneracy the map was built AROUND. A map built
 * on a filtered transcript has HOLES (spans we dropped as garbage), and Khaled
 * must SEE them — a silent gap is exactly the dishonesty this pipeline refuses.
 * Surfaced in the map result (persisted in the map JSONB, shown in the UI) instead
 * of only a `console.warn` the operator never reads.
 */
export interface EpisodeMapTranscriptHealth {
  /** Segments dropped as degenerate whisper loops before the map was built. */
  dropped_segments: number
  /** Total wall-clock seconds of dropped (filtered) audio. */
  dropped_seconds: number
  /** dropped_seconds / total transcribed seconds (0 when nothing was transcribed). */
  dropped_fraction: number
  /** Filtered-out spans on the raw timeline — HOLES the map skips over. */
  dropped_intervals: TimeInterval[]
  /**
   * A borderline 5–9 identical-segment run that was NEITHER dropped (too short to
   * be an unambiguous loop) NOR flagged degenerate (uniqueness stayed healthy) —
   * the "dead zone". Surfaced so a possibly-looped region is honest even though the
   * pipeline could not safely act on it. null when no such run exists.
   */
  suspect_run: { length: number; start_seconds: number; end_seconds: number } | null
}

export interface EpisodeMap {
  /** Real seconds where the episode content actually begins. */
  episode_true_start: number
  /** Verbatim proof sentence from the true_start window's text. */
  first_real_sentence: string
  pre_roll_summary: string
  breaks: EpisodeMapBreak[]
  hook_candidates: EpisodeMapHook[]
  /** Whisper-degeneracy honesty payload (holes the map was built around). */
  transcript_health: EpisodeMapTranscriptHealth
  // Provenance.
  prompt_version: string
  ai_run_id: string
  model_name: string
  generated_at: string
}

export interface GenerateEpisodeMapInput {
  /** Absolute-timed transcript segments (from `transcribeWithTimestamps`). */
  segments: TimedSegment[]
  /** Path to the raw audio — fed to ffmpeg `detectBreaks` (numbers source). */
  audioFilePath: string
  /** Telemetry scope. */
  sessionId?: string | null
  eirId?: string | null
  actorId?: string | null
  /** Merge-window span; defaults to 20s. Exposed for tests. */
  windowSeconds?: number
  /**
   * Optional progress hook so the job handler can surface which sub-step is
   * running: `detecting_breaks` (ffmpeg silencedetect) then `analyzing` (the
   * single AI map call). Default undefined ⇒ no-op — behaviour is unchanged for
   * every existing caller and test. Observational only.
   */
  onStage?: (stage: "detecting_breaks" | "analyzing") => void
}

/** Collapse all whitespace to single spaces + trim — the substring-proof norm. */
function normalizeWhitespace(text: string): string {
  return text.replace(/\s+/g, " ").trim()
}

/** Same id scheme `renderWithIds` uses: 1-based, `S` + zero-padded to 3. */
function windowIdFor(index: number): string {
  return `S${String(index + 1).padStart(3, "0")}`
}

/** Render the ffmpeg gaps for the prompt: `GAP_1: from HH:MM:SS to HH:MM:SS (180s)`. */
function renderGaps(
  gaps: Array<{ start: number; end: number; durationSeconds: number }>,
): string {
  return gaps
    .map(
      (g, i) =>
        `GAP_${i + 1}: from ${formatTimeSeconds(g.start)} to ${formatTimeSeconds(
          g.end,
        )} (${Math.round(g.durationSeconds)}s)`,
    )
    .join("\n")
}

/** True when point `p` sits inside a dropped (filtered-garbage) interval `[c, d)`. */
function pointInDroppedInterval(p: number, intervals: TimeInterval[]): TimeInterval | null {
  for (const iv of intervals) {
    if (p >= iv.start && p < iv.end) return iv
  }
  return null
}

/** True when range `[a, b]` overlaps any dropped interval `[c, d]` (touching ends excluded). */
function rangeIntersectsDropped(a: number, b: number, intervals: TimeInterval[]): TimeInterval | null {
  for (const iv of intervals) {
    if (a < iv.end && iv.start < b) return iv
  }
  return null
}

/**
 * Convert validated model output (ids + labels) into a map with REAL seconds.
 * Pure + exported so the id→seconds resolution and platform_fit derivation are
 * unit-testable with a mocked model output (no ffmpeg, no paid AI).
 *
 * `segMap`  : window id (`Sxxx`) → { segment, index }  (authoritative seconds)
 * `gapMap`  : gap id  (`GAP_n`)  → { start, end, duration }  (ffmpeg's numbers)
 * `droppedIntervals` : spans FILTERED OUT as degenerate whisper garbage before
 *   the windows were built. The model reads only clean windows, but a hook range
 *   can still SPAN a hole (window-before-hole → window-after-hole) and a true_start
 *   can theoretically land in one. Any true_start in a hole THROWS (reselect); any
 *   hook range that intersects a hole is DROPPED (a missing hook beats a hook that
 *   sends the editor to known garbage). Default `[]` — no holes, no checks — so
 *   every existing caller/test is unchanged.
 *
 * Every rejection path throws with a clear message; a caller that gets a
 * returned value is holding a fully-validated map.
 */
export function resolveEpisodeMap(
  model: EpisodeMapModelOutput,
  segMap: Map<string, { segment: TimedSegment; index: number }>,
  gapMap: Map<string, { start: number; end: number; durationSeconds: number }>,
  provenance: { promptVersion: string; aiRunId: string; modelName: string },
  droppedIntervals: TimeInterval[] = [],
): Omit<EpisodeMap, "generated_at" | "transcript_health"> {
  // ── true_start: id must exist ──────────────────────────────────────────────
  const trueStart = segMap.get(model.true_start_segment_id)
  if (!trueStart) {
    throw new Error(
      `episode-map: true_start_segment_id "${model.true_start_segment_id}" ` +
        `is not a real window id — refusing to emit a fabricated start`,
    )
  }

  // ── true_start must NOT land in a filtered-garbage hole ─────────────────────
  // The window's start is real, but if it falls inside a span we dropped as a
  // whisper loop, the "start" points at deleted garbage. Refuse — never anchor the
  // whole episode on a region we know is hallucinated.
  const startHole = pointInDroppedInterval(trueStart.segment.start, droppedIntervals)
  if (startHole) {
    throw new Error(
      `episode-map: episode_true_start ${trueStart.segment.start.toFixed(1)}s falls inside a ` +
        `filtered-out (degenerate) span ${startHole.start.toFixed(1)}s→${startHole.end.toFixed(1)}s ` +
        `— refusing to anchor the episode on dropped garbage`,
    )
  }

  // ── substring proof: the sentence must actually be in that window's text ────
  const sentence = normalizeWhitespace(model.first_real_sentence ?? "")
  if (sentence.length === 0) {
    throw new Error("episode-map: first_real_sentence is empty — proof missing")
  }
  const windowText = normalizeWhitespace(trueStart.segment.text)
  if (!windowText.includes(sentence)) {
    throw new Error(
      `episode-map: first_real_sentence is not a verbatim substring of window ` +
        `${model.true_start_segment_id} — proof failed, rejecting the map`,
    )
  }

  // ── gaps: every id must exist + label must be known ─────────────────────────
  const breaks: EpisodeMapBreak[] = []
  const seenGaps = new Set<string>()
  for (const g of model.gaps ?? []) {
    const authoritative = gapMap.get(g.gap_id)
    if (!authoritative) {
      throw new Error(
        `episode-map: gap_id "${g.gap_id}" was not among the detected gaps — ` +
          `the model may not invent gaps`,
      )
    }
    if (seenGaps.has(g.gap_id)) {
      throw new Error(`episode-map: gap_id "${g.gap_id}" labelled more than once`)
    }
    seenGaps.add(g.gap_id)
    if (!(GAP_LABELS as readonly string[]).includes(g.label)) {
      throw new Error(
        `episode-map: gap "${g.gap_id}" has unknown label "${g.label}"`,
      )
    }
    breaks.push({
      gap_id: g.gap_id,
      // Numbers are ffmpeg's, re-attached by id — never the model's.
      start_seconds: authoritative.start,
      end_seconds: authoritative.end,
      duration_seconds: authoritative.durationSeconds,
      label: g.label as GapLabel,
      label_reason: g.label_reason ?? "",
    })
  }

  // ── hooks: ids must exist, opens_with known, range ordered ──────────────────
  const hooks: EpisodeMapHook[] = []
  for (const h of model.hook_candidates ?? []) {
    const startSeg = segMap.get(h.start_segment_id)
    const endSeg = segMap.get(h.end_segment_id)
    if (!startSeg) {
      throw new Error(
        `episode-map: hook start_segment_id "${h.start_segment_id}" is not a real window id`,
      )
    }
    if (!endSeg) {
      throw new Error(
        `episode-map: hook end_segment_id "${h.end_segment_id}" is not a real window id`,
      )
    }
    if (endSeg.index < startSeg.index) {
      throw new Error(
        `episode-map: hook range ${h.start_segment_id}→${h.end_segment_id} ends before it starts`,
      )
    }
    if (!(HOOK_OPENS_WITH as readonly string[]).includes(h.opens_with)) {
      throw new Error(
        `episode-map: hook has unknown opens_with "${h.opens_with}"`,
      )
    }
    const hookStart = startSeg.segment.start
    const hookEnd = endSeg.segment.end
    // A hook that SPANS a filtered-out hole (window-before-hole → window-after-hole)
    // would send the editor to a clip that includes known garbage. DROP that hook —
    // a missing hook is strictly better than a garbage hook — and warn. The map
    // still ships; the other hooks are unaffected.
    const hole = rangeIntersectsDropped(hookStart, hookEnd, droppedIntervals)
    if (hole) {
      console.warn(
        `[episode-map] dropping hook ${hookStart.toFixed(1)}s→${hookEnd.toFixed(1)}s — it ` +
          `spans a filtered-out (degenerate) span ${hole.start.toFixed(1)}s→${hole.end.toFixed(1)}s`,
      )
      continue
    }
    const opensWith = h.opens_with as HookOpensWith
    hooks.push({
      rank: h.rank,
      start_seconds: hookStart,
      end_seconds: hookEnd,
      opens_with: opensWith,
      // platform_fit is DERIVED by code, never taken from the model.
      platform_fit: derivePlatformFit(opensWith),
      why: h.why ?? "",
    })
  }
  hooks.sort((a, b) => a.rank - b.rank)

  return {
    episode_true_start: trueStart.segment.start,
    first_real_sentence: model.first_real_sentence,
    pre_roll_summary: model.pre_roll_summary ?? "",
    breaks,
    hook_candidates: hooks,
    prompt_version: provenance.promptVersion,
    ai_run_id: provenance.aiRunId,
    model_name: provenance.modelName,
  }
}

/**
 * Full generator: segments + audio → validated time map with real numbers.
 * Routes the single AI call through `runAiTask` (the chokepoint) — no direct
 * provider calls. Throws on any validation failure; never returns an
 * unvalidated map.
 */
export async function generateEpisodeMap(
  input: GenerateEpisodeMapInput,
): Promise<EpisodeMap> {
  if (!input.segments || input.segments.length === 0) {
    throw new Error("episode-map: no segments to build a map from")
  }

  // ── TEXT honesty: FILTER the hallucinated (looped) segments BEFORE building a
  //    map, then build on the CLEAN remainder. The anti-fabrication spine below
  //    proves the MODEL is honest; this proves WHISPER is. A whisper decoding loop
  //    (dozens of identical consecutive segments — happens on raw audio with long
  //    silence/breaks, Khaled's exact case) passes every downstream self-check
  //    (monotonic, in-bounds, substring proof) while pointing the editor at
  //    garbage. We DROP those segments instead of throwing the whole map away
  //    (Khaled's "فلترة" choice: his real 86-min file is ~80% clean, so a map MUST
  //    still be built) — but if the transcript is MOSTLY hallucination, a clean
  //    error beats a map built on a minority of the real audio. Runs before any
  //    ffmpeg or paid AI work.
  const { clean, droppedCount, droppedSeconds, totalSeconds, droppedIntervals, verdict } =
    filterDegenerateSegments(input.segments)
  const totalCount = input.segments.length
  // TIME-weighted drop fraction, NOT count-weighted. A loop that is few-segments-
  // but-many-seconds (a handful of long 30s garbage segments vs. many short clean
  // ones) has a small COUNT fraction while being mostly-garbage by DURATION; a
  // count gate would confidently build a whole-episode map on a real-audio minority.
  // The map is a claim about TIME, so the gate is about time.
  const dropTimeFraction = totalSeconds > 0 ? droppedSeconds / totalSeconds : 0
  // Reject in two cases:
  //   (A) we filtered garbage AND the clean remainder is too thin / too small a
  //       time-slice of the real audio to trust a full-episode map on; OR
  //   (B) the overall verdict is degenerate yet NOTHING was surgically dropped —
  //       the "diffuse" degeneracy the filter deliberately won't touch (an
  //       ambiguous 5–9 run with collapsed uniqueness). There is no clean-and-safe
  //       remainder to fall back to, so refuse rather than silently build a map the
  //       verdict itself calls degenerate (restores the pre-filter guard's floor).
  const remainderTooThin =
    droppedCount > 0 &&
    (clean.length === 0 ||
      clean.length < MIN_CLEAN_SEGMENTS ||
      dropTimeFraction > MAX_DEGENERATE_DROP_FRACTION)
  const diffuseDegeneracy = verdict.degenerate && droppedCount === 0
  // (C) RE-ASSESS the CLEAN remainder the map will actually be built on, and refuse if
  //     it is STILL degenerate. `filterDegenerateSegments` measures HARD runs on the
  //     ORIGINAL stream, so dropping a HARD run that sits BETWEEN two sub-HARD runs of
  //     the SAME word splices them into ONE connected loop in `clean`
  //     ([8×"ثاني"][10×"X"][8×"ثاني"] → drop the "X" loop → 16 identical "ثاني" in a
  //     row) — a loop the pre-filter `verdict` (computed on the raw input) never sees,
  //     and that slips past both gates above (droppedCount>0 so NOT diffuse; clean is
  //     long enough and the time-fraction low). A residual diffuse degeneracy survives
  //     the same way. A map over a residual loop points the editor at garbage exactly
  //     like the un-filtered case, so the remainder must clear the SAME text check that
  //     licensed the filter. A borderline 5–9 run with healthy uniqueness is NOT
  //     degenerate here — it is surfaced as `suspect_run` below.
  const cleanVerdict = assessTranscriptDegeneracy(clean)
  if (remainderTooThin || diffuseDegeneracy || cleanVerdict.degenerate) {
    throw new Error(
      `${DEGENERATE_TRANSCRIPT_MESSAGE} ` +
        `[dropped ${droppedCount}/${totalCount} segments ` +
        `(${Math.round(dropTimeFraction * 100)}% of audio, ${droppedSeconds.toFixed(0)}s), ` +
        `clean=${clean.length}` +
        `${verdict.reason ? `; pre-filter: ${verdict.reason}` : ""}` +
        `${cleanVerdict.degenerate && cleanVerdict.reason ? `; residual: ${cleanVerdict.reason}` : ""}]`,
    )
  }
  if (droppedCount > 0) {
    console.warn(
      `[episode-map] filtered ${droppedCount}/${totalCount} degenerate segments ` +
        `(${droppedSeconds.toFixed(0)}s, ${Math.round(dropTimeFraction * 100)}% of audio) — ` +
        `building map on ${clean.length} clean segments over ` +
        `${droppedIntervals.length} hole(s)` +
        (verdict.reason ? `; ${verdict.reason}` : ""),
    )
  }

  // ── dead-zone warning: a borderline 5–9 identical run that the filter did NOT
  //    drop (too short to be an unambiguous loop) and the CLEAN-remainder verdict did
  //    NOT flag (uniqueness stayed healthy). Measured on `cleanVerdict` (the POST-filter
  //    remainder), NOT the pre-filter `verdict`: a hard loop that WAS dropped pushes the
  //    pre-filter global `maxConsecutiveRun` ≥ HARD, which would mask a real borderline
  //    5–9 run surviving in the clean remainder (it would fail the `< HARD` test and
  //    silently vanish). We cannot safely act on it, but a possibly-looped region must
  //    not be silent — surface it in the map + a warn. (On this non-thrown path
  //    `cleanVerdict.degenerate` is false, so the remainder's run is always < HARD.)
  const runLen = cleanVerdict.metrics.maxConsecutiveRun
  const suspectRun =
    runLen >= SUSPECT_LOOP_RUN_LENGTH &&
    runLen < HARD_LOOP_RUN_LENGTH &&
    cleanVerdict.metrics.loopStartSeconds != null &&
    cleanVerdict.metrics.loopEndSeconds != null
      ? {
          length: runLen,
          start_seconds: cleanVerdict.metrics.loopStartSeconds,
          end_seconds: cleanVerdict.metrics.loopEndSeconds,
        }
      : null
  if (suspectRun) {
    console.warn(
      `[episode-map] borderline ${suspectRun.length}-run (dead zone) at ` +
        `${suspectRun.start_seconds.toFixed(1)}s→${suspectRun.end_seconds.toFixed(1)}s — ` +
        `kept (uniqueness healthy) but flagged for manual review`,
    )
  }

  const transcriptHealth: EpisodeMapTranscriptHealth = {
    dropped_segments: droppedCount,
    dropped_seconds: droppedSeconds,
    dropped_fraction: dropTimeFraction,
    dropped_intervals: droppedIntervals,
    suspect_run: suspectRun,
  }

  // ── ffmpeg owns the break numbers ───────────────────────────────────────────
  input.onStage?.("detecting_breaks")
  const detection = await detectBreaks(input.audioFilePath)
  const gaps = detection.breaks // >20s silences — the ones Khaled sees
  const gapMap = new Map<
    string,
    { start: number; end: number; durationSeconds: number }
  >()
  gaps.forEach((g, i) => {
    gapMap.set(`GAP_${i + 1}`, {
      start: g.start,
      end: g.end,
      durationSeconds: g.durationSeconds,
    })
  })

  // ── whisper owns the transcript numbers — the model sees only ids ───────────
  // Build on the CLEAN (filtered) segments, never the raw input.
  const windows = mergeIntoWindows(
    clean,
    input.windowSeconds ?? DEFAULT_WINDOW_SECONDS,
  )
  const segMap = new Map<string, { segment: TimedSegment; index: number }>()
  windows.forEach((w, i) => segMap.set(windowIdFor(i), { segment: w, index: i }))

  const renderedWindows = renderWithIds(windows)
  const renderedGaps = renderGaps(gaps)

  // ── single AI call through the router chokepoint ────────────────────────────
  input.onStage?.("analyzing")
  const res = await runAiTask<EpisodeMapModelOutput>({
    taskKind: "analysis",
    eirId: input.eirId ?? null,
    subjectTable: "studio_sessions",
    subjectId: input.sessionId ?? null,
    actorId: input.actorId ?? EPISODE_MAP_ACTOR,
    promptVersion: EPISODE_MAP_PROMPT_VERSION,
    input: {
      window_count: windows.length,
      gap_count: gaps.length,
      // The CLEAN segment count actually fed into the windows (post-filter).
      segment_count: clean.length,
    },
    prompt: [
      { role: "system", content: EPISODE_MAP_SYSTEM },
      {
        role: "user",
        content: buildEpisodeMapUser({ renderedWindows, renderedGaps }),
      },
    ],
    expectJson: true,
  })

  if (res.status !== "succeeded") {
    throw new Error(res.errorMessage || "episode-map: AI generation failed")
  }
  const model = res.parsed
  if (!model || typeof model !== "object") {
    throw new Error("episode-map: model returned no parsable JSON")
  }

  const resolved = resolveEpisodeMap(
    model,
    segMap,
    gapMap,
    {
      promptVersion: EPISODE_MAP_PROMPT_VERSION,
      aiRunId: res.runId,
      modelName: res.modelName,
    },
    // Pass the filtered-out holes so a true_start / hook that lands in one is
    // rejected — the editor is never routed to a region we deleted as garbage.
    droppedIntervals,
  )

  return {
    ...resolved,
    transcript_health: transcriptHealth,
    generated_at: new Date().toISOString(),
  }
}
