"use client"

/**
 * The judging surface and the results screen.
 *
 * One pair at a time, not a scrolling list. Twenty pairs of Arabic prose on
 * one page invites comparing pair 7 against pair 3, which is not the question;
 * and the pair you can see while judging another is a source of anchoring.
 * Sequential also makes progress legible, which matters for a task whose
 * validity depends on finishing all twenty.
 *
 * Nothing here can compute the result while blind: the props carry no sources
 * and no model names until the server marks the session revealed.
 */

import { useState, useTransition } from "react"
import { AlertCircle, ArrowLeft, ArrowRight, Check, Eye, Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"
// Imported from the LEAF modules, never from `@/lib/ai-router/blind-panel`.
// That barrel re-exports `store.ts`, which imports `lib/db.ts` → `pg`; a
// single value import from it here drags the Postgres driver into the client
// bundle and the page 500s on `Can't resolve 'dns'`. `stats.ts` is pure by
// construction, which is exactly why it is a separate file.
import type { PanelTally, PanelVerdict, JudgeAgreement } from "@/lib/ai-router/blind-panel/stats"
import type { BlindPanelView } from "@/lib/ai-router/blind-panel/types"
import {
  CLEAR_DIFFERENCE_AT,
  NO_DIFFERENCE_AT_OR_BELOW,
} from "@/lib/ai-router/blind-panel/stats"
import { recordVerdictAction, revealPanelAction } from "./actions"
import { LimitsNote } from "./limits-note"

interface PanelResult {
  tally: PanelTally
  agreement: JudgeAgreement
  currentModel: string
  candidateModel: string
  judgeModel: string
  promptVersion: string
}

const SECTION_LABEL: Record<"titles" | "description", string> = {
  titles: "عناوين مقترحة",
  description: "وصف الحلقة",
}

export function BlindPanelClient({
  view,
  pairCount,
  result,
  judgedCount,
}: {
  view: BlindPanelView
  pairCount: number
  result: PanelResult | null
  judgedCount: number
}) {
  // Open on the first unjudged pair — resuming should not make you scroll
  // past work you already did.
  const firstUnjudged = view.pairs.findIndex((p) => p.verdict === null)
  const [cursor, setCursor] = useState(firstUnjudged === -1 ? 0 : firstUnjudged)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  if (view.revealed && result) {
    return <ResultView view={view} result={result} />
  }

  const pair = view.pairs[cursor]
  const allJudged = judgedCount >= view.pairs.length

  function choose(verdict: PanelVerdict) {
    setError(null)
    startTransition(async () => {
      const res = await recordVerdictAction(pair.index, verdict)
      if (!res.success) {
        setError(res.error ?? "تعذّر حفظ الحكم")
        return
      }
      // Advance to the next unjudged pair, if any remain.
      const next = view.pairs.findIndex((p, i) => i > cursor && p.verdict === null)
      if (next !== -1) setCursor(next)
      else if (cursor < view.pairs.length - 1) setCursor(cursor + 1)
    })
  }

  function reveal() {
    setError(null)
    startTransition(async () => {
      const res = await revealPanelAction()
      if (!res.success) setError(res.error ?? "تعذّر كشف النتيجة")
    })
  }

  return (
    <div dir="rtl" lang="ar" className="mx-auto max-w-4xl">
      <header className="mb-5">
        <h1 className="text-[26px] font-semibold leading-tight tracking-tight text-foreground">
          لوحة الحكم الأعمى
        </h1>
        <p className="mt-1.5 text-[15px] text-muted-foreground">
          اختر النص الأفضل. المصدر مخفي، والترتيب عشوائي في كل زوج.
        </p>
      </header>

      {/* Progress — the only running number shown while blind. It says how
          much is left, never who is ahead. */}
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <div
          className="h-1.5 min-w-[120px] flex-1 overflow-hidden rounded-full bg-muted"
          role="progressbar"
          aria-valuenow={judgedCount}
          aria-valuemin={0}
          aria-valuemax={view.pairs.length}
          aria-label="تقدّم التحكيم"
        >
          <div
            className="h-full rounded-full bg-primary transition-[width] duration-300"
            style={{ width: `${(judgedCount / view.pairs.length) * 100}%` }}
          />
        </div>
        <span className="text-[13px] font-medium tabular-nums text-muted-foreground" dir="ltr">
          {judgedCount} / {view.pairs.length}
        </span>
      </div>

      {/* Pair navigation */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <NavButton
            onClick={() => setCursor((c) => Math.max(0, c - 1))}
            disabled={cursor === 0}
            label="الزوج السابق"
          >
            <ArrowRight className="h-4 w-4" />
          </NavButton>
          <NavButton
            onClick={() => setCursor((c) => Math.min(view.pairs.length - 1, c + 1))}
            disabled={cursor === view.pairs.length - 1}
            label="الزوج التالي"
          >
            <ArrowLeft className="h-4 w-4" />
          </NavButton>
          <span className="text-[13px] text-muted-foreground">
            الزوج <span className="tabular-nums">{pair.index}</span> من{" "}
            <span className="tabular-nums">{pairCount}</span>
          </span>
        </div>
        <span className="rounded-full bg-muted/60 px-2.5 py-1 text-[11px] font-medium text-muted-foreground">
          {SECTION_LABEL[pair.section]}
        </span>
      </div>

      {/* Episode context — the judge needs to know what the text is FOR. */}
      <p className="mb-4 line-clamp-2 rounded-xl border border-border/60 bg-muted/25 px-3 py-2 text-[13px] text-muted-foreground">
        الحلقة: {pair.episodeTitle}
      </p>

      {/* The two outputs. Symmetric by construction — identical markup,
          identical styling, so nothing but the text can differ. */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <OutputCard
          slot="A"
          text={pair.aText}
          selected={pair.verdict === "a"}
          disabled={pending}
          onSelect={() => choose("a")}
        />
        <OutputCard
          slot="B"
          text={pair.bText}
          selected={pair.verdict === "b"}
          disabled={pending}
          onSelect={() => choose("b")}
        />
      </div>

      <button
        type="button"
        onClick={() => choose("tie")}
        disabled={pending}
        className={cn(
          "mt-4 inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl border px-4 py-2 text-[13px] font-semibold transition-colors",
          pair.verdict === "tie"
            ? "border-foreground bg-foreground text-background"
            : "border-border bg-card text-muted-foreground hover:text-foreground",
          pending && "opacity-60",
        )}
      >
        {pair.verdict === "tie" ? <Check className="h-4 w-4" /> : null}
        لا فرق
      </button>

      {error ? (
        <p
          role="alert"
          className="mt-4 flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2 text-[13px] text-destructive"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          {error}
        </p>
      ) : null}

      {/* Reveal is only offered once every pair is judged — the stopping rule
          is defined on a complete panel, and peeking early is optional
          stopping by another name. */}
      <div className="mt-6">
        <button
          type="button"
          onClick={reveal}
          disabled={!allJudged || pending}
          className={cn(
            "inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl px-4 py-2 text-[13px] font-semibold transition-colors",
            allJudged
              ? "bg-primary text-primary-foreground hover:bg-primary/90"
              : "cursor-not-allowed bg-muted text-muted-foreground",
          )}
        >
          {pending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Eye className="h-4 w-4" />
          )}
          {allJudged
            ? "اكشف المصادر والنتيجة"
            : `باقي ${view.pairs.length - judgedCount} زوج قبل الكشف`}
        </button>
      </div>

      <div className="mt-6">
        <LimitsNote variant="judging" />
      </div>

      <div className="mt-5">
        <StoppingRuleCard />
      </div>
    </div>
  )
}

function NavButton({
  onClick,
  disabled,
  label,
  children,
}: {
  onClick: () => void
  disabled: boolean
  label: string
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-border bg-card text-muted-foreground transition-colors hover:text-foreground disabled:opacity-40 sm:h-9 sm:w-9"
    >
      {children}
    </button>
  )
}

function OutputCard({
  slot,
  text,
  selected,
  disabled,
  onSelect,
}: {
  slot: "A" | "B"
  text: string
  selected: boolean
  disabled: boolean
  onSelect: () => void
}) {
  return (
    <div
      className={cn(
        "flex flex-col rounded-2xl border bg-card p-4 transition-colors",
        selected ? "border-primary ring-1 ring-primary/40" : "border-border",
      )}
    >
      <div className="mb-3 flex items-center justify-between">
        <span
          dir="ltr"
          className="inline-flex h-6 w-6 items-center justify-center rounded-md bg-muted text-[13px] font-bold text-foreground"
        >
          {slot}
        </span>
        {selected ? (
          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-primary">
            <Check className="h-3.5 w-3.5" />
            مختار
          </span>
        ) : null}
      </div>
      <p className="mb-4 flex-1 whitespace-pre-wrap text-[15px] leading-relaxed text-foreground">
        {text}
      </p>
      <button
        type="button"
        onClick={onSelect}
        disabled={disabled}
        className={cn(
          "inline-flex min-h-[44px] items-center justify-center rounded-xl px-4 py-2 text-[13px] font-semibold transition-colors",
          selected
            ? "bg-primary text-primary-foreground"
            : "border border-border bg-card text-foreground hover:bg-muted/50",
          disabled && "opacity-60",
        )}
      >
        اختر {slot}
      </button>
    </div>
  )
}

/**
 * The stopping rule, printed where the judging happens.
 *
 * Printed BEFORE the result exists, on purpose. A threshold you read after
 * seeing the numbers is not a threshold — it is a preference. This is the
 * rule as approved, unchanged.
 */
function StoppingRuleCard() {
  return (
    <section
      aria-label="قاعدة التوقف"
      className="rounded-2xl border border-border bg-card p-4"
    >
      <h2 className="mb-3 text-[13px] font-semibold text-foreground">
        قاعدة التوقف — مكتوبة سلفاً، قبل أي نتيجة
      </h2>
      <ul className="space-y-2 text-[13px] leading-relaxed text-foreground/85">
        <RuleRow range={`≥ ${CLEAR_DIFFERENCE_AT}–${20 - CLEAR_DIFFERENCE_AT}`} tone="clear">
          فرق واضح.
        </RuleRow>
        <RuleRow
          range={`≤ ${NO_DIFFERENCE_AT_OR_BELOW}–${20 - NO_DIFFERENCE_AT_OR_BELOW}`}
          tone="none"
        >
          لا فرق يُكشف — <strong className="font-semibold">نبقى على الحالي</strong>.
        </RuleRow>
        <RuleRow range="13–7" tone="mid">
          الحالة الوحيدة التي تستحق ٢٠ زوجًا إضافية.
        </RuleRow>
      </ul>
      <p className="mt-3 border-t border-border/60 pt-3 text-[11px] leading-relaxed text-muted-foreground">
        العدّ على الجانب الأكبر من ٢٠. «لا فرق» ما يُحسب لأي جانب — يعني يدفع
        النتيجة ناحية «ما فيه فرق»، وهذا الاتجاه المحافظ المقصود.
      </p>
    </section>
  )
}

function RuleRow({
  range,
  tone,
  children,
}: {
  range: string
  tone: "clear" | "none" | "mid"
  children: React.ReactNode
}) {
  const toneClass =
    tone === "clear"
      ? "bg-emerald-500/12 text-emerald-700"
      : tone === "none"
        ? "bg-muted text-muted-foreground"
        : "bg-amber-500/12 text-amber-700"
  return (
    <li className="flex flex-wrap items-baseline gap-2">
      <span
        dir="ltr"
        className={cn(
          "rounded-md px-2 py-0.5 text-[11px] font-semibold tabular-nums",
          toneClass,
        )}
      >
        {range}
      </span>
      <span>{children}</span>
    </li>
  )
}

// ─── Results ────────────────────────────────────────────────────────────────

const OUTCOME_COPY: Record<
  PanelTally["outcome"],
  { title: string; body: string; tone: "clear" | "none" | "mid" }
> = {
  clear_difference: {
    title: "فرق واضح",
    body: "النتيجة عدّت عتبة القاعدة المكتوبة سلفاً.",
    tone: "clear",
  },
  no_difference: {
    title: "لا فرق يمكن كشفه — نبقى على الحالي",
    body: "هذا مو تعادل بالصدفة: عند ٢٠ زوجًا، أي نتيجة بهذا المدى تقع داخل مجال الثقة، فما فيه ما يبرّر التبديل.",
    tone: "none",
  },
  inconclusive: {
    title: "غير حاسم — الحالة الوحيدة التي تستحق ٢٠ إضافية",
    body: "١٣–٧ هي بالضبط الحالة التي حُدِّدت سلفاً كمبرّر وحيد لتمديد القياس.",
    tone: "mid",
  },
  incomplete: {
    title: "الجلسة ما اكتملت",
    body: "القاعدة معرّفة على لوحة كاملة.",
    tone: "mid",
  },
}

function ResultView({ view, result }: { view: BlindPanelView; result: PanelResult }) {
  const { tally, agreement } = result
  const copy = OUTCOME_COPY[tally.outcome]
  const leaderModel =
    tally.leader === "current"
      ? result.currentModel
      : tally.leader === "candidate"
        ? result.candidateModel
        : null

  return (
    <div dir="rtl" lang="ar" className="mx-auto max-w-4xl">
      <header className="mb-6">
        <h1 className="text-[26px] font-semibold leading-tight tracking-tight text-foreground">
          نتيجة لوحة الحكم الأعمى
        </h1>
        <p className="mt-1.5 text-[13px] text-muted-foreground">
          <span dir="ltr" className="font-mono">
            {result.currentModel}
          </span>{" "}
          (الحالي) مقابل{" "}
          <span dir="ltr" className="font-mono">
            {result.candidateModel}
          </span>{" "}
          · البرومبت{" "}
          <span dir="ltr" className="font-mono">
            {result.promptVersion}
          </span>
        </p>
      </header>

      <section
        className={cn(
          "mb-5 rounded-2xl border p-5",
          copy.tone === "clear"
            ? "border-emerald-500/30 bg-emerald-500/[0.07]"
            : copy.tone === "mid"
              ? "border-amber-500/30 bg-amber-500/[0.07]"
              : "border-border bg-card",
        )}
      >
        <h2 className="text-[17px] font-semibold text-foreground">{copy.title}</h2>
        <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">{copy.body}</p>

        <div className="mt-4 flex flex-wrap items-end gap-x-6 gap-y-3">
          <Figure
            label="الحالي"
            value={tally.currentWins}
            sub={result.currentModel}
            subIsModelId
            emphasise={tally.leader === "current"}
          />
          <Figure
            label="المرشّح"
            value={tally.candidateWins}
            sub={result.candidateModel}
            subIsModelId
            emphasise={tally.leader === "candidate"}
          />
          <Figure label="لا فرق" value={tally.ties} sub="غير محسوب لأي جانب" />
        </div>

        {/* The CI, stated explicitly and next to the headline — not in a
            footnote. It is the number that decides whether the split above
            means anything. */}
        <div className="mt-4 rounded-xl border border-border/60 bg-background/60 p-3">
          <p className="text-[13px] leading-relaxed text-foreground/85">
            الجانب الأكبر:{" "}
            <strong className="font-semibold tabular-nums" dir="ltr">
              {tally.leaderCount}/{tally.total}
            </strong>{" "}
            ={" "}
            <strong className="font-semibold tabular-nums" dir="ltr">
              {tally.leaderSharePct.toFixed(1)}%
            </strong>{" "}
            ± <span className="tabular-nums" dir="ltr">{tally.marginPct.toFixed(1)}</span>{" "}
            نقطة (مجال ثقة ٩٥٪ عند{" "}
            <span className="tabular-nums" dir="ltr">
              n={tally.total}
            </span>
            ).
          </p>
          <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
            اختبار الإشارة ثنائي الطرف على الأزواج المحسومة (
            <span className="tabular-nums" dir="ltr">
              n={tally.signTestN}
            </span>
            ):{" "}
            <span className="tabular-nums" dir="ltr">
              p = {tally.pValue.toFixed(3)}
            </span>
            . القاعدة أعلاه <strong className="font-semibold">قرارية لا إحصائية</strong> —
            اختيرت سلفاً لتحديد متى نتوقف، وقد تختلف عن الـ p عند الحدود. الرقمان
            معروضان الاثنان عمداً بدل اختيار الأنسب منهما.
          </p>
        </div>

        {leaderModel && tally.outcome === "clear_difference" ? (
          <p className="mt-3 text-[13px] text-foreground">
            الأفضل في هذي اللوحة:{" "}
            <strong className="font-mono font-semibold" dir="ltr">
              {leaderModel}
            </strong>
          </p>
        ) : null}
      </section>

      <section className="mb-5 rounded-2xl border border-border bg-card p-5">
        <h2 className="text-[15px] font-semibold text-foreground">
          الحَكَم النموذجي — مقاسًا، لا مُقرِّرًا
        </h2>
        <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">
          نفس الحَكَم (
          <span dir="ltr" className="font-mono">
            {result.judgeModel}
          </span>
          ) هو اللي يعطي درجة <span dir="ltr" className="font-mono">quality_net</span> في
          كل مقارنة موديلات آلية. وزنه في القرار أعلاه = صفر؛ شغّلناه فقط عشان
          نقيسه.
        </p>
        {agreement.agreementPct === null ? (
          <p className="mt-3 text-[13px] text-muted-foreground">
            ما فيه أحكام قابلة للمقارنة.
          </p>
        ) : (
          <>
            <div className="mt-4 flex flex-wrap items-end gap-x-6 gap-y-3">
              <Figure
                label="اتفاقه معك"
                value={`${agreement.agreementPct.toFixed(0)}%`}
                sub={`${agreement.agreed} من ${agreement.comparable}`}
              />
              <Figure
                label="الاتفاق بالصدفة"
                value={
                  agreement.chancePct === null ? "—" : `${agreement.chancePct.toFixed(0)}%`
                }
                sub="من توزيع أحكامكما"
              />
            </div>
            <p className="mt-3 text-[13px] leading-relaxed text-foreground/85">
              {agreement.chancePct !== null &&
              agreement.agreementPct - agreement.chancePct < 10
                ? "اتفاقه ما يتجاوز الصدفة بفرق يُعتد به — يعني درجة الجودة الآلية في مقارنات الموديلات ضجيج بفاصلة عشرية، ولا ينبغي أن تُرجّح قرار تبنٍّ لوحدها."
                : "اتفاقه يتجاوز الصدفة — يعني الحَكَم الآلي يلتقط شيئًا حقيقيًا من ذوقك، لكن يظل مؤشرًا لا قرارًا."}
            </p>
          </>
        )}
      </section>

      <LimitsNote variant="result" />

      <p className="mt-5 text-[11px] text-muted-foreground">
        كُشفت في{" "}
        <span dir="ltr" className="font-mono tabular-nums">
          {view.revealedAt}
        </span>
        . الأحكام مقفلة بعد الكشف — إعادة التحكيم تحتاج جلسة جديدة.
      </p>
    </div>
  )
}

function Figure({
  label,
  value,
  sub,
  /**
   * True when `sub` is a model id — Latin, monospace, and needing `dir="ltr"`
   * inside this RTL page. Default FALSE, because the other subs are Arabic
   * ("7 من 20", "غير محسوب لأي جانب") and forcing LTR on those hands the
   * bidi-neutral spaces to the wrong run: "7 من 20" paints as "من 20 7".
   * Same UAX#9 rule as the ops timestamps — an LTR override is only correct
   * over an actually-LTR string.
   */
  subIsModelId,
  emphasise,
}: {
  label: string
  value: number | string
  sub?: string
  subIsModelId?: boolean
  emphasise?: boolean
}) {
  return (
    <div>
      <div className="text-[11px] font-medium text-muted-foreground">{label}</div>
      <div
        className={cn(
          "mt-0.5 text-[26px] font-bold leading-none tabular-nums",
          emphasise ? "text-foreground" : "text-foreground/70",
        )}
        dir="ltr"
      >
        {value}
      </div>
      {sub ? (
        <div
          className={cn(
            "mt-1 text-[11px] text-muted-foreground",
            subIsModelId && "font-mono",
          )}
          {...(subIsModelId ? { dir: "ltr" as const } : {})}
        >
          {sub}
        </div>
      ) : null}
    </div>
  )
}
