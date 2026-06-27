/**
 * Editorial enrichment — run the editorial intelligence over already-generated
 * topics (the Guided/hybrid path) and produce the persisted editorial fields.
 *
 * One gpt-4o pass (prompts-enrich.ts) classifies + lenses + headlines + judges
 * each topic. We reuse `assembleEditorial` so the persisted shape is identical
 * to the editorial engine's: `editorial_intel` + `success_score` + the flat
 * `topic_category` / `topic_subcategory` / `main_axes` / `suggested_questions` /
 * `regional_note` columns. Never throws — a failed enrichment leaves the topics
 * as plain candidates (the upgrade degrades gracefully).
 */

import { runAiTask } from "@/lib/ai-router"
import { buildEnrichSystemPrompt, buildEnrichUserPrompt, type EnrichTopicInput } from "./prompts-enrich"
import { assembleEditorial } from "./editorial-assemble"
import { neutralAudienceFit } from "./regional-fit"
import { clampCategory } from "./categories"
import { clampSuccessDimensions } from "./success-score"
import type { RawCandidate, CourtVerdict } from "./types"
import type { KhatMapEditorialIntel } from "@/types/khat-map"

export interface EnrichedTopic {
  topic_category: string | null
  topic_subcategory: string | null
  main_axes: string[]
  suggested_questions: string[]
  regional_note: string | null
  success_score: number
  editorial_intel: KhatMapEditorialIntel
}

/**
 * Enrich a list of topics. Returns a Map keyed by the input `index`. Topics the
 * model failed to enrich are simply absent from the map.
 */
export async function enrichTopicsEditorially(
  seasonId: string | null,
  topics: EnrichTopicInput[],
): Promise<Map<number, EnrichedTopic>> {
  const out = new Map<number, EnrichedTopic>()
  if (topics.length === 0) return out

  try {
    const r = await runAiTask<{ topics?: unknown } | unknown[]>({
      taskKind: "editorial",
      subjectTable: "khat_map_seasons",
      subjectId: seasonId,
      promptVersion: "khat-map-enrich-v1",
      input: { season_id: seasonId, count: topics.length },
      prompt: [
        { role: "system", content: buildEnrichSystemPrompt() },
        { role: "user", content: buildEnrichUserPrompt(topics) },
      ],
      expectJson: true,
      providerOptions: { temperature: 0.5 },
    })
    if (r.status !== "succeeded" || r.parsed == null) return out

    const list = coerceList(r.parsed)
    if (!list) return out

    const byIndex = new Map<number, EnrichTopicInput>()
    for (const t of topics) byIndex.set(t.index, t)

    for (let pos = 0; pos < list.length; pos++) {
      const item = list[pos]
      if (!item || typeof item !== "object") continue
      const o = item as Record<string, unknown>
      // Prefer the model's echoed index; fall back to array position when it is
      // missing or doesn't match an input topic (models drop/renumber indices).
      let index = num(o.index)
      if (index === null || !byIndex.has(index)) index = pos
      const src = byIndex.get(index)
      if (!src) continue

      const category = clampCategory(str(o.category))
      const main_axes = strArr(o.main_axes)
      const suggested_questions = strArr(o.suggested_questions)
      const regional_note = optStr(o.regional_note)

      // Build a synthetic RawCandidate from the enrichment's generation fields…
      const raw: RawCandidate = {
        topic: {
          working_title: src.title,
          hook: src.hook,
          why_matters: src.why_it_matters,
          why_now: src.why_now,
          goal: "",
          description: src.conflict_angle,
          episode_type: "signature_khat",
          topic_domain: "none",
          topic_angle_code: null,
          main_axes,
          suggested_questions,
          risk_level: null,
          effort_level: null,
          sponsor_appeal: null,
          category,
          audience_fit: neutralAudienceFit(),
          regional_note,
          viral_angle: optStr(o.viral_angle),
          debate_axis: optStr(o.debate_axis),
          subcategory: optStr(o.subcategory),
          lenses: strArr(o.lenses),
          global_note: optStr(o.global_note),
          why_this_topic: optStr(o.why_this_topic),
          titles: o.titles ?? null,
          success: o.success ?? null,
          guest_idea: null,
        },
        guest: null,
        editorial_score: 7,
        why_now: src.why_now,
        domain_reasoning: null,
      }
      // …and a CourtVerdict from the enrichment's judgment fields.
      const verdict: CourtVerdict = {
        index,
        verdict: "accept",
        success: clampSuccessDimensions(o.success),
        why_succeed: optStr(o.why_succeed),
        why_fail: optStr(o.why_fail),
        is_overdone: o.is_overdone === true,
        reference_potential: o.reference_potential === true,
        clip_potential: o.clip_potential === true,
        recommended_title: null,
        recommended_reason: null,
      }

      const assembled = assembleEditorial(raw, verdict)
      out.set(index, {
        topic_category: category,
        topic_subcategory: assembled.subcategory,
        main_axes,
        suggested_questions,
        regional_note,
        success_score: assembled.success_score,
        editorial_intel: assembled.editorial_intel,
      })
    }
  } catch (err) {
    console.error("[khat-map] editorial enrichment failed; topics stay plain", err)
  }
  return out
}

// ─── tiny coercers ───────────────────────────────────────────────────────────

function isEnrichedObject(v: unknown): boolean {
  if (!v || typeof v !== "object" || Array.isArray(v)) return false
  const o = v as Record<string, unknown>
  // An enriched topic carries at least one of these keys.
  return "index" in o || "category" in o || "titles" in o || "success" in o
}

function coerceList(parsed: unknown): unknown[] | null {
  if (Array.isArray(parsed)) return parsed
  if (!parsed || typeof parsed !== "object") return null
  const o = parsed as Record<string, unknown>
  // Preferred wrapper.
  if (Array.isArray(o.topics)) return o.topics
  // The model sometimes returns a SINGLE enriched object (json_object mode) —
  // wrap it so a one-topic batch still enriches.
  if (isEnrichedObject(o)) return [o]
  // Otherwise: the first array of OBJECTS (never a string array like `lenses`).
  for (const v of Object.values(o)) {
    if (Array.isArray(v) && v.some((x) => x && typeof x === "object")) return v
  }
  return null
}
function num(v: unknown): number | null {
  const n = Number(v)
  return Number.isFinite(n) ? Math.round(n) : null
}
function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null
}
function optStr(v: unknown): string | null {
  return str(v)
}
function strArr(v: unknown): string[] {
  if (!Array.isArray(v)) return []
  return v.filter((x): x is string => typeof x === "string" && x.trim().length > 0)
}
