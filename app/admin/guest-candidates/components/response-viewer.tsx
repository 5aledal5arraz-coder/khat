"use client"

import { useMemo, useState } from "react"
import { ChevronDown, ChevronLeft, FileText, Clock, CheckCircle2 } from "lucide-react"
import { formatDateTime } from "@/lib/shared/formatters"
import type {
  PrepFormLink,
  PrepFormResponse,
  PrepFormTemplate,
  PrepFormFieldDef,
} from "@/types/database"

interface Props {
  responses: PrepFormResponse[]
  prepLinks: PrepFormLink[]
  templates: PrepFormTemplate[]
}

export function ResponseViewer({ responses, prepLinks, templates }: Props) {
  const [openId, setOpenId] = useState<string | null>(responses[0]?.id ?? null)

  const fieldByTemplate = useMemo(() => {
    const map = new Map<string, Map<string, PrepFormFieldDef>>()
    for (const t of templates) {
      const fmap = new Map<string, PrepFormFieldDef>()
      for (const section of t.schema_json.sections || []) {
        for (const f of section.fields || []) fmap.set(f.id, f)
      }
      map.set(t.id, fmap)
    }
    return map
  }, [templates])

  function linkFor(prepLinkId: string): PrepFormLink | undefined {
    return prepLinks.find((l) => l.id === prepLinkId)
  }

  function fieldLabel(templateId: string | undefined, key: string): string {
    if (!templateId) return prettyLabel(key)
    return fieldByTemplate.get(templateId)?.get(key)?.label ?? prettyLabel(key)
  }

  return (
    <div className="space-y-2">
      {responses.map((resp) => {
        const link = linkFor(resp.prep_link_id)
        const isOpen = openId === resp.id
        const isFinal = !!resp.submitted_at
        const data = resp.response_json || {}
        return (
          <div key={resp.id} className="rounded-lg border border-border/30 bg-background/30">
            <button
              type="button"
              onClick={() => setOpenId(isOpen ? null : resp.id)}
              className="flex w-full items-center justify-between gap-2 p-3 text-start"
            >
              <div className="flex min-w-0 items-center gap-2">
                {isFinal ? (
                  <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-500" />
                ) : (
                  <Clock className="h-3.5 w-3.5 shrink-0 text-amber-500" />
                )}
                <span className="text-[11px] font-semibold">
                  {isFinal ? "إجابة نهائية" : "مسودة قيد التعبئة"}
                </span>
                {resp.completion_percent !== null && resp.completion_percent !== undefined && (
                  <span className="rounded bg-muted/60 px-1.5 py-0.5 text-[9px] text-muted-foreground">
                    {Math.round(resp.completion_percent)}%
                  </span>
                )}
                <span className="truncate text-[10px] text-muted-foreground/60">
                  {(isFinal && resp.submitted_at
                    ? formatDateTime(resp.submitted_at)
                    : formatDateTime(resp.updated_at))}
                </span>
              </div>
              {isOpen ? (
                <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
              ) : (
                <ChevronLeft className="h-3.5 w-3.5 text-muted-foreground" />
              )}
            </button>
            {isOpen && (
              <div className="border-t border-border/20 p-3 space-y-3">
                {Object.keys(data).length === 0 ? (
                  <p className="text-[11px] text-muted-foreground">لا توجد إجابات</p>
                ) : (
                  Object.entries(data).map(([key, value]) => (
                    <div key={key} className="text-[11px]">
                      <div className="mb-0.5 font-semibold text-muted-foreground">
                        {fieldLabel(link?.template_id, key)}
                      </div>
                      <div className="whitespace-pre-wrap text-foreground/85">
                        {formatValue(value)}
                      </div>
                    </div>
                  ))
                )}
                {link?.admin_message && (
                  <div className="mt-2 rounded border border-violet-500/20 bg-violet-500/5 p-2 text-[10px] text-muted-foreground">
                    <FileText className="me-1 inline h-3 w-3" />
                    رسالة مرافقة للرابط: {link.admin_message}
                  </div>
                )}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

function prettyLabel(key: string): string {
  return key.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase())
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return "—"
  if (typeof value === "boolean") return value ? "نعم" : "لا"
  if (Array.isArray(value)) return value.join("، ") || "—"
  if (typeof value === "object") return JSON.stringify(value, null, 2)
  const s = String(value)
  return s.trim() || "—"
}
