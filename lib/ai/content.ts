import { runAiTask } from "@/lib/ai-router"

// ---------------------------------------------------------------------------
// Newsletter: AI-generated monthly newsletter content
//
// MIGRATED to AI Router (Khat Brain Phase 1). All other generators still
// call lib/ai/client.ts directly — they'll move over in subsequent phases.
// ---------------------------------------------------------------------------

export async function generateNewsletterContent(params: {
  monthName: string
  year: number
  featured: { title: string; slug: string; thumbnail_url: string | null; guest: { name: string; photo_url: string | null } | null }
  quotes: { text: string; theme: string | null }[]
  otherEpisodes: { title: string; slug: string; thumbnail_url: string | null; guest: { name: string } | null }[]
  appUrl: string
}): Promise<{ success: boolean; data?: { subject: string; body: string }; error?: string; runId?: string }> {
  const { monthName, year, featured, quotes, otherEpisodes, appUrl } = params

  const episodeDataBlock = JSON.stringify({
    featured: {
      title: featured.title,
      slug: featured.slug,
      thumbnail_url: featured.thumbnail_url,
      guest: featured.guest,
      link: `${appUrl}/episodes/${featured.slug}`,
    },
    quotes: quotes.slice(0, 3),
    otherEpisodes: otherEpisodes.map((ep) => ({
      title: ep.title,
      slug: ep.slug,
      thumbnail_url: ep.thumbnail_url,
      guest: ep.guest,
      link: `${appUrl}/episodes/${ep.slug}`,
    })),
  }, null, 2)

  const systemPrompt = `أنت مصمم نشرات بريدية محترف لبودكاست عربي اسمه "خط".

## مهمتك:
اكتب نشرة بريدية شهرية بتنسيق HTML جاهز للإرسال عبر البريد الإلكتروني.

## قواعد HTML الصارمة (للتوافق مع عملاء البريد):
- استخدم جداول HTML للتخطيط (<table>) وليس CSS grid أو flexbox
- جميع الأنماط inline فقط (style="...")
- لا تستخدم <style> tags أو CSS خارجي
- الاتجاه RTL: dir="rtl" على الجدول الرئيسي
- أقصى عرض: 600px للجدول الرئيسي مع margin: 0 auto
- الخطوط: font-family: 'Segoe UI', Tahoma, Arial, sans-serif

## ألوان العلامة (ثيم فاتح — لا تستخدم خلفيات داكنة إطلاقاً):
- خلفية البطاقات: #f7f5fc (أو أبيض #ffffff مع حد)
- نص رئيسي/عناوين: #1b1630
- نص الفقرات: #403a55
- نص ثانوي/باهت: #6c6783
- حدود: #ece9f5
- اللون الأساسي (إنديغو): #3a2d70
- لون التمييز (برتقالي): #ee6a2c — استخدمه للمسات صغيرة فقط (علامات، روابط مميزة)

## البنية المطلوبة:
1. **الحلقة المميزة**: صورة مصغرة (إذا متوفرة كـ <img>)، عنوان الحلقة، اسم الضيف (إذا متوفر)، زر "استمع الآن" يوجه للرابط
2. **اقتباسات مميزة**: 1-3 اقتباسات في صناديق مميزة بخلفية مختلفة قليلاً
3. **حلقات أخرى**: قائمة بباقي حلقات الشهر (إذا وُجدت) مع روابط

## تحذيرات مهمة:
- لا تُضف هيدر أو فوتر — النظام يضيفهم تلقائياً حول المحتوى
- لا تُضف رابط إلغاء الاشتراك — يُضاف تلقائياً في الفوتر
- لا تستخدم {{unsubscribe_url}} — سيتم تجاهله
- المحتوى يجب أن يكون فقط الجزء الداخلي (بين الهيدر والفوتر)

## تعليمات:
- اجعل النشرة مختصرة وجذابة — لا تكتب فقرات طويلة
- أضف personality عربية دافئة
- أزرار CTA: خلفية إنديغو (#3a2d70) مع نص أبيض (#ffffff)، padding مناسب (مثل 14px 36px)، border-radius: 10px، خط عريض
- الصور تظهر فقط إذا كان الرابط موجوداً (ليس null)
- لا تضف صور من عندك — استخدم فقط الروابط المقدمة

## مخطط JSON المطلوب:
{
  "subject": "نشرة خط — {الشهر} {السنة}",
  "body": "<table>...HTML الكامل...</table>"
}`

  const userPrompt = `الشهر: ${monthName} ${year}

بيانات الحلقات:
${episodeDataBlock}`

  const result = await runAiTask<{ subject?: string; body?: string }>({
    taskKind: "editorial",
    subjectTable: "newsletter_campaigns",
    input: {
      monthName,
      year,
      featuredSlug: featured.slug,
      quoteCount: quotes.length,
      otherEpisodeCount: otherEpisodes.length,
    },
    prompt: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    expectJson: true,
    providerOptions: { temperature: 0.5 },
  })

  if (result.status !== "succeeded") {
    return {
      success: false,
      error: result.errorMessage || "حدث خطأ أثناء إنشاء النشرة",
      runId: result.runId,
    }
  }

  const parsed = result.parsed
  if (!parsed?.subject || !parsed.body) {
    return {
      success: false,
      error: "استجابة OpenAI غير مكتملة",
      runId: result.runId,
    }
  }

  return {
    success: true,
    runId: result.runId,
    data: {
      subject: parsed.subject || `نشرة خط — ${monthName} ${year}`,
      body: parsed.body,
    },
  }
}
