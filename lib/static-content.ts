import { createConfigStore } from "@/lib/config-store"
import { pool, USE_DB } from "@/lib/db"
import type { StaticContentConfig, AboutPageContent } from "@/types/static-content"

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
  if (USE_DB) {
    try {
      const { rows } = await pool!.query(
        `SELECT content FROM static_content WHERE key = $1 LIMIT 1`,
        ["about"]
      )
      if (rows[0]) {
        return { about: rows[0].content as AboutPageContent }
      }
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
  if (USE_DB) {
    try {
      await pool!.query(
        `INSERT INTO static_content (key, content)
         VALUES ($1, $2)
         ON CONFLICT (key) DO UPDATE SET content = EXCLUDED.content`,
        ["about", JSON.stringify(about)]
      )
      return
    } catch (e) {
      console.error("saveAboutContent DB exception:", e)
    }
  }
  const config = await store.read()
  config.about = about
  await store.write(config)
}
