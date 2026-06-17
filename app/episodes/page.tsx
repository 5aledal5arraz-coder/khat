import { Metadata } from "next"
import Link from "next/link"
import { Search } from "lucide-react"
import { getEpisodes } from "@/lib/queries/episodes"
import { getCachedPublicEpisodes } from "@/lib/cache"
import { EpisodePosterCard } from "@/components/episodes/episode-poster-card"
import type { Episode } from "@/types/database"

export const dynamic = "force-dynamic"

export const metadata: Metadata = {
  title: "الحلقات",
  description: "استعرض جميع حلقات بودكاست خط — حوارات عميقة وأفكار تبقى.",
}

interface EpisodesPageProps {
  searchParams: Promise<{ search?: string }>
}

export default async function EpisodesPage({ searchParams }: EpisodesPageProps) {
  const { search } = await searchParams
  const query = search?.trim()

  const episodes: Episode[] = query
    ? await getEpisodes({ search: query }).catch(() => [])
    : await getCachedPublicEpisodes()
      .then((list) =>
        [...list].sort(
          (a, b) =>
            new Date(b.release_date).getTime() - new Date(a.release_date).getTime(),
        ),
      )
      .catch(() => [])

  return (
    <div className="px-6 pb-24 pt-14 sm:pt-20">
      <div className="mx-auto max-w-6xl">
        {/* Header */}
        <header className="text-center">
          <span className="text-[12px] font-bold uppercase tracking-[0.18em] text-accent">
            أرشيف الحوارات
          </span>
          <h1 className="mt-3 text-5xl font-extrabold tracking-tight text-foreground sm:text-6xl">
            الحلقات
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-[15px] leading-relaxed text-muted-foreground">
            كل حوار هو فكرة تستحق أن تبقى — استمع، تأمّل، ودوّن ما يستحق أن تضع
            تحته خط.
          </p>

          {/* Search */}
          <form action="/episodes" className="mx-auto mt-8 flex max-w-md items-center">
            <div className="relative w-full">
              <Search className="pointer-events-none absolute end-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                type="search"
                name="search"
                defaultValue={query ?? ""}
                placeholder="ابحث عن حلقة أو ضيف…"
                className="h-12 w-full rounded-full border border-border bg-card pe-11 ps-5 text-[15px] text-foreground shadow-sm outline-none transition-shadow placeholder:text-muted-foreground focus:border-primary/40 focus:ring-4 focus:ring-primary/10"
              />
            </div>
          </form>
        </header>

        {/* Result summary */}
        {query ? (
          <div className="mt-10 flex items-center justify-between text-[14px]">
            <span className="text-muted-foreground">
              {episodes.length > 0
                ? `${episodes.length} نتيجة لـ «${query}»`
                : `لا توجد نتائج لـ «${query}»`}
            </span>
            <Link href="/episodes" className="font-semibold text-primary hover:underline">
              عرض الكل
            </Link>
          </div>
        ) : null}

        {/* Grid */}
        {episodes.length > 0 ? (
          <div className="mt-10 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {episodes.map((ep) => (
              <EpisodePosterCard key={ep.id} ep={ep} />
            ))}
          </div>
        ) : (
          <div className="mt-16 rounded-3xl border border-dashed border-border bg-card/50 px-6 py-20 text-center">
            <p className="text-lg font-bold text-foreground">لا توجد حلقات بعد</p>
            <p className="mt-2 text-[14px] text-muted-foreground">
              {query
                ? "جرّب البحث بكلمات مختلفة."
                : "ستظهر الحلقات هنا فور نشرها."}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
