import { createConfigStore } from "@/lib/config-store"
import { createClient } from "@/lib/supabase/server"
import type { StaticContentConfig, AboutPageContent } from "@/types/static-content"

const USE_SUPABASE = !!(
  process.env.NEXT_PUBLIC_SUPABASE_URL &&
  !process.env.NEXT_PUBLIC_SUPABASE_URL.includes("placeholder")
)

const defaultAboutContent: AboutPageContent = {
  hostName: "بودكاست خط",
  hostTitle: "مؤسس ومقدم بودكاست خط",
  hostDescription: "بودكاست يستكشف القصص الإنسانية والتجارب الحياتية من خلال حوارات عميقة مع ضيوف ملهمين.",
  hostPhoto: "",
  hostImageUrl: "",
  welcomeVideoId: "",
  welcomeVideoUrl: "",
  welcomeVideoPosterUrl: "",
  missionQuote: "نؤمن بأن كل إنسان يحمل قصة تستحق أن تُروى",
  ctaTitle: "انضم لرحلتنا",
  ctaDescription: "كن جزءاً من مجتمع خط واستمع لقصص ملهمة تغير نظرتك للحياة",
  socialLinks: [],
  values: [],
  teamMembers: [],
}

const store = createConfigStore<StaticContentConfig>("static-content.json", { about: defaultAboutContent })

export async function getStaticContentConfig(): Promise<StaticContentConfig> {
  if (USE_SUPABASE) {
    try {
      const supabase = await createClient()
      const { data, error } = await supabase
        .from("static_content")
        .select("content")
        .eq("key", "about")
        .maybeSingle()

      if (!error && data) {
        return { about: data.content as AboutPageContent }
      }
      if (error) console.error("getStaticContentConfig DB error:", error.message)
    } catch (e) {
      console.error("getStaticContentConfig DB exception:", e)
    }
  }
  return store.read()
}

export async function getAboutContent(): Promise<AboutPageContent> {
  const config = await getStaticContentConfig()
  return config.about
}

export async function saveAboutContent(about: AboutPageContent): Promise<void> {
  if (USE_SUPABASE) {
    try {
      const supabase = await createClient()
      const { error } = await supabase.from("static_content").upsert({
        key: "about",
        content: about,
      })
      if (!error) return
      console.error("saveAboutContent DB error:", error.message)
    } catch (e) {
      console.error("saveAboutContent DB exception:", e)
    }
  }
  const config = await store.read()
  config.about = about
  await store.write(config)
}
