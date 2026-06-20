"use client"

import { useState } from "react"
import { Save, Plus, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { saveConversationData } from "../conversation-actions"
import { GlowCard } from "@/app/admin/components/glow-card"
import type { EpisodeEnrichment } from "@/types/episodes"

interface DetailConversationProps {
  episodeId: string
  enrichment: EpisodeEnrichment | null
}

export function DetailConversation({ episodeId, enrichment }: DetailConversationProps) {
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

  const handleSave = async () => {
    setSaving(true)
    setSaved(false)

    const hasBeforeYouWatch = whoIsItFor || whoIsItNotFor || whatYouGain
    const hasConversationMap = beginningTitle || beginningDesc || middleTitle || middleDesc || conclusionTitle || conclusionDesc
    const hasExclusiveClip = clipUrl || clipMessage
    const filteredUnsaid = unsaidItems.filter((s) => s.trim())

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
    })

    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const addUnsaidItem = () => setUnsaidItems([...unsaidItems, ""])
  const removeUnsaidItem = (index: number) => setUnsaidItems(unsaidItems.filter((_, i) => i !== index))
  const updateUnsaidItem = (index: number, value: string) => {
    const updated = [...unsaidItems]
    updated[index] = value
    setUnsaidItems(updated)
  }

  return (
    <div className="space-y-6">
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
            className="w-full resize-none rounded-xl border border-border/50 bg-white/[0.02] px-4 py-3 text-sm leading-relaxed placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/30"
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
            className="h-11 rounded-xl border-border/50 bg-white/[0.02]"
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
                className="w-full resize-none rounded-xl border border-border/50 bg-white/[0.02] px-4 py-3 text-sm leading-relaxed placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/30"
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
                className="w-full resize-none rounded-xl border border-border/50 bg-white/[0.02] px-4 py-3 text-sm leading-relaxed placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/30"
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
                className="w-full resize-none rounded-xl border border-border/50 bg-white/[0.02] px-4 py-3 text-sm leading-relaxed placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/30"
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
                className="h-9 rounded-lg border-border/50 bg-white/[0.02] text-sm"
              />
              <textarea
                value={node.desc}
                onChange={(e) => node.setDesc(e.target.value)}
                placeholder="الوصف"
                dir="auto"
                className="w-full resize-none rounded-lg border border-border/50 bg-white/[0.02] px-3 py-2 text-sm leading-relaxed placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/30"
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
            className="h-11 rounded-xl border-border/50 bg-white/[0.02]"
          />
          <textarea
            value={clipMessage}
            onChange={(e) => setClipMessage(e.target.value)}
            placeholder="رسالة أو تعليق من الضيف..."
            dir="auto"
            className="w-full resize-none rounded-xl border border-border/50 bg-white/[0.02] px-4 py-3 text-sm leading-relaxed placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/30"
            rows={3}
          />
        </div>
      </GlowCard>

      {/* 6. Unsaid Reflections */}
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
          <div className="space-y-2">
            {unsaidItems.map((item, i) => (
              <div key={i} className="flex items-start gap-2">
                <span className="mt-3 shrink-0 text-xs font-bold text-primary tabular-nums">{i + 1}</span>
                <textarea
                  value={item}
                  onChange={(e) => updateUnsaidItem(i, e.target.value)}
                  placeholder="تأمل أو سؤال لم يُطرح..."
                  dir="auto"
                  className="flex-1 resize-none rounded-lg border border-border/50 bg-white/[0.02] px-3 py-2 text-sm leading-relaxed placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/30"
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
    </div>
  )
}
