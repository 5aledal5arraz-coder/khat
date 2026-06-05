"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { AdminPageHeader } from "../../components/admin-page-header"
import { Input } from "@/components/ui/input"
import {
  Search,
  CheckCircle2,
  Clock,
  ChevronLeft,
  ChevronDown,
  ExternalLink,
  FileText,
  Inbox,
} from "lucide-react"
import type {
  PrepFormResponse,
  PrepFormTemplate,
  PrepFormFieldDef,
  PrepFormLinkStatus,
} from "@/types/database"
import { CATEGORY_OPTIONS } from "../lib/status"
import { formatDateTime } from "@/lib/shared/formatters"

interface LinkLite {
  id: string
  token: string
  template_id: string
  status: PrepFormLinkStatus
  sent_via: string | null
  admin_message: string | null
}

interface CandidateLite {
  id: string
  full_name: string
  display_name: string | null
  category: string | null
  status: string
}

interface Row {
  response: PrepFormResponse
  link: LinkLite
  candidate: CandidateLite
}

interface Props {
  rows: Row[]
  templates: PrepFormTemplate[]
}

type Filter = "all" | "final" | "draft"

export function ResponsesArchiveClient({ rows, templates }: Props) {
  const [search, setSearch] = useState("")
  const [filter, setFilter] = useState<Filter>("all")
  const [category, setCategory] = useState<string>("all")
  const [openId, setOpenId] = useState<string | null>(rows[0]?.response.id ?? null)

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

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase()
    return rows.filter((r) => {
      if (filter === "final" && !r.response.submitted_at) return false
      if (filter === "draft" && r.response.submitted_at) return false
      if (category !== "all" && r.candidate.category !== category) return false
      if (!term) return true
      const name = (r.candidate.display_name || r.candidate.full_name || "").toLowerCase()
      if (name.includes(term)) return true
      // search in response values
      const data = r.response.response_json || {}
      for (const v of Object.values(data)) {
        if (typeof v === "string" && v.toLowerCase().includes(term)) return true
      }
      return false
    })
  }, [rows, search, filter, category])

  const stats = useMemo(() => {
    const finals = rows.filter((r) => r.response.submitted_at).length
    const drafts = rows.length - finals
    return { total: rows.length, finals, drafts }
  }, [rows])

  return (
    <div className="space-y-5">
      <AdminPageHeader
        title="أرشيف نماذج التحضير"
        description="جميع الإجابات التي استلمتها من المرشّحين — مسوّدات ونهائية."
      />

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-2.5">
        <StatCard icon={<Inbox className="h-3.5 w-3.5" />} label="إجمالي" value={stats.total} tone="neutral" />
        <StatCard icon={<CheckCircle2 className="h-3.5 w-3.5" />} label="نهائية" value={stats.finals} tone="success" />
        <StatCard icon={<Clock className="h-3.5 w-3.5" />} label="مسودات" value={stats.drafts} tone="warning" />
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="pointer-events-none absolute end-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="بحث في الأسماء والإجابات..."
            className="h-8 pe-8 text-[12px]"
          />
        </div>
        <div className="flex gap-1 rounded-md border border-border/40 bg-background/30 p-0.5">
          {(["all", "final", "draft"] as Filter[]).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              className={`px-2.5 py-1 text-[11px] font-medium rounded-sm transition-colors ${
                filter === f
                  ? "bg-primary/15 text-primary"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {f === "all" ? "الكل" : f === "final" ? "نهائية" : "مسودات"}
            </button>
          ))}
        </div>
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="h-8 rounded-md border border-border/40 bg-background/30 px-2 text-[11px]"
        >
          <option value="all">كل التصنيفات</option>
          {CATEGORY_OPTIONS.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </select>
      </div>

      {/* List */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border/40 p-10 text-center">
          <Inbox className="mb-2 h-8 w-8 text-muted-foreground/50" />
          <p className="text-sm font-medium text-muted-foreground">لا توجد إجابات مطابقة</p>
          <p className="mt-1 text-[11px] text-muted-foreground/60">
            جرّب تغيير الفلاتر أو أرسل رابط تحضير لمرشّح جديد.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((row) => {
            const isOpen = openId === row.response.id
            const isFinal = !!row.response.submitted_at
            const data = row.response.response_json || {}
            const templateFields = fieldByTemplate.get(row.link.template_id)
            return (
              <div
                key={row.response.id}
                className="rounded-lg border border-border/30 bg-background/30 overflow-hidden"
              >
                <button
                  type="button"
                  onClick={() => setOpenId(isOpen ? null : row.response.id)}
                  className="flex w-full items-center justify-between gap-3 p-3 text-start hover:bg-muted/20 transition-colors"
                >
                  <div className="flex min-w-0 flex-1 items-center gap-2.5">
                    {isFinal ? (
                      <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />
                    ) : (
                      <Clock className="h-4 w-4 shrink-0 text-amber-500" />
                    )}
                    <div className="flex min-w-0 flex-col gap-0.5">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-[13px] font-semibold">
                          {row.candidate.display_name || row.candidate.full_name}
                        </span>
                        {row.response.completion_percent !== null && row.response.completion_percent !== undefined && (
                          <span className="rounded bg-muted/60 px-1.5 py-0.5 text-[9px] text-muted-foreground shrink-0">
                            {Math.round(row.response.completion_percent)}%
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 text-[10px] text-muted-foreground/60">
                        <span>{isFinal ? "نهائية" : "مسودة"}</span>
                        <span>•</span>
                        <span>
                          {formatDateTime(
                            isFinal && row.response.submitted_at
                              ? row.response.submitted_at
                              : row.response.updated_at
                          )}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Link
                      href={`/admin/guest-candidates/${row.candidate.id}`}
                      onClick={(e) => e.stopPropagation()}
                      className="rounded p-1.5 text-muted-foreground hover:bg-muted/40 hover:text-foreground"
                      title="فتح ملف المرشّح"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                    </Link>
                    {isOpen ? (
                      <ChevronDown className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <ChevronLeft className="h-4 w-4 text-muted-foreground" />
                    )}
                  </div>
                </button>
                {isOpen && (
                  <div className="border-t border-border/20 p-3 space-y-3">
                    {Object.keys(data).length === 0 ? (
                      <p className="text-[11px] text-muted-foreground">لا توجد إجابات بعد</p>
                    ) : (
                      Object.entries(data).map(([key, value]) => {
                        const label = templateFields?.get(key)?.label ?? prettyLabel(key)
                        return (
                          <div key={key} className="text-[11px]">
                            <div className="mb-0.5 font-semibold text-muted-foreground">{label}</div>
                            <div className="whitespace-pre-wrap text-foreground/85">
                              {formatValue(value)}
                            </div>
                          </div>
                        )
                      })
                    )}
                    {row.link.admin_message && (
                      <div className="mt-2 rounded border border-violet-500/20 bg-violet-500/5 p-2 text-[10px] text-muted-foreground">
                        <FileText className="me-1 inline h-3 w-3" />
                        رسالة مرافقة للرابط: {row.link.admin_message}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function StatCard({
  icon,
  label,
  value,
  tone,
}: {
  icon: React.ReactNode
  label: string
  value: number
  tone: "success" | "warning" | "neutral"
}) {
  const toneMap = {
    success: "text-emerald-600 dark:text-emerald-400",
    warning: "text-amber-600 dark:text-amber-400",
    neutral: "text-foreground/80",
  }
  return (
    <div className="rounded-lg border border-border/30 bg-background/30 p-3">
      <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
        <span className={toneMap[tone]}>{icon}</span>
        {label}
      </div>
      <div className={`mt-1 text-xl font-bold tabular-nums ${toneMap[tone]}`}>{value}</div>
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
