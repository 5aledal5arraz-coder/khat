"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { Save, Plus, X, Sparkles, Loader2, AlertTriangle, CheckCircle2, EyeOff, ShieldCheck } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  saveConversationData,
  startConversationGeneration,
  getConversationGenerationStatus,
} from "../conversation-actions"
import { GlowCard } from "@/app/admin/components/glow-card"
import { StudioOwnedFields } from "./studio-owned-fields"
import { formatTimeSeconds } from "@/lib/shared/formatters"
import { cn } from "@/lib/utils"
import type { EpisodeEnrichment } from "@/types/episodes"

interface DetailConversationProps {
  episodeId: string
  enrichment: EpisodeEnrichment | null
  /** Passed straight through to `StudioOwnedFields`; null when unlinked. */
  eirId: string | null
}

/** What the generate button is currently saying. `null` = nothing to say. */
type GenNotice = { tone: "error" | "success" | "info"; text: string } | null

/**
 * ص-٩ — approval flags for «ما لم يُقال», aligned index-wise with the item
 * list while it is being edited. Persisted by TEXT (see
 * `publicUnsaidReflections`), so this array is a UI convenience only.
 */
function initialApprovals(enrichment: EpisodeEnrichment | null, items: string[]): boolean[] {
  const approved = new Set((enrichment?.unsaid_reflections_approved ?? []).map((s) => s.trim()))
  return items.map((item) => item.trim().length > 0 && approved.has(item.trim()))
}

export function DetailConversation({ episodeId, enrichment, eirId }: DetailConversationProps) {
  const router = useRouter()
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  // Form state
  const [whyThisConversation, setWhyThisConversation] = useState(enrichment?.why_this_conversation || "")
  const [centralQuestion, setCentralQuestion] = useState(enrichment?.central_question || "")

  const [whoIsItFor, setWhoIsItFor] = useState(enrichment?.before_you_watch?.who_is_it_for || "")
  const [whoIsItNotFor, setWhoIsItNotFor] = useState(enrichment?.before_you_watch?.who_is_it_not_for || "")
  const [whatYouGain, setWhatYouGain] = useState(enrichment?.before_you_watch?.what_you_gain || "")

  const [beginningTitle, setBeginningTitle] = useState(enrichment?.conversation_map?.beginning?.title || "")
  const [beginningDesc, setBeginningDesc] = useState(enrichment?.conversation_map?.beginning?.description || "")
  const [middleTitle, setMiddleTitle] = useState(enrichment?.conversation_map?.middle?.title || "")
  const [middleDesc, setMiddleDesc] = useState(enrichment?.conversation_map?.middle?.description || "")
  const [conclusionTitle, setConclusionTitle] = useState(enrichment?.conversation_map?.conclusion?.title || "")
  const [conclusionDesc, setConclusionDesc] = useState(enrichment?.conversation_map?.conclusion?.description || "")

  const [clipUrl, setClipUrl] = useState(enrichment?.exclusive_clip?.youtube_url || "")
  const [clipMessage, setClipMessage] = useState(enrichment?.exclusive_clip?.message || "")

  const [unsaidItems, setUnsaidItems] = useState<string[]>(enrichment?.unsaid_reflections || [""])
  const [unsaidApproved, setUnsaidApproved] = useState<boolean[]>(() =>
    initialApprovals(enrichment, enrichment?.unsaid_reflections || [""]),
  )

  // ── Generation (background job) ──────────────────────────────────────
  // The run takes ~132s and nginx cuts a proxied request at 120s, so the
  // action only ENQUEUES and we poll. Everything the operator needs to know —
  // "no studio session", "no transcript", "the call failed", "the worker
  // isn't running" — arrives through `notice` and is rendered. An error we
  // computed but never showed is an error that did not happen, as far as the
  // person looking at the screen is concerned.
  const [generating, setGenerating] = useState(false)
  const [notice, setNotice] = useState<GenNotice>(null)
  const [elapsed, setElapsed] = useState(0)
  const [queued, setQueued] = useState(false)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current)
      pollRef.current = null
    }
    if (tickRef.current) {
      clearInterval(tickRef.current)
      tickRef.current = null
    }
  }, [])

  /** Re-seed the form from the enrichment the finished job just wrote. */
  const applyEnrichment = useCallback((fresh: EpisodeEnrichment) => {
    setWhyThisConversation(fresh.why_this_conversation || "")
    setCentralQuestion(fresh.central_question || "")
    setWhoIsItFor(fresh.before_you_watch?.who_is_it_for || "")
    setWhoIsItNotFor(fresh.before_you_watch?.who_is_it_not_for || "")
    setWhatYouGain(fresh.before_you_watch?.what_you_gain || "")
    setBeginningTitle(fresh.conversation_map?.beginning?.title || "")
    setBeginningDesc(fresh.conversation_map?.beginning?.description || "")
    setMiddleTitle(fresh.conversation_map?.middle?.title || "")
    setMiddleDesc(fresh.conversation_map?.middle?.description || "")
    setConclusionTitle(fresh.conversation_map?.conclusion?.title || "")
    setConclusionDesc(fresh.conversation_map?.conclusion?.description || "")
    setClipUrl(fresh.exclusive_clip?.youtube_url || "")
    setClipMessage(fresh.exclusive_clip?.message || "")
    const items = fresh.unsaid_reflections?.length ? fresh.unsaid_reflections : [""]
    setUnsaidItems(items)
    // Freshly generated reflections arrive UNAPPROVED by construction — the
    // generator never writes the approval column (ص-٩).
    setUnsaidApproved(initialApprovals(fresh, items))
  }, [])

  const poll = useCallback(
    (jobId: string) => {
      stopPolling()
      tickRef.current = setInterval(() => setElapsed((s) => s + 1), 1000)
      pollRef.current = setInterval(async () => {
        try {
          const s = await getConversationGenerationStatus(episodeId, jobId)
          if (!s.success) return // transient; keep polling
          setQueued(s.jobStatus === "pending")
          if (s.jobStatus === "succeeded") {
            stopPolling()
            setGenerating(false)
            if (s.enrichment) applyEnrichment(s.enrichment)
            const count = s.filled?.length ?? 0
            setNotice(
              count > 0
                ? { tone: "success", text: `تم توليد ${count} من الأقسام — راجعها ثم اضغط حفظ.` }
                : {
                    tone: "info",
                    text: "كل الأقسام مكتوبة مسبقاً — لم يُستدعَ الذكاء الاصطناعي ولم تُصرف تكلفة.",
                  },
            )
            router.refresh()
          } else if (s.jobStatus && ["failed", "dead", "cancelled"].includes(s.jobStatus)) {
            stopPolling()
            setGenerating(false)
            setNotice({
              tone: "error",
              text: s.jobError || "تعذّر التوليد — تأكّد أن عامل المهام (worker) يعمل.",
            })
          }
          // pending / running → keep polling.
        } catch {
          // Transient network blip — keep polling.
        }
      }, 3000)
    },
    [episodeId, router, stopPolling, applyEnrichment],
  )

  // Re-attach on mount: a tab refreshed mid-run resumes «جارٍ التوليد» instead
  // of showing idle and inviting a duplicate run.
  useEffect(() => {
    let cancelled = false
    getConversationGenerationStatus(episodeId)
      .then((s) => {
        if (cancelled || !s.success) return
        if (s.jobId && (s.jobStatus === "pending" || s.jobStatus === "running")) {
          setGenerating(true)
          setElapsed(0)
          poll(s.jobId)
        }
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [episodeId, poll])

  useEffect(() => stopPolling, [stopPolling])

  const handleGenerate = async () => {
    if (generating) return
    setGenerating(true)
    setNotice(null)
    setElapsed(0)
    setQueued(false)
    const res = await startConversationGeneration(episodeId)
    if (!res.success) {
      setGenerating(false)
      setNotice({ tone: "error", text: res.error || "تعذّر بدء التوليد" })
      return
    }
    if (res.alreadyRunning) {
      setNotice({ tone: "info", text: "يوجد توليد جارٍ لهذه الحلقة — تتابع الحالة أدناه." })
    }
    poll(res.jobId!)
  }

  const handleSave = async () => {
    setSaving(true)
    setSaved(false)

    const hasBeforeYouWatch = whoIsItFor || whoIsItNotFor || whatYouGain
    const hasConversationMap = beginningTitle || beginningDesc || middleTitle || middleDesc || conclusionTitle || conclusionDesc
    const hasExclusiveClip = clipUrl || clipMessage
    const filteredUnsaid = unsaidItems.filter((s) => s.trim())
    // ص-٩ — persist approvals by TEXT, and only for items that survived the
    // blank filter. Always an ARRAY (never undefined) so un-ticking the last
    // approved item actually un-publishes it instead of merging to the old set.
    const approvedUnsaid = unsaidItems
      .map((s, i) => (unsaidApproved[i] ? s.trim() : ""))
      .filter((s) => s.length > 0)

    await saveConversationData(episodeId, {
      why_this_conversation: whyThisConversation || undefined,
      central_question: centralQuestion || undefined,
      before_you_watch: hasBeforeYouWatch
        ? {
            who_is_it_for: whoIsItFor || undefined,
            who_is_it_not_for: whoIsItNotFor || undefined,
            what_you_gain: whatYouGain || undefined,
          }
        : undefined,
      conversation_map: hasConversationMap
        ? {
            beginning: beginningTitle || beginningDesc ? { title: beginningTitle, description: beginningDesc } : undefined,
            middle: middleTitle || middleDesc ? { title: middleTitle, description: middleDesc } : undefined,
            conclusion: conclusionTitle || conclusionDesc ? { title: conclusionTitle, description: conclusionDesc } : undefined,
          }
        : undefined,
      exclusive_clip: hasExclusiveClip
        ? {
            youtube_url: clipUrl || undefined,
            message: clipMessage || undefined,
          }
        : undefined,
      unsaid_reflections: filteredUnsaid.length > 0 ? filteredUnsaid : undefined,
      unsaid_reflections_approved: approvedUnsaid,
    })

    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const addUnsaidItem = () => {
    setUnsaidItems([...unsaidItems, ""])
    setUnsaidApproved([...unsaidApproved, false])
  }
  const removeUnsaidItem = (index: number) => {
    setUnsaidItems(unsaidItems.filter((_, i) => i !== index))
    setUnsaidApproved(unsaidApproved.filter((_, i) => i !== index))
  }
  const updateUnsaidItem = (index: number, value: string) => {
    const updated = [...unsaidItems]
    updated[index] = value
    setUnsaidItems(updated)
    // ص-٩ — editing the wording revokes the approval. Khaled approved a
    // SENTENCE, not a slot; letting a rewrite inherit the old tick is exactly
    // how an unreviewed claim would reach the public page.
    if (unsaidApproved[index] && value.trim() !== unsaidItems[index].trim()) {
      const flags = [...unsaidApproved]
      flags[index] = false
      setUnsaidApproved(flags)
    }
  }
  const toggleUnsaidApproval = (index: number) => {
    const flags = [...unsaidApproved]
    flags[index] = !flags[index]
    setUnsaidApproved(flags)
  }

  return (
    <div className="space-y-6">
      {/* 0. Generate — the AI fills only what is blank. */}
      <GlowCard>
        <div className="p-5 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="space-y-1">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                توليد أقسام الحوار
              </h3>
              <p className="text-xs text-muted-foreground">
                يملأ الأقسام الفارغة فقط من نص الحلقة — ما كتبته بيدك لا يُمسّ.
              </p>
            </div>
            <Button
              type="button"
              onClick={handleGenerate}
              disabled={generating}
              className="gap-2 rounded-xl"
            >
              {generating ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="h-4 w-4" />
              )}
              {generating ? "جارٍ التوليد…" : "توليد بالذكاء الاصطناعي"}
            </Button>
          </div>

          {generating && (
            <div className="space-y-1 rounded-xl border border-border/50 bg-card/[0.02] px-4 py-3">
              <p className="text-sm text-foreground">
                {queued ? "المهمة في الطابور…" : "يعمل الآن على نص الحلقة…"}{" "}
                <span className="tabular-nums text-muted-foreground">
                  {formatTimeSeconds(elapsed)}
                </span>
              </p>
              <p className="text-xs text-muted-foreground">
                {/* The single most common "nothing happened" cause locally. */}
                {queued && elapsed > 15
                  ? "لم يلتقطها أحد بعد — تأكّد أن عامل المهام يعمل (npm run worker أو npm run dev:all)."
                  : "التوليد يستغرق نحو دقيقتين ويكمل في الخلفية — يمكنك ترك الصفحة والعودة."}
              </p>
            </div>
          )}

          {notice && (
            <div
              className={cn(
                "flex items-start gap-2 rounded-xl border px-4 py-3 text-sm",
                notice.tone === "error" && "border-destructive/30 bg-destructive/5 text-destructive",
                notice.tone === "success" && "border-green-700/30 bg-green-700/5 text-green-700",
                notice.tone === "info" && "border-border/50 bg-card/[0.02] text-muted-foreground",
              )}
            >
              {notice.tone === "error" ? (
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              ) : (
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
              )}
              <span className="leading-relaxed">{notice.text}</span>
            </div>
          )}
        </div>
      </GlowCard>

      {/* 1. Why This Conversation */}
      <GlowCard>
        <div className="p-5 space-y-3">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            لماذا هذه المحادثة؟
          </h3>
          <textarea
            value={whyThisConversation}
            onChange={(e) => setWhyThisConversation(e.target.value)}
            placeholder="لماذا اخترنا هذا الضيف وهذا الموضوع..."
            dir="auto"
            className="w-full resize-none rounded-xl border border-border/50 bg-card/[0.02] px-4 py-3 text-sm leading-relaxed placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/30"
            rows={4}
          />
        </div>
      </GlowCard>

      {/* 2. Central Question */}
      <GlowCard>
        <div className="p-5 space-y-3">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            السؤال المحوري
          </h3>
          <Input
            value={centralQuestion}
            onChange={(e) => setCentralQuestion(e.target.value)}
            placeholder="ما السؤال الأساسي الذي تدور حوله الحلقة؟"
            dir="auto"
            className="h-11 rounded-xl border-border/50 bg-card/[0.02]"
          />
        </div>
      </GlowCard>

      {/* 3. Before You Watch */}
      <GlowCard>
        <div className="p-5 space-y-4">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            قبل أن تشاهد
          </h3>
          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">لمن هذه الحلقة؟</label>
              <textarea
                value={whoIsItFor}
                onChange={(e) => setWhoIsItFor(e.target.value)}
                placeholder="هذه الحلقة مناسبة لـ..."
                dir="auto"
                className="w-full resize-none rounded-xl border border-border/50 bg-card/[0.02] px-4 py-3 text-sm leading-relaxed placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/30"
                rows={2}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">ليست لك إذا...</label>
              <textarea
                value={whoIsItNotFor}
                onChange={(e) => setWhoIsItNotFor(e.target.value)}
                placeholder="قد لا تناسبك هذه الحلقة إذا..."
                dir="auto"
                className="w-full resize-none rounded-xl border border-border/50 bg-card/[0.02] px-4 py-3 text-sm leading-relaxed placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/30"
                rows={2}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">ماذا ستكسب؟</label>
              <textarea
                value={whatYouGain}
                onChange={(e) => setWhatYouGain(e.target.value)}
                placeholder="بعد مشاهدة هذه الحلقة ستكتسب..."
                dir="auto"
                className="w-full resize-none rounded-xl border border-border/50 bg-card/[0.02] px-4 py-3 text-sm leading-relaxed placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/30"
                rows={2}
              />
            </div>
          </div>
        </div>
      </GlowCard>

      {/* 4. Conversation Map */}
      <GlowCard>
        <div className="p-5 space-y-4">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            خريطة المحادثة
          </h3>
          {([
            { label: "البداية", title: beginningTitle, setTitle: setBeginningTitle, desc: beginningDesc, setDesc: setBeginningDesc },
            { label: "المنتصف", title: middleTitle, setTitle: setMiddleTitle, desc: middleDesc, setDesc: setMiddleDesc },
            { label: "الخاتمة", title: conclusionTitle, setTitle: setConclusionTitle, desc: conclusionDesc, setDesc: setConclusionDesc },
          ] as const).map((node) => (
            <div key={node.label} className="space-y-2 rounded-lg border border-border/30 p-3">
              <p className="text-xs font-medium text-muted-foreground">{node.label}</p>
              <Input
                value={node.title}
                onChange={(e) => node.setTitle(e.target.value)}
                placeholder="العنوان"
                dir="auto"
                className="h-9 rounded-lg border-border/50 bg-card/[0.02] text-sm"
              />
              <textarea
                value={node.desc}
                onChange={(e) => node.setDesc(e.target.value)}
                placeholder="الوصف"
                dir="auto"
                className="w-full resize-none rounded-lg border border-border/50 bg-card/[0.02] px-3 py-2 text-sm leading-relaxed placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/30"
                rows={2}
              />
            </div>
          ))}
        </div>
      </GlowCard>

      {/* 5. Exclusive Clip */}
      <GlowCard>
        <div className="p-5 space-y-3">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            الدقيقة الحصرية
          </h3>
          <Input
            value={clipUrl}
            onChange={(e) => setClipUrl(e.target.value)}
            placeholder="رابط يوتيوب للمقطع الحصري"
            dir="ltr"
            className="h-11 rounded-xl border-border/50 bg-card/[0.02]"
          />
          <textarea
            value={clipMessage}
            onChange={(e) => setClipMessage(e.target.value)}
            placeholder="رسالة أو تعليق من الضيف..."
            dir="auto"
            className="w-full resize-none rounded-xl border border-border/50 bg-card/[0.02] px-4 py-3 text-sm leading-relaxed placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/30"
            rows={3}
          />
        </div>
      </GlowCard>

      {/* 6. Unsaid Reflections — the ONE field behind a per-item review gate.
          Everything here is invisible to the public until it is ticked, and
          the tick is per SENTENCE because the item worth deleting may be the
          strongest one in the list (ص-٩). */}
      <GlowCard>
        <div className="p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              ما لم يُقال
            </h3>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={addUnsaidItem}
              className="h-7 gap-1 rounded-lg text-xs"
            >
              <Plus className="h-3 w-3" />
              إضافة
            </Button>
          </div>
          <p className="flex items-start gap-2 rounded-lg border border-amber-700/30 bg-amber-700/5 px-3 py-2 text-xs leading-relaxed text-amber-700">
            <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>
              هذا القسم وحده لا يُنشر تلقائياً. كل بند يبقى مخفياً عن الصفحة العامة
              حتى تعتمده بنفسك، وتعديل نصّ بند معتمد يلغي اعتماده.
            </span>
          </p>
          <div className="space-y-2">
            {unsaidItems.map((item, i) => (
              <div
                key={i}
                className={cn(
                  "space-y-2 rounded-lg border p-3 transition-colors",
                  unsaidApproved[i] ? "border-green-700/40 bg-green-700/5" : "border-border/30",
                )}
              >
                <div className="flex items-start gap-2">
                  <span className="mt-3 shrink-0 text-xs font-bold text-primary tabular-nums">{i + 1}</span>
                  <textarea
                    value={item}
                    onChange={(e) => updateUnsaidItem(i, e.target.value)}
                    placeholder="تأمل أو سؤال لم يُطرح..."
                    dir="auto"
                    className="flex-1 resize-none rounded-lg border border-border/50 bg-card/[0.02] px-3 py-2 text-sm leading-relaxed placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/30"
                    rows={2}
                  />
                  {unsaidItems.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeUnsaidItem(i)}
                      className="mt-2 rounded-lg p-1 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  )}
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={Boolean(unsaidApproved[i])}
                  disabled={!item.trim()}
                  onClick={() => toggleUnsaidApproval(i)}
                  className={cn(
                    "flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50",
                    unsaidApproved[i]
                      ? "border-green-700/40 bg-green-700/10 text-green-700 hover:bg-green-700/15"
                      : "border-border/50 text-muted-foreground hover:bg-muted/50",
                  )}
                >
                  {unsaidApproved[i] ? (
                    <CheckCircle2 className="h-3.5 w-3.5" />
                  ) : (
                    <EyeOff className="h-3.5 w-3.5" />
                  )}
                  {unsaidApproved[i] ? "معتمد للنشر" : "غير معتمد — لا يظهر للجمهور"}
                </button>
              </div>
            ))}
          </div>
        </div>
      </GlowCard>

      {/* Save Button */}
      <div className="flex items-center gap-3">
        <Button
          onClick={handleSave}
          disabled={saving}
          className="gap-2 rounded-xl"
        >
          <Save className="h-4 w-4" />
          {saving ? "جارٍ الحفظ..." : "حفظ بيانات المحادثة"}
        </Button>
        {saved && (
          <span className="text-sm text-green-700">تم الحفظ بنجاح</span>
        )}
      </div>

      {/* The other five public fields — read-only, below the save button so it
          is clear they are not part of what this form writes. */}
      <StudioOwnedFields enrichment={enrichment} eirId={eirId} />
    </div>
  )
}
