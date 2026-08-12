"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Tags, Loader2, Check } from "lucide-react"

import { GlowCard } from "@/app/admin/components/glow-card"
import { runAction } from "@/app/admin/components/run-action"
import { setEpisodeTopicsAction } from "@/app/admin/home-content/topics-actions"
import type { Topic } from "@/lib/queries/topics"

/**
 * Topic tagging, on the screen that owns the episode.
 *
 * «موضوعات الحلقة» renders on the public episode page, but the only way to
 * change it was `/admin/home-content` — a screen about the HOMEPAGE, three
 * clicks away, holding a matrix of every episode against every topic. Nothing
 * on the episode's own page said where its topics came from, or that they could
 * be changed at all.
 *
 * The action is the existing one, reused rather than reimplemented: a second
 * writer for the same join table is how two screens start disagreeing about
 * what an episode is about. The matrix stays where it is for bulk work.
 */
export function DetailTopics({
  episodeId,
  allTopics,
  initialTopicIds,
}: {
  episodeId: string
  allTopics: Topic[]
  initialTopicIds: string[]
}) {
  const router = useRouter()
  const [selected, setSelected] = useState<string[]>(initialTopicIds)
  const [pending, startTransition] = useTransition()
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function toggle(topicId: string) {
    const next = selected.includes(topicId)
      ? selected.filter((t) => t !== topicId)
      : [...selected, topicId]

    // Optimistic, then reverted on failure — a chip that stays lit after a
    // VIEWER rejection is a lie about what was saved.
    const prev = selected
    setSelected(next)
    setError(null)
    setSaved(false)

    startTransition(async () => {
      const outcome = await runAction(() => setEpisodeTopicsAction(episodeId, next))
      if (!outcome.ok) {
        setSelected(prev)
        setError(outcome.message)
        return
      }
      setSaved(true)
      setTimeout(() => setSaved(false), 1800)
      router.refresh()
    })
  }

  return (
    <GlowCard color="primary">
      <div className="p-5">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            <Tags className="h-3.5 w-3.5" />
            موضوعات الحلقة
          </h3>
          <span className="flex items-center gap-2 text-[11px] text-muted-foreground">
            {pending && <Loader2 className="h-3 w-3 animate-spin" />}
            {saved && !pending && (
              <span className="flex items-center gap-1 text-green-700">
                <Check className="h-3 w-3" /> حُفظ
              </span>
            )}
            <span className="tabular-nums">{selected.length}</span>
          </span>
        </div>

        <p className="mb-3 text-[11px] leading-relaxed text-muted-foreground">
          تظهر أسفل صفحة الحلقة، وكل موضوع له صفحة تجمع حلقاته. الحفظ فوري.
        </p>

        {allTopics.length === 0 ? (
          <p className="text-xs italic text-muted-foreground">
            لا توجد مواضيع بعد — تُنشأ من الصفحة الرئيسية ← المواضيع.
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {allTopics.map((t) => {
              const on = selected.includes(t.id)
              return (
                <button
                  key={t.id}
                  onClick={() => toggle(t.id)}
                  disabled={pending}
                  className={
                    on
                      ? "rounded-full border border-primary/40 bg-primary/10 px-3 py-1 text-[11px] font-semibold text-primary transition-colors disabled:opacity-50"
                      : "rounded-full border border-border/50 px-3 py-1 text-[11px] text-muted-foreground transition-colors hover:border-border hover:text-foreground disabled:opacity-50"
                  }
                >
                  {t.name}
                </button>
              )
            })}
          </div>
        )}

        {error && (
          <p className="mt-3 text-xs text-destructive" data-topics-error>
            {error}
          </p>
        )}
      </div>
    </GlowCard>
  )
}
