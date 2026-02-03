import { Metadata } from "next"
import { GuestApplicationForm } from "@/components/forms/guest-application-form"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Mail, MessageCircle, Mic } from "lucide-react"

export const metadata: Metadata = {
  title: "تواصل معنا",
  description: "تواصل مع فريق بودكاست خط أو قدم طلباً لتكون ضيفاً",
}

const contactMethods = [
  {
    icon: Mail,
    title: "البريد الإلكتروني",
    description: "للاستفسارات العامة",
    value: "hello@khat.fm",
    href: "mailto:hello@khat.fm",
  },
  {
    icon: MessageCircle,
    title: "وسائل التواصل",
    description: "تابعنا وتواصل معنا",
    value: "@khat",
    href: "https://twitter.com/khat",
  },
]

export default function ContactPage() {
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
          {/* Guest Application */}
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
                <ul className="space-y-1 text-sm text-muted-foreground">
                  <li>• لديهم قصص وتجارب حقيقية ملهمة</li>
                  <li>• يمتلكون خبرة في مجال معين يمكنهم مشاركتها</li>
                  <li>• مستعدون للحديث بصراحة وعمق</li>
                  <li>• يضيفون قيمة لجمهورنا</li>
                </ul>
              </div>
              <GuestApplicationForm />
            </CardContent>
          </Card>

          {/* Contact Methods */}
          {contactMethods.map((method) => (
            <Card key={method.title}>
              <CardHeader>
                <div className="flex items-center gap-3">
                  <div className="rounded-lg bg-primary/10 p-2">
                    <method.icon className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <CardTitle className="text-lg">{method.title}</CardTitle>
                    <CardDescription>{method.description}</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <a
                  href={method.href}
                  className="text-lg font-medium text-primary hover:underline"
                  target={method.href.startsWith("http") ? "_blank" : undefined}
                  rel={method.href.startsWith("http") ? "noopener noreferrer" : undefined}
                >
                  {method.value}
                </a>
              </CardContent>
            </Card>
          ))}
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
