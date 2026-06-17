/**
 * Single source of truth for Arabic episode-phase labels.
 *
 * This map was previously copy-pasted verbatim into three Khat Brain pages
 * (command center, episodes list, EIR workspace). A phase added to
 * `EPISODE_PHASES` had to be relabeled in all three or the UI would show a raw
 * key in one place and a label in another. Centralized here so it's defined —
 * and translated — exactly once. `Record<EpisodePhase, string>` keeps it
 * exhaustive: a new phase is a type error until it's labeled.
 */
import type { EpisodePhase } from "@/lib/db/schema/eir"

export const PHASE_LABEL: Record<EpisodePhase, string> = {
  idea: "فكرة",
  guest_discovery: "اكتشاف ضيف",
  guest_assigned: "ضيف معيّن",
  approved: "معتمدة",
  researching: "قيد البحث",
  prepared: "إعداد جاهز",
  ready_to_record: "جاهزة للتسجيل",
  recording: "قيد التسجيل",
  recorded: "مسجّلة",
  producing: "إنتاج",
  ready_to_publish: "جاهزة للنشر",
  published: "منشورة",
  analyzing: "تحليل",
  learned: "تم التعلّم",
  archived: "مؤرشفة",
}

/** Safe lookup — falls back to the raw phase key if somehow unmapped. */
export function phaseLabel(phase: EpisodePhase): string {
  return PHASE_LABEL[phase] ?? phase
}
