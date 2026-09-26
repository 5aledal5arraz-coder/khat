/**
 * «نسخة الضيف» → prep generation.
 *
 * The guest's own questionnaire answers, as an OPTIONAL input to Pass 1
 * (research) and Pass 4 (critique):
 *   - "excited about" → steers the axes and the must-ask picks,
 *   - "avoid"         → becomes a sensitive zone (never asked, never shown to
 *                       the guest — sensitive_zones are outside the guest
 *                       projection),
 *   - kunya           → how the host addresses the guest, for host guidance.
 *
 * GATED: every prompt change is conditional on `hasGuestPreferences()`. A prep
 * with no submitted questionnaire sends byte-identical prompts — pinned by the
 * story SHA test in tests/preparation/prep-v2-course-format.test.ts.
 */

import { and, desc, eq, isNotNull, isNull } from "drizzle-orm"
import { db } from "@/lib/db"
import { guestEpisodeLinks } from "@/lib/db/schema/guest-episode-links"

export interface GuestPreferences {
  excited_about: string | null
  avoid: string | null
  kunya: string | null
}

const MAX = 600

function clip(v: unknown): string | null {
  if (typeof v !== "string") return null
  const t = v.trim()
  return t ? t.slice(0, MAX) : null
}

export function hasGuestPreferences(p: GuestPreferences | null | undefined): p is GuestPreferences {
  return Boolean(p && (p.excited_about || p.avoid || p.kunya))
}

/** Pure mapping from a stored questionnaire. */
export function guestPreferencesFromQuestionnaire(q: unknown): GuestPreferences | null {
  if (!q || typeof q !== "object") return null
  const r = q as Record<string, unknown>
  const prefs: GuestPreferences = {
    excited_about: clip(r.topics_excited_about),
    avoid: clip(r.sensitivities_to_avoid),
    kunya: clip(r.kunya),
  }
  return hasGuestPreferences(prefs) ? prefs : null
}

/** The latest SUBMITTED questionnaire on a live link for this EIR, if any. */
export async function loadGuestPreferences(eirId: string | null): Promise<GuestPreferences | null> {
  if (!eirId || !db) return null
  try {
    const rows = await db
      .select({ questionnaire: guestEpisodeLinks.questionnaire })
      .from(guestEpisodeLinks)
      .where(
        and(
          eq(guestEpisodeLinks.eir_id, eirId),
          isNull(guestEpisodeLinks.revoked_at),
          isNotNull(guestEpisodeLinks.questionnaire_submitted_at),
        ),
      )
      .orderBy(desc(guestEpisodeLinks.questionnaire_submitted_at))
      .limit(1)
    return guestPreferencesFromQuestionnaire(rows?.[0]?.questionnaire ?? null)
  } catch (err) {
    // Preferences are an enrichment; their absence must never fail a prep.
    console.warn(
      "[prep-v2] guest preferences unavailable (non-fatal):",
      err instanceof Error ? err.message : err,
    )
    return null
  }
}

/** Prompt block for Pass 1 (appended to the user message only when present). */
export function guestPreferencesResearchBlock(p: GuestPreferences): string[] {
  return [
    "",
    "The guest's OWN answers from our questionnaire (binding):",
    ...(p.excited_about
      ? [`- Excited to talk about: ${p.excited_about}`, "  → Let this shape at least two axes."]
      : []),
    ...(p.avoid
      ? [
          `- Asked us to avoid: ${p.avoid}`,
          "  → List this in sensitive_zones. It must never become an axis or a question.",
        ]
      : []),
    ...(p.kunya ? [`- Kunya (how the host addresses him in conversation): ${p.kunya}`] : []),
  ]
}

/** Prompt block for Pass 4 (appended to the user message only when present). */
export function guestPreferencesCritiqueBlock(p: GuestPreferences): string[] {
  return [
    "",
    "The guest's OWN answers from our questionnaire (binding):",
    ...(p.excited_about
      ? [`- Excited to talk about: ${p.excited_about} → prefer must_ask questions that open these.`]
      : []),
    ...(p.avoid ? [`- Asked us to avoid: ${p.avoid} → drop or rewrite any question that touches it.`] : []),
    ...(p.kunya
      ? [`- Kunya: ${p.kunya} → host_guidance should have the host address the guest by it.`]
      : []),
  ]
}

/** Deterministic: the guest's "avoid" is always a sensitive zone, whatever the model did. */
export function withGuestAvoidZone(zones: string[], p: GuestPreferences | null | undefined): string[] {
  if (!p?.avoid) return zones
  const zone = `طلب الضيف تجنّب: ${p.avoid}`
  return zones.includes(zone) ? zones : [...zones, zone]
}
