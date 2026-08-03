import Link from "next/link"
import { cn } from "@/lib/utils"
import {
  PROGRAM_LANES,
  laneCategories,
  laneGroups,
  laneLabel,
  laneNote,
  laneTag,
  unresolvedLaneExceptions,
  type ProgramLane,
} from "@/lib/episodes/programs"
import type { EpisodeCategory } from "@/types/database"

/**
 * The archive's navigation — TWO LEVELS, because the archive holds two levels.
 *
 * Level one is the lane: حلقات خط · the separate program · the clips. Level two
 * is the group inside the active lane — the seasons of خط. It replaced a single
 * flat chip row (`CategoryChips`) whose «الكل» pill meant "everything except
 * clips" and said so nowhere; see `lib/episodes/programs.ts` for why the data
 * made that inevitable.
 *
 * Plain `<Link>`s, not a client control, for the same reasons the chip row was:
 * every state is a real URL — shareable, back-button-correct, crawlable, zero
 * JavaScript.
 *
 * NO COUNT ON A LANE TAB. That is the whole bug this replaces: a lane's total
 * and its groups' totals are two different questions, and printing both invites
 * exactly the «الكل ٣٦ / ١٩ / ١٦ / ٦» arithmetic nobody could read. Counts stay
 * on the groups, where they answer one question, and the page states the size
 * of what is actually on screen.
 */
export function ArchiveNav({
  categories,
  activeLane,
  activeSlug,
  laneHref,
  groupHref,
  counts,
  className,
}: {
  categories: EpisodeCategory[]
  /**
   * `null` when nothing is scoped — an archive-wide search. No tab is then
   * marked current, because none of them describes the result.
   */
  activeLane: ProgramLane | null
  /** The selected group inside the lane, or `null` for the whole lane. */
  activeSlug: string | null
  laneHref: (lane: ProgramLane) => string
  /**
   * The link for one group. There is NO "all" variant any more — the lane tab
   * above is that control, and it always was the same URL. See below.
   */
  groupHref: (slug: string) => string
  /** `category_id → count`. Omit to render groups with no numbers. */
  counts?: Record<string, number>
  className?: string
}) {
  if (categories.length === 0) return null

  // The reverse-direction hole declared at the switch point, reported at the
  // one moment it is detectable. An enumerated exception slug that resolves to
  // nothing means a category was renamed — «سالفة» → «سالفه» is one keystroke —
  // and its episodes have just become a season of خط with no other sign
  // anywhere. It warns and renders on: guessing what the operator meant is a
  // worse failure than the typo.
  const drifted = unresolvedLaneExceptions(categories)
  if (drifted.length > 0) {
    console.warn(
      `[episodes] lane exception slug(s) match no category: ${drifted.join(", ")} — ` +
        "renamed in the admin? Those episodes are now listed as حلقات خط. " +
        "See SEPARATE_PROGRAM_SLUGS in lib/episodes/programs.ts.",
    )
  }

  // An empty lane gets no tab: a program with nothing in it is not a place a
  // visitor can go, and an empty tab is a broken promise rather than a filter.
  const lanes = PROGRAM_LANES.filter((lane) => laneCategories(categories, lane).length > 0)
  if (lanes.length === 0) return null

  const groups = activeLane ? laneGroups(categories, activeLane, counts) : []

  // Only when the visitor can actually choose. With one season there is nothing
  // to pick between, and a row holding the single season already named by the
  // page is chrome pretending to be a control. The selected state is still
  // visible without it: the lane tab is current and the page states the scope
  // by name. Season two makes this row appear on its own.
  const showGroups = groups.length > 1

  const note = activeLane ? laneNote(activeLane, categories) : null

  return (
    <div className={cn("flex flex-col items-center gap-4", className)}>
      <nav
        aria-label="أقسام الأرشيف"
        className="flex flex-wrap items-center justify-center gap-2"
      >
        {lanes.map((lane) => {
          const active = lane === activeLane
          // Styled active for "you are in this lane", but only CURRENT when
          // nothing narrower is selected — with the «الكل» chip gone this tab
          // is the whole-lane control, and a tab that reports itself current
          // while a season is chosen would leave the page with two current
          // links and no way to hear which one you are on.
          const current = active && activeSlug === null
          const tag = laneTag(lane)
          return (
            <Link
              key={lane}
              href={laneHref(lane)}
              aria-current={current ? "page" : undefined}
              className={cn(
                "inline-flex items-center gap-2 rounded-full border px-4 py-2 text-caption font-semibold transition-colors",
                "focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2",
                active
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-card text-muted-foreground hover:border-primary/40 hover:text-primary",
              )}
            >
              {laneLabel(lane, categories)}
              {/* The kind, on the tab itself — a visitor must not have to click
                  «سالفة» to find out it is not خط. */}
              {tag ? (
                <span
                  className={cn(
                    "rounded-full px-2 py-0.5 text-micro font-medium",
                    active
                      ? "bg-primary-foreground/15 text-primary-foreground/85"
                      : "bg-secondary text-muted-foreground",
                  )}
                >
                  {tag}
                </span>
              ) : null}
            </Link>
          )
        })}
      </nav>

      {note ? (
        <p className="max-w-measure text-caption text-muted-foreground">{note}</p>
      ) : null}

      {showGroups ? (
        <nav
          aria-label="تصفية حسب الموسم"
          className="flex flex-wrap items-center justify-center gap-2"
        >
          {/* NO «الكل» CHIP. It was a duplicate control AND a returning bug.
              · Duplicate: `groupHref(null)` and `laneHref(activeLane)` build
                the identical URL — `/episodes` for خط — so the row opened with
                a second button for the tab directly above it.
              · Bug: a season row is a PARTITION on screen, and this lane is not
                partitioned by its seasons. Measured today, the خط lane holds 20
                published episodes and «الموسم الاول» holds 19; the twentieth
                has no category yet, which is a real and correct third state
                (see the switch point). The moment «الموسم الثاني» arrives the
                row would have read «الكل ٢٠ · الموسم الاول ١٩ · الموسم الثاني
                N», 19 + N ≠ 20, with nothing on screen accounting for the
                difference — which is «الكل ٣٦» again, one level down, in the
                row that replaced it.
              Dropping the chip drops the total. What remains is group counts,
              which answer one question each and are not claimed to sum to
              anything. Going back to the whole lane is the lane tab, and
              `aria-current` below now says which of the two is actually
              selected instead of marking the tab current either way. */}
          {groups.map((group) => (
            <GroupChip
              key={group.slug}
              href={groupHref(group.slug)}
              label={group.name}
              count={group.count}
              active={activeSlug === group.slug}
            />
          ))}
        </nav>
      ) : null}
    </div>
  )
}

/**
 * A group inside the active lane — a season of خط.
 *
 * A count here answers exactly one question: how many episodes are in THIS
 * season. That is the only reason counts survived the rewrite at all, and it
 * is why there is no chip carrying a lane total beside them: the moment two
 * numbers of different kinds sit in one row, a reader adds them up, and this
 * archive has now produced that same wrong sum twice.
 */
function GroupChip({
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
        "inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-caption font-semibold transition-colors",
        "focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2",
        active
          ? "border-primary/40 bg-secondary text-primary"
          : "border-transparent bg-transparent text-muted-foreground hover:text-primary",
      )}
    >
      {label}
      {typeof count === "number" ? (
        <span className="text-micro font-medium opacity-70">{count}</span>
      ) : null}
    </Link>
  )
}
