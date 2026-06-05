import { NextRequest, NextResponse } from "next/server"
import { getEpisodes } from "@/lib/queries/episodes"
import { getHiddenGems, interleaveBoosts } from "@/lib/episodes/boost"

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams

  const offset = Math.max(0, parseInt(searchParams.get("offset") || "0", 10) || 0)
  const limit = Math.min(Math.max(1, parseInt(searchParams.get("limit") || "9", 10) || 9), 50)
  const category = searchParams.get("category") || undefined
  const search = searchParams.get("search") || undefined
  const sort = searchParams.get("sort") || "newest"

  try {
    let episodes = await getEpisodes({
      category,
      search,
    })

    // Sort by date only when not searching — search results are ranked by relevance
    if (!search) {
      episodes = [...episodes].sort((a, b) => {
        const dateA = new Date(a.release_date).getTime()
        const dateB = new Date(b.release_date).getTime()
        return sort === "oldest" ? dateA - dateB : dateB - dateA
      })
    }

    // On default view (no search, no category, newest first), interleave boosts.
    // `episodes` is already the full unfiltered set here, so reuse it.
    const isDefaultView = !search && !category && sort !== "oldest"
    if (isDefaultView) {
      const gemsIds = new Set(getHiddenGems(episodes, 5).map((e) => e.id))
      episodes = interleaveBoosts(episodes, episodes, { excludeIds: gemsIds })
    }

    // Apply pagination
    const paginated = episodes.slice(offset, offset + limit)

    return NextResponse.json(paginated)
  } catch (error) {
    console.error("Error fetching episodes:", error)
    return NextResponse.json([], { status: 500 })
  }
}
