"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { AdminPageHeader } from "../components/admin-page-header"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Plus,
  Search,
  Filter,
  Sparkles,
  UserPlus,
  ChevronRight,
  MapPin,
  Inbox,
} from "lucide-react"
import { CandidateFormDialog } from "./components/candidate-form-dialog"
import { STATUS_META, STATUS_OPTIONS, PRIORITY_META, CATEGORY_OPTIONS } from "./lib/status"
import type { GuestCandidateView, GuestCandidateStatus } from "@/types/database"

interface Props {
  initialCandidates: GuestCandidateView[]
  stats: {
    total: number
    new: number
    researching: number
    analyzed: number
    shortlisted: number
    contacted: number
    accepted: number
    declined: number
    prep_completed: number
  }
}

export function CandidatesListClient({ initialCandidates, stats }: Props) {
  const router = useRouter()
  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState<GuestCandidateStatus | "all">("all")
  const [categoryFilter, setCategoryFilter] = useState<string>("all")
  const [createOpen, setCreateOpen] = useState(false)

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase()
    return initialCandidates.filter((c) => {
      if (statusFilter !== "all" && c.status !== statusFilter) return false
      if (categoryFilter !== "all" && c.category !== categoryFilter) return false
      if (term) {
        const haystack = `${c.full_name} ${c.display_name || ""} ${c.bio || ""} ${c.city || ""} ${c.country || ""}`.toLowerCase()
        if (!haystack.includes(term)) return false
      }
      return true
    })
  }, [initialCandidates, search, statusFilter, categoryFilter])

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="المرشحون"
        description="إدارة المرشحين المحتملين للحلقات القادمة. هذه قاعدة بيانات مستقلة عن الضيوف الفعليين."
        badge="ai"
        actions={
          <>
            <Link
              href="/admin/guest-candidates/responses"
              className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border/40 bg-background/30 px-3 text-[12px] font-medium text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground"
            >
              <Inbox className="h-3.5 w-3.5" />
              أرشيف النماذج
            </Link>
            <Button onClick={() => setCreateOpen(true)} size="sm">
              <Plus className="ms-1 h-4 w-4" /> مرشح جديد
            </Button>
          </>
        }
      />

      {/* Stats grid */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
        <StatCard label="الإجمالي" value={stats.total} accent="bg-primary/8 text-primary" />
        <StatCard label="جديد" value={stats.new} accent="bg-slate-500/10 text-slate-700 dark:text-slate-300" />
        <StatCard label="ضمن القائمة" value={stats.shortlisted} accent="bg-amber-500/10 text-amber-700 dark:text-amber-400" />
        <StatCard label="تم التواصل" value={stats.contacted} accent="bg-sky-500/10 text-sky-700 dark:text-sky-400" />
        <StatCard label="وافق" value={stats.accepted} accent="bg-emerald-500/10 text-emerald-700 dark:text-emerald-400" />
        <StatCard label="أكمل التحضير" value={stats.prep_completed} accent="bg-green-500/10 text-green-700 dark:text-green-400" />
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-3 rounded-xl border border-border/40 bg-card/40 p-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="ابحث بالاسم، البلد، النبذة..."
            className="ps-9"
          />
        </div>

        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as GuestCandidateStatus | "all")}
            className="h-9 rounded-md border border-input bg-transparent px-2 text-xs"
          >
            <option value="all">كل الحالات</option>
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>{STATUS_META[s].label}</option>
            ))}
          </select>

          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="h-9 rounded-md border border-input bg-transparent px-2 text-xs"
          >
            <option value="all">كل التصنيفات</option>
            {CATEGORY_OPTIONS.map((c) => (
              <option key={c.value} value={c.value}>{c.label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Candidates list */}
      {filtered.length === 0 ? (
        <EmptyState onCreate={() => setCreateOpen(true)} hasFilters={search !== "" || statusFilter !== "all" || categoryFilter !== "all"} />
      ) : (
        <div className="space-y-2">
          {filtered.map((c) => (
            <CandidateRow key={c.id} candidate={c} />
          ))}
        </div>
      )}

      <CandidateFormDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onSuccess={() => router.refresh()}
      />
    </div>
  )
}

function StatCard({ label, value, accent }: { label: string; value: number; accent: string }) {
  return (
    <div className="rounded-xl border border-border/40 bg-card/40 p-3">
      <div className={`mb-1 inline-flex h-6 items-center rounded-md px-2 text-[10px] font-semibold ${accent}`}>
        {label}
      </div>
      <div className="text-xl font-bold tracking-tight">{value}</div>
    </div>
  )
}

function CandidateRow({ candidate }: { candidate: GuestCandidateView }) {
  const status = STATUS_META[candidate.status]
  const priority = candidate.priority_level ? PRIORITY_META[candidate.priority_level] : null
  const initials = candidate.full_name.trim().slice(0, 2)
  const aiScore = candidate.ai_score_overall

  return (
    <Link
      href={`/admin/guest-candidates/${candidate.id}`}
      className="group flex items-center gap-4 rounded-xl border border-border/40 bg-card/40 p-3 transition-all hover:border-primary/30 hover:bg-card/60"
    >
      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-primary/15 to-primary/5 text-sm font-semibold text-primary">
        {initials}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <h3 className="truncate text-sm font-semibold">{candidate.display_name || candidate.full_name}</h3>
          {priority && (
            <span className={`shrink-0 rounded px-1.5 py-0.5 text-[9px] font-semibold ${priority.badgeClass}`}>
              {priority.label}
            </span>
          )}
          {aiScore !== null && aiScore !== undefined && (
            <span className="inline-flex shrink-0 items-center gap-0.5 rounded bg-violet-500/10 px-1.5 py-0.5 text-[9px] font-semibold text-violet-700 dark:text-violet-400">
              <Sparkles className="h-2.5 w-2.5" />
              {aiScore.toFixed(1)}
            </span>
          )}
        </div>
        <div className="mt-0.5 flex items-center gap-3 text-[11px] text-muted-foreground">
          {(candidate.city || candidate.country) && (
            <span className="inline-flex items-center gap-1">
              <MapPin className="h-3 w-3" />
              {[candidate.city, candidate.country].filter(Boolean).join("، ")}
            </span>
          )}
          {candidate.category && <span>{CATEGORY_OPTIONS.find((c) => c.value === candidate.category)?.label || candidate.category}</span>}
          {candidate.social_links.length > 0 && <span>{candidate.social_links.length} رابط</span>}
        </div>
      </div>

      <div className="hidden flex-col items-end gap-1 sm:flex">
        <span className={`rounded px-2 py-0.5 text-[10px] font-semibold ${status.badgeClass}`}>
          {status.label}
        </span>
        {candidate.has_completed_prep && (
          <span className="text-[10px] text-emerald-700 dark:text-emerald-400">✓ تحضير مكتمل</span>
        )}
      </div>

      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:text-primary group-hover:-translate-x-0.5 rtl:rotate-180 rtl:group-hover:translate-x-0.5" />
    </Link>
  )
}

function EmptyState({ onCreate, hasFilters }: { onCreate: () => void; hasFilters: boolean }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border/40 bg-card/20 p-12 text-center">
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
        {hasFilters ? <Filter className="h-6 w-6 text-primary/70" /> : <UserPlus className="h-6 w-6 text-primary/70" />}
      </div>
      <h3 className="mb-1 text-sm font-semibold">
        {hasFilters ? "لا توجد نتائج مطابقة" : "لا يوجد مرشحون بعد"}
      </h3>
      <p className="mb-4 max-w-md text-xs text-muted-foreground">
        {hasFilters
          ? "جرب تعديل البحث أو تصفية مختلفة"
          : "ابدأ ببناء قائمة المرشحين المحتملين للحلقات القادمة. يمكنك إضافتهم يدوياً أو لاحقاً عبر الذكاء الاصطناعي."}
      </p>
      {!hasFilters && (
        <Button onClick={onCreate} size="sm">
          <Plus className="ms-1 h-4 w-4" /> إضافة أول مرشح
        </Button>
      )}
    </div>
  )
}
