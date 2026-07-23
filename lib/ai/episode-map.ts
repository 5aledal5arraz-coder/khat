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
  assessTranscriptDegeneracy,
  DEGENERATE_TRANSCRIPT_MESSAGE,
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

export interface EpisodeMap {
  /** Real seconds where the episode content actually begins. */
  episode_true_start: number
  /** Verbatim proof sentence from the true_start window's text. */
  first_real_sentence: string
  pre_roll_summary: string
  breaks: EpisodeMapBreak[]
  hook_candidates: EpisodeMapHook[]
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

/**
 * Convert validated model output (ids + labels) into a map with REAL seconds.
 * Pure + exported so the id→seconds resolution and platform_fit derivation are
 * unit-testable with a mocked model output (no ffmpeg, no paid AI).
 *
 * `segMap`  : window id (`Sxxx`) → { segment, index }  (authoritative seconds)
 * `gapMap`  : gap id  (`GAP_n`)  → { start, end, duration }  (ffmpeg's numbers)
 *
 * Every rejection path throws with a clear message; a caller that gets a
 * returned value is holding a fully-validated map.
 */
export function resolveEpisodeMap(
  model: EpisodeMapModelOutput,
  segMap: Map<string, { segment: TimedSegment; index: number }>,
  gapMap: Map<string, { start: number; end: number; durationSeconds: number }>,
  provenance: { promptVersion: string; aiRunId: string; modelName: string },
): Omit<EpisodeMap, "generated_at"> {
  // ── true_start: id must exist ──────────────────────────────────────────────
  const trueStart = segMap.get(model.true_start_segment_id)
  if (!trueStart) {
    throw new Error(
      `episode-map: true_start_segment_id "${model.true_start_segment_id}" ` +
        `is not a real window id — refusing to emit a fabricated start`,
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
    const opensWith = h.opens_with as HookOpensWith
    hooks.push({
      rank: h.rank,
      start_seconds: startSeg.segment.start,
      end_seconds: endSeg.segment.end,
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

  // ── TEXT honesty: reject a hallucinated (looped) transcript BEFORE building a
  //    map on it. The anti-fabrication spine below proves the MODEL is honest;
  //    this proves WHISPER is. A whisper decoding loop (dozens of identical
  //    consecutive segments — happens on raw audio with long silence/breaks,
  //    Khaled's exact case) passes every downstream self-check (monotonic,
  //    in-bounds, substring proof) while pointing the editor at garbage. Fail
  //    fast here, before any ffmpeg or paid AI work.
  const degeneracy = assessTranscriptDegeneracy(input.segments)
  if (degeneracy.degenerate) {
    throw new Error(`${DEGENERATE_TRANSCRIPT_MESSAGE} [${degeneracy.reason}]`)
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
  const windows = mergeIntoWindows(
    input.segments,
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
      segment_count: input.segments.length,
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

  const resolved = resolveEpisodeMap(model, segMap, gapMap, {
    promptVersion: EPISODE_MAP_PROMPT_VERSION,
    aiRunId: res.runId,
    modelName: res.modelName,
  })

  return { ...resolved, generated_at: new Date().toISOString() }
}
