/**
 * Studio 3-phase journey, Phase 2 — EDIT REVIEW job handler.
 *
 * After Khaled uploads his EDITED audio (linked to the project as
 * `edited_session_id` in Step 1), this job proves whether each Phase-1 cut
 * (pre-roll + breaks) was actually applied. Transcribing the edited recording
 * with whisper-1 timestamps takes minutes, so — like the Phase-1 map — it runs
 * as a background job, never inline in the request.
 *
 * Pipeline:
 *   1. Resolve the project from the EDITED session id (getProjectByEditedSession).
 *      No project ⇒ error: this job only runs for linked edited sessions.
 *   2. Read the RAW session's persisted Phase-1 artifacts (timed segments + map)
 *      off `project.raw_session_id`. Missing either ⇒ error (Phase 1 first).
 *   3. `transcribeWithTimestamps` the EDITED audio (whisper-1 verbose_json),
 *      logged to ai_runs with phase="review_transcription" (distinct from
 *      Phase-1's "timestamp_map") so the two passes are cost-attributable.
 *   3b. `assessTranscriptDegeneracy` on the fresh edited transcript — a whisper
 *      decoding loop here would make every alignment verdict garbage, so a
 *      degenerate edited transcript FAILS the job (no review is stored) instead of
 *      producing a false ✅ on hallucinated text. Mirrors Phase-1's guard.
 *   4. `reviewEpisodeEdits` — the PURE, deterministic, FREE verdict algorithm.
 *   5. Persist the review under the `phase2_review` kind, keyed to the EDITED
 *      session id.
 *
 * It does NOT transition the project to `reviewed`. That happens on Khaled's
 * APPROVAL in the UI (Step 4): the presence of a stored review is the
 * "review available, awaiting approval" signal, and moving the state here would
 * be a lie about what occurred (the same principle as attachEditedSession
 * deliberately not advancing state).
 *
 * The registered type is "studio.episode_review"; its HANDLER_TIMEOUT_MS entry
 * in worker.ts uses the SAME string (a mismatch silently caps the handler at
 * the 5-min default — see worker.ts assertTimeoutKeysAreRegistered).
 */

import path from "path"
import fs from "fs/promises"
import { registerHandler } from "../registry"
import { getStudioSession } from "@/lib/studio"
import { getProjectByEditedSession } from "@/lib/studio/projects"
import { resolveEirIdForSession } from "@/lib/studio/analysis-records"
import {
  getTimedSegments,
  getEpisodeMap,
  saveEpisodeReview,
} from "@/lib/studio/transcripts"
import { transcribeWithTimestamps } from "@/lib/whisper"
import { reviewEpisodeEdits } from "@/lib/studio/episode-review"
import {
  assessTranscriptDegeneracy,
  filterDegenerateSegments,
  DEGENERATE_EDITED_TRANSCRIPT_MESSAGE,
  DEGENERATE_RAW_REVIEW_TRANSCRIPT_MESSAGE,
} from "@/lib/studio/transcript-quality"
import {
  estimateChunkCount,
  buildTranscriptionProgress,
} from "@/lib/studio/transcription-progress"

/** Matches the upload route's layout: data/studio-audio/{sessionId}/audio-{sessionId}{ext}. */
const AUDIO_DIR = path.join(process.cwd(), "data", "studio-audio")

interface EpisodeReviewPayload extends Record<string, unknown> {
  editedSessionId?: string
  language?: string
}

interface EpisodeReviewResult extends Record<string, unknown> {
  edited_session_id: string
  raw_session_id: string
  applied: number
  not_applied: number
  partial: number
  uncertain: number
  extra_cuts: number
  overall_confidence: number
  edited_segment_count: number
}

/**
 * Resolve the uploaded audio path for a session from the standard upload
 * location. Mirrors the episode-map handler's helper (kept local rather than
 * imported so this handler module doesn't pull in episode-map's registration
 * side effect): rebuild `audio-{sessionId}{ext}` and confirm it stays inside
 * AUDIO_DIR before use (defence against a crafted session id / extension).
 */
async function resolveSessionAudioPath(
  sessionId: string,
  audioFilename: string,
): Promise<string> {
  const ext = path.extname(audioFilename).toLowerCase()
  const sessionDir = path.join(AUDIO_DIR, sessionId)
  const filePath = path.join(sessionDir, `audio-${sessionId}${ext}`)
  if (!path.resolve(filePath).startsWith(path.resolve(sessionDir) + path.sep)) {
    throw new Error("episode-review: resolved audio path escapes the session directory")
  }
  await fs.access(filePath) // throws if the edited audio isn't on disk
  return filePath
}

registerHandler<EpisodeReviewPayload, EpisodeReviewResult>(
  "studio.episode_review",
  async (payload, ctx) => {
    const editedSessionId = payload.editedSessionId
    if (!editedSessionId) {
      throw new Error("episode-review: payload.editedSessionId is required")
    }

    // ── 1. Resolve the project from the edited session ────────────────────────
    const project = await getProjectByEditedSession(editedSessionId)
    if (!project) {
      throw new Error(
        `episode-review: no studio project is linked to edited session ${editedSessionId}`,
      )
    }
    const rawSessionId = project.raw_session_id
    if (!rawSessionId) {
      throw new Error(
        `episode-review: project ${project.id} has no raw session — Phase 1 must run first`,
      )
    }

    // ── 2. Read the RAW session's Phase-1 artifacts (segments + map) ──────────
    const rawTimed = await getTimedSegments(rawSessionId)
    if (!rawTimed || rawTimed.segments.length === 0) {
      throw new Error(
        `episode-review: raw session ${rawSessionId} has no timed segments — run Phase 1 (episode map) first`,
      )
    }
    const map = await getEpisodeMap(rawSessionId)
    if (!map) {
      throw new Error(
        `episode-review: raw session ${rawSessionId} has no episode map — run Phase 1 (episode map) first`,
      )
    }

    // ── 3. Transcribe the EDITED audio (phase="review_transcription") ─────────
    const editedSession = await getStudioSession(editedSessionId)
    if (!editedSession) {
      throw new Error(`episode-review: edited session ${editedSessionId} not found`)
    }
    if (!editedSession.audio_filename) {
      throw new Error(
        `episode-review: edited session ${editedSessionId} has no uploaded audio to review`,
      )
    }

    const eirId = await resolveEirIdForSession(editedSessionId)
    const language = payload.language ?? "ar"
    const audioPath = await resolveSessionAudioPath(
      editedSessionId,
      editedSession.audio_filename,
    )

    // ── live progress: same shape as Phase 1 — transcription dominates (~90%),
    //    then `comparing` (the pure verdict) is the fast tail. Immediate
    //    determinate scale from the edited cut's stored duration, refined per
    //    chunk. Best-effort throughout (ctx.reportProgress never throws).
    const expectedChunks = estimateChunkCount(editedSession.duration_seconds)
    let lastTotalChunks = expectedChunks
    void ctx.reportProgress(
      buildTranscriptionProgress({
        stage: "transcribing",
        currentChunk: 0,
        totalChunks: expectedChunks,
      }),
    )

    const transcriptionStartMs = Date.now()
    const transcription = await transcribeWithTimestamps(
      audioPath,
      language,
      {
        eirId,
        subjectTable: "studio_sessions",
        subjectId: editedSessionId,
      },
      "review_transcription",
      (p) => {
        lastTotalChunks = p.totalChunks
        void ctx.reportProgress(
          buildTranscriptionProgress({
            stage: "transcribing",
            currentChunk: p.currentChunk,
            totalChunks: p.totalChunks,
            elapsedMs: Date.now() - transcriptionStartMs,
          }),
        )
      },
    )
    if (!transcription.success || !transcription.segments) {
      throw new Error(
        transcription.error || "episode-review: edited-audio transcription failed",
      )
    }
    const editedSegments = transcription.segments

    // ── 3b. TEXT honesty on the FRESH edited-audio whisper pass ───────────────
    // Phase 1 guards its raw whisper output inside generateEpisodeMap; the edited
    // transcription is a SECOND whisper pass and can ALSO degenerate into a
    // decoding loop (identical segments repeated) on silence/breaks in the cut.
    // A looped edited transcript passes reviewEpisodeEdits' structural checks but
    // makes every content-alignment verdict garbage. Fail the job with a meaningful
    // message here rather than store a review built on hallucinated edited text.
    // (The RAW side is not REFUSED here — the map already exists so Phase 1's guard
    // passed — but it IS FILTERED before the comparison in step 4, the same way the
    // map was built, so raw whisper garbage can't fabricate a false ✅. See there.)
    //
    // DELIBERATE DIVERGENCE from the Phase-1 map path (Wave-1 Fix B): the map path
    // FILTERS degenerate segments and builds on the clean remainder, because that
    // is generation and dropping garbage is safe. This review path does NOT filter
    // — it REFUSES on any degeneracy. Reviewing verifies whether a cut was APPLIED
    // by checking that raw content is ABSENT from the edited transcript; a whisper
    // hallucination that REPLACED still-present edited content makes that content
    // unmatchable, so the raw content reads "absent" → a FALSE ✅ "applied". That
    // false ✅ is the review's cardinal sin (see the honesty principle in
    // episode-review.ts), and filtering the hallucinated region out does NOT rescue
    // it (the real words are already gone). So the honesty-safe unification is: same
    // degeneracy engine, but refuse-don't-filter here — flagged for Khaled's sign-off.
    const editedDegeneracy = assessTranscriptDegeneracy(editedSegments)
    if (editedDegeneracy.degenerate) {
      throw new Error(
        `${DEGENERATE_EDITED_TRANSCRIPT_MESSAGE} [${editedDegeneracy.reason}]`,
      )
    }

    // ── 4. The PURE, FREE verdict (throws on malformed input, never a false ✅) ─
    void ctx.reportProgress(
      buildTranscriptionProgress({
        stage: "comparing",
        currentChunk: lastTotalChunks,
        totalChunks: lastTotalChunks,
      }),
    )
    // FILTER the RAW side the SAME way Phase 1 did before it built the map. The
    // persisted rawTimed.segments are the FULL, UNFILTERED whisper output (the map
    // handler saves segments BEFORE generateEpisodeMap filters them locally). The
    // review classifies each RAW segment as PRESENT/ABSENT in the edited transcript;
    // a whisper-loop garbage segment ("اشتغلنا ×36") reads ABSENT (its garbage token
    // is not in the correctly-transcribed edited audio) and, if it overlaps a note
    // region, fabricates absent-evidence → a FALSE ✅ "applied" on a break that was
    // never actually cut. Dropping the same garbage the map dropped removes that
    // fabricated evidence; a region left with no real content then honestly reads
    // `uncertain`, never a false ✅. The EDITED side stays REFUSE-not-filter (guard
    // 3b above) — Khaled's confirmed decision — because a hallucination that REPLACED
    // still-present edited content can't be rescued by filtering (the real words are
    // already gone).
    const cleanRaw = filterDegenerateSegments(rawTimed.segments).clean
    // RE-ASSESS the filtered raw remainder before trusting it as the review reference.
    // `filterDegenerateSegments` is a keep/drop MASK, not a proof of cleanliness: it
    // measures HARD runs on the ORIGINAL stream, so dropping a HARD run BETWEEN two
    // sub-HARD runs of the SAME word splices them into ONE connected loop that survives
    // in `cleanRaw` ([8×"ثاني"][10×"X"][8×"ثاني"] → the "X" loop is dropped → 16 identical
    // "ثاني" remain). A residual loop in the reference reads "absent" from the edited
    // transcript and fabricates a FALSE ✅ "applied" — the review's cardinal sin. Unlike
    // the map path (generation), a review VERIFIES and there is no honest way to filter
    // this away (the real words are already gone), so FAIL the review — the same
    // refuse-not-filter rule the edited side (3b) already applies.
    const rawResidual = assessTranscriptDegeneracy(cleanRaw)
    if (rawResidual.degenerate) {
      throw new Error(
        `${DEGENERATE_RAW_REVIEW_TRANSCRIPT_MESSAGE} [${rawResidual.reason}]`,
      )
    }
    const review = reviewEpisodeEdits(cleanRaw, map, editedSegments)

    // ── 5. Persist the review, keyed to the EDITED session id ─────────────────
    // NOTE: intentionally NO project state transition here — `reviewed` is
    // Khaled's approval action in the UI (Step 4). The stored review is the
    // "ready for approval" signal.
    await saveEpisodeReview(editedSessionId, review)

    // Cosmetic terminal tick — the poller keys on the review appearing.
    void ctx.reportProgress(
      buildTranscriptionProgress({
        stage: "done",
        currentChunk: lastTotalChunks,
        totalChunks: lastTotalChunks,
      }),
    )

    return {
      edited_session_id: editedSessionId,
      raw_session_id: rawSessionId,
      applied: review.summary.applied,
      not_applied: review.summary.not_applied,
      partial: review.summary.partial,
      uncertain: review.summary.uncertain,
      extra_cuts: review.summary.extra,
      overall_confidence: review.overall_confidence,
      edited_segment_count: editedSegments.length,
    }
  },
)
