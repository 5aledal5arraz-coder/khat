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
} from "lucide-react"
import { saveV2CandidateAction, rejectV2CandidateAction } from "./actions"

export interface V2CardData {
  id: string
  name: string
  name_en?: string | null
  role?: string | null
  country?: string | null
  image?: string | null
  why?: string | null
  decision: "accepted" | "shortlist" | "rejected"
  status: string
  scores?: { notability: number; topic_fit: number; guestability: number; recency: number; overall: number }
  reasons?: string[]
  birth_year?: number | null
  sitelinks?: number | null
  signals?: {
    scholar?: { works: number; cited_by: number; institution?: string | null } | null
    podcast?: { appearances: number } | null
    books?: { count: number } | null
    news?: { recent_mentions: number } | null
  }
  links?: { platform: string; url: string; title?: string | null }[]
}

const DECISION = {
  accepted: { label: "مرشّح قويّ", cls: "border-emerald-500/40 bg-emerald-500/10 text-emerald-200" },
  shortlist: { label: "قائمة مختصرة", cls: "border-amber-500/40 bg-amber-500/10 text-amber-200" },
  rejected: { label: "مستبعد", cls: "border-rose-500/30 bg-rose-500/5 text-rose-300/80" },
}

function Bar({ label, v }: { label: string; v: number }) {
  const pct = Math.round((v ?? 0) * 100)
  return (
    <div className="flex items-center gap-1.5">
      <span className="w-16 shrink-0 text-[9.5px] text-muted-foreground">{label}</span>
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-background/60">
        <div className="h-full rounded-full bg-violet-400/70" style={{ width: `${pct}%` }} />
      </div>
      <span className="w-7 text-end text-[9.5px] tabular-nums text-muted-foreground">{pct}</span>
    </div>
  )
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

export function CandidateCard({ c }: { c: V2CardData }) {
  const [pending, start] = useTransition()
  const [done, setDone] = useState<null | "saved" | "rejected">(
    c.status === "saved_for_later" ? "saved" : c.status === "rejected" && c.decision !== "rejected" ? "rejected" : null,
  )
  const d = DECISION[c.decision]
  const initials = c.name.trim().slice(0, 2)

  return (
    <div className={"rounded-2xl border bg-card/40 p-3 " + (c.decision === "rejected" ? "border-border/30 opacity-70" : "border-border/40")}>
      <div className="flex items-start gap-3">
        {c.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={c.image} alt={c.name} className="h-14 w-14 shrink-0 rounded-xl object-cover" />
        ) : (
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-violet-500/15 text-sm font-bold text-violet-200">{initials}</div>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <div className="truncate text-[14px] font-semibold text-foreground">{c.name}</div>
              <div className="truncate text-[11px] text-muted-foreground">
                {[c.role, c.country, c.birth_year ? `مواليد ${c.birth_year}` : null].filter(Boolean).join(" · ")}
              </div>
            </div>
            <span className={"shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-medium " + d.cls}>{d.label}</span>
          </div>
          {c.why && <p className="mt-1 line-clamp-2 text-[11.5px] leading-relaxed text-foreground/80">{c.why}</p>}
        </div>
      </div>

      {c.scores && (
        <div className="mt-2 grid grid-cols-1 gap-1 sm:grid-cols-2">
          <Bar label="الشهرة" v={c.scores.notability} />
          <Bar label="الملاءمة" v={c.scores.topic_fit} />
          <Bar label="قابلية الاستضافة" v={c.scores.guestability} />
          <Bar label="الحضور الحالي" v={c.scores.recency} />
        </div>
      )}

      <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[10px] text-muted-foreground">
        {(c.sitelinks ?? 0) >= 3 && <span className="inline-flex items-center gap-0.5 rounded-md bg-background/60 px-1.5 py-0.5"><Star className="h-2.5 w-2.5" /> {c.sitelinks} ويكي</span>}
        {(c.signals?.scholar?.cited_by ?? 0) > 0 && <span className="inline-flex items-center gap-0.5 rounded-md bg-background/60 px-1.5 py-0.5"><GraduationCap className="h-2.5 w-2.5" /> {c.signals!.scholar!.cited_by} اقتباس</span>}
        {(c.signals?.books?.count ?? 0) > 0 && <span className="inline-flex items-center gap-0.5 rounded-md bg-background/60 px-1.5 py-0.5"><BookOpen className="h-2.5 w-2.5" /> {c.signals!.books!.count} كتاب</span>}
        {(c.signals?.podcast?.appearances ?? 0) > 0 && <span className="inline-flex items-center gap-0.5 rounded-md bg-background/60 px-1.5 py-0.5"><Mic className="h-2.5 w-2.5" /> {c.signals!.podcast!.appearances} بودكاست</span>}
        {(c.signals?.news?.recent_mentions ?? 0) > 0 && <span className="inline-flex items-center gap-0.5 rounded-md bg-background/60 px-1.5 py-0.5"><Newspaper className="h-2.5 w-2.5" /> {c.signals!.news!.recent_mentions} خبر</span>}
      </div>

      {c.links && c.links.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {c.links.slice(0, 6).map((l, i) => {
            const Icon = LINK_ICON[l.platform] ?? ExternalLink
            return (
              <a key={i} href={l.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-md border border-border/40 bg-background/40 px-1.5 py-0.5 text-[10px] text-foreground/80 hover:border-violet-500/40 hover:text-foreground">
                <Icon className="h-2.5 w-2.5" /> {l.title ?? l.platform}
              </a>
            )
          })}
        </div>
      )}

      <div className="mt-3 flex gap-2">
        <button type="button" disabled={pending || done === "saved"} onClick={() => start(async () => { const r = await saveV2CandidateAction(c.id); if (r.success) setDone("saved") })} className="inline-flex items-center gap-1 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-[11.5px] text-emerald-200 hover:bg-emerald-500/20 disabled:opacity-40">
          <Check className="h-3 w-3" /> {done === "saved" ? "محفوظ" : "احفظ للحلقة"}
        </button>
        <button type="button" disabled={pending || done === "rejected"} onClick={() => start(async () => { const r = await rejectV2CandidateAction(c.id); if (r.success) setDone("rejected") })} className="inline-flex items-center gap-1 rounded-lg border border-border/40 bg-background/40 px-2.5 py-1 text-[11.5px] text-muted-foreground hover:bg-muted/30 disabled:opacity-40">
          <X className="h-3 w-3" /> استبعد
        </button>
      </div>
    </div>
  )
}
