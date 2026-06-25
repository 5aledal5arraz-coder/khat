import { Metadata } from "next"
import Link from "next/link"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Mail, Mic, ArrowLeft, ExternalLink } from "lucide-react"
import { listPlatformsForSurface } from "@/lib/queries/official-platforms"
import { PlatformIcon } from "@/components/platforms/platform-icon"
import { getSiteSettings } from "@/lib/site-settings"

export const metadata: Metadata = {
  title: "تواصل معنا",
  description: "تواصل مع فريق بودكاست خط أو قدم طلباً لتكون ضيفاً",
}

const FALLBACK_CONTACT_EMAIL = "hello@khat.fm"

export default async function ContactPage() {
  const [contactPlatforms, settings] = await Promise.all([
    listPlatformsForSurface("contact_page").catch(() => []),
    getSiteSettings().catch(() => null),
  ])
  const contactEmail = settings?.metadata.contactEmail?.trim() || FALLBACK_CONTACT_EMAIL
  const emailMethod = {
    icon: Mail,
    title: "البريد الإلكتروني",
    description: "للاستفسارات العامة",
    value: contactEmail,
    href: `mailto:${contactEmail}`,
  }
  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mx-auto max-w-4xl">
        {/* Header */}
        <div className="mb-12 text-center">
          <h1 className="text-3xl font-bold">تواصل معنا</h1>
          <p className="mt-2 text-muted-foreground">
            نحب أن نسمع منك! سواء كنت تريد أن تكون ضيفاً أو لديك استفسار
          </p>
        </div>

        <div className="grid gap-8 lg:grid-cols-2">
          {/* Guest Application CTA */}
          <Card className="lg:col-span-2">
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="rounded-lg bg-primary/10 p-2">
                  <Mic className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <CardTitle>كن ضيفاً على البودكاست</CardTitle>
                  <CardDescription>
                    هل لديك قصة ملهمة أو خبرة تستحق المشاركة؟
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="mb-6 rounded-lg bg-muted/50 p-4">
                <h3 className="mb-2 font-semibold">نبحث عن ضيوف:</h3>
                <ul className="list-disc space-y-1 ps-5 text-sm text-muted-foreground">
                  <li>لديهم قصص وتجارب حقيقية ملهمة</li>
                  <li>يمتلكون خبرة في مجال معين يمكنهم مشاركتها</li>
                  <li>مستعدون للحديث بصراحة وعمق</li>
                  <li>يضيفون قيمة لجمهورنا</li>
                </ul>
              </div>
              <Link href="/guest">
                <Button className="w-full gap-2 sm:w-auto">
                  قدّم طلب ضيافة
                  <ArrowLeft className="h-4 w-4" />
                </Button>
              </Link>
            </CardContent>
          </Card>

          {/* Email */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="rounded-lg bg-primary/10 p-2">
                  <emailMethod.icon className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <CardTitle className="text-lg">{emailMethod.title}</CardTitle>
                  <CardDescription>{emailMethod.description}</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <a
                href={emailMethod.href}
                className="text-lg font-medium text-primary hover:underline"
              >
                {emailMethod.value}
              </a>
            </CardContent>
          </Card>

          {/* Social / Community (from DB) */}
          {contactPlatforms.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">وسائل التواصل</CardTitle>
                <CardDescription>تابعنا وتواصل معنا</CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2">
                  {contactPlatforms.map((p) => (
                    <li key={p.id}>
                      <a
                        href={p.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="group inline-flex items-center gap-2 text-sm text-primary hover:underline"
                      >
                        <PlatformIcon iconName={p.icon_name} className="h-4 w-4" />
                        <span>{p.handle || p.platform_name}</span>
                        <ExternalLink className="h-3 w-3 opacity-50 group-hover:opacity-100" />
                      </a>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}
        </div>

        {/* FAQ */}
        <div className="mt-12 rounded-xl border bg-muted/30 p-6">
          <h2 className="mb-6 text-xl font-bold">أسئلة شائعة</h2>
          <div className="space-y-4">
            <div>
              <h3 className="font-semibold">كم تستغرق الحلقة؟</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                عادة تستغرق الحلقات بين 60-90 دقيقة، لكننا مرنون حسب الموضوع.
              </p>
            </div>
            <div>
              <h3 className="font-semibold">أين يتم التسجيل؟</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                يمكن التسجيل في استوديونا أو عبر الإنترنت حسب موقعك وتفضيلك.
              </p>
            </div>
            <div>
              <h3 className="font-semibold">متى سيتم نشر الحلقة؟</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                نخطط لجدول النشر مسبقاً وسنخبرك بموعد النشر المتوقع.
              </p>
            </div>
            <div>
              <h3 className="font-semibold">هل يمكنني مراجعة الحلقة قبل النشر؟</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                نعم، نرسل الحلقة للمراجعة قبل النشر لضمان رضاك عن المحتوى.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
