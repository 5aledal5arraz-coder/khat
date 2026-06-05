import { db } from "@/lib/db"
import { staticContent } from "@/lib/db/schema"
import { eq } from "drizzle-orm"
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

export async function getStaticContentConfig(): Promise<StaticContentConfig> {
  if (!db) return { about: defaultAboutContent }

  const rows = await db.select().from(staticContent).where(eq(staticContent.key, "about")).limit(1)
  if (rows[0]) {
    return { about: rows[0].content as AboutPageContent }
  }
  return { about: defaultAboutContent }
}

export async function getAboutContent(): Promise<AboutPageContent> {
  const config = await getStaticContentConfig()
  return config.about
}

export async function saveAboutContent(about: AboutPageContent): Promise<void> {
  if (!db) throw new Error("Database not available")

  await db.insert(staticContent).values({
    key: "about",
    content: about,
  }).onConflictDoUpdate({
    target: staticContent.key,
    set: { content: about },
  })
}
