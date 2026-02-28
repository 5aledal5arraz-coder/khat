"use client"

import { useState, useRef, useEffect } from "react"
import type { TeaserConfig, TeaserQuestion } from "@/types/teaser"
import { Button } from "@/components/ui/button"
import { Send, CheckCircle, MessageCircle } from "lucide-react"

interface Props {
  teaser: TeaserConfig
  questions: TeaserQuestion[]
}

export function AskTheGuest({ teaser, questions }: Props) {
  const [questionText, setQuestionText] = useState("")
  const [displayName, setDisplayName] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isVisible, setIsVisible] = useState(false)
  const sectionRef = useRef<HTMLElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)

  // Lazy-load video when section is in viewport
  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true)
          observer.disconnect()
        }
      },
      { rootMargin: "200px" }
    )

    if (sectionRef.current) {
      observer.observe(sectionRef.current)
    }

    return () => observer.disconnect()
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)

    try {
      const res = await fetch(`/api/teaser/${teaser.id}/questions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-requested-with": "khat",
        },
        body: JSON.stringify({
          questionText: questionText.trim(),
          displayName: displayName.trim() || undefined,
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error || "صار خطأ، حاول مرة ثانية")
        return
      }

      setSubmitted(true)
      setQuestionText("")
      setDisplayName("")
    } catch {
      setError("في مشكلة بالاتصال، حاول مرة ثانية")
    } finally {
      setSubmitting(false)
    }
  }

  function relativeTime(dateStr: string) {
    const diff = Date.now() - new Date(dateStr).getTime()
    const mins = Math.floor(diff / 60000)
    if (mins < 1) return "الآن"
    if (mins < 60) return `منذ ${mins} د`
    const hours = Math.floor(mins / 60)
    if (hours < 24) return `منذ ${hours} س`
    const days = Math.floor(hours / 24)
    return `منذ ${days} ي`
  }

  return (
    <section ref={sectionRef} className="py-12">
      <div className="space-y-6">
        {/* Section header */}
        <div className="text-center">
          <h2 className="text-2xl font-bold">{teaser.title}</h2>
          <p className="mt-1 text-muted-foreground">{teaser.guestName}</p>
        </div>

        {/* Video player */}
        <div className="overflow-hidden rounded-2xl border bg-black/5">
          {isVisible && (
            <video
              ref={videoRef}
              src={`/teasers/${teaser.videoFilename}`}
              poster={teaser.posterImage ? `/teasers/${teaser.posterImage}` : undefined}
              controls
              preload="metadata"
              playsInline
              className="w-full"
            />
          )}
        </div>

        {/* Prompt */}
        <p className="text-center text-sm text-muted-foreground">{teaser.prompt}</p>

        {/* Question form */}
        {submitted ? (
          <div className="flex flex-col items-center gap-3 rounded-2xl border border-green-500/20 bg-green-500/5 p-6 text-center">
            <CheckCircle className="h-8 w-8 text-green-600" />
            <p className="font-medium text-green-600 dark:text-green-400">
              شكراً! سؤالك وصلنا وقيد المراجعة
            </p>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setSubmitted(false)}
            >
              أرسل سؤال ثاني
            </Button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-3">
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="اسمك (اختياري)"
              maxLength={50}
              className="w-full rounded-xl border bg-background px-4 py-3 text-sm transition-colors focus:border-primary focus:outline-none"
            />
            <div className="relative">
              <textarea
                value={questionText}
                onChange={(e) => {
                  setQuestionText(e.target.value)
                  setError(null)
                }}
                placeholder="اكتب سؤالك هنا..."
                maxLength={280}
                required
                rows={3}
                className="w-full resize-none rounded-xl border bg-background px-4 py-3 text-sm transition-colors focus:border-primary focus:outline-none"
              />
              <span className="absolute bottom-2 start-3 text-xs text-muted-foreground">
                {questionText.length}/280
              </span>
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button
              type="submit"
              className="w-full gap-2"
              disabled={submitting || questionText.trim().length < 10}
            >
              <Send className="h-4 w-4" />
              {submitting ? "جارٍ الإرسال..." : "أرسل سؤالك"}
            </Button>
          </form>
        )}

        {/* Approved questions */}
        {questions.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <MessageCircle className="h-4 w-4" />
              <span>أسئلة الجمهور ({questions.length})</span>
            </div>
            <div className="space-y-2">
              {questions.map((q) => (
                <div
                  key={q.id}
                  className="rounded-xl border bg-card p-4"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">
                      {q.display_name || "مجهول"}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {relativeTime(q.created_at)}
                    </span>
                  </div>
                  <p className="mt-1 text-sm">{q.question_text}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  )
}
