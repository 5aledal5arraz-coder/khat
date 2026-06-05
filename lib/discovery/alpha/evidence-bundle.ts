/**
 * Phase Alpha — Evidence bundle curator.
 *
 * The current candidate row stores every URL we touched in
 * `evidence_urls` (the audit trail). The operator card then shows all
 * of them in a long, undifferentiated list. That makes "which source
 * actually proves this person exists?" impossible to answer at a
 * glance.
 *
 * Alpha curates a bounded bundle of 3..5 citations, each annotated:
 *   - Which axis it reinforces (identity / fit / attribute / context)
 *   - A short Arabic note: WHAT this URL supports
 *
 * Selection rules:
 *   1. Always include the strongest identity citation (bio page,
 *      Wikipedia, LinkedIn) when present.
 *   2. Always include any URL containing an explicit nationality or
 *      gender statement.
 *   3. Fill remaining slots by platform diversity — prefer one each
 *      from {bio, video, social, web, podcast} before duplicating.
 *   4. Cap at 5 citations. Audit trail stays in evidence_urls.
 */

import type {
  AlphaAttributeConfidences,
  AlphaEvidenceBundle,
  AlphaEvidenceCitation,
  AlphaPersonClassReport,
  DiscoveryEvidenceUrl,
} from "@/lib/db/schema/discovery"

export interface BundleInput {
  evidence_urls: DiscoveryEvidenceUrl[]
  classifier_report: AlphaPersonClassReport
  attributes: AlphaAttributeConfidences
}

const MAX_CITATIONS = 5

export function curateEvidenceBundle(input: BundleInput): AlphaEvidenceBundle {
  const evidence = input.evidence_urls ?? []
  if (evidence.length === 0) {
    return { citations: [], platform_diversity: 0 }
  }

  const used = new Set<string>()
  const out: AlphaEvidenceCitation[] = []

  // Rule 1 — strongest identity citation
  for (const e of evidence) {
    if (out.length >= MAX_CITATIONS) break
    const url = (e.url ?? "").toLowerCase()
    if (/linkedin\.com\/in\//.test(url)) {
      pushUnique(out, used, citation(e, "identity", "ملف لينكدإن — يثبت الهوية المهنية"))
      break
    }
    if (/wikipedia\.org\/wiki\//.test(url)) {
      pushUnique(out, used, citation(e, "identity", "صفحة ويكيبيديا — ملخص مرجعي للهوية"))
      break
    }
    if (/\/about(\/|$)/.test(url) || /about\.me\//.test(url)) {
      pushUnique(out, used, citation(e, "identity", "صفحة “عن” — السيرة الذاتية الموثّقة"))
      break
    }
  }

  // Rule 2 — explicit attribute statements
  for (const e of evidence) {
    if (out.length >= MAX_CITATIONS) break
    const text = `${e.title ?? ""} ${e.snippet ?? ""}`.toLowerCase()
    if (/كويتي|كويتية|\bkuwaiti\b|\bfrom kuwait\b/i.test(text)) {
      pushUnique(out, used, citation(e, "attribute", "يذكر الجنسية الكويتية صراحةً"))
    }
  }
  for (const e of evidence) {
    if (out.length >= MAX_CITATIONS) break
    const text = `${e.title ?? ""} ${e.snippet ?? ""}`.toLowerCase()
    if (input.attributes.gender.value === "female" && /\bshe (is|has|founded)\b/i.test(text)) {
      pushUnique(out, used, citation(e, "attribute", "ضمائر المؤنث في وصف الشخص"))
    }
    if (input.attributes.gender.value === "male" && /\bhe (is|has|founded)\b/i.test(text)) {
      pushUnique(out, used, citation(e, "attribute", "ضمائر المذكر في وصف الشخص"))
    }
  }

  // Rule 3 — platform diversity, prefer one of each
  const platformOrder = ["youtube", "google_web", "podcast", "instagram", "twitter", "linkedin"]
  for (const platform of platformOrder) {
    if (out.length >= MAX_CITATIONS) break
    const cand = evidence.find(
      (e) => e.platform === platform && !used.has(citationKey(e)),
    )
    if (cand) {
      pushUnique(out, used, citation(cand, "fit", platformNote(platform)))
    }
  }

  // Backfill from any remaining evidence if we're still short
  for (const e of evidence) {
    if (out.length >= MAX_CITATIONS) break
    pushUnique(out, used, citation(e, "context", "سياق إضافي"))
  }

  const platform_diversity = new Set(out.map((c) => c.platform)).size
  return { citations: out, platform_diversity }
}

function citation(
  e: DiscoveryEvidenceUrl,
  axis: AlphaEvidenceCitation["axis"],
  supports: string,
): AlphaEvidenceCitation {
  return {
    platform: e.platform,
    url: e.url,
    title: e.title ?? null,
    supports,
    axis,
  }
}

function citationKey(e: DiscoveryEvidenceUrl): string {
  return `${e.platform}::${e.url}`
}

function pushUnique(
  out: AlphaEvidenceCitation[],
  used: Set<string>,
  c: AlphaEvidenceCitation,
): void {
  const k = `${c.platform}::${c.url}`
  if (used.has(k)) return
  used.add(k)
  out.push(c)
}

function platformNote(platform: string): string {
  switch (platform) {
    case "youtube":
      return "مقطع يوتيوب — صوت الشخص وأسلوبه"
    case "podcast":
      return "حلقة بودكاست — مقابلة مطوّلة"
    case "google_web":
      return "نتيجة ويب — سياق المحتوى المنشور"
    case "instagram":
      return "حساب إنستجرام — صورة وجمهور"
    case "twitter":
      return "حساب إكس — تدفّق آراء حالي"
    case "linkedin":
      return "ملف لينكدإن — مسار مهني"
    default:
      return "مصدر إضافي"
  }
}
