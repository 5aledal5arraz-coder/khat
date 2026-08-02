"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { Loader2, Send, CheckCircle2 } from "lucide-react"
import {
  validateQuestionContent,
  validateDisplayName,
  QUESTION_LIMITS,
  NAME_LIMITS,
} from "@/lib/validation/forms"
import {
  describeSubmitFailure,
  questionCounterHint,
  OFFLINE_MESSAGE,
  type Feedback,
  type FeedbackField,
} from "./teaser-question-copy"

/**
 * «اسأل الضيف» — the public question form under a LIVE teaser.
 *
 * It posts to the EXISTING `POST /api/teaser/[id]/questions` route: zero new
 * API surface. That route already owns every guard (CSRF origin + the
 * `x-requested-with: khat` header, 3 submissions / hour / IP, length
 * validation, HTML stripping, the Arabic+English profanity filter) and files
 * everything as `pending`, so nothing a visitor types reaches the site.
 *
 * The two client-side checks below are UX only — the same rules run again
 * server-side, which is the copy that counts.
 *
 * Rendered only when `acceptsQuestions` is true (see `ActiveTeaserView`): a
 * form under a finished teaser would just refill an unread queue.
 *
 * RTL note (Sara review 2026-07-25): both fields are `dir="rtl"`, NOT
 * `dir="auto"`. `auto` resolves direction from the field's VALUE, which is
 * empty on load, so the browser fell back to LTR inside an RTL form — the
 * placeholder sat on the left, the ellipsis rendered at the wrong end, and the
 * caret jumped left→right on the first Arabic character. Latin text typed into
 * an RTL field is still ordered correctly by the bidi algorithm; only the
 * paragraph alignment is pinned, which is what an Arabic-first product wants.
 */

export function TeaserQuestionForm({
  teaserId,
  prompt,
}: {
  teaserId: string
  /** `teasers.prompt` — the operator's own call to action. */
  prompt: string
}) {
  const [question, setQuestion] = useState("")
  const [name, setName] = useState("")
  const [sending, setSending] = useState(false)
  const [feedback, setFeedback] = useState<Feedback | null>(null)
  const [done, setDone] = useState(false)

  const questionRef = useRef<HTMLTextAreaElement>(null)
  const doneRef = useRef<HTMLDivElement>(null)
  /** True only while returning from the success card, so mount never steals focus. */
  const returningRef = useRef(false)

  const questionId = `teaser-q-${teaserId}`
  const nameId = `teaser-n-${teaserId}`
  const feedbackId = `teaser-err-${teaserId}`

  /**
   * Auto-grow. `rows={3}` clips a full-length question — measured at 390px on a
   * 268-char question: scrollHeight 152px vs clientHeight 86px — and the CSS
   * resize handle does nothing at all on iOS Safari, so the visitor was locked
   * into 3 visible lines of a 280-character allowance and could not read what
   * they were about to send.
   */
  const fitToContent = useCallback(() => {
    const el = questionRef.current
    if (!el) return
    el.style.height = "auto"
    el.style.height = `${el.scrollHeight}px`
  }, [])

  /**
   * Focus follows the swap between form and success card. The form is unmounted
   * on success, so without this the focus falls back to `<body>` and a keyboard
   * user is silently thrown to the top of the page.
   */
  useEffect(() => {
    if (done) {
      doneRef.current?.focus()
      return
    }
    if (returningRef.current) {
      returningRef.current = false
      questionRef.current?.focus()
      fitToContent()
    }
  }, [done, fitToContent])

  const askAnother = () => {
    returningRef.current = true
    setQuestion("")
    setName("")
    setFeedback(null)
    setDone(false)
  }

  if (done) {
    return (
      <div
        ref={doneRef}
        role="status"
        tabIndex={-1}
        className="mt-5 rounded-3xl border border-primary/15 bg-primary/[0.03] px-6 py-10 text-center outline-none"
      >
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10">
          <CheckCircle2 className="h-7 w-7 text-primary" />
        </div>
        <h4 className="mt-5 text-lead font-bold text-foreground">وصلنا سؤالك</h4>
        <p className="mx-auto mt-2 max-w-sm text-caption text-muted-foreground">
          كل سؤال يمر على المراجعة قبل أي استخدام. إذا اختير سؤالك، بتشوفه مع الحلقة.
        </p>
        <button
          type="button"
          onClick={askAnother}
          className="mt-6 inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-border bg-card px-4 text-caption font-medium text-foreground transition-colors hover:bg-muted/40"
        >
          اسأل سؤالًا ثانيًا
        </button>
      </div>
    )
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setFeedback(null)

    const q = validateQuestionContent(question)
    if (!q.valid) {
      return setFeedback({ message: q.error!, field: "question", tone: "error" })
    }
    if (name.trim()) {
      const n = validateDisplayName(name)
      if (!n.valid) {
        return setFeedback({ message: n.error!, field: "name", tone: "error" })
      }
    }

    setSending(true)
    try {
      const res = await fetch(`/api/teaser/${teaserId}/questions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          // Required by validateMutation() in lib/api-utils.ts — without it
          // the route answers 403 «طلب غير صالح».
          "x-requested-with": "khat",
        },
        body: JSON.stringify({
          questionText: question.trim(),
          displayName: name.trim() || undefined,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setFeedback(describeSubmitFailure(res.status, data?.error))
        return
      }
      setDone(true)
    } catch {
      setFeedback({ message: OFFLINE_MESSAGE, field: null, tone: "error" })
    } finally {
      setSending(false)
    }
  }

  const trimmedLength = question.trim().length
  const hint = questionCounterHint(trimmedLength)

  /**
   * One message, rendered under the field it is about. `aria-describedby` +
   * `aria-invalid` are set on that same field, so the message is announced as
   * part of the field rather than as a loose alert two fields further down.
   */
  const messageFor = (field: FeedbackField) =>
    feedback && feedback.field === field ? feedback : null

  const questionMessage = messageFor("question")
  const nameMessage = messageFor("name")
  const formMessage = messageFor(null)

  const feedbackBlock = (f: Feedback) => (
    <p
      id={feedbackId}
      role="alert"
      className={
        f.tone === "notice"
          ? "mt-2 text-micro text-muted-foreground"
          : "mt-2 text-micro text-destructive"
      }
    >
      {f.message}
    </p>
  )

  return (
    <form onSubmit={submit} className="mt-5 border-t border-border pt-4">
      <label
        htmlFor={questionId}
        className="block text-caption font-bold text-foreground"
        dir="auto"
      >
        {prompt}
      </label>

      <textarea
        id={questionId}
        ref={questionRef}
        // dir is pinned, not "auto" — see the RTL note above.
        dir="rtl"
        rows={3}
        value={question}
        onChange={(e) => {
          setQuestion(e.target.value)
          fitToContent()
        }}
        maxLength={QUESTION_LIMITS.MAX_CHARS}
        disabled={sending}
        placeholder="اكتب سؤالك هنا…"
        aria-invalid={questionMessage ? true : undefined}
        aria-describedby={questionMessage ? feedbackId : undefined}
        // resize-none: height is driven by fitToContent(), and the native
        // handle is inert on iOS Safari anyway.
        className="mt-2 w-full resize-none overflow-hidden rounded-xl border border-border bg-background px-3 py-2.5 text-field text-foreground outline-none focus:border-primary md:text-control"
      />
      <div className="mt-1 flex items-center justify-between gap-3 text-micro text-muted-foreground">
        <span>{hint}</span>
        <span className="tabular-nums">
          {question.length}/{QUESTION_LIMITS.MAX_CHARS}
        </span>
      </div>
      {questionMessage ? feedbackBlock(questionMessage) : null}

      <label
        htmlFor={nameId}
        className="mt-3 block text-micro font-semibold text-foreground"
      >
        اسمك <span className="font-normal text-muted-foreground">(اختياري)</span>
      </label>
      <input
        id={nameId}
        type="text"
        dir="rtl"
        value={name}
        onChange={(e) => setName(e.target.value)}
        maxLength={NAME_LIMITS.MAX_CHARS}
        disabled={sending}
        placeholder="بدون اسم"
        aria-invalid={nameMessage ? true : undefined}
        aria-describedby={nameMessage ? feedbackId : undefined}
        // min-h-11 → the 44px touch target, same as the submit button.
        className="mt-1.5 min-h-11 w-full rounded-xl border border-border bg-background px-3 text-field text-foreground outline-none focus:border-primary md:text-control"
      />
      {nameMessage ? feedbackBlock(nameMessage) : null}

      {/* Form-level messages (network failure, 429) belong to neither field. */}
      {formMessage ? feedbackBlock(formMessage) : null}

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={sending || question.trim().length === 0}
          className="inline-flex min-h-11 items-center gap-2 rounded-full bg-primary px-5 text-caption font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-45"
        >
          {sending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Send className="h-4 w-4" />
          )}
          أرسل السؤال
        </button>
        <span className="text-micro text-muted-foreground">
          كل سؤال يمر على المراجعة قبل أي استخدام
        </span>
      </div>
    </form>
  )
}
