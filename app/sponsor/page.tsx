import { Metadata } from "next"
import { SponsorForm } from "@/components/forms/sponsor-form"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Users, Eye, Heart, Target } from "lucide-react"

export const metadata: Metadata = {
  title: "كن راعياً",
  description: "كن شريكاً في نجاح بودكاست خط واصل إلى جمهور متفاعل ومهتم",
}

const benefits = [
  {
    icon: Users,
    title: "جمهور متفاعل",
    description: "آلاف المستمعين المتفاعلين والمهتمين بالمحتوى العربي الهادف",
  },
  {
    icon: Eye,
    title: "ظهور مميز",
    description: "إعلانات في بداية ونهاية الحلقات مع ذكر العلامة التجارية",
  },
  {
    icon: Heart,
    title: "ارتباط بالقيم",
    description: "ربط علامتك التجارية بمحتوى يركز على النمو والتطوير",
  },
  {
    icon: Target,
    title: "استهداف دقيق",
    description: "الوصول لجمهور مهتم بتطوير الذات والعلاقات والنجاح",
  },
]

const stats = [
  { value: "100K+", label: "مشاهدة شهرياً" },
  { value: "50K+", label: "مستمع فريد" },
  { value: "85%", label: "معدل الإكمال" },
  { value: "4.9", label: "تقييم المستمعين" },
]

export default function SponsorPage() {
  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mx-auto max-w-4xl">
        {/* Hero */}
        <div className="mb-12 text-center">
          <h1 className="text-3xl font-bold md:text-4xl">
            كن شريكاً في نجاحنا
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-lg text-muted-foreground">
            هل تبحث عن طريقة فعالة للوصول إلى جمهور عربي متفاعل ومهتم بالمحتوى الهادف؟
            بودكاست خط يقدم لك فرصة مميزة للتواصل مع مستمعينا.
          </p>
        </div>

        {/* Stats */}
        <div className="mb-12 grid grid-cols-2 gap-4 md:grid-cols-4">
          {stats.map((stat) => (
            <Card key={stat.label} className="text-center">
              <CardContent className="pt-6">
                <div className="text-3xl font-bold text-primary">{stat.value}</div>
                <div className="mt-1 text-sm text-muted-foreground">
                  {stat.label}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Benefits */}
        <div className="mb-12">
          <h2 className="mb-6 text-center text-2xl font-bold">
            لماذا ترعى بودكاست خط؟
          </h2>
          <div className="grid gap-6 sm:grid-cols-2">
            {benefits.map((benefit) => (
              <Card key={benefit.title}>
                <CardHeader className="flex flex-row items-center gap-4 pb-2">
                  <div className="rounded-lg bg-primary/10 p-2">
                    <benefit.icon className="h-6 w-6 text-primary" />
                  </div>
                  <CardTitle className="text-lg">{benefit.title}</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-muted-foreground">{benefit.description}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>

        {/* Sponsorship Options */}
        <div className="mb-12 rounded-xl border bg-muted/30 p-6">
          <h2 className="mb-4 text-xl font-bold">خيارات الرعاية</h2>
          <div className="space-y-4">
            <div className="flex items-start gap-4">
              <div className="mt-1 h-2 w-2 rounded-full bg-primary" />
              <div>
                <h3 className="font-semibold">رعاية حلقة كاملة</h3>
                <p className="text-sm text-muted-foreground">
                  إعلان في بداية ونهاية الحلقة مع ذكر الراعي وشكره
                </p>
              </div>
            </div>
            <div className="flex items-start gap-4">
              <div className="mt-1 h-2 w-2 rounded-full bg-primary" />
              <div>
                <h3 className="font-semibold">رعاية موسم كامل</h3>
                <p className="text-sm text-muted-foreground">
                  ظهور متكرر في جميع حلقات الموسم مع محتوى مخصص
                </p>
              </div>
            </div>
            <div className="flex items-start gap-4">
              <div className="mt-1 h-2 w-2 rounded-full bg-primary" />
              <div>
                <h3 className="font-semibold">شراكة محتوى</h3>
                <p className="text-sm text-muted-foreground">
                  حلقة خاصة تتناول موضوعاً يتعلق بمجال عملك
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Contact Form */}
        <div className="rounded-xl border p-6">
          <h2 className="mb-2 text-xl font-bold">تواصل معنا</h2>
          <p className="mb-6 text-muted-foreground">
            أرسل لنا استفسارك وسنتواصل معك لمناقشة التفاصيل
          </p>
          <SponsorForm />
        </div>
      </div>
    </div>
  )
}
