/**
 * Phase B.5 — Inline workspace skeleton.
 *
 * Renders during server-component refetches (initial load + after a
 * server action triggers `revalidatePath`). Mirrors the workspace's
 * actual layout so the page doesn't go blank between data refreshes.
 *
 * No data, no client logic — pure CSS shimmer placeholders.
 */

export default function EpisodeWorkspaceLoading() {
  return (
    <div className="mx-auto max-w-6xl space-y-5 p-6" data-workspace-loading>
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-[11.5px]">
        <SkeletonLine width="w-24" />
        <span className="text-muted-foreground">/</span>
        <SkeletonLine width="w-16" />
        <span className="text-muted-foreground">/</span>
        <SkeletonLine width="w-40" />
      </div>

      {/* Header */}
      <div className="rounded-3xl border border-primary/10 bg-card/30 p-5">
        <SkeletonLine width="w-32" className="mb-3" />
        <SkeletonLine width="w-2/3" className="h-6 mb-2" />
        <SkeletonLine width="w-48" className="h-3" />
      </div>

      {/* Tab nav */}
      <div className="flex flex-wrap gap-1 border-b border-border/40 pb-2">
        {Array.from({ length: 8 }).map((_, i) => (
          <SkeletonPill key={i} />
        ))}
      </div>

      {/* Tab content */}
      <div className="space-y-4">
        <div className="rounded-2xl border border-border/40 bg-card/20 p-4">
          <SkeletonLine width="w-1/3" className="mb-3" />
          <SkeletonLine width="w-full" className="h-3 mb-2" />
          <SkeletonLine width="w-5/6" className="h-3 mb-2" />
          <SkeletonLine width="w-4/6" className="h-3" />
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="rounded-2xl border border-border/40 bg-card/20 p-3"
            >
              <SkeletonLine width="w-12" className="mb-1" />
              <SkeletonLine width="w-16" className="h-4" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function SkeletonLine({
  width,
  className = "",
}: {
  width: string
  className?: string
}) {
  return (
    <div
      className={`h-3 rounded-md bg-muted/30 animate-pulse ${width} ${className}`}
    />
  )
}

function SkeletonPill() {
  return (
    <div className="h-7 w-20 rounded-t-xl bg-muted/20 animate-pulse" />
  )
}
