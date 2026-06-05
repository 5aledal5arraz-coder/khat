"use client"

import { CheckCircle2, Pencil, RefreshCw, UserRound, Lock, Loader2 } from "lucide-react"
import type {
  KhatMapEpisodeCandidate,
  KhatMapGuestCandidate,
} from "@/types/khat-map"

export interface AcceptedPair {
  topic: KhatMapEpisodeCandidate
  guest: KhatMapGuestCandidate | null
}

export function SeasonOverview({
  pairs,
  target,
  onEdit,
  onRegenerate,
  phaseA = false,
  lockPending = false,
  onLockTopics,
}: {
  pairs: AcceptedPair[]
  target: number
  onEdit?: (topicId: string) => void
  onRegenerate?: (topicId: string) => void
  /**
   * Phase A topics-only mode. Swaps the success copy for a "topics
   * pending lock" framing and surfaces the lock CTA. The guest stats /
   * gender distribution still render but they'll all be empty in phase
   * A — the panel stays useful once the wizard exits topics-only mode
   * by virtue of those numbers populating naturally.
   */
  phaseA?: boolean
  lockPending?: boolean
  /** Required when `phaseA` is true. */
  onLockTopics?: () => void
}) {
  const counts = deriveCounts(pairs)
  return (
    <div className="space-y-6">
      {/* Hero — copy + CTA depend on wizard phase */}
      <div className="rounded-3xl border border-primary/30 bg-gradient-to-br from-primary/10 to-transparent p-6 text-center">
        <CheckCircle2 className="mx-auto h-8 w-8 text-primary" />
        <h2 className="mt-3 text-xl font-bold">
          {phaseA ? "اعتمدت كل المواضيع — اقفلها للانتقال للضيوف" : "اكتمل موسمك ✨"}
        </h2>
        <p className="mt-1 text-[12.5px] text-muted-foreground">
          {phaseA
            ? `${pairs.length} موضوع معتمد من أصل ${target}. اقفل المواضيع لتبدأ المرحلة الثانية — البحث الموجّه عن الضيوف لكل حلقة.`
            : `${pairs.length} حلقات مقبولة من أصل ${target}. راجع التوزيعات أدناه — يمكنك تعديل أي حلقة أو توليد بديلاً.`}
        </p>
        {phaseA && onLockTopics && (
          <button
            type="button"
            onClick={onLockTopics}
            disabled={lockPending || pairs.length === 0}
            className="mt-4 inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-[13px] font-bold text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {lockPending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                نقفل المواضيع…
              </>
            ) : (
              <>
                <Lock className="h-4 w-4" />
                اقفل المواضيع وابدأ البحث عن الضيوف
              </>
            )}
          </button>
        )}
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatBlock label="الحلقات" value={pairs.length} />
        <StatBlock label="الضيوف" value={counts.guests} />
        <StatBlock label="مجالات" value={Object.keys(counts.by_domain).length} />
        <StatBlock
          label="نساء / رجال"
          value={`${counts.by_gender.female ?? 0} / ${counts.by_gender.male ?? 0}`}
        />
      </div>

      {/* Distribution bars */}
      <div className="grid gap-4 rounded-2xl border border-border/40 bg-card/30 p-4 sm:grid-cols-2">
        <DistributionBlock
          title="التوزيع حسب المجال"
          entries={Object.entries(counts.by_domain).map(([k, v]) => ({
            label: domainLabel(k),
            value: v,
            total: pairs.length,
          }))}
        />
        <DistributionBlock
          title="التوزيع حسب النوع"
          entries={[
            {
              label: "ذكر",
              value: counts.by_gender.male ?? 0,
              total: pairs.length,
              color: "bg-sky-500",
            },
            {
              label: "أنثى",
              value: counts.by_gender.female ?? 0,
              total: pairs.length,
              color: "bg-pink-500",
            },
            {
              label: "غير محدّد",
              value: counts.by_gender.unknown ?? 0,
              total: pairs.length,
              color: "bg-muted-foreground",
            },
          ]}
        />
      </div>

      {/* Episode grid */}
      <div>
        <div className="mb-3 text-[11px] font-semibold uppercase tracking-[0.15em] text-muted-foreground">
          الحلقات
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {pairs.map((p, i) => (
            <EpisodeTile
              key={p.topic.id}
              index={i + 1}
              pair={p}
              onEdit={onEdit ? () => onEdit(p.topic.id) : undefined}
              onRegenerate={
                onRegenerate ? () => onRegenerate(p.topic.id) : undefined
              }
            />
          ))}
        </div>
      </div>
    </div>
  )
}

function StatBlock({
  label,
  value,
}: {
  label: string
  value: number | string
}) {
  return (
    <div className="rounded-xl border border-border/40 bg-card/30 p-3 text-center">
      <div className="text-2xl font-bold tabular-nums">{value}</div>
      <div className="mt-1 text-[10px] uppercase tracking-[0.15em] text-muted-foreground">
        {label}
      </div>
    </div>
  )
}

function DistributionBlock({
  title,
  entries,
}: {
  title: string
  entries: Array<{ label: string; value: number; total: number; color?: string }>
}) {
  const sorted = [...entries].sort((a, b) => b.value - a.value)
  return (
    <div>
      <div className="mb-2 text-[10.5px] font-semibold uppercase tracking-[0.15em] text-muted-foreground">
        {title}
      </div>
      <div className="space-y-1.5">
        {sorted.map((e) => {
          const pct = e.total > 0 ? (e.value / e.total) * 100 : 0
          return (
            <div key={e.label}>
              <div className="mb-0.5 flex justify-between text-[11px]">
                <span>{e.label}</span>
                <span className="tabular-nums text-muted-foreground">
                  {e.value}
                </span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-muted/30">
                <div
                  className={`h-full ${e.color ?? "bg-primary/70"}`}
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function EpisodeTile({
  index,
  pair,
  onEdit,
  onRegenerate,
}: {
  index: number
  pair: AcceptedPair
  onEdit?: () => void
  onRegenerate?: () => void
}) {
  return (
    <div className="group rounded-xl border border-border/40 bg-card/30 p-3 transition-shadow hover:shadow-sm">
      <div className="flex items-start gap-3">
        <div className="rounded-lg bg-muted/40 px-2 py-1 text-[11px] font-bold tabular-nums text-muted-foreground">
          {String(index).padStart(2, "0")}
        </div>
        <div className="min-w-0 flex-1">
          <h4 className="truncate text-[13px] font-semibold">
            {pair.topic.working_title}
          </h4>
          <div className="mt-1 flex flex-wrap items-center gap-1">
            <span className="rounded-md border border-primary/20 bg-primary/5 px-1.5 py-0.5 text-[9px] text-primary">
              {domainLabel(pair.topic.topic_domain)}
            </span>
            {pair.guest && (
              <span className="inline-flex items-center gap-0.5 rounded-md bg-muted/40 px-1.5 py-0.5 text-[9px] text-muted-foreground">
                <UserRound className="h-2.5 w-2.5" />
                {pair.guest.full_name}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
          {onEdit && (
            <button
              type="button"
              onClick={onEdit}
              className="rounded-md p-1.5 text-muted-foreground hover:bg-muted/40 hover:text-foreground"
              aria-label="تعديل"
            >
              <Pencil className="h-3 w-3" />
            </button>
          )}
          {onRegenerate && (
            <button
              type="button"
              onClick={onRegenerate}
              className="rounded-md p-1.5 text-muted-foreground hover:bg-muted/40 hover:text-foreground"
              aria-label="توليد بديل"
            >
              <RefreshCw className="h-3 w-3" />
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

function deriveCounts(pairs: AcceptedPair[]) {
  const by_domain: Record<string, number> = {}
  const by_gender: Record<string, number> = {}
  let guests = 0
  for (const p of pairs) {
    const d = p.topic.topic_domain ?? "none"
    by_domain[d] = (by_domain[d] ?? 0) + 1
    if (p.guest) {
      guests++
      const g = p.guest.gender ?? "unknown"
      by_gender[g] = (by_gender[g] ?? 0) + 1
    } else {
      by_gender["unknown"] = (by_gender["unknown"] ?? 0) + 1
    }
  }
  return { by_domain, by_gender, guests }
}

function domainLabel(d: string): string {
  const map: Record<string, string> = {
    philosophy: "فلسفة",
    psychology: "علم نفس",
    relationships: "علاقات",
    religion: "دين",
    identity_masculinity: "هوية",
    money_career: "مال ومهنة",
    technology_ai: "تقنية",
    internet_culture: "إنترنت",
    crime_mystery: "جريمة",
    hidden_history: "تاريخ خفي",
    power_manipulation: "سلطة",
    parenting: "تربية",
    kuwait_gulf: "كويت / خليج",
    historical: "تاريخي",
    social_issues: "قضايا",
    modern_society: "مجتمع",
    emotions_inner_life: "عواطف",
    none: "متعدد",
  }
  return map[d] ?? d
}
