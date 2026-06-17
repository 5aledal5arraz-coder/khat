/**
 * Phase X Step 4 — Preparation V2 read-only view.
 *
 * Server component. Renders the structured prep_v2 payload above the
 * legacy studio. Falls back gracefully when prep_v2 is null.
 */

import { Sparkles, Mic, Compass, Eye, AlertTriangle } from "lucide-react"
import type { PrepV2Payload, PrepV2Question, SectionKind } from "@/lib/preparation/v2/types"
import { Empty } from "../../components/ui-kit"

const SECTION_LABEL_AR: Record<SectionKind, string> = {
  opening: "افتتاحية",
  build_up: "بناء التوتر",
  conflict: "المواجهة",
  deep_dive: "الغوص العميق",
  emotional_peak: "الذروة العاطفية",
  resolution: "الخاتمة",
}

const TYPE_LABEL_AR: Record<string, string> = {
  emotional: "عاطفي",
  philosophical: "فلسفي",
  personal: "شخصي",
  confrontational: "مواجهة",
  reflective: "تأملي",
  factual: "سياقي",
}

export function PrepV2View({ payload }: { payload: PrepV2Payload }) {
  const totalQ = payload.question_bank.length
  const mustAsk = payload.question_bank.filter((q) => q.priority === "must_ask").length
  const total = payload.total_estimated_minutes

  return (
    <div className="mb-6 space-y-6 rounded-3xl border border-violet-500/20 bg-gradient-to-br from-violet-500/5 to-primary/5 p-6">
      {/* ── Hero ────────────────────────────────────────────────────── */}
      <div>
        <div className="mb-2 inline-flex items-center gap-1.5 text-[11px] font-medium text-violet-200">
          <Sparkles className="h-3 w-3" />
          إعداد V2 — ضمير التحرير
        </div>
        <h2 className="text-[15px] font-semibold leading-snug text-foreground">
          {payload.thesis}
        </h2>
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Stat label="مدة مقدّرة" value={`${total} د`} />
          <Stat label="أسئلة" value={String(totalQ)} />
          <Stat label="must_ask" value={String(mustAsk)} />
          <Stat label="عدسة" value={payload.generator_version} ltr />
        </div>
      </div>

      {/* ── Axes of tension ─────────────────────────────────────────── */}
      <Section title="محاور التوتر" icon={<Compass className="h-3.5 w-3.5" />}>
        <ul className="grid grid-cols-1 gap-1.5 text-[12px] text-foreground/85 sm:grid-cols-2">
          {payload.axes_of_tension.map((a, i) => (
            <li
              key={i}
              className="rounded-lg border border-border/40 bg-background/40 px-2.5 py-1.5"
            >
              <span className="me-1 text-muted-foreground/70" dir="ltr">
                {i + 1}.
              </span>
              {a}
            </li>
          ))}
        </ul>
      </Section>

      {/* ── Guest extraction strategy ───────────────────────────────── */}
      <Section title="استراتيجية استخراج الضيف">
        <p className="text-[12.5px] leading-relaxed text-foreground/85">
          {payload.guest_extraction_strategy}
        </p>
      </Section>

      {/* ── Sections + per-section questions ────────────────────────── */}
      <Section title="هيكل الحلقة + بنك الأسئلة">
        <div className="space-y-4">
          {payload.episode_sections.map((s) => {
            const qs = payload.question_bank.filter((q) => q.section === s.kind)
            return (
              <div
                key={s.kind}
                className="rounded-2xl border border-border/40 bg-background/40 p-4"
              >
                <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
                  <h3 className="text-[12.5px] font-semibold text-foreground">
                    {SECTION_LABEL_AR[s.kind]}
                  </h3>
                  <div className="text-[10.5px] text-muted-foreground" dir="ltr">
                    {s.estimated_minutes} min · {s.target_emotion} · {qs.length} q
                  </div>
                </div>
                <p className="mb-2 text-[12px] leading-relaxed text-foreground/80">
                  {s.intent}
                </p>
                <p className="mb-3 text-[11px] italic text-muted-foreground/80">
                  → {s.transition_goal}
                </p>
                {qs.length === 0 ? (
                  <Empty text="(no questions in this section)" />
                ) : (
                  <ul className="space-y-2">
                    {qs.map((q) => (
                      <QuestionRow key={q.id} q={q} />
                    ))}
                  </ul>
                )}
              </div>
            )
          })}
        </div>
      </Section>

      {/* ── Host + director guidance ────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Section title="إرشاد المضيف" icon={<Mic className="h-3.5 w-3.5" />}>
          <p className="mb-2 text-[12px] text-foreground/80">
            <strong>النبرة:</strong> {payload.host_guidance.overall_tone}
          </p>
          <p className="mb-2 text-[12px] italic text-muted-foreground/85">
            {payload.host_guidance.energy_curve}
          </p>
          <ListBlock label="افعل" items={payload.host_guidance.do_list} good />
          <ListBlock label="لا" items={payload.host_guidance.dont_list} />
        </Section>
        <Section title="إرشاد المخرج" icon={<Eye className="h-3.5 w-3.5" />}>
          <ListBlock
            label="لقطات أولوية"
            items={payload.director_guidance.shot_priorities}
          />
          <ListBlock
            label="لحظات صمت"
            items={payload.director_guidance.silence_moments}
          />
          {payload.director_guidance.cut_warnings.length > 0 && (
            <ListBlock
              label="تحذيرات قطع"
              items={payload.director_guidance.cut_warnings}
              warn
            />
          )}
        </Section>
      </div>

      {/* ── Sensitive zones ─────────────────────────────────────────── */}
      {payload.sensitive_zones.length > 0 && (
        <Section
          title="مناطق حسّاسة"
          icon={<AlertTriangle className="h-3.5 w-3.5 text-amber-300" />}
        >
          <ul className="list-inside list-disc space-y-0.5 text-[12px] text-foreground/85">
            {payload.sensitive_zones.map((z, i) => (
              <li key={i}>{z}</li>
            ))}
          </ul>
        </Section>
      )}

      {/* ── Opening + closing options ───────────────────────────────── */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Section title="خيارات الافتتاح">
          <ApproachList items={payload.opening_options} />
        </Section>
        <Section title="خيارات الختام">
          <ApproachList items={payload.closing_options} />
        </Section>
      </div>
    </div>
  )
}

// ─── Subcomponents ────────────────────────────────────────────────────

function QuestionRow({ q }: { q: PrepV2Question }) {
  return (
    <li className="rounded-lg border border-border/30 bg-background/30 p-2.5">
      <div className="mb-1 flex flex-wrap items-center gap-1.5">
        <PriorityChip priority={q.priority} />
        {q.types.map((t) => (
          <span
            key={t}
            className="rounded-full border border-border/40 px-1.5 py-0.5 text-[9.5px] text-muted-foreground"
          >
            {TYPE_LABEL_AR[t] ?? t}
          </span>
        ))}
        <RiskChip risk={q.risk_level} />
      </div>
      <div className="text-[12.5px] font-medium leading-snug text-foreground">
        {q.text}
      </div>
      {q.purpose && (
        <div className="mt-1 text-[11px] text-muted-foreground/80">
          {q.purpose}
        </div>
      )}
      {q.follow_up_prompt && (
        <div className="mt-1 text-[11px] text-foreground/75">
          ↳ {q.follow_up_prompt}
        </div>
      )}
    </li>
  )
}

function PriorityChip({ priority }: { priority: "must_ask" | "if_time" }) {
  if (priority === "must_ask") {
    return (
      <span className="rounded-full bg-emerald-500/10 px-1.5 py-0.5 text-[9.5px] font-medium text-emerald-300">
        must_ask
      </span>
    )
  }
  return (
    <span className="rounded-full bg-muted/30 px-1.5 py-0.5 text-[9.5px] text-muted-foreground">
      if_time
    </span>
  )
}

function RiskChip({ risk }: { risk: "low" | "medium" | "high" }) {
  const cls =
    risk === "high"
      ? "bg-rose-500/10 text-rose-300"
      : risk === "medium"
        ? "bg-amber-500/10 text-amber-300"
        : "bg-sky-500/10 text-sky-300"
  return (
    <span className={`rounded-full px-1.5 py-0.5 text-[9.5px] ${cls}`} dir="ltr">
      risk: {risk}
    </span>
  )
}

function ListBlock({
  label,
  items,
  good,
  warn,
}: {
  label: string
  items: string[]
  good?: boolean
  warn?: boolean
}) {
  if (items.length === 0) return null
  const tone = good
    ? "text-emerald-300"
    : warn
      ? "text-amber-300"
      : "text-foreground/85"
  return (
    <div className="mb-2">
      <div className={`text-[10.5px] uppercase tracking-wider ${tone}`}>{label}</div>
      <ul className="mt-1 list-inside list-disc space-y-0.5 text-[12px] text-foreground/85">
        {items.map((x, i) => (
          <li key={i}>{x}</li>
        ))}
      </ul>
    </div>
  )
}

function ApproachList({
  items,
}: {
  items: Array<{ approach: string; text: string }>
}) {
  if (items.length === 0) return <Empty text="(none)" />
  return (
    <ul className="space-y-3">
      {items.map((o, i) => (
        <li
          key={i}
          className="rounded-xl border border-border/40 bg-background/40 p-3"
        >
          <div className="text-[10.5px] uppercase tracking-wider text-muted-foreground/70">
            {o.approach}
          </div>
          <div className="mt-1 text-[12.5px] leading-relaxed text-foreground/90">
            {o.text}
          </div>
        </li>
      ))}
    </ul>
  )
}

function Section({
  title,
  icon,
  children,
}: {
  title: string
  icon?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <section>
      <h3 className="mb-2 inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/80">
        {icon}
        {title}
      </h3>
      {children}
    </section>
  )
}

function Stat({
  label,
  value,
  ltr,
}: {
  label: string
  value: string
  ltr?: boolean
}) {
  return (
    <div className="rounded-xl border border-border/40 bg-background/40 p-2.5">
      <div className="text-[9.5px] uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div
        className="text-[14px] font-semibold tabular-nums"
        dir={ltr ? "ltr" : undefined}
      >
        {value}
      </div>
    </div>
  )
}
