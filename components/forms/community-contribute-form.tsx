"use client"

import { useState } from "react"
import { Check, Loader2, ArrowRight, UserPlus, Lightbulb, MessageCircleQuestion, Sparkles, Wand2 } from "lucide-react"

type ContribType = "guest" | "topic" | "question" | "concept" | "improvement"

const TYPES: {
  id: ContribType
  label: string
  blurb: string
  icon: React.ElementType
  titleLabel: string
  titlePlaceholder: string
  bodyLabel: string
  bodyPlaceholder: string
  detail?: { key: string; label: string; placeholder: string }
}[] = [
  {
    id: "guest",
    label: "اقترح ضيفًا",
    blurb: "شخص له قصة أو فكرة تستحق حلقة",
    icon: UserPlus,
    titleLabel: "اسم الشخص",
    titlePlaceholder: "مثال: د. سارة المنصور",
    bodyLabel: "لماذا هو ضيف مثالي لخط؟",
    bodyPlaceholder: "ما قصته أو فكرته؟ ولماذا الآن؟",
    detail: { key: "مجال الخبرة / روابط", label: "مجاله أو روابطه (اختياري)", placeholder: "مجال خبرته، أو رابط حساب/مقابلة" },
  },
  {
    id: "topic",
    label: "فكرة حلقة",
    blurb: "موضوع تتمنّى أن يتناوله خط",
    icon: Lightbulb,
    titleLabel: "عنوان الفكرة",
    titlePlaceholder: "مثال: لماذا نخاف من الصمت؟",
    bodyLabel: "اشرح الفكرة وزاويتها",
    bodyPlaceholder: "ما الذي يجعلها مهمة؟ وما الزاوية التي يميّزها خط بها؟",
    detail: { key: "رابط", label: "رابط مرجعي (اختياري)", placeholder: "https://" },
  },
  {
    id: "question",
    label: "سؤال للنقاش",
    blurb: "سؤال عميق يستحق أن يُطرح",
    icon: MessageCircleQuestion,
    titleLabel: "السؤال",
    titlePlaceholder: "اكتب السؤال كما تتمنّى أن يُطرح",
    bodyLabel: "لماذا يستحق هذا السؤال؟",
    bodyPlaceholder: "السياق — لأي حلقة أو ضيف، ولماذا يفتح بابًا عميقًا؟",
  },
  {
    id: "concept",
    label: "فكرة محتوى",
    blurb: "تصوّر جديد أو سلسلة أو شكل",
    icon: Sparkles,
    titleLabel: "اسم الفكرة",
    titlePlaceholder: "مثال: سلسلة «رسائل لم تُرسل»",
    bodyLabel: "ما الفكرة؟ وما الزاوية الإنسانية فيها؟",
    bodyPlaceholder: "اشرح التصوّر وكيف يخدم جمهور خط",
  },
  {
    id: "improvement",
    label: "تحسين لخط",
    blurb: "اقتراح يجعل خط أفضل",
    icon: Wand2,
    titleLabel: "اقتراحك باختصار",
    titlePlaceholder: "مثال: إضافة فصول زمنية للحلقات",
    bodyLabel: "اشرح الاقتراح وأثره",
    bodyPlaceholder: "كيف يحسّن تجربة المستمع أو المحتوى؟",
  },
]

export function CommunityContributeForm() {
  const [type, setType] = useState<ContribType | null>(null)
  const [title, setTitle] = useState("")
  const [content, setContent] = useState("")
  const [detail, setDetail] = useState("")
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle")
  const [errorMsg, setErrorMsg] = useState("")
  const [reference, setReference] = useState("")

  const cfg = TYPES.find((t) => t.id === type) || null

  const reset = () => {
    setType(null); setTitle(""); setContent(""); setDetail(""); setName(""); setEmail("")
    setStatus("idle"); setErrorMsg(""); setReference("")
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!type || !title.trim() || content.trim().length < 10) return
    setStatus("loading"); setErrorMsg("")
    try {
      const details: Record<string, string> = {}
      if (cfg?.detail && detail.trim()) details[cfg.detail.key] = detail.trim()
      const res = await fetch("/api/contribute", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Requested-With": "khat" },
        body: JSON.stringify({ type, title, content, details, contributor_name: name || null, contributor_email: email || null }),
      })
      const data = await res.json()
      if (res.ok) { setReference(data.reference || ""); setStatus("success") }
      else { setStatus("error"); setErrorMsg(data.error || "صار خطأ، حاول مرة ثانية") }
    } catch {
      setStatus("error"); setErrorMsg("صار خطأ، حاول مرة ثانية")
    }
  }

  if (status === "success") {
    return (
      <div className="rounded-3xl border border-primary/15 bg-primary/[0.03] px-8 py-14 text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10">
          <Check className="h-8 w-8 text-primary" />
        </div>
        <h3 className="mt-6 text-xl font-bold">وصلتنا مساهمتك</h3>
        <p className="mx-auto mt-3 max-w-sm text-sm leading-relaxed text-muted-foreground">
          شكرًا أنك شاركتنا. خط يُصنع معكم — نقرأ كل مساهمة بعناية، وقد نبني عليها حلقة قادمة.
        </p>
        {reference && (
          <div className="mx-auto mt-6 max-w-xs rounded-2xl border border-primary/15 bg-card px-5 py-4">
            <p className="text-[11px] tracking-wide text-muted-foreground">رقمك المرجعي</p>
            <p className="mt-1 text-lg font-bold tracking-widest text-primary" dir="ltr">{reference}</p>
          </div>
        )}
        <button onClick={reset} className="mt-7 inline-flex items-center gap-1.5 rounded-xl border border-border bg-card px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted/40">
          ساهم بفكرة أخرى
        </button>
      </div>
    )
  }

  const loading = status === "loading"

  return (
    <div className="space-y-6">
      {/* Type picker */}
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
        {TYPES.map((t) => {
          const Icon = t.icon
          const active = type === t.id
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => { setType(t.id); setTitle(""); setContent(""); setDetail("") }}
              className={`flex items-start gap-3 rounded-2xl border p-3.5 text-start transition-all ${
                active
                  ? "border-primary/40 bg-primary/[0.06] shadow-[0_2px_10px_-6px_hsl(var(--primary)/0.4)]"
                  : "border-border bg-card hover:border-primary/25 hover:bg-primary/[0.02]"
              }`}
            >
              <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${active ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
                <Icon className="h-[18px] w-[18px]" />
              </span>
              <span className="min-w-0">
                <span className="block text-[13.5px] font-semibold text-foreground">{t.label}</span>
                <span className="block text-[11.5px] leading-snug text-muted-foreground">{t.blurb}</span>
              </span>
            </button>
          )
        })}
      </div>

      {/* Tailored form */}
      {cfg && (
        <form onSubmit={submit} className="space-y-4 rounded-3xl border border-border bg-card p-6">
          <div>
            <label className="text-[13px] font-medium text-foreground">{cfg.titleLabel}</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={cfg.titlePlaceholder}
              disabled={loading}
              className="mt-1.5 w-full rounded-xl border border-border bg-background px-3.5 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/50 focus:border-primary focus:outline-none"
            />
          </div>
          <div>
            <label className="text-[13px] font-medium text-foreground">{cfg.bodyLabel}</label>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder={cfg.bodyPlaceholder}
              rows={5}
              disabled={loading}
              className="mt-1.5 w-full resize-y rounded-xl border border-border bg-background px-3.5 py-2.5 text-sm leading-relaxed text-foreground placeholder:text-muted-foreground/50 focus:border-primary focus:outline-none"
            />
          </div>
          {cfg.detail && (
            <div>
              <label className="text-[13px] font-medium text-foreground">{cfg.detail.label}</label>
              <input
                value={detail}
                onChange={(e) => setDetail(e.target.value)}
                placeholder={cfg.detail.placeholder}
                disabled={loading}
                dir="auto"
                className="mt-1.5 w-full rounded-xl border border-border bg-background px-3.5 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/50 focus:border-primary focus:outline-none"
              />
            </div>
          )}
          <div className="grid grid-cols-1 gap-3 border-t border-border/60 pt-4 sm:grid-cols-2">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="اسمك (اختياري)"
              disabled={loading}
              className="w-full rounded-xl border border-border bg-background px-3.5 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/50 focus:border-primary focus:outline-none"
            />
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="بريدك لنعود إليك (اختياري)"
              disabled={loading}
              dir="ltr"
              className="w-full rounded-xl border border-border bg-background px-3.5 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/50 focus:border-primary focus:outline-none"
            />
          </div>

          {status === "error" && (
            <p className="rounded-xl border border-destructive/20 bg-destructive/5 px-3.5 py-2.5 text-center text-sm text-destructive">{errorMsg}</p>
          )}

          <button
            type="submit"
            disabled={loading || !title.trim() || content.trim().length < 10}
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
            أرسل مساهمتك
          </button>
        </form>
      )}
    </div>
  )
}
