/**
 * Phase X Step 4 — Preparation V2 read-only view.
 *
 * Server component. Renders the structured prep_v2 payload above the
 * legacy studio. Falls back gracefully when prep_v2 is null.
 */

import { Sparkles, Mic, Compass, Eye, AlertTriangle } from "lucide-react"
import type { PrepV2Payload, PrepV2Question } from "@/lib/preparation/v2/types"
import {
  PREP_FORMAT_LABEL_AR,
  prepFormatOf,
  sectionLabelAr,
} from "@/lib/preparation/v2/format"
import { formatArabicCount } from "@/lib/shared/formatters"
import { Empty } from "../../components/ui-kit"

/*
 * Typography note — sizes here are taken from the scale already in use on
 * `/admin/ops` and the recording preflight screens (11 · 13 · 15 · 17 · 20),
 * not invented. The question text is the largest body size on the page on
 * purpose: it is the one string a human reads OUT LOUD, off a screen, while
 * a guest is sitting opposite him.
 */

/**
 * Display-only Arabic for the stored enums. The VALUES in the database stay
 * `must_ask` / `if_time` / `low|medium|high` — only the rendering is Arabic.
 */
const PRIORITY_LABEL_AR: Record<PrepV2Question["priority"], string> = {
  must_ask: "أساسي",
  if_time: "إن سمح الوقت",
}

const RISK_LABEL_AR: Record<PrepV2Question["risk_level"], string> = {
  low: "منخفضة",
  medium: "متوسطة",
  high: "مرتفعة",
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
  // Count what the section list below actually renders: a question filed under
  // a slot the prep has no section for is not shown, so it must not be counted.
  const shownKinds = new Set<string>(payload.episode_sections.map((s) => s.kind))
  const shownQuestions = payload.question_bank.filter((q) => shownKinds.has(q.section))
  const totalQ = shownQuestions.length
  const mustAsk = shownQuestions.filter((q) => q.priority === "must_ask").length
  const total = payload.total_estimated_minutes
  // A course reuses the story fields with course meaning (see format.ts):
  // axes_of_tension are its learning threads, sections are its modules.
  const isCourse = prepFormatOf(payload) === "course"

  return (
    <div className="mb-6 space-y-6 rounded-3xl border border-primary/20 bg-gradient-to-br from-primary/5 to-primary/5 p-6">
      {/* ── Hero ────────────────────────────────────────────────────── */}
      <div>
        <div className="mb-2 inline-flex items-center gap-1.5 text-[13px] font-medium text-primary">
          <Sparkles className="h-3.5 w-3.5" />
          إعداد V2 — ضمير التحرير
          <span className="ms-1 rounded-full border border-primary/30 px-2 py-0.5 text-[11px]">
            {PREP_FORMAT_LABEL_AR[prepFormatOf(payload)]}
          </span>
        </div>
        <h2 className="text-[20px] font-semibold leading-snug text-foreground">
          {payload.thesis}
        </h2>
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Stat label="مدة مقدّرة" value={`${total} د`} />
          <Stat label="أسئلة" value={String(totalQ)} />
          <Stat label="أسئلة أساسية" value={String(mustAsk)} />
          {/* Was labelled «عدسة» (lens), which describes nothing about a
              generator version string. */}
          <Stat label="إصدار المولّد" value={payload.generator_version} ltr />
        </div>
      </div>

      {/* ── Axes of tension ─────────────────────────────────────────── */}
      <Section title={isCourse ? "محاور التعلّم" : "محاور التوتر"} icon={<Compass className="h-3.5 w-3.5" />}>
        <ul className="grid grid-cols-1 gap-1.5 text-[13px] text-foreground/85 sm:grid-cols-2">
          {payload.axes_of_tension.map((a, i) => (
            <li
              key={i}
              className="rounded-lg border border-border/40 bg-background/40 px-2.5 py-1.5"
            >
              <span className="me-1 text-muted-foreground" dir="ltr">
                {i + 1}.
              </span>
              {a}
            </li>
          ))}
        </ul>
      </Section>

      {/* ── Guest extraction strategy ───────────────────────────────── */}
      <Section title="استراتيجية استخراج الضيف">
        <p className="text-[13px] leading-relaxed text-foreground/85">
          {payload.guest_extraction_strategy}
        </p>
      </Section>

      {/* ── Sections + per-section questions ────────────────────────── */}
      <Section title={isCourse ? "وحدات الدورة + بنك الأسئلة" : "هيكل الحلقة + بنك الأسئلة"}>
        <div className="space-y-4">
          {payload.episode_sections.map((s, idx) => {
            const qs = payload.question_bank.filter((q) => q.section === s.kind)
            return (
              <div
                key={s.kind}
                className="rounded-2xl border border-border/40 bg-background/40 p-4"
              >
                <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
                  <h3 className="text-[17px] font-semibold text-foreground">
                    {isCourse && (
                      <span className="me-1.5 text-muted-foreground">
                        الوحدة {idx + 1}:
                      </span>
                    )}
                    {sectionLabelAr(s.kind, payload.episode_sections)}
                  </h3>
                  {/* Was `6 min · فضول · 4 q` forced to dir="ltr" — two English
                      units and an LTR override on a line that is mostly Arabic. */}
                  <div className="text-[13px] text-muted-foreground">
                    {formatArabicCount(s.estimated_minutes, "دقيقة")}
                    {" · "}
                    {s.target_emotion}
                    {" · "}
                    {formatArabicCount(qs.length, "سؤال")}
                  </div>
                </div>
                <p className="mb-2 text-[13px] leading-relaxed text-foreground/80">
                  {s.intent}
                </p>
                {isCourse && <CourseModuleDetails section={s} />}
                <p className="mb-3 text-[13px] italic text-muted-foreground/80">
                  <span aria-hidden="true">←</span> {s.transition_goal}
                </p>
                {qs.length === 0 ? (
                  <Empty text="لا توجد أسئلة في هذا القسم." />
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
          <p className="mb-2 text-[13px] text-foreground/80">
            <strong>النبرة:</strong> {payload.host_guidance.overall_tone}
          </p>
          <p className="mb-2 text-[13px] italic text-muted-foreground/85">
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
          icon={<AlertTriangle className="h-3.5 w-3.5 text-amber-700" />}
        >
          <ul className="list-inside list-disc space-y-0.5 text-[13px] text-foreground/85">
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
      <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
        <PriorityChip priority={q.priority} />
        {q.types.map((t) => (
          <span
            key={t}
            className="rounded-full border border-border/40 px-2 py-0.5 text-[12px] text-muted-foreground"
          >
            {TYPE_LABEL_AR[t] ?? t}
          </span>
        ))}
        <RiskChip risk={q.risk_level} />
      </div>
      {/* 17px: the single string a host reads out loud, mid-recording. */}
      <div className="text-[17px] font-medium leading-relaxed text-foreground">
        {q.text}
      </div>
      {q.purpose && (
        <div className="mt-1 text-[13px] text-muted-foreground">
          {q.purpose}
        </div>
      )}
      {q.follow_up_prompt && (
        <div className="mt-1 text-[13px] text-foreground/75">
          {/* ↳ points right; in an RTL column the follow-up hangs to the LEFT. */}
          <span aria-hidden="true">↲</span> {q.follow_up_prompt}
        </div>
      )}
    </li>
  )
}

function PriorityChip({ priority }: { priority: PrepV2Question["priority"] }) {
  if (priority === "must_ask") {
    return (
      <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[12px] font-medium text-emerald-800">
        {PRIORITY_LABEL_AR.must_ask}
      </span>
    )
  }
  return (
    <span className="rounded-full bg-muted/30 px-2 py-0.5 text-[12px] text-muted-foreground">
      {PRIORITY_LABEL_AR.if_time}
    </span>
  )
}

function RiskChip({ risk }: { risk: PrepV2Question["risk_level"] }) {
  const cls =
    risk === "high"
      ? "bg-rose-500/10 text-rose-800"
      : risk === "medium"
        ? "bg-amber-500/10 text-amber-800"
        : "bg-sky-500/10 text-sky-800"
  // Was `risk: low` under dir="ltr" — an English key and an English value,
  // 28 times, on an Arabic screen.
  return (
    <span className={`rounded-full px-2 py-0.5 text-[12px] ${cls}`}>
      خطورة: {RISK_LABEL_AR[risk]}
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
    ? "text-emerald-700"
    : warn
      ? "text-amber-700"
      : "text-foreground/85"
  return (
    <div className="mb-2">
      {/* `uppercase` does nothing to Arabic glyphs and `tracking-wider` only
          loosens its cursive joins, so both are dropped wherever the label is
          Arabic; the weight now carries the emphasis instead. */}
      <div className={`text-[13px] font-medium ${tone}`}>{label}</div>
      <ul className="mt-1 list-inside list-disc space-y-0.5 text-[13px] text-foreground/85">
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
  if (items.length === 0) return <Empty text="لا توجد خيارات." />
  return (
    <ul className="space-y-3">
      {items.map((o, i) => (
        <li
          key={i}
          className="rounded-xl border border-border/40 bg-background/40 p-3"
        >
          <div className="text-[13px] font-medium text-muted-foreground">
            {o.approach}
          </div>
          {/* Opening/closing lines are also read aloud — 15px, not 12.5. */}
          <div className="mt-1 text-[15px] leading-relaxed text-foreground/90">
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
      <h3 className="mb-2 inline-flex items-center gap-1.5 text-[15px] font-semibold text-foreground/70">
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
      <div className="text-[12px] text-muted-foreground">{label}</div>
      <div
        className="text-[20px] font-semibold tabular-nums"
        dir={ltr ? "ltr" : undefined}
      >
        {value}
      </div>
    </div>
  )
}

/** Course-format module fields — rendered only when present. */
function CourseModuleDetails({
  section,
}: {
  section: PrepV2Payload["episode_sections"][number]
}) {
  const rows: { label: string; value: string }[] = [
    { label: "هدف التعلّم", value: section.learning_objective ?? "" },
    { label: "الأداة العملية", value: section.takeaway_tool ?? "" },
    { label: "مكان تجربة الضيف", value: section.guest_experience_fit ?? "" },
  ].filter((r) => r.value.trim().length > 0)
  const concepts = section.key_concepts ?? []
  if (rows.length === 0 && concepts.length === 0) return null
  return (
    <div className="mb-3 space-y-1.5 rounded-xl border border-border/40 bg-card/60 p-3 text-[13px]">
      {rows.map((r) => (
        <p key={r.label} className="leading-relaxed text-foreground/85">
          <strong className="me-1 text-foreground">{r.label}:</strong>
          {r.value}
        </p>
      ))}
      {concepts.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <strong className="text-foreground">مفاهيم وأطر:</strong>
          {concepts.map((c, i) => (
            <span
              key={i}
              className="rounded-full border border-border/60 bg-background px-2 py-0.5 text-[12px] text-foreground/85"
            >
              {c}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
