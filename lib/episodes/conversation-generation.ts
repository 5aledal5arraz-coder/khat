/**
 * ص-٩ — the work behind «توليد أقسام الحوار», lifted out of the server action.
 *
 * WHY IT LIVES HERE AND NOT IN THE ACTION
 * The measured run takes ~132s. nginx on the droplet cuts a proxied request at
 * 120s, so a synchronous server action would be severed mid-flight and the
 * operator would see the button die with no reason — the exact failure the
 * candidate analysis already hit and already fixed by moving to the worker
 * (see lib/jobs/candidate-jobs.ts). So this module holds the logic with NO
 * auth and NO Next.js request context, and two callers use it:
 *   • lib/jobs/handlers/episode-conversation.ts — runs it in the worker;
 *   • nothing else. The admin action only ENQUEUES.
 *
 * FAILURES ARE RETURNED, NOT THROWN, and they are classified. The job layer —
 * not this module — decides what is worth retrying: a missing studio session
 * will still be missing on attempt three, while a 502 from the model may not.
 * Keeping the classification here and the retry POLICY there is why this file
 * imports nothing from lib/jobs.
 */

import { getEpisodeEnrichment, setEpisodeEnrichment } from "@/lib/episodes/enrichments"
import { episodeGenerationContext } from "@/lib/episodes/generation-context"
import { saveVersion } from "@/lib/episodes/versions"
import {
  findSessionLinkedToEpisode,
  getEpisodeIntelligenceForSession,
  getStudioSession,
  getStudioSessionsByVideoId,
  getTranscriptForSession,
} from "@/lib/studio"
import { generateEpisodeConversation, type ConversationField } from "@/lib/ai"
import type { StudioSession } from "@/types/database"

/**
 * Why a run produced nothing. `not_khat_lane` / `no_session` / `no_transcript`
 * are facts about the data that a retry cannot change; `generation_failed` may
 * be transient.
 */
export type ConversationGenerationFailure =
  | "not_khat_lane"
  | "no_episode"
  | "no_session"
  | "no_transcript"
  | "generation_failed"

export type ConversationGenerationResult =
  | { ok: true; filled: ConversationField[]; skipped: ConversationField[] }
  | { ok: false; reason: ConversationGenerationFailure; error: string }

/**
 * Fill the empty «conversation» sections of one episode from its transcript.
 *
 * Fills ONLY what is currently blank; anything Khaled typed is read first and
 * wins on every leaf (see `mergeConversationFields`). Returns without an AI
 * call — and without cost — when nothing is empty.
 *
 * `exclusive_clip` is not part of this: it embeds a separate published clip's
 * YouTube URL, which no model can know.
 */
export async function runConversationGeneration(
  episodeId: string,
  only?: ConversationField[],
): Promise<ConversationGenerationResult> {
  // ── Lane gate (ص-٩, Khaled) ────────────────────────────────────────
  // These five sections are a template for a COMPLETE خط conversation, and
  // only خط gets them. Measured runtimes say why it is not merely a matter of
  // taste: خط runs 70–216 min, سالفة 5–15, clips 8–24 — so an 18-minute clip
  // was being handed the two-hour template and answering it, producing 8
  // timestamps, 8 quotes and 5 lessons out of material that holds none of
  // that. The gate protects the guest, the money and the generator's own
  // assumptions at once.
  //
  // IT LIVES HERE, not at the callers, so the admin button, the job handler
  // and any future bulk run inherit the same limit instead of each
  // remembering it.
  //
  // ⚠️ THE CLASSIFIER IS EXCEPTION-BASED and this gate does NOT invert it: an
  // episode with no category resolves to خط and IS ALLOWED THROUGH. That is
  // correct — a freshly synced episode has no category until an admin assigns
  // one, and refusing a real episode over incomplete paperwork is the silent
  // loss this codebase keeps paying for. Only an episode positively
  // classified as سالفة or a clip is turned away.
  const { lane, eirId } = await episodeGenerationContext(episodeId)
  if (lane === null) {
    return {
      ok: false,
      reason: "no_episode",
      error: "لم يتم العثور على هذه الحلقة في قاعدة البيانات.",
    }
  }
  if (lane !== "khat") {
    return {
      ok: false,
      reason: "not_khat_lane",
      error:
        lane === "clips"
          ? "هذا مقطع وليس حلقة خط كاملة — أقسام الحوار تُولَّد لحلقات خط وحدها."
          : "هذي ليست حلقة خط كاملة (برنامج منفصل) — أقسام الحوار تُولَّد لحلقات خط وحدها.",
    }
  }

  // The transcript lives on a studio session. Preferred route: the website
  // package the operator explicitly linked to this episode. Fallback:
  // `episodes.id` IS the YouTube video id, so a session imported from the
  // same video carries the same transcript. Reading a transcript through
  // the video id is safe — unlike WRITING `linked_episode_id`, which stays
  // an explicit operator action (see lib/studio/website-packages.ts, ص-٣).
  const candidates: StudioSession[] = []
  const linkedSessionId = await findSessionLinkedToEpisode(episodeId)
  if (linkedSessionId) {
    const linked = await getStudioSession(linkedSessionId)
    if (linked) candidates.push(linked)
  }
  for (const session of await getStudioSessionsByVideoId(episodeId)) {
    if (!candidates.some((c) => c.id === session.id)) candidates.push(session)
  }

  if (candidates.length === 0) {
    return {
      ok: false,
      reason: "no_session",
      error: "لا توجد جلسة استوديو لهذه الحلقة — استورد الحلقة في الاستوديو أولاً.",
    }
  }

  // A failed import and a good one can share a video; take the first
  // session that actually has a ready transcript.
  let session: StudioSession | null = null
  let transcriptText = ""
  for (const candidate of candidates) {
    const transcript = await getTranscriptForSession(candidate.id)
    if (transcript?.status === "ready" && transcript.transcript_clean) {
      session = candidate
      transcriptText = transcript.transcript_clean
      break
    }
  }
  if (!session) {
    return {
      ok: false,
      reason: "no_transcript",
      error: "لا يوجد نص جاهز لهذه الحلقة — شغّل تفريغ النص في الاستوديو أولاً.",
    }
  }

  const existing = await getEpisodeEnrichment(episodeId)
  // Free quality lift when the Studio already computed it for this
  // session — the generator folds it into the prompt.
  const intelligence = await getEpisodeIntelligenceForSession(session.id)

  const result = await generateEpisodeConversation({
    transcript: transcriptText,
    videoTitle: session.video_title ?? "",
    existing,
    episodeIntelligence: intelligence?.status === "ready" ? intelligence.data : null,
    only,
    // TELEMETRY ATTRIBUTION — the whole point of resolving `eirId` above.
    // `ai_runs` rows are written the moment the call completes and CANNOT be
    // attributed retroactively, so a run that goes out without these three
    // fields is a cost we will never be able to trace back to an episode. The
    // generator has always accepted this context; it was simply never passed.
    eirContext: {
      eirId,
      subjectTable: "episode_enrichments",
      subjectId: episodeId,
    },
  })

  if (!result.success) {
    return {
      ok: false,
      reason: "generation_failed",
      error: result.error || "حدث خطأ أثناء توليد أقسام الحوار",
    }
  }
  if (!result.filled || result.filled.length === 0) {
    return { ok: true, filled: [], skipped: result.skipped ?? [] }
  }

  if (existing) {
    await saveVersion(episodeId, "conversation", { enrichment: existing }, "توليد أقسام الحوار")
  }

  // NOTE: no `unsaid_reflections_approved` in this patch, and there never
  // must be. A generated reflection lands unapproved and stays invisible on
  // the public page until Khaled ticks it himself (ص-٩ decision).
  await setEpisodeEnrichment({
    episodeId,
    ...result.patch,
    updatedAt: new Date().toISOString(),
  })

  return { ok: true, filled: result.filled, skipped: result.skipped ?? [] }
}
