"use client"

import type { ElementType } from "react"
import {
  Check,
  X,
  RefreshCw,
  MapPin,
  Clock,
  Loader2,
  UserRound,
  Lightbulb,
  AlertTriangle,
  TrendingUp,
  Target,
  Globe2,
  Aperture,
  Type as TypeIcon,
  MessagesSquare,
  HelpCircle,
  Flame,
  ThumbsDown,
  ThumbsUp,
  Scissors,
  BookMarked,
  RotateCcw,
} from "lucide-react"
import type {
  KhatMapEpisodeCandidate,
  KhatMapGuestCandidate,
} from "@/types/khat-map"
import type { CardExplainability } from "@/lib/khat-map/v2/types"
import { categoryById } from "@/lib/khat-map/v2/categories"
import { successBand } from "@/lib/khat-map/v2/success-score"

export interface PendingCard {
  topic: KhatMapEpisodeCandidate
  guest: KhatMapGuestCandidate | null
  /** Optional — present when the card came straight from a BatchResult. */
  why_now?: string | null
  why_fit_you?: string | null
  editorial_score?: number | null
  taste_alignment?: number | null
  /** Deterministic Arabic explainers — present on every fresh batch card. */
  explainability?: CardExplainability | null
}

export function WizardCard({
  card,
  batchIndex,
  pending,
  onAccept,
  onReject,
  onAlternative,
  hideGuestBlock = false,
}: {
  card: PendingCard
  batchIndex: number
  pending: boolean
  onAccept: () => void
  onReject: () => void
  onAlternative: () => void
  /**
   * Phase A topics-only mode. When `true`, the guest block (including
   * the "no guest" placeholder) is omitted entirely so the operator
   * focuses on the topic. Set by the wizard when the season is in
   * `wizard_stage === "topics"`.
   */
  hideGuestBlock?: boolean
}) {
  const topic = card.topic
  const guest = card.guest
  const whyNow = card.why_now ?? topic.why_now
  const whyFitYou = card.why_fit_you ?? null
  // Editorial intelligence (the upgrade) — null on legacy / audience / Phase B cards.
  const intel = topic.editorial_intel
  const headline = intel?.recommended_title || topic.working_title
  const altTitles = (intel?.titles ?? []).filter((t) => t.text && t.text !== headline)
  const dims = intel?.success_dimensions ?? null
  const successScore = topic.success_score
  const band = successScore != null ? successBand(successScore) : null

  return (
    <div className="group relative overflow-hidden rounded-2xl border border-border/60 bg-card/50 shadow-sm transition-shadow hover:shadow-md">
      {/* Meta row */}
      <div className="flex flex-wrap items-center gap-1.5 border-b border-border/30 px-5 py-2.5 text-[10px]">
        <span className="rounded-md border border-primary/30 bg-primary/5 px-1.5 py-0.5 font-semibold text-primary">
          {topic.topic_category
            ? categoryLabel(topic.topic_category)
            : domainLabel(topic.topic_domain)}
        </span>
        {intel?.subcategory_label && (
          <span className="rounded-md border border-primary/20 bg-primary/[0.03] px-1.5 py-0.5 text-primary/80">
            {intel.subcategory_label}
          </span>
        )}
        <span className="rounded-md border border-border/40 bg-muted/30 px-1.5 py-0.5 text-muted-foreground">
          {episodeTypeLabel(topic.episode_type)}
        </span>
        {topic.topic_angle_code && (
          <span
            className="rounded-md border border-border/40 bg-muted/30 px-1.5 py-0.5 text-muted-foreground/80"
            dir="ltr"
          >
            {topic.topic_angle_code}
          </span>
        )}
        {/* Success Probability (editorial path) — falls back to RAF composite. */}
        {successScore != null ? (
          <span
            className={
              "ml-auto inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 font-bold tabular-nums " +
              bandClasses(band)
            }
            title="احتمالية النجاح (0-100، داخلي)"
          >
            <Target className="h-3 w-3" />
            {Math.round(successScore)}
          </span>
        ) : (
          topic.composite_score != null && (
            <span
              className="ml-auto inline-flex items-center gap-1 rounded-md border border-indigo-500/30 bg-indigo-500/5 px-1.5 py-0.5 font-semibold text-indigo-700"
              title="ملاءمة جمهور الخليج (داخلي)"
            >
              <Target className="h-3 w-3" />
              {topic.composite_score.toFixed(1)}
            </span>
          )
        )}
      </div>

      {/* Title + hook */}
      <div className="px-5 pt-4">
        <h3 className="text-[17px] font-bold leading-snug">{headline}</h3>
        {intel?.recommended_reason && (
          <p className="mt-1 inline-flex items-start gap-1 text-[10.5px] leading-relaxed text-primary/70">
            <TypeIcon className="mt-0.5 h-3 w-3 flex-shrink-0" />
            {intel.recommended_reason}
          </p>
        )}
        {topic.hook && (
          <p className="mt-1.5 text-[12px] leading-relaxed text-muted-foreground">
            {topic.hook}
          </p>
        )}
        {/* Alternative title options from the headline layer. */}
        {altTitles.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {altTitles.map((t, i) => (
              <span
                key={i}
                className="rounded-md border border-border/40 bg-background/40 px-1.5 py-0.5 text-[10px] text-muted-foreground/90"
                title={`عنوان ${t.label_ar}`}
              >
                <span className="text-muted-foreground/50">{t.label_ar}:</span> {t.text}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Why now */}
      {whyNow && (
        <div className="mx-5 mt-3 flex items-start gap-2 rounded-xl border border-border/30 bg-muted/10 p-3">
          <Clock className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-muted-foreground" />
          <div>
            <div className="text-[9.5px] font-semibold uppercase tracking-[0.15em] text-muted-foreground">
              لماذا الآن
            </div>
            <p className="mt-0.5 text-[12px] leading-relaxed text-foreground/85">
              {whyNow}
            </p>
          </div>
        </div>
      )}

      {/* Regional fit note — admin-internal "why it lands in the GCC". */}
      {topic.regional_note && (
        <div className="mx-5 mt-3 flex items-start gap-2 rounded-xl border border-indigo-500/20 bg-indigo-500/5 p-3">
          <Globe2 className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-indigo-700" />
          <div>
            <div className="text-[9.5px] font-semibold uppercase tracking-[0.15em] text-indigo-700/80">
              ملاءمة جمهور الخليج
            </div>
            <p className="mt-0.5 text-[12px] leading-relaxed text-foreground/85">
              {topic.regional_note}
            </p>
          </div>
        </div>
      )}

      {/* Key axes */}
      {topic.main_axes && topic.main_axes.length > 0 && (
        <div className="px-5 pt-3">
          <div className="mb-1.5 text-[9.5px] font-semibold uppercase tracking-[0.15em] text-muted-foreground">
            المحاور
          </div>
          <div className="flex flex-wrap gap-1">
            {topic.main_axes.slice(0, 5).map((axis, i) => (
              <span
                key={i}
                className="rounded-md border border-border/40 bg-background/50 px-1.5 py-0.5 text-[10px] text-muted-foreground"
              >
                {axis}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* ─── Editorial intelligence (the upgrade) ─── */}
      {intel && (
        <div className="mx-5 mt-3 space-y-2.5">
          {/* Thinking lenses */}
          {intel.lens_labels.length > 0 && (
            <div>
              <div className="mb-1 flex items-center gap-1 text-[9.5px] font-semibold uppercase tracking-[0.15em] text-muted-foreground">
                <Aperture className="h-3 w-3" /> عدسات التفكير
              </div>
              <div className="flex flex-wrap gap-1">
                {intel.lens_labels.map((l, i) => (
                  <span
                    key={i}
                    className="rounded-md border border-violet-500/25 bg-violet-500/5 px-1.5 py-0.5 text-[10px] text-violet-700"
                  >
                    {l}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Debate axis + viral angle */}
          {intel.debate_axis && (
            <MiniNote icon={MessagesSquare} tone="rose" label="محور الجدل" text={intel.debate_axis} />
          )}
          {intel.viral_angle && (
            <MiniNote icon={Flame} tone="orange" label="زاوية الانتشار" text={intel.viral_angle} />
          )}

          {/* Global reach note (regional note is rendered above) */}
          {intel.global_note && (
            <MiniNote icon={Globe2} tone="sky" label="الصلة العالمية" text={intel.global_note} />
          )}

          {/* Suggested questions */}
          {topic.suggested_questions && topic.suggested_questions.length > 0 && (
            <div className="rounded-xl border border-border/30 bg-muted/10 p-2.5">
              <div className="mb-1 flex items-center gap-1 text-[9.5px] font-semibold uppercase tracking-[0.15em] text-muted-foreground">
                <HelpCircle className="h-3 w-3" /> أسئلة مقترحة
              </div>
              <ul className="space-y-0.5 text-[11.5px] leading-relaxed text-foreground/80">
                {topic.suggested_questions.slice(0, 5).map((q, i) => (
                  <li key={i}>• {q}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Self-critique: why this topic */}
          {intel.why_this_topic && (
            <MiniNote icon={Lightbulb} tone="emerald" label="لماذا هذا الموضوع" text={intel.why_this_topic} />
          )}

          {/* Editorial Court verdict: why succeed / why fail */}
          {(intel.why_succeed || intel.why_fail) && (
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {intel.why_succeed && (
                <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-2.5">
                  <div className="mb-0.5 flex items-center gap-1 text-[9.5px] font-semibold uppercase tracking-[0.12em] text-emerald-700/80">
                    <ThumbsUp className="h-3 w-3" /> لماذا قد تنجح
                  </div>
                  <p className="text-[11.5px] leading-relaxed text-foreground/85">{intel.why_succeed}</p>
                </div>
              )}
              {intel.why_fail && (
                <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-2.5">
                  <div className="mb-0.5 flex items-center gap-1 text-[9.5px] font-semibold uppercase tracking-[0.12em] text-amber-700/80">
                    <ThumbsDown className="h-3 w-3" /> لماذا قد تفشل
                  </div>
                  <p className="text-[11.5px] leading-relaxed text-foreground/85">{intel.why_fail}</p>
                </div>
              )}
            </div>
          )}

          {/* Signal chips: court flags + indicators */}
          <div className="flex flex-wrap items-center gap-1">
            {intel.is_overdone && (
              <Chip icon={RotateCcw} tone="rose" label="مُستهلك" />
            )}
            {intel.reference_potential && (
              <Chip icon={BookMarked} tone="indigo" label="حلقة مرجعية" />
            )}
            {intel.clip_potential && (
              <Chip icon={Scissors} tone="violet" label="قابلة للمقاطع" />
            )}
            {dims?.guest_potential != null && (
              <Chip tone="slate" label={`ضيف ${Math.round(dims.guest_potential)}/10`} />
            )}
            {topic.risk_level && (
              <Chip tone="slate" label={`جرأة: ${riskLabel(topic.risk_level)}`} />
            )}
            {topic.effort_level && (
              <Chip tone="slate" label={`جهد: ${effortLabel(topic.effort_level)}`} />
            )}
            {topic.sponsor_appeal && (
              <Chip tone="slate" label={`رعاية: ${sponsorLabel(topic.sponsor_appeal)}`} />
            )}
          </div>

          {/* Guest idea sketch (Phase A — not a booking) */}
          {intel.guest_idea && (
            <MiniNote icon={UserRound} tone="slate" label="ضيف محتمل (فكرة)" text={intel.guest_idea} />
          )}
        </div>
      )}

      {/* Guest block — suppressed entirely in Phase A. */}
      {!hideGuestBlock && (guest ? (
        <div className="mx-5 mt-3 rounded-xl border border-border/40 bg-background/40 p-3">
          <div className="flex items-start gap-2">
            <div className="rounded-lg bg-muted/40 p-1.5">
              <UserRound className="h-3.5 w-3.5 text-muted-foreground" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-[13px] font-semibold">{guest.full_name}</span>
                {guest.gender !== "unknown" && (
                  <span
                    className={
                      "rounded-md border px-1.5 py-0.5 text-[9px] font-semibold " +
                      (guest.gender === "male"
                        ? "border-sky-500/30 bg-sky-500/10 text-sky-700"
                        : "border-pink-500/30 bg-pink-500/10 text-pink-700")
                    }
                  >
                    {guest.gender === "male" ? "ذكر" : "أنثى"}
                  </span>
                )}
                {guest.profession && (
                  <span className="rounded-md bg-muted/40 px-1.5 py-0.5 text-[9px] text-muted-foreground">
                    {guest.profession}
                  </span>
                )}
                {guest.country && (
                  <span className="inline-flex items-center gap-0.5 rounded-md bg-muted/40 px-1.5 py-0.5 text-[9px] text-muted-foreground">
                    <MapPin className="h-2.5 w-2.5" />
                    {guest.country}
                  </span>
                )}
              </div>
              {guest.why_fit && (
                <p className="mt-1 text-[11.5px] leading-relaxed text-muted-foreground">
                  {guest.why_fit}
                </p>
              )}
            </div>
          </div>
        </div>
      ) : (
        <div className="mx-5 mt-3 rounded-xl border border-dashed border-border/40 bg-muted/5 p-3 text-[11px] text-muted-foreground">
          لا ضيف مقترح لهذه الحلقة — النظام اعتبرها حلقة فردية.
        </div>
      ))}

      {/* Why this fits YOU — personalization, hidden when no taste signal */}
      {whyFitYou && (
        <div className="mx-5 mt-3 rounded-xl border border-primary/20 bg-primary/5 p-3">
          <div className="text-[9.5px] font-semibold uppercase tracking-[0.15em] text-primary/80">
            يناسب ذوقك
          </div>
          <p className="mt-0.5 text-[12px] leading-relaxed text-foreground/85">
            {whyFitYou}
          </p>
        </div>
      )}

      {/* Explainability — deterministic blurbs derived from scoring signals */}
      {card.explainability && (
        <div className="mx-5 mt-3 space-y-2">
          {card.explainability.why_suggested && (
            <div className="flex items-start gap-2 rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-2.5">
              <Lightbulb className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-emerald-700" />
              <div className="min-w-0">
                <div className="text-[9.5px] font-semibold uppercase tracking-[0.15em] text-emerald-700/80">
                  لماذا اقتُرحت
                </div>
                <p className="mt-0.5 text-[12px] leading-relaxed text-foreground/85">
                  {card.explainability.why_suggested}
                </p>
              </div>
            </div>
          )}
          {card.explainability.risks.length > 0 && (
            <div className="flex items-start gap-2 rounded-xl border border-amber-500/20 bg-amber-500/5 p-2.5">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-amber-700" />
              <div className="min-w-0">
                <div className="text-[9.5px] font-semibold uppercase tracking-[0.15em] text-amber-700/80">
                  مخاطر
                </div>
                <ul className="mt-0.5 space-y-0.5 text-[12px] leading-relaxed text-foreground/85">
                  {card.explainability.risks.map((r, i) => (
                    <li key={i}>• {r}</li>
                  ))}
                </ul>
              </div>
            </div>
          )}
          {card.explainability.expected_outcome && (
            <div className="flex items-start gap-2 rounded-xl border border-sky-500/20 bg-sky-500/5 p-2.5">
              <TrendingUp className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-sky-700" />
              <div className="min-w-0">
                <div className="text-[9.5px] font-semibold uppercase tracking-[0.15em] text-sky-700/80">
                  توقّع الأداء
                </div>
                <p className="mt-0.5 text-[12px] leading-relaxed text-foreground/85">
                  {card.explainability.expected_outcome}
                </p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Actions */}
      <div className="mt-4 flex items-center gap-2 border-t border-border/30 px-5 py-3">
        <button
          type="button"
          onClick={onReject}
          disabled={pending}
          className="inline-flex items-center gap-1.5 rounded-xl border border-border/60 bg-background/50 px-3 py-2 text-[12px] text-muted-foreground transition-colors hover:border-rose-500/40 hover:bg-rose-500/5 hover:text-rose-700 disabled:opacity-50"
        >
          <X className="h-3.5 w-3.5" />
          رفض
        </button>
        <button
          type="button"
          onClick={onAlternative}
          disabled={pending}
          className="inline-flex items-center gap-1.5 rounded-xl border border-border/60 bg-background/50 px-3 py-2 text-[12px] text-muted-foreground transition-colors hover:border-border hover:text-foreground disabled:opacity-50"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          بديل
        </button>
        <button
          type="button"
          onClick={onAccept}
          disabled={pending}
          className="ml-auto inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2 text-[12px] font-semibold text-white shadow-sm transition-opacity hover:opacity-90 disabled:opacity-60"
        >
          {pending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Check className="h-3.5 w-3.5" />
          )}
          قبول
        </button>
      </div>

      {/* Batch index footer (subtle) */}
      <div className="absolute bottom-1 right-2 text-[9px] text-muted-foreground tabular-nums">
        دفعة {batchIndex}
      </div>
    </div>
  )
}

// ─── Editorial UI primitives ─────────────────────────────────────────────────

const NOTE_TONES: Record<string, string> = {
  rose: "border-rose-500/20 bg-rose-500/5 text-rose-700",
  orange: "border-orange-500/20 bg-orange-500/5 text-orange-700",
  sky: "border-sky-500/20 bg-sky-500/5 text-sky-700",
  emerald: "border-emerald-500/20 bg-emerald-500/5 text-emerald-700",
  slate: "border-border/30 bg-muted/10 text-muted-foreground",
}

function MiniNote({
  icon: Icon,
  tone,
  label,
  text,
}: {
  icon: ElementType
  tone: keyof typeof NOTE_TONES | string
  label: string
  text: string
}) {
  const cls = NOTE_TONES[tone] ?? NOTE_TONES.slate
  return (
    <div className={"flex items-start gap-2 rounded-xl border p-2.5 " + cls}>
      <Icon className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
      <div className="min-w-0">
        <div className="text-[9.5px] font-semibold uppercase tracking-[0.12em] opacity-80">
          {label}
        </div>
        <p className="mt-0.5 text-[11.5px] leading-relaxed text-foreground/85">{text}</p>
      </div>
    </div>
  )
}

const CHIP_TONES: Record<string, string> = {
  rose: "border-rose-500/30 bg-rose-500/10 text-rose-700",
  indigo: "border-indigo-500/30 bg-indigo-500/10 text-indigo-700",
  violet: "border-violet-500/30 bg-violet-500/10 text-violet-700",
  slate: "border-border/50 bg-muted/30 text-muted-foreground",
}

function Chip({
  icon: Icon,
  tone,
  label,
}: {
  icon?: ElementType
  tone: keyof typeof CHIP_TONES | string
  label: string
}) {
  const cls = CHIP_TONES[tone] ?? CHIP_TONES.slate
  return (
    <span className={"inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-medium " + cls}>
      {Icon && <Icon className="h-2.5 w-2.5" />}
      {label}
    </span>
  )
}

function bandClasses(band: string | null): string {
  switch (band) {
    case "exceptional":
      return "border-emerald-500/40 bg-emerald-500/10 text-emerald-700"
    case "strong":
      return "border-sky-500/40 bg-sky-500/10 text-sky-700"
    case "solid":
      return "border-amber-500/40 bg-amber-500/10 text-amber-700"
    default:
      return "border-rose-500/40 bg-rose-500/10 text-rose-700"
  }
}

function riskLabel(r: string): string {
  const map: Record<string, string> = {
    safe: "آمنة",
    medium: "متوسطة",
    bold: "جريئة",
    highly_sensitive: "حسّاسة جداً",
  }
  return map[r] ?? r
}
function effortLabel(e: string): string {
  const map: Record<string, string> = {
    easy: "سهل",
    medium: "متوسط",
    hard: "صعب",
    requires_special: "خاص",
  }
  return map[e] ?? e
}
function sponsorLabel(s: string): string {
  const map: Record<string, string> = { low: "منخفضة", medium: "متوسطة", high: "عالية" }
  return map[s] ?? s
}

// ─── Label helpers ───────────────────────────────────────────────────────────

function categoryLabel(id: string): string {
  return categoryById(id)?.label_ar ?? id
}

function domainLabel(d: string): string {
  const map: Record<string, string> = {
    philosophy: "فلسفة",
    psychology: "علم نفس",
    relationships: "علاقات",
    religion: "دين",
    identity_masculinity: "هوية ورجولة",
    money_career: "مال ومهنة",
    technology_ai: "تقنية",
    internet_culture: "ثقافة إنترنت",
    crime_mystery: "جريمة وغموض",
    hidden_history: "تاريخ خفي",
    power_manipulation: "سلطة وتلاعب",
    parenting: "تربية",
    kuwait_gulf: "كويت / خليج",
    historical: "تاريخي",
    social_issues: "قضايا اجتماعية",
    modern_society: "مجتمع حديث",
    emotions_inner_life: "عواطف داخلية",
    none: "متعدد",
  }
  return map[d] ?? d
}

function episodeTypeLabel(t: string): string {
  const map: Record<string, string> = {
    intellectual: "فكرية",
    social: "اجتماعية",
    psychological: "نفسية",
    personal_story: "قصة شخصية",
    national: "وطنية",
    historical: "تاريخية",
    economic: "اقتصادية",
    controversial: "جريئة",
    inspirational: "ملهمة",
    mass_audience: "جماهيرية",
    signature_khat: "خط موقّعة",
    invasion: "غزو",
  }
  return map[t] ?? t
}
