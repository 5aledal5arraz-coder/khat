/**
 * «نسخة الضيف» — the ONLY place a link row becomes client props.
 *
 * Everything returned here is serialized into the RSC payload of a public
 * page, so it is built field by field from an explicit list. The prep reaches
 * the client only as `parseGuestPrepView(published_view)`, and only once the
 * questionnaire is submitted (the gate is `questionnaire_submitted_at`).
 *
 * Pure — the page does the DB work and passes rows in.
 */

import type {
  GuestLinkQuestionnaire,
  GuestLinkQuestionnaireDraft,
  GuestOwnSuggestion,
  GuestPrepView,
} from "@/types/database"
import { guestStage, type GuestStage } from "./access"
import { parseGuestPrepView } from "./view"

/** Keys a questionnaire (or draft) may carry back to the guest's own form. */
const QUESTIONNAIRE_KEYS = [
  "full_name",
  "honorific",
  "kunya",
  "pronunciation_notes",
  "phone_whatsapp",
  "preferred_drink",
  "preferred_filming_days",
  "preferred_filming_time",
  "scheduling_restrictions",
  "technical_needs",
  "topics_excited_about",
  "sensitivities_to_avoid",
  "social_accounts",
  "team_notes",
  "arrival_confirmation",
  "clothing_acknowledgment",
] as const satisfies readonly (keyof GuestLinkQuestionnaire)[]

export interface GuestIdentity {
  full_name: string | null
  honorific: string | null
  kunya: string | null
  pronunciation_notes: string | null
}

export interface GuestLinkClientProps {
  token: string
  stage: GuestStage
  /** Who the thank-you greets: the kunya once known, else the admin's name. */
  greetingName: string
  /** The guest's OWN answers (draft first) — to prefill their form. */
  initialAnswers: GuestLinkQuestionnaireDraft
  initialStep: number
  submitted: boolean
  /** Published snapshot — null before submit or before publish. */
  view: GuestPrepView | null
  identity: GuestIdentity | null
  /** Republished since the guest's previous visit. */
  updatedSinceLastVisit: boolean
  suggestions: GuestOwnSuggestion[]
}

interface RowInput {
  guest_display_name: string
  questionnaire: unknown
  questionnaire_draft: unknown
  questionnaire_draft_step: number | null
  questionnaire_submitted_at: Date | null
  welcome_seen_at: Date | null
  published_view: unknown
  published_at: Date | null
  last_opened_at: Date | null
}

function pickAnswers(raw: unknown): GuestLinkQuestionnaireDraft {
  if (!raw || typeof raw !== "object") return {}
  const src = raw as Record<string, unknown>
  const out: Record<string, unknown> = {}
  for (const k of QUESTIONNAIRE_KEYS) {
    if (src[k] !== undefined) out[k] = src[k]
  }
  return out as GuestLinkQuestionnaireDraft
}

function s(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null
}

export function buildGuestPageProps(params: {
  token: string
  row: RowInput
  suggestions: GuestOwnSuggestion[]
}): GuestLinkClientProps {
  const { row } = params
  const stage = guestStage(row)
  const submitted = Boolean(row.questionnaire_submitted_at)
  const answers = pickAnswers(row.questionnaire)
  const draft = pickAnswers(row.questionnaire_draft)
  const hasDraft = Object.keys(draft).length > 0
  const kunya = s(answers.kunya) ?? s(draft.kunya)

  const view = submitted ? parseGuestPrepView(row.published_view) : null
  const updatedSinceLastVisit = Boolean(
    submitted &&
      view &&
      row.published_at &&
      row.last_opened_at &&
      row.published_at.getTime() > row.last_opened_at.getTime(),
  )

  return {
    token: params.token,
    stage,
    greetingName: kunya ?? row.guest_display_name,
    initialAnswers: hasDraft ? { ...answers, ...draft } : answers,
    initialStep: hasDraft ? Math.min(3, Math.max(0, row.questionnaire_draft_step ?? 0)) : 0,
    submitted,
    view,
    identity: submitted
      ? {
          full_name: s(answers.full_name),
          honorific: s(answers.honorific),
          kunya: s(answers.kunya),
          pronunciation_notes: s(answers.pronunciation_notes),
        }
      : null,
    updatedSinceLastVisit,
    suggestions: submitted && view ? params.suggestions : [],
  }
}
