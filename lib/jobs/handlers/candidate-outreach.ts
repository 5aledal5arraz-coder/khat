/**
 * Guest-candidate OUTREACH-DRAFT job handler.
 *
 *   candidate.outreach_generate — generate a personalized outreach draft in the
 *                                 worker AND persist it as a version row in
 *                                 `guest_candidate_outreach_messages`.
 *
 * Two things changed vs the old inline call:
 *   1. It runs in the worker, off the nginx 120s path (same reason as analyze).
 *   2. It PERSISTS the draft. The inline `generateOutreachDraft` only returned
 *      the draft to the client and never saved it, so a proxy timeout (or any
 *      transport drop) lost the draft entirely. Saving it here — as an
 *      AI-generated, un-edited version — means the draft is never lost: the UI
 *      reads it back from the saved history on completion. The admin can still
 *      edit and save a further version on top of it (that becomes the edited
 *      version), exactly as before.
 *
 * `generateOutreachDraft` swallows failures and returns `{ ok: false, error }`;
 * we re-throw so the worker fails/dead-letters the job (quota classification by
 * message still applies).
 */

import { registerHandler } from "../registry"
import { generateOutreachDraft, saveOutreachMessage } from "@/lib/guest-candidates"
import {
  CANDIDATE_OUTREACH_GENERATE_JOB,
  type CandidateOutreachJobPayload,
  type CandidateOutreachJobResult,
} from "../candidate-jobs"

registerHandler<CandidateOutreachJobPayload, CandidateOutreachJobResult>(
  CANDIDATE_OUTREACH_GENERATE_JOB,
  async (payload) => {
    const outcome = await generateOutreachDraft({
      candidateId: payload.candidateId,
      channel: payload.channel,
      tone: payload.tone,
      length: payload.length,
      customNote: payload.customNote ?? undefined,
    })
    if (!outcome.ok) {
      throw new Error(outcome.error)
    }

    // Persist the draft as a version row — this is the durability fix. It is the
    // AI's original, un-edited output (edited_by_admin: false).
    const saved = await saveOutreachMessage({
      candidateId: payload.candidateId,
      channel: payload.channel,
      tone: payload.tone,
      subject_line: outcome.draft.subject_line,
      message_body: outcome.draft.message_body,
      generated_by_ai: true,
      edited_by_admin: false,
    })

    return {
      messageId: saved.id,
      runId: outcome.runId,
      subject_line: saved.subject_line,
      message_body: saved.message_body,
    }
  },
)
