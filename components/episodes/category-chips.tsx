import Link from "next/link"
import { cn } from "@/lib/utils"
import type { EpisodeCategory } from "@/types/database"

/**
 * The category filter row — plain `<Link>` pills, not a dropdown.
 *
 * Server-rendered links rather than a client-side control: every state is a
 * real URL, so it is shareable, back-button-correct, crawlable, and needs zero
 * JavaScript. Shared by `/episodes` (where a chip is a query filter that must
 * carry the current search) and `/categories/[slug]` (where a chip is a route),
 * hence `hrefFor` rather than a hard-coded href scheme.
 */
export function CategoryChips({
  categories,
  activeSlug,
  hrefFor,
  counts,
  className,
}: {
  categories: EpisodeCategory[]
  /** `null` when no category is filtering — the "الكل" chip is then current. */
  activeSlug: string | null
  /** Build the destination for a chip. `null` = the "الكل" chip. */
  hrefFor: (slug: string | null) => string
  /**
   * `category_id → count`, plus `all`. Omit to render chips with no numbers —
   * which is what a search does, because these counts describe the whole
   * archive and would contradict the visible result count.
   */
  counts?: Record<string, number>
  className?: string
}) {
  if (categories.length === 0) return null

  return (
    <nav
      aria-label="تصفية حسب التصنيف"
      className={cn("flex flex-wrap items-center justify-center gap-2", className)}
    >
      <CategoryChip
        href={hrefFor(null)}
        label="الكل"
        count={counts?.all}
        active={activeSlug === null}
      />
      {categories.map((category) => (
        <CategoryChip
          key={category.id}
          href={hrefFor(category.slug)}
          label={category.name}
          count={counts?.[category.id]}
          active={activeSlug === category.slug}
        />
      ))}
    </nav>
  )
}

function CategoryChip({
  href,
  label,
  count,
  active,
}: {
  href: string
  label: string
  count?: number
  active: boolean
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-[13px] font-semibold transition-colors",
        "focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2",
        active
          ? "border-primary bg-primary text-primary-foreground"
          : "border-border bg-card text-muted-foreground hover:border-primary/40 hover:text-primary",
      )}
    >
      {label}
      {typeof count === "number" ? (
        <span className={cn("text-[12px] font-medium", active ? "opacity-80" : "opacity-70")}>
          {count}
        </span>
      ) : null}
    </Link>
  )
}
