"use client"

import { useCallback } from "react"
import { Sparkles, Loader2, AlertCircle, RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { useStudioSession } from "./studio-context"
import { AI_STATUS_LABELS } from "./shared"
import { EditableField, EditableListField, EditableTagsField } from "./editable-fields"

export function TabYoutubePack() {
  const {
    aiOutput, aiStatus, aiError, generateAiOutput, updateAiField,
  } = useStudioSession()

  const statusInfo = AI_STATUS_LABELS[aiStatus]

  const makeSaver = useCallback((field: string) => {
    return async (value: unknown) => {
      await updateAiField(field, value)
    }
  }, [updateAiField])

  return (
    <div className="space-y-6">
      <div className="rounded-xl border bg-card p-6 space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-amber-500" />
            <h2 className="font-semibold">حزمة يوتيوب</h2>
          </div>
          <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-medium", statusInfo.className)}>
            {statusInfo.label}
          </span>
        </div>

        {/* Idle state */}
        {aiStatus === "idle" && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              ولّد حزمة محتوى كاملة لليوتيوب من نص الحلقة: عناوين، وصف، كلمات مفتاحية، هاشتاقات، ونص للصورة المصغرة
            </p>
            <Button onClick={generateAiOutput} className="gap-2">
              <Sparkles className="h-4 w-4" />
              توليد حزمة AI
            </Button>
          </div>
        )}

        {/* Generating state */}
        {aiStatus === "generating" && (
          <div className="flex flex-col items-center gap-3 py-10">
            <Loader2 className="h-6 w-6 animate-spin text-amber-500" />
            <span className="text-sm text-muted-foreground">جارٍ تحليل النص وتوليد المحتوى...</span>
            <span className="text-xs text-muted-foreground/60">قد يستغرق هذا حتى دقيقتين</span>
          </div>
        )}

        {/* Error state */}
        {aiStatus === "error" && (
          <div className="space-y-4">
            <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 dark:border-red-900 dark:bg-red-950/50">
              <AlertCircle className="h-4 w-4 shrink-0 text-red-500 mt-0.5" />
              <p className="text-sm text-red-600 dark:text-red-400">{aiError}</p>
            </div>
            <Button variant="outline" onClick={generateAiOutput} className="gap-2">
              <RefreshCw className="h-4 w-4" />
              إعادة المحاولة
            </Button>
          </div>
        )}

        {/* Ready state */}
        {aiStatus === "ready" && aiOutput && (
          <div className="space-y-6">
            <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
              <span>النموذج: {aiOutput.model}</span>
              <span>إصدار البرومبت: {aiOutput.prompt_version}</span>
            </div>

            <EditableField
              label="العنوان الأفضل"
              value={aiOutput.title_best}
              type="input"
              onSave={makeSaver("title_best")}
            />

            <EditableListField
              label="عناوين بديلة"
              values={aiOutput.title_alternatives}
              onSave={makeSaver("title_alternatives")}
            />

            <EditableListField
              label="نص الصورة المصغرة"
              values={aiOutput.thumbnail_text_options}
              onSave={makeSaver("thumbnail_text_options")}
            />

            <EditableField
              label="وصف يوتيوب"
              value={aiOutput.youtube_description}
              type="textarea"
              onSave={makeSaver("youtube_description")}
            />

            <EditableTagsField
              label="كلمات SEO المفتاحية"
              values={aiOutput.seo_keywords}
              onSave={makeSaver("seo_keywords")}
            />

            <EditableTagsField
              label="هاشتاقات"
              values={aiOutput.hashtags}
              prefix="#"
              onSave={makeSaver("hashtags")}
            />

            <div className="border-t pt-4">
              <Button variant="outline" onClick={generateAiOutput} className="gap-2">
                <RefreshCw className="h-4 w-4" />
                إعادة التوليد
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
