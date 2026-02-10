"use client"

import { useCallback } from "react"
import { Search, Tag, Hash } from "lucide-react"
import { useStudioSession } from "./studio-context"
import { CopyButton } from "./shared"
import { EditableTagsField } from "./editable-fields"

export function TabSeoTopics() {
  const {
    aiOutput, aiStatus, updateAiField,
    topics, websitePkgStatus, setTopics, debouncedSaveWebPkg,
  } = useStudioSession()

  const handleCopy = async (text: string) => {
    await navigator.clipboard.writeText(text)
  }

  const saveKeywords = useCallback(async (values: string[]) => {
    await updateAiField("seo_keywords", values)
  }, [updateAiField])

  const saveHashtags = useCallback(async (values: string[]) => {
    await updateAiField("hashtags", values)
  }, [updateAiField])

  const hasAiData = aiStatus === "ready" && aiOutput
  const hasPkgData = websitePkgStatus === "ready"
  const hasData = hasAiData || hasPkgData

  return (
    <div className="space-y-6">
      {!hasData && (
        <div className="rounded-xl border bg-card p-6">
          <div className="flex flex-col items-center gap-3 py-8 text-center">
            <Search className="h-8 w-8 text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">
              ولّد مخرجات AI وحزمة الموقع أولاً لعرض بيانات SEO والمواضيع
            </p>
          </div>
        </div>
      )}

      {/* SEO Keywords from AI Output */}
      {hasAiData && (
        <div className="rounded-xl border bg-card p-6 space-y-5">
          <div className="flex items-center gap-2">
            <Search className="h-5 w-5 text-blue-500" />
            <h2 className="font-semibold">كلمات SEO المفتاحية</h2>
          </div>
          <EditableTagsField
            label="كلمات مفتاحية"
            values={aiOutput!.seo_keywords}
            onSave={saveKeywords}
          />
        </div>
      )}

      {/* Hashtags from AI Output */}
      {hasAiData && (
        <div className="rounded-xl border bg-card p-6 space-y-5">
          <div className="flex items-center gap-2">
            <Hash className="h-5 w-5 text-purple-500" />
            <h2 className="font-semibold">هاشتاقات</h2>
          </div>
          <EditableTagsField
            label="هاشتاقات"
            values={aiOutput!.hashtags}
            prefix="#"
            onSave={saveHashtags}
          />
        </div>
      )}

      {/* Topics from Website Package */}
      {hasPkgData && topics.length > 0 && (
        <div className="rounded-xl border bg-card p-6 space-y-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Tag className="h-5 w-5 text-emerald-500" />
              <h2 className="font-semibold">مواضيع الحلقة ({topics.length})</h2>
            </div>
            <CopyButton onClick={() => handleCopy(topics.join("، "))} />
          </div>
          <div className="flex flex-wrap gap-1.5">
            {topics.map((topic, idx) => (
              <span
                key={idx}
                className="inline-flex rounded-full bg-emerald-100 dark:bg-emerald-950 px-2.5 py-0.5 text-xs font-medium text-emerald-700 dark:text-emerald-400"
              >
                {topic}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
