import { getEpisodes } from "@/lib/queries/episodes"
import { getHomepageFeatured, getLatestEpisodesForHomepage } from "@/lib/queries/homepage-featured"
import { getHomepageThinkers, getLatestGuestsForHomepage } from "@/lib/queries/homepage-thinkers"
import { getAllGuests } from "@/lib/admin/queries"
import { getAllHomepageSettings } from "@/lib/queries/homepage-settings"
import { HomeContentTabs } from "./home-content-tabs"
import { AdminPageHeader } from "../components/admin-page-header"

export const dynamic = "force-dynamic"

export default async function HomeContentPage() {
  const [
    allEpisodes,
    featuredRows,
    latestEpisodes,
    allGuests,
    thinkerRows,
    latestGuests,
    settings,
  ] = await Promise.all([
    getEpisodes({ limit: 100 }),
    getHomepageFeatured(),
    getLatestEpisodesForHomepage(),
    getAllGuests(),
    getHomepageThinkers(),
    getLatestGuestsForHomepage(),
    getAllHomepageSettings(),
  ])

  const featuredMode = (settings.featured_mode === "manual" ? "manual" : "auto") as "auto" | "manual"
  const thinkersMode = (settings.thinkers_mode === "manual" ? "manual" : "auto") as "auto" | "manual"

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="الصفحة الرئيسية"
        description="إدارة محتوى الصفحة الرئيسية — معرض الحلقات ومعرض العقول"
      />

      <HomeContentTabs
        allEpisodes={allEpisodes}
        featuredRows={featuredRows}
        latestEpisodes={latestEpisodes}
        allGuests={allGuests}
        thinkerRows={thinkerRows}
        latestGuests={latestGuests}
        featuredMode={featuredMode}
        thinkersMode={thinkersMode}
      />
    </div>
  )
}
