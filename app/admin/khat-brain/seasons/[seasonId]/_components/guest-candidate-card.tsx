"use client"

/**
 * Phase B redesign — Per-episode guest candidate card.
 *
 * Renders one discovery candidate inside the per-episode panel of the
 * locked-topics view. Sources data from `guest_discovery_candidates`:
 *
 *   - Identity row:   `proposed_name` + inferred gender + inferred country
 *   - General block:  `general_rationale`        (verifier output)
 *   - Topic block:    `topic_fit_rationale`      (verifier output, bold)
 *   - Social links:   `social_links`             (curated, clickable)
 *
 * Two callbacks: assign (promote into the slot) and skip. The legacy
 * `app/admin/discovery/candidate-row.tsx` keeps its season-wide shape;
 * this card is wizard-scoped so it can be tighter and topic-anchored.
 */

import {
  ExternalLink,
  Loader2,
  MapPin,
  Sparkles,
  UserRoundCheck,
  X,
  Youtube,
  Twitter,
  Instagram,
  Linkedin,
  Facebook,
  Globe,
} from "lucide-react"
import type { ReactNode } from "react"
import type { DiscoverySocialLinks } from "@/lib/db/schema/discovery"

export interface GuestCandidateCardData {
  id: string
  proposed_name: string | null
  proposed_role: string | null
  proposed_country: string | null
  gender_chip?: "male" | "female" | "unknown" | null
  nationality_chip?: "kuwaiti" | "non_kuwaiti" | "unknown" | null
  general_rationale: string | null
  topic_fit_rationale: string | null
  topic_fit_score: number | null
  composite_score: number | null
  social_links: DiscoverySocialLinks | null
}

export function GuestCandidateCard({
  candidate,
  pending = false,
  onAssign,
  onSkip,
}: {
  candidate: GuestCandidateCardData
  pending?: boolean
  onAssign: () => void
  onSkip: () => void
}) {
  const social = candidate.social_links ?? {}
  const hasAnySocial = Object.values(social).some(
    (v) => typeof v === "string" && v.trim().length > 0,
  )
  const displayName = candidate.proposed_name?.trim() || "اسم غير محدّد"
  return (
    <div className="rounded-2xl border border-border/60 bg-card/50 p-4">
      {/* Identity row */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[14px] font-semibold">{displayName}</span>
            {candidate.gender_chip && candidate.gender_chip !== "unknown" && (
              <Chip
                tone={candidate.gender_chip === "male" ? "sky" : "pink"}
                label={candidate.gender_chip === "male" ? "ذكر" : "أنثى"}
              />
            )}
            {candidate.nationality_chip && (
              <Chip
                tone="amber"
                label={
                  candidate.nationality_chip === "kuwaiti"
                    ? "كويتي"
                    : candidate.nationality_chip === "non_kuwaiti"
                      ? "غير كويتي"
                      : "جنسية غير محدّدة"
                }
              />
            )}
            {candidate.proposed_role && (
              <span className="rounded-md bg-muted/40 px-1.5 py-0.5 text-[10px] text-muted-foreground">
                {candidate.proposed_role}
              </span>
            )}
            {candidate.proposed_country && (
              <span className="inline-flex items-center gap-0.5 rounded-md bg-muted/40 px-1.5 py-0.5 text-[10px] text-muted-foreground">
                <MapPin className="h-2.5 w-2.5" />
                {candidate.proposed_country}
              </span>
            )}
          </div>
        </div>
        {typeof candidate.composite_score === "number" && (
          <div className="text-[10.5px] text-muted-foreground">
            تقييم: <span className="font-bold text-foreground">{candidate.composite_score.toFixed(2)}</span>
          </div>
        )}
      </div>

      {/* Why this guest (general) */}
      {candidate.general_rationale && (
        <RationaleBlock
          tone="muted"
          label="لماذا هذا الضيف"
          text={candidate.general_rationale}
        />
      )}

      {/* Why they fit THIS episode (bold — the primary surface) */}
      {candidate.topic_fit_rationale && (
        <RationaleBlock
          tone="primary"
          label={
            <span className="inline-flex items-center gap-1">
              <Sparkles className="h-3 w-3" />
              لماذا يناسب هذه الحلقة
            </span>
          }
          text={candidate.topic_fit_rationale}
        />
      )}

      {/* Social links — clickable, opens in new tab */}
      {hasAnySocial && (
        <div className="mt-3">
          <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.15em] text-muted-foreground/80">
            حسابات الضيف
          </div>
          <div className="flex flex-wrap gap-1.5">
            {social.youtube_channel && (
              <SocialLink href={social.youtube_channel} icon={<Youtube className="h-3.5 w-3.5" />} label="YouTube" />
            )}
            {social.twitter && (
              <SocialLink href={social.twitter} icon={<Twitter className="h-3.5 w-3.5" />} label="Twitter" />
            )}
            {social.instagram && (
              <SocialLink href={social.instagram} icon={<Instagram className="h-3.5 w-3.5" />} label="Instagram" />
            )}
            {social.linkedin && (
              <SocialLink href={social.linkedin} icon={<Linkedin className="h-3.5 w-3.5" />} label="LinkedIn" />
            )}
            {social.tiktok && (
              <SocialLink href={social.tiktok} icon={<ExternalLink className="h-3.5 w-3.5" />} label="TikTok" />
            )}
            {social.facebook && (
              <SocialLink href={social.facebook} icon={<Facebook className="h-3.5 w-3.5" />} label="Facebook" />
            )}
            {social.snapchat && (
              <SocialLink href={social.snapchat} icon={<ExternalLink className="h-3.5 w-3.5" />} label="Snapchat" />
            )}
            {social.website && (
              <SocialLink href={social.website} icon={<Globe className="h-3.5 w-3.5" />} label="الموقع" />
            )}
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="mt-4 flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={onSkip}
          disabled={pending}
          className="inline-flex items-center gap-1 rounded-lg border border-border/60 px-3 py-1.5 text-[12px] text-muted-foreground hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
        >
          <X className="h-3.5 w-3.5" />
          تخطّي
        </button>
        <button
          type="button"
          onClick={onAssign}
          disabled={pending}
          className="inline-flex items-center gap-1 rounded-lg bg-primary px-3 py-1.5 text-[12px] font-bold text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {pending ? (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              تعيين…
            </>
          ) : (
            <>
              <UserRoundCheck className="h-3.5 w-3.5" />
              عيّن لهذه الحلقة
            </>
          )}
        </button>
      </div>
    </div>
  )
}

function Chip({
  tone,
  label,
}: {
  tone: "sky" | "pink" | "amber"
  label: string
}) {
  const cls =
    tone === "sky"
      ? "border-sky-500/30 bg-sky-500/10 text-sky-700"
      : tone === "pink"
        ? "border-pink-500/30 bg-pink-500/10 text-pink-700"
        : "border-amber-500/30 bg-amber-500/10 text-amber-700"
  return (
    <span className={"rounded-md border px-1.5 py-0.5 text-[10px] font-semibold " + cls}>
      {label}
    </span>
  )
}

function RationaleBlock({
  tone,
  label,
  text,
}: {
  tone: "muted" | "primary"
  label: ReactNode
  text: string
}) {
  const wrap =
    tone === "primary"
      ? "border-primary/30 bg-primary/5"
      : "border-border/40 bg-background/40"
  const labelCls =
    tone === "primary"
      ? "text-primary/80"
      : "text-muted-foreground"
  return (
    <div className={"mt-3 rounded-xl border p-3 " + wrap}>
      <div className={"text-[10px] font-semibold uppercase tracking-[0.15em] " + labelCls}>
        {label}
      </div>
      <p className={"mt-1 text-[12.5px] leading-relaxed " + (tone === "primary" ? "font-semibold text-foreground" : "text-foreground/80")}>
        {text}
      </p>
    </div>
  )
}

function SocialLink({
  href,
  icon,
  label,
}: {
  href: string
  icon: ReactNode
  label: string
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1.5 rounded-md border border-border/60 bg-background/40 px-2 py-1 text-[11px] text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground"
    >
      {icon}
      <span>{label}</span>
      <ExternalLink className="h-2.5 w-2.5 opacity-60" />
    </a>
  )
}
