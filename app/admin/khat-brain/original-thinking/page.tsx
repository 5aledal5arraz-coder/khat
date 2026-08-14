/**
 * Phase X Step 2 — Original Thinking admin page.
 *
 * Read-only list with one action button (generate 10). Server-rendered;
 * no client-side state machine. Designed to be replaced by a richer
 * Studio-style UI later if/when the editor wants more controls.
 */

import { Sparkles, Lock, Clock, Eye } from "lucide-react"
import { listOriginalThinkingTopics } from "@/lib/original-thinking/bank"
import { loadLenses } from "@/lib/original-thinking/lenses"
import { formatDateTime } from "@/lib/shared/formatters"
import { GenerateTopicsButton } from "./_components/generate-topics-button"
import { CleanupExpiredButton } from "./_components/cleanup-expired-button"
import { MarkConsumedButton } from "./_components/mark-consumed-button"
import { Empty } from "../../components/ui-kit"

export const dynamic = "force-dynamic"

export default async function OriginalThinkingPage() {
  const [topics, lenses] = await Promise.all([
    listOriginalThinkingTopics({ includeConsumed: true, includeExpired: true, limit: 200 }),
    loadLenses(),
  ])

  const lensByKey = new Map(lenses.map((l) => [l.key, l]))
  const fresh = topics.filter((t) => !t.is_consumed && !t.is_expired)
  const consumed = topics.filter((t) => t.is_consumed)
  const expired = topics.filter((t) => t.is_expired && !t.is_consumed)

  return (
    <div className="mx-auto max-w-6xl space-y-8 p-6">
      {/* ── Hero ─────────────────────────────────────────────────── */}
      <div className="rounded-3xl border border-primary/20 bg-gradient-to-br from-primary/5 via-primary/5 to-transparent p-6">
        <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/5 px-3 py-1 text-[11px] font-medium text-primary">
          <Sparkles className="h-3 w-3" />
          ضمير التحرير — Khat Brain
        </div>
        <h1 className="text-2xl font-bold tracking-tight">التفكير الأصيل</h1>
        <p className="mt-2 max-w-2xl text-[12.5px] leading-relaxed text-muted-foreground">
          مولّد المواضيع العميقة. لا يقرأ بيانات السوق ولا يقلّد العناوين الرائجة.
          يستخدم العدسات التحريرية المرسومة يدوياً لاقتراح أفكار حقيقية، نادرة،
          غير معادة.
        </p>

        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="مواضيع طازجة" value={fresh.length} />
          <Stat label="مستهلكة" value={consumed.length} />
          <Stat label="منتهية" value={expired.length} />
          <Stat label="عدسات" value={lenses.length} />
        </div>

        <div className="mt-5 flex flex-wrap items-start gap-3">
          <GenerateTopicsButton />
          <CleanupExpiredButton />
        </div>
      </div>

      {/* ── Lens registry ────────────────────────────────────────── */}
      <Section title="العدسات التحريرية" subtitle={`${lenses.length} عدسة (يدوية)`}>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
          {lenses.map((l) => (
            <div
              key={l.key}
              className="rounded-2xl border border-border/40 bg-background/40 p-4"
            >
              <div className="mb-1 text-[12.5px] font-semibold">{l.name_ar}</div>
              <div className="mb-2 text-[10.5px] text-muted-foreground/70" dir="ltr">
                {l.key}
              </div>
              <p className="text-[12px] leading-relaxed text-foreground/80">
                {l.description_ar}
              </p>
            </div>
          ))}
        </div>
      </Section>

      {/* ── Fresh topics ─────────────────────────────────────────── */}
      <Section title="المواضيع الطازجة" subtitle={`${fresh.length} غير مستهلكة`}>
        {fresh.length === 0 ? (
          <Empty text="لا توجد مواضيع طازجة بعد. اضغط زر الإنشاء أعلاه." />
        ) : (
          <ul className="space-y-3">
            {fresh.map((t) => (
              <TopicCard key={t.id} topic={t} lensName={lensByKey.get(t.lens)?.name_ar ?? t.lens} />
            ))}
          </ul>
        )}
      </Section>

      {consumed.length > 0 && (
        <Section title="مستهلكة" subtitle={`${consumed.length} موضوع`}>
          <ul className="space-y-3">
            {consumed.slice(0, 20).map((t) => (
              <TopicCard
                key={t.id}
                topic={t}
                lensName={lensByKey.get(t.lens)?.name_ar ?? t.lens}
                muted
              />
            ))}
          </ul>
        </Section>
      )}
    </div>
  )
}

function TopicCard({
  topic,
  lensName,
  muted,
}: {
  topic: {
    id: string
    title: string
    lens: string
    philosophical_frame: string
    conflict: string
    emotional_hook: string
    language: string
    generated_at: string
    consumed_at: string | null
    expires_at: string
    is_expired: boolean
    is_consumed: boolean
  }
  lensName: string
  muted?: boolean
}) {
  return (
    <li
      className={
        "rounded-2xl border border-border/50 bg-background/40 p-4 " +
        (muted ? "opacity-60" : "")
      }
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1">
          <div className="mb-1 flex flex-wrap items-center gap-2">
            <span className="text-[10px] font-medium tracking-wide text-primary/70">
              {lensName}
            </span>
            <span className="text-[10px] text-muted-foreground">
              · {topic.language === "en" ? "إنجليزي" : "عربي"}
            </span>
            {topic.is_consumed && (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] text-emerald-700">
                <Lock className="h-2.5 w-2.5" /> مستهلك
              </span>
            )}
            {topic.is_expired && !topic.is_consumed && (
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] text-amber-700">
                <Clock className="h-2.5 w-2.5" /> منتهٍ
              </span>
            )}
          </div>
          <h3 className="mb-2 text-[13.5px] font-semibold leading-snug">{topic.title}</h3>
          <p className="mb-2 text-[11.5px] leading-relaxed text-foreground/80">
            <span className="font-medium text-muted-foreground">الإطار:</span>{" "}
            {topic.philosophical_frame}
          </p>
          <p className="mb-2 text-[11.5px] leading-relaxed text-foreground/80">
            <span className="font-medium text-muted-foreground">الصراع:</span>{" "}
            {topic.conflict}
          </p>
          <p className="text-[11.5px] leading-relaxed text-foreground/80">
            <span className="font-medium text-muted-foreground">الخطاف:</span>{" "}
            {topic.emotional_hook}
          </p>
          <div className="mt-2 flex flex-wrap gap-x-2 gap-y-1 text-[10px] text-muted-foreground">
            <span>
              أُنشئ <span dir="ltr">{formatDateTime(topic.generated_at)}</span>
            </span>
            {topic.consumed_at && (
              <span>
                · استُهلك <span dir="ltr">{formatDateTime(topic.consumed_at)}</span>
              </span>
            )}
            {!topic.is_consumed && (
              <span>
                · ينتهي <span dir="ltr">{formatDateTime(topic.expires_at)}</span>
              </span>
            )}
          </div>
        </div>
        <div className="flex flex-col items-end gap-2">
          <Eye className="h-4 w-4 text-muted-foreground" />
          {!muted && !topic.is_consumed && <MarkConsumedButton id={topic.id} />}
        </div>
      </div>
    </li>
  )
}

function Section({
  title,
  subtitle,
  children,
}: {
  title: string
  subtitle?: string
  children: React.ReactNode
}) {
  return (
    <section>
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <h2 className="text-[13px] font-semibold tracking-wide">{title}</h2>
        {subtitle && (
          <span className="text-[11px] text-muted-foreground">{subtitle}</span>
        )}
      </div>
      {children}
    </section>
  )
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl border border-border/40 bg-background/40 p-3">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div className="text-xl font-semibold tabular-nums" dir="ltr">
        {value.toLocaleString()}
      </div>
    </div>
  )
}
