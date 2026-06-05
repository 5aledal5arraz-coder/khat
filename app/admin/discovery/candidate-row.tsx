"use client"

import { useTransition } from "react"
import {
  CheckCircle2,
  XCircle,
  Bookmark,
  ExternalLink,
  Sparkles,
  ShieldCheck,
  ShieldQuestion,
  Gem,
} from "lucide-react"
import {
  promoteCandidateAction,
  rejectCandidateAction,
  saveCandidateForLaterAction,
} from "./actions"
import type { DiscoveryCandidateRecord } from "@/lib/discovery"

export function CandidateRow({ candidate }: { candidate: DiscoveryCandidateRecord }) {
  const [pending, startTransition] = useTransition()
  const isAlpha = candidate.pipeline_version === "alpha"
  // Alpha rows surface recommendation_score; legacy rows fall back to
  // composite_score so the operator card keeps a single "top number"
  // regardless of which pipeline produced the row.
  const score = isAlpha
    ? candidate.recommendation_score
    : candidate.composite_score
  const scoreLabel = score === null ? "—" : score.toFixed(2)
  // Alpha display_name is the cleaned, operator-facing label; falls
  // back to legacy proposed_name on non-Alpha rows.
  const headerName =
    candidate.display_name ?? candidate.proposed_name ?? "(no name)"

  return (
    <div
      className={
        "rounded-xl border bg-card/40 p-4 transition-opacity " +
        (candidate.status === "rejected" ? "opacity-50" : "") +
        (candidate.status === "promoted" ? "border-emerald-500/30" : "border-border/30")
      }
    >
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-[14px] font-bold">{headerName}</h3>
            {candidate.archetype && (
              <span className="rounded-md border border-primary/30 bg-primary/5 px-1.5 py-0.5 text-[10px] text-primary">
                {candidate.archetype.name}
              </span>
            )}
            {isAlpha && (
              <span
                className="inline-flex items-center gap-1 rounded-md border border-violet-500/30 bg-violet-500/5 px-1.5 py-0.5 text-[10px] text-violet-300"
                title="Khat Guest Discovery v2"
              >
                <Sparkles className="h-2.5 w-2.5" />
                Alpha
              </span>
            )}
            <StatusBadge status={candidate.status} />
          </div>
          {candidate.proposed_role && (
            <div className="mt-0.5 text-[11px] text-muted-foreground">
              {candidate.proposed_role}
              {candidate.proposed_country && ` — ${candidate.proposed_country}`}
            </div>
          )}

          {/*
            Phase Alpha — identity + attribute badges. These are the
            "trust spine" of the new card: every Alpha row carries
            visible confidence on (a) is this a person? and (b) what
            attributes do we trust? Operators decide based on numbers
            they can see, not on the model's silent inferences.
          */}
          {isAlpha && (
            <div
              className="mt-2 flex flex-wrap items-center gap-1.5 text-[10px]"
              dir="rtl"
            >
              {candidate.identity_confidence !== null && (
                <span
                  className={
                    "inline-flex items-center gap-1 rounded-md border bg-background/40 px-1.5 py-0.5 " +
                    (candidate.identity_confidence >= 0.85
                      ? "border-emerald-500/30 text-emerald-300"
                      : candidate.identity_confidence >= 0.6
                        ? "border-amber-500/30 text-amber-300"
                        : "border-rose-500/30 text-rose-300")
                  }
                  title="ثقة الهوية — احتمالية أن يكون هذا شخصاً حقيقياً"
                >
                  <ShieldCheck className="h-2.5 w-2.5" />
                  هوية {(candidate.identity_confidence * 100).toFixed(0)}%
                </span>
              )}
              {candidate.attribute_confidences?.nationality && (
                <AttributeBadge
                  label="الجنسية"
                  value={
                    candidate.attribute_confidences.nationality.value === "kuwaiti"
                      ? "كويتي"
                      : candidate.attribute_confidences.nationality.value === "non_kuwaiti"
                        ? "غير كويتي"
                        : "غير محدّد"
                  }
                  confidence={candidate.attribute_confidences.nationality.confidence}
                />
              )}
              {candidate.attribute_confidences?.gender && (
                <AttributeBadge
                  label="الجنس"
                  value={
                    candidate.attribute_confidences.gender.value === "male"
                      ? "ذكر"
                      : candidate.attribute_confidences.gender.value === "female"
                        ? "أنثى"
                        : "غير محدّد"
                  }
                  confidence={candidate.attribute_confidences.gender.confidence}
                />
              )}
              {candidate.hidden_gem_score !== null && (
                <span
                  className="inline-flex items-center gap-1 rounded-md border border-sky-500/30 bg-sky-500/5 px-1.5 py-0.5 text-sky-300"
                  title="مؤشر الجوهرة المخفية"
                >
                  <Gem className="h-2.5 w-2.5" />
                  جوهرة {(candidate.hidden_gem_score * 100).toFixed(0)}%
                </span>
              )}
            </div>
          )}

          {candidate.evidence_summary?.why_they_matter && (
            <p className="mt-2 text-[12px] leading-relaxed text-foreground/85">
              {candidate.evidence_summary.why_they_matter}
            </p>
          )}
        </div>

        {/*
          CR-4 — Scores panel.
          Was: 5 rows always rendered with "—" when null. Operators read
          that as "broken." Now: only render rows that have a real value;
          if NO scores exist, show an honest "بانتظار التقييم" pill so
          the operator understands scoring hasn't run yet rather than
          mistaking absent data for zero-confidence candidates.
        */}
        {(() => {
          // Alpha rows expose four operator-facing axes:
          //   • ملاءمة (editorial_fit)
          //   • جوهرة (hidden_gem)
          //   • هوية (identity_confidence)
          //   • أدلّة (evidence_strength)
          // Legacy rows keep their existing four-axis breakdown.
          const rows: Array<{ label: string; value: number | null }> = isAlpha
            ? [
                { label: "ملاءمة", value: candidate.editorial_fit_score },
                { label: "جوهرة", value: candidate.hidden_gem_score },
                { label: "هوية", value: candidate.identity_confidence },
                { label: "أدلّة", value: candidate.evidence_strength_score },
              ]
            : [
                { label: "ملاءمة", value: candidate.editorial_fit_score },
                { label: "خفاء", value: candidate.hiddenness_score },
                { label: "أدلّة", value: candidate.evidence_strength_score },
                { label: "جدّة", value: candidate.novelty_score },
              ]
          const hasAny =
            score !== null || rows.some((r) => r.value !== null)
          if (!hasAny) {
            return (
              <div
                className="flex flex-col items-end gap-1 text-[10px] text-muted-foreground"
                dir="rtl"
              >
                <span className="rounded-md border border-muted-foreground/30 bg-muted/30 px-1.5 py-0.5">
                  بانتظار التقييم
                </span>
              </div>
            )
          }
          return (
            <div
              className="flex flex-col items-end gap-1 text-[10px] text-muted-foreground"
              dir="rtl"
            >
              {score !== null && (
                <span className="inline-flex items-center gap-1 rounded-md border border-amber-500/30 bg-amber-500/5 px-1.5 py-0.5 text-amber-300">
                  <Sparkles className="h-3 w-3" />
                  {isAlpha ? "توصية" : "تقييم مركّب"}: {scoreLabel}
                </span>
              )}
              {rows
                .filter((r) => r.value !== null)
                .map((r) => (
                  <span key={r.label}>
                    {r.label}: {r.value!.toFixed(2)}
                  </span>
                ))}
            </div>
          )
        })()}
      </div>

      {/* Social profiles — curated by the verifier into structured links.
          Renders as labeled, platform-specific buttons when present. */}
      {candidate.social_links &&
        Object.values(candidate.social_links).some(
          (v) => typeof v === "string" && v.trim(),
        ) && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {Object.entries(candidate.social_links).map(([platform, url]) => {
              if (typeof url !== "string" || !url.trim()) return null
              return (
                <a
                  key={platform}
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 rounded-md border border-primary/30 bg-primary/5 px-2 py-0.5 text-[10px] text-primary transition-colors hover:bg-primary/10"
                  dir="ltr"
                >
                  <ExternalLink className="h-2.5 w-2.5" />
                  {SOCIAL_LABELS[platform] ?? platform}
                </a>
              )
            })}
          </div>
        )}

      {/*
        Phase Alpha — curated evidence bundle. 3..5 citations chosen
        by axis (identity / fit / attribute / context) with operator-
        facing Arabic notes explaining WHAT each URL supports.
        Renders only on Alpha rows; legacy rows keep the audit list.
      */}
      {isAlpha &&
        candidate.evidence_bundle?.citations &&
        candidate.evidence_bundle.citations.length > 0 && (
          <div className="mt-3 space-y-1.5 rounded-lg border border-violet-500/20 bg-violet-500/5 p-2.5">
            <div
              className="text-[10.5px] font-semibold text-violet-300"
              dir="rtl"
            >
              المصادر المختارة
            </div>
            {candidate.evidence_bundle.citations.map((c, i) => (
              <a
                key={i}
                href={c.url}
                target="_blank"
                rel="noopener noreferrer"
                className="block rounded-md border border-violet-500/15 bg-background/40 px-2 py-1.5 text-[11px] transition-colors hover:bg-violet-500/10"
              >
                <div className="flex items-center justify-between gap-2">
                  <span
                    className="truncate text-foreground/85"
                    dir="auto"
                  >
                    {c.title ?? c.url}
                  </span>
                  <span
                    className="shrink-0 rounded-md border border-violet-500/30 bg-violet-500/5 px-1 py-0 text-[9px] uppercase text-violet-300"
                    dir="ltr"
                  >
                    {c.axis}
                  </span>
                </div>
                <div
                  className="mt-0.5 text-[10px] text-muted-foreground"
                  dir="rtl"
                >
                  {c.platform} · {c.supports}
                </div>
              </a>
            ))}
          </div>
        )}

      {/* Evidence URLs — audit trail, includes search hits. Suppressed when
          the curated `social_links` block carries the canonical profile set. */}
      {candidate.evidence_urls.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {candidate.evidence_urls.slice(0, 6).map((u, i) => (
            <a
              key={i}
              href={u.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 rounded-md border border-border/40 bg-background/40 px-2 py-0.5 text-[10px] text-muted-foreground transition-colors hover:text-foreground"
              dir="ltr"
            >
              <ExternalLink className="h-2.5 w-2.5" />
              {u.platform}
            </a>
          ))}
        </div>
      )}

      {/* Topics + risks */}
      {candidate.evidence_summary?.topics && candidate.evidence_summary.topics.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {candidate.evidence_summary.topics.map((t, i) => (
            <span
              key={i}
              className="rounded-md bg-muted/30 px-1.5 py-0.5 text-[10px] text-muted-foreground"
            >
              {t}
            </span>
          ))}
        </div>
      )}
      {candidate.evidence_summary?.red_flags && candidate.evidence_summary.red_flags.length > 0 && (
        <div className="mt-2 rounded-md border border-rose-500/20 bg-rose-500/5 px-2 py-1 text-[10.5px] text-rose-300">
          ⚠ {candidate.evidence_summary.red_flags.join(" · ")}
        </div>
      )}

      {/* Actions — only when not already terminal */}
      {candidate.status !== "promoted" && candidate.status !== "rejected" && (
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                const r = await promoteCandidateAction(candidate.id)
                if (!r.success) {
                  // Match requires review — offer force-create.
                  const wantForce = window.confirm(
                    `${r.error}\n\nForce-create as a new guest?`,
                  )
                  if (wantForce) {
                    await promoteCandidateAction(candidate.id, { forceCreate: true })
                  }
                }
              })
            }
            className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-500/40 bg-emerald-500/5 px-3 py-1.5 text-[11px] text-emerald-300 transition-opacity hover:opacity-90 disabled:opacity-60"
          >
            <CheckCircle2 className="h-3.5 w-3.5" />
            ترقية
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                const reason = window.prompt("سبب الرفض؟") ?? ""
                if (!reason) return
                await rejectCandidateAction(candidate.id, reason)
              })
            }
            className="inline-flex items-center gap-1.5 rounded-lg border border-rose-500/40 bg-rose-500/5 px-3 py-1.5 text-[11px] text-rose-300 transition-opacity hover:opacity-90 disabled:opacity-60"
          >
            <XCircle className="h-3.5 w-3.5" />
            رفض
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                await saveCandidateForLaterAction(candidate.id)
              })
            }
            className="inline-flex items-center gap-1.5 rounded-lg border border-border/40 bg-background/40 px-3 py-1.5 text-[11px] text-muted-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
          >
            <Bookmark className="h-3.5 w-3.5" />
            حفظ لاحقاً
          </button>
        </div>
      )}
    </div>
  )
}

const SOCIAL_LABELS: Record<string, string> = {
  youtube_channel: "YouTube",
  twitter: "Twitter",
  instagram: "Instagram",
  linkedin: "LinkedIn",
  tiktok: "TikTok",
  facebook: "Facebook",
  snapchat: "Snapchat",
  website: "الموقع",
}

/**
 * Phase Alpha — attribute badge: shows the inferred value + a
 * confidence tint. Below 0.50 the badge renders muted with a "?"
 * icon so the operator sees the uncertainty rather than a confidently
 * wrong answer.
 */
function AttributeBadge({
  label,
  value,
  confidence,
}: {
  label: string
  value: string
  confidence: number
}) {
  const high = confidence >= 0.80
  const mid = confidence >= 0.50
  const cls = high
    ? "border-emerald-500/30 text-emerald-300"
    : mid
      ? "border-amber-500/30 text-amber-300"
      : "border-muted-foreground/30 text-muted-foreground"
  const Icon = mid ? ShieldCheck : ShieldQuestion
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md border bg-background/40 px-1.5 py-0.5 ${cls}`}
      title={`${label}: ${value} — ثقة ${(confidence * 100).toFixed(0)}%`}
    >
      <Icon className="h-2.5 w-2.5" />
      {label}: {value} {Math.round(confidence * 100)}%
    </span>
  )
}

function StatusBadge({ status }: { status: DiscoveryCandidateRecord["status"] }) {
  const map: Record<DiscoveryCandidateRecord["status"], { label: string; cls: string }> = {
    proposed: { label: "مقترح", cls: "border-border/40 text-muted-foreground" },
    under_review: { label: "قيد المراجعة", cls: "border-amber-500/30 text-amber-300" },
    promoted: { label: "مُرقَّى", cls: "border-emerald-500/30 text-emerald-300" },
    rejected: { label: "مرفوض", cls: "border-rose-500/30 text-rose-300" },
    saved_for_later: { label: "محفوظ", cls: "border-sky-500/30 text-sky-300" },
  }
  const m = map[status]
  return (
    <span className={`rounded-md border bg-background/30 px-1.5 py-0.5 text-[10px] ${m.cls}`}>
      {m.label}
    </span>
  )
}
