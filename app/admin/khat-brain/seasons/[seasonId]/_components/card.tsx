"use client"

import {
  Check,
  X,
  RefreshCw,
  Sparkles,
  MapPin,
  Clock,
  Loader2,
  UserRound,
  Lightbulb,
  AlertTriangle,
  TrendingUp,
} from "lucide-react"
import type {
  KhatMapEpisodeCandidate,
  KhatMapGuestCandidate,
} from "@/types/khat-map"
import type { CardExplainability } from "@/lib/khat-map/v2/types"

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

  return (
    <div className="group relative overflow-hidden rounded-2xl border border-border/60 bg-card/50 shadow-sm transition-shadow hover:shadow-md">
      {/* Meta row */}
      <div className="flex flex-wrap items-center gap-1.5 border-b border-border/30 px-5 py-2.5 text-[10px]">
        <span className="rounded-md border border-primary/30 bg-primary/5 px-1.5 py-0.5 font-semibold text-primary">
          {domainLabel(topic.topic_domain)}
        </span>
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
        {card.editorial_score !== null && card.editorial_score !== undefined && (
          <span className="ml-auto inline-flex items-center gap-1 rounded-md border border-amber-500/30 bg-amber-500/5 px-1.5 py-0.5 text-amber-400">
            <Sparkles className="h-3 w-3" />
            {card.editorial_score.toFixed(1)}
          </span>
        )}
      </div>

      {/* Title + hook */}
      <div className="px-5 pt-4">
        <h3 className="text-[17px] font-bold leading-snug">
          {topic.working_title}
        </h3>
        {topic.hook && (
          <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">
            {topic.hook}
          </p>
        )}
      </div>

      {/* Why now */}
      {whyNow && (
        <div className="mx-5 mt-3 flex items-start gap-2 rounded-xl border border-border/30 bg-muted/10 p-3">
          <Clock className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-muted-foreground/70" />
          <div>
            <div className="text-[9.5px] font-semibold uppercase tracking-[0.15em] text-muted-foreground/60">
              لماذا الآن
            </div>
            <p className="mt-0.5 text-[12px] leading-relaxed text-foreground/85">
              {whyNow}
            </p>
          </div>
        </div>
      )}

      {/* Key axes */}
      {topic.main_axes && topic.main_axes.length > 0 && (
        <div className="px-5 pt-3">
          <div className="mb-1.5 text-[9.5px] font-semibold uppercase tracking-[0.15em] text-muted-foreground/60">
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
                        ? "border-sky-500/30 bg-sky-500/10 text-sky-300"
                        : "border-pink-500/30 bg-pink-500/10 text-pink-300")
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
        <div className="mx-5 mt-3 rounded-xl border border-dashed border-border/40 bg-muted/5 p-3 text-[11px] text-muted-foreground/70">
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
              <Lightbulb className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-emerald-400" />
              <div className="min-w-0">
                <div className="text-[9.5px] font-semibold uppercase tracking-[0.15em] text-emerald-300/80">
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
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-amber-400" />
              <div className="min-w-0">
                <div className="text-[9.5px] font-semibold uppercase tracking-[0.15em] text-amber-300/80">
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
              <TrendingUp className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-sky-400" />
              <div className="min-w-0">
                <div className="text-[9.5px] font-semibold uppercase tracking-[0.15em] text-sky-300/80">
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
          className="inline-flex items-center gap-1.5 rounded-xl border border-border/60 bg-background/50 px-3 py-2 text-[12px] text-muted-foreground transition-colors hover:border-rose-500/40 hover:bg-rose-500/5 hover:text-rose-400 disabled:opacity-50"
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
      <div className="absolute bottom-1 right-2 text-[9px] text-muted-foreground/40 tabular-nums">
        دفعة {batchIndex}
      </div>
    </div>
  )
}

// ─── Label helpers ───────────────────────────────────────────────────────────

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
