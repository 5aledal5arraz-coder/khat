/**
 * «نسخة الضيف» — the guest-safe projection of a prep.
 *
 * `toGuestPrepView()` is the SECURITY BOUNDARY between the prep (which holds
 * the thesis, tensions, extraction strategy, sensitive zones, host/director
 * guidance, risk levels, question purposes…) and a page any link holder can
 * read. It is an ALLOWLIST: it builds a brand-new object field by field and
 * never spreads, clones or filters the input. A field added to PrepV2Payload
 * therefore cannot reach the guest unless someone writes it in here — and the
 * canary test (tests/guest-link/projection.test.ts) pins the exact key set.
 *
 * `parseGuestPrepView()` re-projects a STORED snapshot on the way out, so a
 * hand-edited or older `published_view` row is held to the same allowlist.
 *
 * Pure — no DB, no I/O — so it is testable in isolation.
 */

import type {
  GuestPrepView,
  GuestPrepViewAxis,
  GuestPrepViewLocation,
} from "@/types/database"
import type {
  PrepV2Payload,
  PrepV2Question,
  QuestionType,
  SectionKind,
} from "@/lib/preparation/v2/types"
import { SECTION_KINDS } from "@/lib/preparation/v2/types"

/** Total sample questions across the whole view (Sara: ≤12). */
export const MAX_SAMPLES_TOTAL = 12
/** Per axis (spec: 2–3). */
export const MAX_SAMPLES_PER_AXIS = 3

/**
 * Guest-friendly names for the STORY arc. The internal labels («المواجهة»,
 * «الذروة العاطفية», «بناء التوتر») describe what the HOST is doing to the
 * guest — exactly what a guest must not read the night before. A course module
 * uses its own title instead.
 */
export const GUEST_STORY_SECTION_LABEL: Record<SectionKind, string> = {
  opening: "البداية والتعارف",
  build_up: "المحطات الأولى",
  conflict: "المنعطفات والقرارات",
  deep_dive: "الغوص في التجربة",
  emotional_peak: "اللي شكّل نظرتك",
  resolution: "الخلاصة والنظرة للأمام",
}

/** Question types that never appear as a guest-facing sample. */
const EXCLUDED_TYPES: ReadonlySet<QuestionType> = new Set(["confrontational", "emotional"])

export interface SampleOverride {
  hidden?: boolean
  pinned?: boolean
  text?: string
}

export type SampleOverrides = Record<string, SampleOverride>

export interface GuestViewLocationInput {
  location_label: string | null
  address: string | null
  map_url: string | null
  house_photo: string | null
}

export interface ToGuestPrepViewInput {
  prep: PrepV2Payload | null
  overrides?: SampleOverrides | null
  schedule_at: Date | string | null
  show_schedule: boolean
  location: GuestViewLocationInput | null
}

/** Server-only map from the opaque refs in the view back to prep ids. */
export interface GuestRefMap {
  axes: Record<string, { section: SectionKind; label: string }>
  samples: Record<string, { question_id: string; axis_ref: string; text: string }>
}

export interface ToGuestPrepViewResult {
  view: GuestPrepView
  refs: GuestRefMap
}

/** Is this question eligible to be shown to the guest at all? */
export function isGuestSafeQuestion(q: PrepV2Question): boolean {
  if (q.risk_level !== "low") return false
  const types = Array.isArray(q.types) ? q.types : []
  if (types.some((t) => EXCLUDED_TYPES.has(t))) return false
  return typeof q.text === "string" && q.text.trim().length > 0
}

function isFormatCourse(prep: PrepV2Payload): boolean {
  return prep.format === "course"
}

/** The label the guest sees for a section. */
export function guestSectionLabel(prep: PrepV2Payload, kind: SectionKind): string {
  if (isFormatCourse(prep)) {
    const title = prep.episode_sections.find((s) => s.kind === kind)?.title?.trim()
    if (title) return title
  }
  return GUEST_STORY_SECTION_LABEL[kind]
}

function str(v: unknown, max: number): string | null {
  if (typeof v !== "string") return null
  const t = v.trim()
  return t ? t.slice(0, max) : null
}

function isoOrNull(v: Date | string | null): string | null {
  if (!v) return null
  const d = v instanceof Date ? v : new Date(v)
  return isNaN(d.getTime()) ? null : d.toISOString()
}

function projectLocation(loc: GuestViewLocationInput | null): GuestPrepViewLocation | null {
  if (!loc) return null
  const out: GuestPrepViewLocation = {
    label: str(loc.location_label, 120),
    address: str(loc.address, 500),
    map_url: str(loc.map_url, 1000),
    has_photo: Boolean(loc.house_photo),
  }
  if (!out.label && !out.address && !out.map_url && !out.has_photo) return null
  return out
}

/**
 * Build the guest view. Order of sections follows the prep; within a section,
 * pinned samples first, then must_ask, then the rest — capped per axis and in
 * total. Sections with no eligible sample are still shown (a heading is not
 * a leak), so the guest sees the whole shape of the conversation.
 */
export function toGuestPrepView(input: ToGuestPrepViewInput): ToGuestPrepViewResult {
  const refs: GuestRefMap = { axes: {}, samples: {} }
  const axes: GuestPrepViewAxis[] = []
  const prep = input.prep
  const overrides = input.overrides ?? {}

  if (prep && Array.isArray(prep.episode_sections)) {
    let total = 0
    let axisN = 0
    let sampleN = 0
    const questions = Array.isArray(prep.question_bank) ? prep.question_bank : []

    for (const section of prep.episode_sections) {
      const kind = section?.kind
      if (!SECTION_KINDS.includes(kind)) continue
      axisN += 1
      const axisRef = `a${axisN}`
      const label = guestSectionLabel(prep, kind)
      refs.axes[axisRef] = { section: kind, label }

      const candidates = questions
        .filter((q) => q.section === kind && isGuestSafeQuestion(q))
        .filter((q) => !overrides[q.id]?.hidden)
        .map((q, i) => ({ q, i }))
        .sort((a, b) => {
          const pa = overrides[a.q.id]?.pinned ? 0 : 1
          const pb = overrides[b.q.id]?.pinned ? 0 : 1
          if (pa !== pb) return pa - pb
          const ma = a.q.priority === "must_ask" ? 0 : 1
          const mb = b.q.priority === "must_ask" ? 0 : 1
          if (ma !== mb) return ma - mb
          return a.i - b.i
        })

      const samples: GuestPrepViewAxis["samples"] = []
      for (const { q } of candidates) {
        if (samples.length >= MAX_SAMPLES_PER_AXIS || total >= MAX_SAMPLES_TOTAL) break
        const text = str(overrides[q.id]?.text, 300) ?? str(q.text, 300)
        if (!text) continue
        sampleN += 1
        const ref = `s${sampleN}`
        samples.push({ ref, text })
        refs.samples[ref] = { question_id: q.id, axis_ref: axisRef, text }
        total += 1
      }

      axes.push({ ref: axisRef, label, samples })
    }
  }

  const view: GuestPrepView = {
    v: 1,
    schedule_at: input.show_schedule ? isoOrNull(input.schedule_at) : null,
    location: projectLocation(input.location),
    axes,
  }
  return { view, refs }
}

/**
 * Re-project a stored snapshot through the same allowlist. Anything that is
 * not exactly the published shape is dropped, never passed through.
 */
export function parseGuestPrepView(raw: unknown): GuestPrepView | null {
  if (!raw || typeof raw !== "object") return null
  const r = raw as Record<string, unknown>
  if (r.v !== 1) return null

  const axesIn = Array.isArray(r.axes) ? r.axes : []
  const axes: GuestPrepViewAxis[] = []
  let total = 0
  for (const a of axesIn.slice(0, SECTION_KINDS.length)) {
    if (!a || typeof a !== "object") continue
    const ax = a as Record<string, unknown>
    const ref = typeof ax.ref === "string" && /^a\d{1,2}$/.test(ax.ref) ? ax.ref : null
    const label = str(ax.label, 120)
    if (!ref || !label) continue
    const samplesIn = Array.isArray(ax.samples) ? ax.samples : []
    const samples: GuestPrepViewAxis["samples"] = []
    for (const s of samplesIn) {
      if (samples.length >= MAX_SAMPLES_PER_AXIS || total >= MAX_SAMPLES_TOTAL) break
      if (!s || typeof s !== "object") continue
      const so = s as Record<string, unknown>
      const sref = typeof so.ref === "string" && /^s\d{1,2}$/.test(so.ref) ? so.ref : null
      const text = str(so.text, 300)
      if (!sref || !text) continue
      samples.push({ ref: sref, text })
      total += 1
    }
    axes.push({ ref, label, samples })
  }

  let location: GuestPrepViewLocation | null = null
  if (r.location && typeof r.location === "object") {
    const l = r.location as Record<string, unknown>
    const mapUrl = str(l.map_url, 1000)
    location = {
      label: str(l.label, 120),
      address: str(l.address, 500),
      // Defence in depth: a stored map link must still be https.
      map_url: mapUrl && mapUrl.startsWith("https://") ? mapUrl : null,
      has_photo: l.has_photo === true,
    }
  }

  const scheduleAt = typeof r.schedule_at === "string" ? isoOrNull(r.schedule_at) : null
  return { v: 1, schedule_at: scheduleAt, location, axes }
}

/** Read a stored ref map defensively (server only). */
export function parseGuestRefMap(raw: unknown): GuestRefMap {
  const out: GuestRefMap = { axes: {}, samples: {} }
  if (!raw || typeof raw !== "object") return out
  const r = raw as Record<string, unknown>
  if (r.axes && typeof r.axes === "object") {
    for (const [k, v] of Object.entries(r.axes as Record<string, unknown>)) {
      const o = v as Record<string, unknown> | null
      if (o && typeof o.label === "string" && SECTION_KINDS.includes(o.section as SectionKind)) {
        out.axes[k] = { section: o.section as SectionKind, label: o.label }
      }
    }
  }
  if (r.samples && typeof r.samples === "object") {
    for (const [k, v] of Object.entries(r.samples as Record<string, unknown>)) {
      const o = v as Record<string, unknown> | null
      if (o && typeof o.question_id === "string" && typeof o.text === "string") {
        out.samples[k] = {
          question_id: o.question_id,
          axis_ref: typeof o.axis_ref === "string" ? o.axis_ref : "",
          text: o.text,
        }
      }
    }
  }
  return out
}

/** Read stored overrides defensively. */
export function parseSampleOverrides(raw: unknown): SampleOverrides {
  const out: SampleOverrides = {}
  if (!raw || typeof raw !== "object") return out
  for (const [id, v] of Object.entries(raw as Record<string, unknown>)) {
    if (!v || typeof v !== "object") continue
    const o = v as Record<string, unknown>
    const entry: SampleOverride = {}
    if (o.hidden === true) entry.hidden = true
    if (o.pinned === true) entry.pinned = true
    if (typeof o.text === "string" && o.text.trim()) entry.text = o.text.trim().slice(0, 300)
    if (Object.keys(entry).length) out[id] = entry
  }
  return out
}
