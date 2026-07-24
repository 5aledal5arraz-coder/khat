/**
 * Guest-candidate AI jobs — shared type + constant contract.
 *
 * The candidate "تحليل" (profile analysis) and "توليد رسالة الدعوة" (outreach
 * draft) AI calls used to run INLINE inside the request. On the droplet that
 * put them behind the nginx 120s wall while the AI-router retry budget is
 * longer — the proxy cut the connection and the client saw a transport error
 * even when the server had finished, and (worse) the outreach draft was lost
 * entirely because it was never persisted. Both are now background jobs
 * (lib/jobs), so the heavy AI work runs in the worker, off the proxy path.
 *
 * This module is SIDE-EFFECT-FREE (no handler registration, no db import) so the
 * route + status endpoints can import the job-type constants and payload shapes
 * without dragging the handler's AI/db module graph into their bundles. The
 * handlers (lib/jobs/handlers/candidate-*.ts) import these too and register
 * against the same constants.
 *
 * Naming follows the existing `domain.action` job-type convention
 * (`original.generate_topics`, `studio.episode_map`, `discovery_v2.run`, …).
 */

import type { OutreachChannel, OutreachTone } from "@/types/database"

export const CANDIDATE_ANALYZE_JOB = "candidate.analyze"
export const CANDIDATE_OUTREACH_GENERATE_JOB = "candidate.outreach_generate"

export interface CandidateAnalyzeJobPayload extends Record<string, unknown> {
  candidateId: string
}

export interface CandidateAnalyzeJobResult extends Record<string, unknown> {
  runId: string
}

export interface CandidateOutreachJobPayload extends Record<string, unknown> {
  candidateId: string
  channel: OutreachChannel
  tone: OutreachTone
  length: "short" | "medium" | "long"
  customNote?: string | null
}

export interface CandidateOutreachJobResult extends Record<string, unknown> {
  /** The persisted draft row id (the durability fix — the draft survives now). */
  messageId: string
  runId: string
  subject_line: string | null
  message_body: string
}
