"use client"

import { useState, useTransition } from "react"
import {
  Check,
  X,
  ExternalLink,
  BookOpen,
  Mic,
  Newspaper,
  GraduationCap,
  Star,
  UserPlus,
  ShieldCheck,
  Globe,
} from "lucide-react"
import {
  saveV2CandidateAction,
  rejectV2CandidateAction,
  promoteV2CandidateAction,
} from "./actions"
// Wave 1 = unblock only. A rejected action promise used to leave `pending`
// stuck true, disabling all three buttons on the card permanently; runAction
// makes the transition always settle. Surfacing WHY (an else + toast) is
// deliberately deferred — this card has no error slot yet.
import { runAction } from "@/app/admin/components/run-action"
import { scoreEvidenceLabels, unmeasuredScores, wikiFactsTrusted } from "@/lib/discovery-v2/display"
import {
  STORY_REVIEW_FLAGS,
  type ProposedOrigin,
  type StoryAssessment,
  type V2Flag,
  type V2ScoreKey,
} from "@/lib/discovery-v2/types"

export interface V2CardData {
  id: string
  name: string
  name_en?: string | null
  role?: string | null
  country?: string | null
  image?: string | null
  why?: string | null
  decision: "accepted" | "needs_review" | "shortlist" | "rejected"
  status: string
  /** story/searchability/gulf_hook are absent on rows scored before story-first. */
  scores?: {
    notability: number
    topic_fit: number
    guestability: number
    recency: number
    overall: number
    story?: number
    searchability?: number
    gulf_hook?: number
    /** Components with no real evidence behind them — shown «غير مقيّم». */
    unmeasured?: V2ScoreKey[]
  }
  story?: Pick<
    StoryAssessment,
    "status" | "evidence" | "gulf_event" | "claim_from_propose" | "story_type" | "self_told" | "topic_relevance"
  > | null
  flags?: V2Flag[]
  /** Where the name came from; absent/"propose" on rows before 2026-09-28. */
  origin?: ProposedOrigin | null
  reasons?: string[]
  birth_year?: number | null
  sitelinks?: number | null
  signals?: {
    scholar?: { works: number; cited_by: number; institution?: string | null } | null
    /** `test` = Listen Notes sandbox mock data — never shown as an appearance. */
    podcast?: { appearances: number; test?: boolean } | null
    books?: { count: number } | null
    news?: { recent_mentions: number } | null
  }
  links?: { platform: string; url: string; title?: string | null }[]
  grounded?: {
    presence: "confirmed" | "weak" | "none"
    recent_activity: boolean
    source_count: number
    verified_count: number
    sources: { title: string; url: string; domain: string | null; verified: boolean }[]
    model: string
  } | null
}

const DECISION = {
  accepted: { label: "مرشّح قويّ", cls: "border-emerald-500/40 bg-emerald-500/10 text-emerald-700" },
  needs_review: { label: "قصة قوية — راجِع الهوية", cls: "border-amber-500/40 bg-amber-500/10 text-amber-700" },
  shortlist: { label: "قائمة مختصرة", cls: "border-amber-500/40 bg-amber-500/10 text-amber-700" },
  rejected: { label: "مستبعد", cls: "border-rose-500/30 bg-rose-500/5 text-rose-700/80" },
}

// needs_review for the STORY (unpublished / told by others), not the
// identity — «قصة قوية» would claim a story nobody has verified.
const STORY_REVIEW = { label: "تحتاج مراجعتك", cls: "border-sky-500/40 bg-sky-500/10 text-sky-700" }

/**
 * One score row. `unmeasured` → «غير مقيّم» and no bar: a default or a
 * lexical guess is not a measurement, and a number next to it was read as
 * one (the 0.62 topic-fit prior, the Listen Notes sandbox's 0.65).
 * `evidence` replaces the number for a bucketed score (D4): the bar still
 * shows the bucket, the text says what evidence it stands for.
 */
function Bar({
  label,
  v,
  unmeasured = false,
  evidence = null,
}: {
  label: string
  v: number
  unmeasured?: boolean
  evidence?: string | null
}) {
  const pct = Math.round((v ?? 0) * 100)
  return (
    <div className="flex items-center gap-1.5">
      <span className="w-16 shrink-0 text-[9.5px] text-muted-foreground">{label}</span>
      {unmeasured ? (
        <span className="flex-1 text-[9.5px] text-muted-foreground">غير مقيّم</span>
      ) : (
        <>
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-background/60">
            <div className="h-full rounded-full bg-primary/70/70" style={{ width: `${pct}%` }} />
          </div>
          {evidence ? (
            <span className="max-w-[55%] shrink-0 truncate text-end text-[9.5px] text-muted-foreground" title={evidence}>{evidence}</span>
          ) : (
            <span className="w-7 text-end text-[9.5px] tabular-nums text-muted-foreground">{pct}</span>
          )}
        </>
      )}
    </div>
  )
}


const FLAG_LABEL: Record<V2Flag, string> = {
  identity_unverified: "ليس في ويكي‌داتا",
  identity_uncertain: "هوية غير مؤكّدة",
  gender_unverified: "الجنس غير متحقّق",
  nationality_unverified: "الجنسية غير متحقّقة",
  // Rows stored before the per-attribute split: the attribute is unknown.
  filter_unverified: "فلتر غير متحقّق",
  story_unpublished: "قصة غير منشورة — تحتاج مراجعتك",
  story_second_hand: "قصته يرويها غيره",
  story_self_told_unverified: "لم يُتحقق أنه رواها بنفسه",
  no_web_footprint: "لا أثر رقمي",
  policy_violation: "مخالف لدستور خط",
  policy_review: "سابقة مالية — قرار خالد",
  policy_exposure_unbacked: "خصوصية الغير؟ غير مسندة — راجِع",
  likely_historical: "يُرجّح أنه متوفّى أو شخصية تاريخية",
  seen_in_other_run: "مقترح في بحث آخر",
}

const LINK_ICON: Record<string, typeof ExternalLink> = {
  wikipedia: ExternalLink,
  wikipedia_ar: ExternalLink,
  official: ExternalLink,
  youtube: ExternalLink,
  youtube_talk: Mic,
  podcast: Mic,
  news: Newspaper,
}

/**
 * The one line that says WHY they scored: a quote from the page itself, or —
 * when it only matched the search engine's summary of the page — that
 * summary, labelled as one (never in quote marks).
 */
function StoryLine({ story }: { story: NonNullable<V2CardData["story"]> }) {
  const first = story.evidence.find((e) => e.on_page === true) ?? story.evidence[0]
  if (story.status === "verified" && first) {
    const link = (
      <a href={first.url} target="_blank" rel="noreferrer" className="text-primary underline-offset-2 hover:underline">
        {first.domain ?? "المصدر"}
      </a>
    )
    return first.on_page === true ? (
      <p className="mt-1 text-[11px] leading-relaxed text-foreground/85">
        «{first.quote}» {link}
      </p>
    ) : (
      <p className="mt-1 text-[11px] leading-relaxed text-foreground/85">
        <span className="font-medium text-muted-foreground">ملخص البحث عن الصفحة (ليس اقتباساً منها):</span> {first.quote} {link}
      </p>
    )
  }
  if (story.status === "unverified") {
    return (
      <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
        القصة المقترحة لم تُثبت بمصدر
        {story.claim_from_propose && <> · <span className="font-medium">فرضية:</span> {story.claim_from_propose}</>}
      </p>
    )
  }
  return <p className="mt-1 text-[11px] text-muted-foreground">لم تُفحص القصة</p>
}

/** Where a name came from — anything but the model's memory is said out loud. */
const ORIGIN_LABEL: Record<ProposedOrigin, string> = {
  propose: "اقتراح النموذج",
  harvest_web: "وُجد في الصحافة/البودكاست",
  x_list: "من قوائم X المنسّقة",
}

export function CandidateCard({ c }: { c: V2CardData }) {
  const [pending, start] = useTransition()
  const [done, setDone] = useState<null | "saved" | "rejected" | "promoted">(
    c.status === "saved_for_later"
      ? "saved"
      : c.status === "promoted"
        ? "promoted"
        : c.status === "rejected" && c.decision !== "rejected"
          ? "rejected"
          : null,
  )
  const storyReview = c.decision === "needs_review" && !!c.flags?.some((f) => STORY_REVIEW_FLAGS.includes(f))
  const d = storyReview ? STORY_REVIEW : DECISION[c.decision]
  const initials = c.name.trim().slice(0, 2)
  const unmeasured = unmeasuredScores(c)
  const evidence = scoreEvidenceLabels(c)
  // A birth year / photo from a possible namesake is not shown (older rows).
  const factsTrusted = wikiFactsTrusted(c)
  const image = factsTrusted ? c.image : null
  const birthYear = factsTrusted ? c.birth_year : null
  const podcastAppearances = c.signals?.podcast?.test ? 0 : (c.signals?.podcast?.appearances ?? 0)

  return (
    <div className={"rounded-2xl border bg-card/40 p-3 " + (c.decision === "rejected" ? "border-border/30 opacity-70" : "border-border/40")}>
      <div className="flex items-start gap-3">
        {image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={image} alt={c.name} className="h-14 w-14 shrink-0 rounded-xl object-cover" />
        ) : (
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-sm font-bold text-primary">{initials}</div>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <div className="truncate text-[14px] font-semibold text-foreground">{c.name}</div>
              <div className="truncate text-[11px] text-muted-foreground">
                {[c.role, c.country, birthYear ? `مواليد ${birthYear}` : null].filter(Boolean).join(" · ")}
              </div>
            </div>
            <span className={"shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-medium " + d.cls}>{d.label}</span>
          </div>
          {c.why && <p className="mt-1 line-clamp-2 text-[11.5px] leading-relaxed text-foreground/80">{c.why}</p>}
          {c.story && <StoryLine story={c.story} />}
        </div>
      </div>

      {(c.flags?.length || (c.scores?.gulf_hook === 1 && c.story?.gulf_event) || (c.origin && c.origin !== "propose")) ? (
        <div className="mt-2 flex flex-wrap gap-1.5 text-[10px]">
          {c.origin && c.origin !== "propose" && (
            <span className="rounded-md border border-border bg-muted/40 px-1.5 py-0.5 font-medium text-foreground/80">
              {ORIGIN_LABEL[c.origin]}
            </span>
          )}
          {c.scores?.gulf_hook === 1 && c.story?.gulf_event && (
            <span className="rounded-md bg-primary/10 px-1.5 py-0.5 font-medium text-primary">{c.story.gulf_event.event}</span>
          )}
          {c.flags?.map((f) => (
            <span key={f} className={"rounded-md border px-1.5 py-0.5 " + (STORY_REVIEW_FLAGS.includes(f) ? "border-sky-500/30 bg-sky-500/5 font-medium text-sky-700" : "border-amber-500/30 bg-amber-500/5 text-amber-700")}>{FLAG_LABEL[f] ?? f}</span>
          ))}
        </div>
      ) : null}

      {c.scores && (
        <div className="mt-2 grid grid-cols-1 gap-1 sm:grid-cols-2">
          {c.scores.story !== undefined ? (
            <>
              <Bar label="القصة" v={c.scores.story} unmeasured={unmeasured.has("story")} evidence={evidence.story} />
              <Bar label="الملاءمة" v={c.scores.topic_fit} unmeasured={unmeasured.has("topic_fit")} evidence={evidence.topic_fit} />
              <Bar label="يُبحث عنه" v={c.scores.searchability ?? 0} unmeasured={unmeasured.has("searchability")} evidence={evidence.searchability} />
              <Bar label="قابلية الاستضافة" v={c.scores.guestability} unmeasured={unmeasured.has("guestability")} />
            </>
          ) : (
            <>
              <Bar label="الشهرة" v={c.scores.notability} />
              <Bar label="الملاءمة" v={c.scores.topic_fit} />
              <Bar label="قابلية الاستضافة" v={c.scores.guestability} />
              <Bar label="الحضور الحالي" v={c.scores.recency} />
            </>
          )}
        </div>
      )}

      <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[10px] text-muted-foreground">
        {(c.sitelinks ?? 0) >= 3 && <span className="inline-flex items-center gap-0.5 rounded-md bg-background/60 px-1.5 py-0.5"><Star className="h-2.5 w-2.5" /> {c.sitelinks} ويكي</span>}
        {(c.signals?.scholar?.cited_by ?? 0) > 0 && <span className="inline-flex items-center gap-0.5 rounded-md bg-background/60 px-1.5 py-0.5"><GraduationCap className="h-2.5 w-2.5" /> {c.signals!.scholar!.cited_by} اقتباس</span>}
        {(c.signals?.books?.count ?? 0) > 0 && <span className="inline-flex items-center gap-0.5 rounded-md bg-background/60 px-1.5 py-0.5"><BookOpen className="h-2.5 w-2.5" /> {c.signals!.books!.count} كتاب</span>}
        {podcastAppearances > 0 && <span className="inline-flex items-center gap-0.5 rounded-md bg-background/60 px-1.5 py-0.5"><Mic className="h-2.5 w-2.5" /> {podcastAppearances} بودكاست</span>}
        {(c.signals?.news?.recent_mentions ?? 0) > 0 && <span className="inline-flex items-center gap-0.5 rounded-md bg-background/60 px-1.5 py-0.5"><Newspaper className="h-2.5 w-2.5" /> {c.signals!.news!.recent_mentions} خبر</span>}
      </div>

      {c.grounded && (
        <div className="mt-2 rounded-lg border border-sky-500/25 bg-sky-500/5 p-2">
          <div className="flex flex-wrap items-center gap-1.5 text-[10px]">
            {c.grounded.presence === "confirmed" ? (
              <span className="inline-flex items-center gap-1 rounded-md bg-emerald-500/10 px-1.5 py-0.5 font-medium text-emerald-700"><ShieldCheck className="h-2.5 w-2.5" /> تحقّق حيّ: مؤكّد</span>
            ) : c.grounded.presence === "weak" ? (
              <span className="inline-flex items-center gap-1 rounded-md bg-amber-500/10 px-1.5 py-0.5 font-medium text-amber-700"><ShieldCheck className="h-2.5 w-2.5" /> تحقّق حيّ: أوّليّ</span>
            ) : (
              <span className="inline-flex items-center gap-1 rounded-md bg-rose-500/5 px-1.5 py-0.5 font-medium text-rose-700/80"><ShieldCheck className="h-2.5 w-2.5" /> تحقّق حيّ: بلا حضور</span>
            )}
            {c.grounded.recent_activity && <span className="inline-flex items-center gap-1 rounded-md bg-background/60 px-1.5 py-0.5 text-muted-foreground">نشاط حديث</span>}
            {c.grounded.verified_count > 0 && <span className="rounded-md bg-background/60 px-1.5 py-0.5 text-muted-foreground">{c.grounded.verified_count} مصدر موثّق</span>}
          </div>
          {c.grounded.sources.length > 0 && (
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {c.grounded.sources.slice(0, 4).map((s, i) => (
                <a key={i} href={s.url} target="_blank" rel="noreferrer" title={s.title} className={"inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] hover:text-foreground " + (s.verified ? "border-sky-500/30 bg-background/40 text-foreground/80" : "border-border/30 bg-background/20 text-muted-foreground")}>
                  <Globe className="h-2.5 w-2.5" /> {s.domain ?? "مصدر"}
                </a>
              ))}
            </div>
          )}
        </div>
      )}

      {c.links && c.links.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {c.links.slice(0, 6).map((l, i) => {
            const Icon = LINK_ICON[l.platform] ?? ExternalLink
            return (
              <a key={i} href={l.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-md border border-border/40 bg-background/40 px-1.5 py-0.5 text-[10px] text-foreground/80 hover:border-primary/40 hover:text-foreground">
                <Icon className="h-2.5 w-2.5" /> {l.title ?? l.platform}
              </a>
            )
          })}
        </div>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" title="يضيف الشخص إلى قائمة التواصل (CRM) للمتابعة — لا يربطه بهذه الحلقة" disabled={pending || done === "promoted"} onClick={() => start(async () => { const o = await runAction(() => promoteV2CandidateAction(c.id)); if (o.ok && o.data.success) setDone("promoted") })} className="inline-flex items-center gap-1 rounded-lg border border-primary/30 bg-primary/10 px-2.5 py-1 text-[11.5px] text-primary hover:bg-primary/20 disabled:opacity-40">
          <UserPlus className="h-3 w-3" /> {done === "promoted" ? "في قائمة التواصل" : "أضِف لقائمة التواصل"}
        </button>
        <button type="button" title="احفظ المرشّح لمراجعته لاحقاً" disabled={pending || done === "saved"} onClick={() => start(async () => { const o = await runAction(() => saveV2CandidateAction(c.id)); if (o.ok && o.data.success) setDone("saved") })} className="inline-flex items-center gap-1 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-[11.5px] text-emerald-700 hover:bg-emerald-500/20 disabled:opacity-40">
          <Check className="h-3 w-3" /> {done === "saved" ? "محفوظ" : "احفظ لاحقاً"}
        </button>
        <button type="button" disabled={pending || done === "rejected"} onClick={() => start(async () => { const o = await runAction(() => rejectV2CandidateAction(c.id)); if (o.ok && o.data.success) setDone("rejected") })} className="inline-flex items-center gap-1 rounded-lg border border-border/40 bg-background/40 px-2.5 py-1 text-[11.5px] text-muted-foreground hover:bg-muted/30 disabled:opacity-40">
          <X className="h-3 w-3" /> استبعد
        </button>
      </div>
    </div>
  )
}
