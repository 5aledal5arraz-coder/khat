import { Metadata } from "next"
import { GuestApplicationForm } from "@/components/forms/guest-application-form"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Mic, CheckCircle } from "lucide-react"

export const metadata: Metadata = {
  title: "كن ضيفاً",
  description: "قدم طلباً لتكون ضيفاً على بودكاست خط",
}

const requirements = [
  "لديك قصة أو تجربة حقيقية وملهمة",
  "تمتلك خبرة في مجال معين يمكنك مشاركتها",
  "مستعد للحديث بصراحة وعمق",
  "يمكنك تخصيص 60-90 دقيقة للتسجيل",
]

const benefits = [
  "الوصول إلى جمهور متفاعل ومهتم",
  "مشاركة قصتك وخبراتك مع الآخرين",
  "بناء علاقات جديدة في مجتمع خط",
  "الحصول على نسخة من الحلقة للمشاركة",
]

export default function GuestPage() {
  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mx-auto max-w-4xl">
        {/* Hero */}
        <div className="mb-12 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary/20">
            <Mic className="h-8 w-8 text-primary" />
          </div>
          <h1 className="text-3xl font-bold">كن ضيفاً على خط</h1>
          <p className="mx-auto mt-4 max-w-xl text-muted-foreground">
            هل لديك قصة ملهمة أو خبرة تستحق المشاركة؟ نحب أن نسمعها.
            قدم طلبك وسنتواصل معك.
          </p>
        </div>

        <div className="grid gap-8 lg:grid-cols-2">
          {/* Info Cards */}
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">من نبحث عنهم؟</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-3">
                  {requirements.map((req, i) => (
                    <li key={i} className="flex items-start gap-3">
                      <CheckCircle className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                      <span className="text-sm text-muted-foreground">{req}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">ماذا ستستفيد؟</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-3">
                  {benefits.map((benefit, i) => (
                    <li key={i} className="flex items-start gap-3">
                      <CheckCircle className="mt-0.5 h-5 w-5 shrink-0 text-accent" />
                      <span className="text-sm text-muted-foreground">{benefit}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>

            <Card className="bg-secondary/50">
              <CardContent className="p-4">
                <p className="text-sm text-muted-foreground">
                  <strong className="text-foreground">ملاحظة:</strong> نراجع جميع الطلبات
                  بعناية. قد نتواصل معك لمزيد من التفاصيل قبل اتخاذ القرار. عدم
                  الرد لا يعني الرفض، فقد نعود لطلبك لاحقاً.
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Form */}
          <Card>
            <CardHeader>
              <CardTitle>قدم طلبك</CardTitle>
              <CardDescription>
                أخبرنا عن نفسك والموضوع الذي تود مناقشته
              </CardDescription>
            </CardHeader>
            <CardContent>
              <GuestApplicationForm />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
