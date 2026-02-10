"use client"

import { SponsorForm } from "@/components/forms/sponsor-form"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Mic,
  Play,
  Star,
  Users,
  Layers,
  Sparkles,
  Shield,
  ChevronDown,
} from "lucide-react"

const partnershipTypes = [
  {
    icon: Mic,
    name: "شريك حلقة",
    nameEn: "Episode Partner",
    description:
      "ظهور مميز في حلقة واحدة يشمل إعلان صوتي، ذكر في الوصف، ومنشور على وسائل التواصل.",
  },
  {
    icon: Layers,
    name: "شريك موسم",
    nameEn: "Season Partner",
    description:
      "شراكة مستمرة طوال الموسم مع ظهور متكرر، شعار في الفيديو، وتقارير أداء.",
  },
  {
    icon: Play,
    name: "حلقة تعاونية",
    nameEn: "Special Collaborative Episode",
    description:
      "حلقة كاملة تُصمَّم حول موضوع يخدم علامتك التجارية مع ضيف من فريقك أو مجالك.",
  },
  {
    icon: Sparkles,
    name: "شراكة مخصصة",
    nameEn: "Custom Partnership",
    description:
      "نصمّم معًا شراكة فريدة تتناسب مع أهدافك — من المحتوى الرقمي إلى الفعاليات الحية.",
    featured: true,
  },
]

export default function SponsorPage() {
  return (
    <div className="min-h-screen">
      {/* Hero Section */}
      <section className="relative overflow-hidden py-20">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/15 via-background to-accent/10" />
        <div className="absolute top-20 start-10 w-72 h-72 bg-primary/20 rounded-full blur-3xl" />
        <div className="absolute bottom-20 end-10 w-96 h-96 bg-accent/10 rounded-full blur-3xl" />

        <div className="container mx-auto px-4 relative">
          <div className="max-w-3xl mx-auto text-center">
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold mb-6 leading-tight">
              كن شريكًا
              <span className="block text-primary mt-2">في المحادثة</span>
            </h1>

            <p className="text-xl md:text-2xl text-muted-foreground mb-8 leading-relaxed max-w-2xl mx-auto">
              شراكة ثقافية مع بودكاست خط ليست إعلانًا عابرًا —
              <span className="text-foreground font-medium">
                {" "}
                إنها حضور في محادثات تُشكّل وعي جيل.
              </span>
            </p>

            <Button
              size="lg"
              className="gap-2 text-lg px-8 py-6 bg-primary hover:bg-primary/90 shadow-lg shadow-primary/25"
              onClick={() => {
                document
                  .getElementById("partnership-form")
                  ?.scrollIntoView({ behavior: "smooth" })
              }}
            >
              قدّم طلب شراكة
              <ChevronDown className="w-5 h-5" />
            </Button>
          </div>
        </div>
      </section>

      {/* Partnership Philosophy */}
      <section className="py-16 bg-secondary/30">
        <div className="container mx-auto px-4">
          <div className="max-w-3xl mx-auto text-center">
            <Badge variant="outline" className="mb-4">
              <Users className="w-3 h-3 me-1.5" />
              فلسفة الشراكة
            </Badge>
            <h2 className="text-3xl font-bold mb-6">
              كل شراكة تُصمَّم لتناسبك
            </h2>
            <p className="text-lg text-muted-foreground leading-relaxed mb-4">
              نؤمن أن الشراكة الحقيقية تبدأ بفهم أهدافك. لذلك لا نقدّم باقات
              ثابتة بأسعار معلّقة — بل نبني مع كل شريك خطة تعاون مخصصة تناسب
              ميزانيته وأهدافه وطبيعة جمهوره.
            </p>
            <p className="text-muted-foreground leading-relaxed">
              قدّم طلبك وسنتواصل معك بمقترح تعاون مفصّل يتضمن الخيارات
              المناسبة والعائد المتوقع.
            </p>
          </div>
        </div>
      </section>

      {/* Partnership Types */}
      <section className="py-16">
        <div className="container mx-auto px-4">
          <div className="text-center mb-12">
            <Badge variant="outline" className="mb-4">
              <Star className="w-3 h-3 me-1.5" />
              أنواع الشراكة
            </Badge>
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              خيارات متعددة، هدف واحد
            </h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              اختر ما يناسب رؤيتك أو اقترح شيئًا جديدًا — نحن منفتحون
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-6 max-w-4xl mx-auto">
            {partnershipTypes.map((type) => (
              <Card
                key={type.name}
                className={`group relative overflow-hidden transition-all duration-300 hover:shadow-xl hover:-translate-y-1 ${
                  type.featured
                    ? "border-primary border-2 ring-2 ring-primary/20"
                    : "border-border hover:border-primary/50"
                }`}
              >
                {type.featured && (
                  <div className="absolute top-0 start-0 end-0 bg-primary text-primary-foreground text-center py-1.5 text-xs font-medium">
                    <Sparkles className="w-3 h-3 inline me-1" />
                    الأكثر مرونة
                  </div>
                )}
                <CardContent
                  className={`p-6 ${type.featured ? "pt-12" : ""}`}
                >
                  <div className="flex items-start gap-4">
                    <div className="flex-shrink-0 p-3 rounded-xl bg-primary/10 text-primary group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                      <type.icon className="w-6 h-6" />
                    </div>
                    <div>
                      <h3 className="text-xl font-bold mb-1">{type.name}</h3>
                      <p className="text-xs text-muted-foreground/60 mb-2">
                        {type.nameEn}
                      </p>
                      <p className="text-muted-foreground text-sm leading-relaxed">
                        {type.description}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Editorial Independence Note */}
      <section className="py-10">
        <div className="container mx-auto px-4">
          <div className="max-w-2xl mx-auto">
            <div className="flex items-start gap-4 rounded-2xl border border-border/50 bg-secondary/30 p-6">
              <Shield className="w-6 h-6 text-primary flex-shrink-0 mt-0.5" />
              <div>
                <h3 className="font-semibold mb-1">استقلالية تحريرية كاملة</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  يحتفظ بودكاست خط بالتحكم التحريري الكامل في محتوى الحلقات.
                  الشراكة تعني حضورًا إلى جانب محتوى أصيل — لا تدخلًا فيه.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Form Section */}
      <section
        id="partnership-form"
        className="py-16 bg-gradient-to-br from-primary/10 via-background to-accent/10"
      >
        <div className="container mx-auto px-4">
          <div className="max-w-2xl mx-auto">
            <div className="text-center mb-10">
              <h2 className="text-3xl md:text-4xl font-bold mb-4">
                قدّم طلب شراكة
              </h2>
              <p className="text-lg text-muted-foreground">
                أخبرنا عن شركتك وأهدافك وسنعود إليك بمقترح مخصص
              </p>
            </div>

            <Card className="border-2">
              <CardContent className="p-8">
                <SponsorForm />
              </CardContent>
            </Card>
          </div>
        </div>
      </section>
    </div>
  )
}
