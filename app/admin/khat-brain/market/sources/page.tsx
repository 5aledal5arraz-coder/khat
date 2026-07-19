/**
 * Phase 3 — Trusted Sources CRUD page.
 *
 *   /admin/khat-brain/market/sources?filter=…&sort=…&type=…&language=…&geography=…&search=…
 *
 * Server-rendered. Reads facets + the filtered/sorted list in
 * parallel, hands them to the client component. All mutations go
 * through server actions. Phase 3 contract: CRUD + visibility ONLY —
 * no scoring/clustering/hybrid/scheduler changes.
 */

import Link from "next/link"
import { ArrowRight, Bookmark, Inbox } from "lucide-react"
import { requireAdmin } from "@/lib/api-utils"
import {
  listTrustedSources,
  getSourcesFacets,
  SOURCE_FILTER_KEYS,
  SOURCE_SORT_KEYS,
  type SourceFilterKey,
  type SourceSortKey,
} from "@/lib/market-intelligence/sources-queries"
import { PAGE_COPY } from "./_components/copy"
import { SourcesClient } from "./_components/sources-client"
import { MarketSubnav } from "../_components/market-subnav"

export const dynamic = "force-dynamic"

function pick(
  raw: string | string[] | undefined,
  allowed: readonly string[],
  fallback: string,
): string {
  const v = Array.isArray(raw) ? raw[0] : raw
  return allowed.includes(v ?? "") ? (v as string) : fallback
}
function str(raw: string | string[] | undefined): string {
  const v = Array.isArray(raw) ? raw[0] : raw
  return (v ?? "").trim()
}

export default async function TrustedSourcesPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>
}) {
  await requireAdmin()
  const sp = (await searchParams) ?? {}
  const filter = pick(
    sp.filter,
    SOURCE_FILTER_KEYS as readonly string[],
    "all",
  ) as SourceFilterKey
  const sort = pick(
    sp.sort,
    SOURCE_SORT_KEYS as readonly string[],
    "newest",
  ) as SourceSortKey
  const typeFilter = str(sp.type)
  const languageFilter = str(sp.language)
  const geographyFilter = str(sp.geography)
  const search = str(sp.search)

  const [facets, sources] = await Promise.all([
    getSourcesFacets(),
    listTrustedSources({
      filter,
      sort,
      type: typeFilter || null,
      language: languageFilter || null,
      geography: geographyFilter || null,
      search: search || null,
    }),
  ])

  return (
    <div className="mx-auto max-w-7xl space-y-4 px-4 py-4">
      <div>
        <Link
          href="/admin/ops"
          className="inline-flex items-center gap-1 text-[11.5px] text-muted-foreground hover:text-foreground"
        >
          <ArrowRight className="h-3 w-3" /> {PAGE_COPY.backToBrain}
        </Link>
        <div className="mt-3 flex items-baseline justify-between gap-2">
          <div>
            <div className="mb-1 inline-flex items-center gap-1.5 rounded-full border border-primary/20 bg-primary/5 px-2.5 py-0.5 text-[10.5px] font-medium text-primary">
              <Bookmark className="h-3 w-3" /> {PAGE_COPY.title}
            </div>
            <h1 className="text-xl font-bold tracking-tight">{PAGE_COPY.title}</h1>
            <p className="mt-1.5 max-w-3xl text-[12px] leading-relaxed text-muted-foreground">
              {PAGE_COPY.subtitle}
            </p>
          </div>
          <div className="flex flex-wrap gap-1.5 text-[10.5px]" data-facet-counts>
            <FacetChip label="نشطة" value={facets.totalActive} tone="ok" />
            <FacetChip label="متوقّفة" value={facets.totalInactive} tone="warn" />
            <FacetChip label="مؤرشفة" value={facets.totalArchived} tone="muted" />
          </div>
        </div>
      </div>

      <MarketSubnav />

      {facets.totalAll === 0 && filter === "all" ? (
        <div className="rounded-2xl border border-dashed border-border/40 bg-card/20 px-6 py-12 text-center">
          <Inbox className="mx-auto mb-2 h-6 w-6 text-muted-foreground" />
          <p className="text-[12.5px] text-muted-foreground">{PAGE_COPY.empty}</p>
          <SourcesClient
            sources={[]}
            filter={filter}
            sort={sort}
            search={search}
            typeFilter={typeFilter}
            languageFilter={languageFilter}
            geographyFilter={geographyFilter}
            availableGeos={Object.keys(facets.byGeography)}
            availableLangs={Object.keys(facets.byLanguage)}
          />
        </div>
      ) : (
        <SourcesClient
          sources={sources}
          filter={filter}
          sort={sort}
          search={search}
          typeFilter={typeFilter}
          languageFilter={languageFilter}
          geographyFilter={geographyFilter}
          availableGeos={Object.keys(facets.byGeography)}
          availableLangs={Object.keys(facets.byLanguage)}
        />
      )}
    </div>
  )
}

function FacetChip({
  label,
  value,
  tone,
}: {
  label: string
  value: number
  tone: "ok" | "warn" | "muted"
}) {
  const cls = {
    ok: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700",
    warn: "border-amber-500/30 bg-amber-500/10 text-amber-700",
    muted: "border-slate-500/30 bg-slate-500/10 text-slate-700",
  }[tone]
  return (
    <span
      className={"inline-flex items-center gap-1 rounded-full border px-2 py-0.5 " + cls}
    >
      <span>{label}</span>
      <span className="font-mono" dir="ltr">
        {value}
      </span>
    </span>
  )
}
