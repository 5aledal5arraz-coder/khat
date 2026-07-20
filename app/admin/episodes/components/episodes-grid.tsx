"use client"

import { useState, useMemo, useCallback, useTransition, useEffect, useRef } from "react"
import { useRouter } from "next/navigation"
import {
  CheckSquare,
  Square,
  MinusSquare,
  Search,
  Trash2,
  FolderInput,
  Loader2,
  AlertTriangle,
  X,
  Check,
  ChevronDown,
} from "lucide-react"
import { normalizeArabic } from "@/lib/search"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"
import { EpisodeCard } from "./episode-card"
import { EpisodeRow } from "./episode-row"
import {
  bulkDeleteEpisodes,
  bulkAssignEpisodeCategory,
  deleteEpisode,
  assignEpisodeGuest,
  assignEpisodeCategory,
  toggleEpisodeVisibility,
  updateEpisodeTitle,
  removeEpisodeOverride,
} from "../actions"
import type { AdminEpisodeView, AdminGuestView } from "./shared"
import type { CategoryWithCount } from "./shared"
import type { EpisodeOverride, EpisodeQuotesConfig } from "@/types/episodes"
import type { YouTubePackConfig } from "@/types/youtube-pack"

/**
 * Server-action calls THROW (rather than returning {success:false}) when
 * this tab predates the current deployment — the action id no longer
 * exists server-side ("Failed to find Server Action"). Without this
 * wrapper the throw escapes startTransition and the click silently does
 * nothing; with it, the failure lands in the normal actionError UI.
 */
const STALE_TAB_MSG =
  "تعذّر تنفيذ الإجراء — يبدو أن لوحة التحكم تحدّثت بعد فتح هذه الصفحة. أعد تحميل الصفحة ثم حاول مجدداً."

async function safeAction<T extends { success: boolean; error?: string }>(
  fn: () => Promise<T>,
): Promise<T | { success: false; error: string }> {
  try {
    return await fn()
  } catch {
    return { success: false, error: STALE_TAB_MSG }
  }
}

interface EpisodesGridProps {
  episodes: AdminEpisodeView[]
  overrides: EpisodeOverride[]
  guests: AdminGuestView[]
  categories: CategoryWithCount[]
  quotesConfig: EpisodeQuotesConfig
  youtubePackConfig: YouTubePackConfig
  hiddenEpisodeIds: string[]
  deletedEpisodeIds: string[]
  search: string
  viewMode: "grid" | "list"
}

/* ─── List Header (with select-all checkbox) ─── */

function ListHeader({
  allSelected,
  someSelected,
  onToggleAll,
}: {
  allSelected: boolean
  someSelected: boolean
  onToggleAll: () => void
}) {
  return (
    <div className="flex items-center gap-3 border-b border-border/30 px-3 py-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
      <button
        onClick={onToggleAll}
        aria-label={allSelected ? "إلغاء تحديد الكل" : "تحديد الكل"}
        className="shrink-0 text-muted-foreground transition-all hover:text-foreground"
      >
        {allSelected ? (
          <CheckSquare className="h-4 w-4 text-primary" />
        ) : someSelected ? (
          <MinusSquare className="h-4 w-4 text-primary" />
        ) : (
          <Square className="h-4 w-4" />
        )}
      </button>
      <span className="w-16 shrink-0">صورة</span>
      <span className="min-w-0 flex-1">العنوان</span>
      <span className="hidden w-28 shrink-0 md:block">الضيف</span>
      <span className="hidden w-24 shrink-0 md:block">التاريخ</span>
      <span className="hidden w-16 shrink-0 md:block">المدة</span>
      <span className="w-8 shrink-0" />
    </div>
  )
}

/* ─── Move-to-Category Dropdown ─── */

function MoveToCategoryButton({
  categories,
  onMove,
  disabled,
}: {
  categories: CategoryWithCount[]
  onMove: (categoryId: string | null) => void
  disabled: boolean
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false)
    }
    document.addEventListener("mousedown", handleClick)
    document.addEventListener("keydown", handleKey)
    return () => {
      document.removeEventListener("mousedown", handleClick)
      document.removeEventListener("keydown", handleKey)
    }
  }, [open])

  return (
    <div ref={ref} className="relative">
      <Button
        variant="outline"
        size="sm"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        className="h-8 gap-1.5 rounded-lg border-border/40 px-3 text-[11px]"
      >
        <FolderInput className="h-3.5 w-3.5" />
        نقل إلى
        <ChevronDown className="h-3 w-3 opacity-60" />
      </Button>
      {open && (
        <div
          role="menu"
          className="absolute end-0 top-full z-50 mt-1 max-h-64 w-56 overflow-y-auto rounded-xl border border-border/30 bg-card/95 py-1 shadow-xl shadow-black/20 backdrop-blur-xl"
        >
          <button
            role="menuitem"
            onClick={() => {
              setOpen(false)
              onMove(null)
            }}
            className="flex w-full items-center gap-3 px-4 py-2 text-[13px] text-muted-foreground transition-all hover:bg-muted/40 hover:text-foreground"
          >
            <X className="h-4 w-4 shrink-0 opacity-60" />
            بدون تصنيف
          </button>
          {categories.length > 0 && (
            <div className="my-1 border-t border-border/30" />
          )}
          {categories.map((cat) => (
            <button
              key={cat.id}
              role="menuitem"
              onClick={() => {
                setOpen(false)
                onMove(cat.id)
              }}
              className="flex w-full items-center justify-between gap-3 px-4 py-2 text-[13px] text-foreground transition-all hover:bg-muted/40"
            >
              <span className="truncate">{cat.name}</span>
              <span className="shrink-0 rounded-md bg-muted/40 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                {cat.episodeCount}
              </span>
            </button>
          ))}
          {categories.length === 0 && (
            <p className="px-4 py-3 text-center text-[11px] text-muted-foreground">
              لا توجد تصنيفات
            </p>
          )}
        </div>
      )}
    </div>
  )
}

/* ─── Confirmation Dialog ─── */

function DeleteConfirmationDialog({
  open,
  onOpenChange,
  titles,
  totalCount,
  onConfirm,
  isDeleting,
  error,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  titles: string[]
  totalCount: number
  onConfirm: () => void
  isDeleting: boolean
  error: string | null
}) {
  const PREVIEW_LIMIT = 8
  const preview = titles.slice(0, PREVIEW_LIMIT)
  const hiddenCount = totalCount - preview.length

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!isDeleting) onOpenChange(v) }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-destructive/10">
              <AlertTriangle className="h-5 w-5 text-destructive" />
            </div>
            <div className="min-w-0 flex-1">
              <DialogTitle>
                {totalCount === 1 ? "حذف الحلقة؟" : `حذف ${totalCount} حلقة؟`}
              </DialogTitle>
              <DialogDescription className="mt-1">
                لا يمكن التراجع عن هذا الإجراء. سيتم حذف كل البيانات المرتبطة
                (الاقتباسات، الفصول، الإصدارات، المعالجات).
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {preview.length > 0 && (
          <div className="max-h-48 overflow-y-auto rounded-xl border border-border/30 bg-muted/20 p-2">
            <ul className="space-y-1">
              {preview.map((title, i) => (
                <li
                  key={i}
                  className="truncate px-2 py-1 text-[12px] text-foreground/80"
                  dir="auto"
                  title={title}
                >
                  • {title}
                </li>
              ))}
            </ul>
            {hiddenCount > 0 && (
              <p className="mt-1 px-2 text-[11px] text-muted-foreground">
                + {hiddenCount} حلقة أخرى
              </p>
            )}
          </div>
        )}

        {error && (
          <p className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-[12px] text-destructive">
            {error}
          </p>
        )}

        <DialogFooter className="gap-2">
          <Button
            variant="ghost"
            disabled={isDeleting}
            onClick={() => onOpenChange(false)}
          >
            إلغاء
          </Button>
          <Button
            variant="destructive"
            disabled={isDeleting}
            onClick={onConfirm}
            className="gap-2"
          >
            {isDeleting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                جارٍ الحذف...
              </>
            ) : (
              <>
                <Trash2 className="h-4 w-4" />
                تأكيد الحذف
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/* ─── Main Grid ─── */

export function EpisodesGrid({
  episodes,
  overrides,
  guests,
  categories,
  quotesConfig,
  youtubePackConfig,
  hiddenEpisodeIds,
  search,
  viewMode,
}: EpisodesGridProps) {
  const router = useRouter()
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [isPending, startTransition] = useTransition()
  const [actionError, setActionError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)

  // Delete confirmation state — can hold a single id or full selection
  const [deleteDialog, setDeleteDialog] = useState<{
    open: boolean
    ids: string[]
    isBulk: boolean
  }>({ open: false, ids: [], isBulk: false })

  const overrideMap = useMemo(
    () => new Map(overrides.map((o) => [o.id, o])),
    [overrides]
  )
  const hiddenSet = useMemo(
    () => new Set(hiddenEpisodeIds),
    [hiddenEpisodeIds]
  )

  // Filtered episodes (Arabic-aware search) — memoized for large lists
  const filteredEpisodes = useMemo(() => {
    const normalizedSearch = normalizeArabic(search)
    if (!normalizedSearch) return episodes
    return episodes.filter(
      (ep) =>
        normalizeArabic(ep.title).includes(normalizedSearch) ||
        (overrideMap.get(ep.id)?.customTitle &&
          normalizeArabic(overrideMap.get(ep.id)!.customTitle).includes(
            normalizedSearch
          ))
    )
  }, [episodes, search, overrideMap])

  // Auto-clear success toast
  useEffect(() => {
    if (!successMessage) return
    const id = setTimeout(() => setSuccessMessage(null), 3500)
    return () => clearTimeout(id)
  }, [successMessage])

  const selectionCount = selectedIds.size
  const allSelected =
    filteredEpisodes.length > 0 &&
    filteredEpisodes.every((ep) => selectedIds.has(ep.id))
  const someSelected =
    selectionCount > 0 &&
    filteredEpisodes.some((ep) => selectedIds.has(ep.id))

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const clearSelection = useCallback(() => setSelectedIds(new Set()), [])

  const handleSelectAll = useCallback(() => {
    setSelectedIds((prev) => {
      const visibleIds = filteredEpisodes.map((ep) => ep.id)
      const allVisibleSelected = visibleIds.every((id) => prev.has(id))
      if (allVisibleSelected) {
        // Deselect visible only; keep any off-screen selections
        const next = new Set(prev)
        visibleIds.forEach((id) => next.delete(id))
        return next
      }
      return new Set([...prev, ...visibleIds])
    })
  }, [filteredEpisodes])

  /* ─── Bulk move ─── */

  const handleBulkMove = useCallback(
    (categoryId: string | null) => {
      if (selectionCount === 0 || isPending) return
      const ids = Array.from(selectedIds)
      setActionError(null)
      startTransition(async () => {
        const result = await safeAction(() => bulkAssignEpisodeCategory(ids, categoryId))
        if (!result.success) {
          setActionError(result.error || "فشل نقل الحلقات")
          return
        }
        const target = categoryId
          ? categories.find((c) => c.id === categoryId)?.name || "تصنيف"
          : "بدون تصنيف"
        setSuccessMessage(`تم نقل ${result.count} حلقة إلى ${target}`)
        // Partial success (some ids couldn't be materialized) — show the
        // warning alongside the honest count instead of swallowing it.
        if (result.error) setActionError(result.error)
        clearSelection()
        router.refresh()
      })
    },
    [selectedIds, selectionCount, isPending, categories, clearSelection, router]
  )

  /* ─── Delete flow ─── */

  const openBulkDelete = useCallback(() => {
    if (selectionCount === 0) return
    setActionError(null)
    setDeleteDialog({
      open: true,
      ids: Array.from(selectedIds),
      isBulk: true,
    })
  }, [selectedIds, selectionCount])

  const openSingleDelete = useCallback((episodeId: string) => {
    setActionError(null)
    setDeleteDialog({ open: true, ids: [episodeId], isBulk: false })
  }, [])

  const handleConfirmDelete = useCallback(() => {
    const { ids, isBulk } = deleteDialog
    if (ids.length === 0) return

    startTransition(async () => {
      if (isBulk || ids.length > 1) {
        const result = await safeAction(() => bulkDeleteEpisodes(ids))
        if (!result.success) {
          setActionError(result.error || "فشل حذف الحلقات")
          return
        }
        setSuccessMessage(`تم حذف ${result.deletedCount} حلقة`)
      } else {
        const result = await safeAction(() => deleteEpisode(ids[0]))
        if (!result.success) {
          setActionError(result.error || "فشل حذف الحلقة")
          return
        }
        setSuccessMessage("تم حذف الحلقة")
      }
      setDeleteDialog({ open: false, ids: [], isBulk: false })
      clearSelection()
      router.refresh()
    })
  }, [deleteDialog, clearSelection, router])

  /* ─── Guest / Category assignment (per-episode) ─── */

  const handleAssignGuest = useCallback(
    (episodeId: string, guestId: string | null) => {
      setActionError(null)
      startTransition(async () => {
        const result = await safeAction(() => assignEpisodeGuest(episodeId, guestId))
        if (!result.success) {
          setActionError(result.error || "فشل تعيين الضيف")
          return
        }
        const guestName = guestId
          ? guests.find((g) => g.id === guestId)?.name || "الضيف"
          : null
        setSuccessMessage(
          guestName ? `تم تعيين الضيف: ${guestName}` : "تم إلغاء تعيين الضيف",
        )
        router.refresh()
      })
    },
    [guests, router],
  )

  const handleAssignCategory = useCallback(
    (episodeId: string, categoryId: string | null) => {
      setActionError(null)
      startTransition(async () => {
        const result = await safeAction(() => assignEpisodeCategory(episodeId, categoryId))
        if (!result.success) {
          setActionError(result.error || "فشل تعيين التصنيف")
          return
        }
        const categoryName = categoryId
          ? categories.find((c) => c.id === categoryId)?.name || "التصنيف"
          : null
        setSuccessMessage(
          categoryName
            ? `تم تعيين التصنيف: ${categoryName}`
            : "تم إلغاء تعيين التصنيف",
        )
        router.refresh()
      })
    },
    [categories, router],
  )

  /* ─── Visibility toggle (per-episode) ─── */

  // Routed through the grid — like delete/assign — so a role rejection
  // (VIEWER) surfaces the action's { success:false, error } in the shared
  // banner instead of the previous silent no-op in the card/row.
  const handleToggleVisibility = useCallback(
    (episodeId: string) => {
      const willHide = !hiddenSet.has(episodeId)
      setActionError(null)
      startTransition(async () => {
        const result = await safeAction(() => toggleEpisodeVisibility(episodeId))
        if (!result.success) {
          setActionError(result.error || "فشل تغيير حالة عرض الحلقة")
          return
        }
        setSuccessMessage(willHide ? "تم إخفاء الحلقة" : "تم إظهار الحلقة")
        router.refresh()
      })
    },
    [hiddenSet, router],
  )

  /* ─── Title override edit / reset (per-episode) ─── */

  // Routed through the grid — same plumbing as delete/assign/visibility — so a
  // role rejection (VIEWER) surfaces the action's { success:false, error } in
  // the shared banner instead of the previous silent no-op in the card/row.
  // These resolve a promise (unlike the void visibility toggle) so the card/row
  // can keep their inline-editor "saving"/"editing" state in sync with the
  // action's completion.
  const handleUpdateTitle = useCallback(
    (episodeId: string, originalTitle: string, customTitle: string) =>
      new Promise<void>((resolve) => {
        setActionError(null)
        startTransition(async () => {
          const result = await safeAction(() =>
            updateEpisodeTitle(episodeId, originalTitle, customTitle),
          )
          if (!result.success) {
            setActionError(result.error || "فشل تعديل العنوان")
            resolve()
            return
          }
          setSuccessMessage("تم تحديث العنوان")
          router.refresh()
          resolve()
        })
      }),
    [router],
  )

  const handleRemoveOverride = useCallback(
    (episodeId: string) =>
      new Promise<void>((resolve) => {
        setActionError(null)
        startTransition(async () => {
          const result = await safeAction(() => removeEpisodeOverride(episodeId))
          if (!result.success) {
            setActionError(result.error || "فشل استعادة النسخة الأصلية")
            resolve()
            return
          }
          setSuccessMessage("تمت استعادة النسخة الأصلية")
          router.refresh()
          resolve()
        })
      }),
    [router],
  )

  // Map from id → resolved title (override > original) for the dialog preview
  const resolvedTitleMap = useMemo(() => {
    const m = new Map<string, string>()
    for (const ep of episodes) {
      m.set(ep.id, overrideMap.get(ep.id)?.customTitle || ep.title)
    }
    return m
  }, [episodes, overrideMap])

  const dialogTitles = useMemo(
    () =>
      deleteDialog.ids
        .map((id) => resolvedTitleMap.get(id) || id)
        .filter(Boolean) as string[],
    [deleteDialog.ids, resolvedTitleMap]
  )

  /* ─── Render helpers ─── */

  const episodeProps = useCallback(
    (episode: AdminEpisodeView) => ({
      episode,
      override: overrideMap.get(episode.id) || null,
      isHidden: hiddenSet.has(episode.id),
      isSelected: selectedIds.has(episode.id),
      onToggleSelect: () => toggleSelect(episode.id),
      onDelete: () => openSingleDelete(episode.id),
      onAssignGuest: (guestId: string | null) =>
        handleAssignGuest(episode.id, guestId),
      onAssignCategory: (categoryId: string | null) =>
        handleAssignCategory(episode.id, categoryId),
      onToggleVisibility: () => handleToggleVisibility(episode.id),
      onUpdateTitle: (originalTitle: string, customTitle: string) =>
        handleUpdateTitle(episode.id, originalTitle, customTitle),
      onRemoveOverride: () => handleRemoveOverride(episode.id),
      isAssigning: isPending,
      guests,
      categories,
      currentGuestId: episode.guest_id || null,
      currentCategoryId: episode.category_id || null,
      quotesEntry: quotesConfig[episode.id] || null,
      youtubePackEntry: youtubePackConfig[episode.id] || null,
    }),
    [
      overrideMap,
      hiddenSet,
      selectedIds,
      toggleSelect,
      openSingleDelete,
      handleAssignGuest,
      handleAssignCategory,
      handleToggleVisibility,
      handleUpdateTitle,
      handleRemoveOverride,
      isPending,
      guests,
      categories,
      quotesConfig,
      youtubePackConfig,
    ]
  )

  return (
    <div className="space-y-4">
      {/* Bulk Actions Bar */}
      {selectionCount > 0 && (
        <div className="sticky top-0 z-30 flex flex-wrap items-center gap-3 rounded-lg border border-primary/20 bg-primary/5 px-4 py-2.5 shadow-sm backdrop-blur-sm">
          <button
            onClick={handleSelectAll}
            aria-label={allSelected ? "إلغاء تحديد الكل" : "تحديد الكل"}
            className="shrink-0 text-muted-foreground transition-all hover:text-foreground"
          >
            {allSelected ? (
              <CheckSquare className="h-[18px] w-[18px] text-primary" />
            ) : someSelected ? (
              <MinusSquare className="h-[18px] w-[18px] text-primary" />
            ) : (
              <Square className="h-[18px] w-[18px]" />
            )}
          </button>
          <span className="text-xs font-medium text-foreground">
            {selectionCount} محدد
          </span>
          <button
            onClick={clearSelection}
            className="text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            إلغاء التحديد
          </button>

          <div className="ms-auto flex items-center gap-2">
            <MoveToCategoryButton
              categories={categories}
              onMove={handleBulkMove}
              disabled={isPending}
            />
            <Button
              variant="destructive"
              size="sm"
              onClick={openBulkDelete}
              disabled={isPending}
              className="h-8 gap-1.5 rounded-lg px-3 text-[11px]"
            >
              {isPending && deleteDialog.open ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Trash2 className="h-3.5 w-3.5" />
              )}
              حذف
            </Button>
          </div>
        </div>
      )}

      {/* Success / Error toast */}
      {successMessage && (
        <div className="flex items-center gap-2 rounded-lg border border-green-500/20 bg-green-500/5 px-4 py-2 text-[12px] text-green-700">
          <Check className="h-4 w-4 shrink-0" />
          <span>{successMessage}</span>
        </div>
      )}
      {actionError && !deleteDialog.open && (
        <div className="flex items-center gap-2 rounded-lg border border-destructive/20 bg-destructive/5 px-4 py-2 text-[12px] text-destructive">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>{actionError}</span>
          <button
            onClick={() => setActionError(null)}
            className="ms-auto text-destructive/70 hover:text-destructive"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* Grid Content */}
      {filteredEpisodes.length > 0 ? (
        viewMode === "grid" ? (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {filteredEpisodes.map((episode) => (
              <EpisodeCard key={episode.id} {...episodeProps(episode)} />
            ))}
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-border/30 bg-card/50 admin-glow">
            <ListHeader
              allSelected={allSelected}
              someSelected={someSelected && !allSelected}
              onToggleAll={handleSelectAll}
            />
            <div className="divide-y divide-border/15">
              {filteredEpisodes.map((episode) => (
                <EpisodeRow key={episode.id} {...episodeProps(episode)} />
              ))}
            </div>
          </div>
        )
      ) : (
        <div className="admin-card flex flex-col items-center justify-center py-20 text-center">
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-muted/30">
            <Search className="h-5 w-5 text-muted-foreground" />
          </div>
          <p className="text-[13px] font-semibold text-muted-foreground">
            {search ? "لا توجد نتائج" : "لا توجد حلقات"}
          </p>
          <p className="mt-1.5 max-w-xs text-[12px] text-muted-foreground">
            {search
              ? `لم يتم العثور على حلقات تطابق "${search}"`
              : "لم يتم إضافة أي حلقات بعد"}
          </p>
        </div>
      )}

      <DeleteConfirmationDialog
        open={deleteDialog.open}
        onOpenChange={(v) =>
          setDeleteDialog((prev) => ({ ...prev, open: v }))
        }
        titles={dialogTitles}
        totalCount={deleteDialog.ids.length}
        onConfirm={handleConfirmDelete}
        isDeleting={isPending}
        error={actionError}
      />
    </div>
  )
}
