import { Metadata } from "next"
import { SponsorForm } from "@/components/forms/sponsor-form"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { SponsorHeroCTA } from "./sponsor-hero-cta"
import {
  Mic,
  Play,
  Star,
  Users,
  Layers,
  Sparkles,
  Shield,
  Handshake,
  TrendingUp,
  Headphones,
  Globe,
  BarChart3,
} from "lucide-react"
import { getActivePartners } from "@/lib/queries/partnerships"
import { fetchAllEpisodes, fetchTotalViews } from "@/lib/youtube/queries"
import Image from "next/image"

export const metadata: Metadata = {
  title: "كن شريكًا في المحادثة",
  description: "شراكة ثقافية مع بودكاست خط — ليست إعلانًا عابرًا، إنها حضور في محادثات تُشكّل وعي جيل.",
  openGraph: {
    title: "كن شريكًا في المحادثة — بودكاست خط",
    description: "شراكة ثقافية مع بودكاست خط — ليست إعلانًا عابرًا، إنها حضور في محادثات تُشكّل وعي جيل.",
  },
}

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

export default async function SponsorPage() {
  const [partners, episodes, totalViews] = await Promise.all([
    getActivePartners(),
    fetchAllEpisodes().catch(() => []),
    fetchTotalViews().catch(() => 0),
  ])

  const totalEpisodes = episodes.length

  function formatNumber(n: number): string {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M+`
    if (n >= 1_000) return `${Math.floor(n / 1_000)}K+`
    return `${n}+`
  }

  const metrics = [
    {
      icon: Headphones,
      value: totalEpisodes > 0 ? `${totalEpisodes}+` : "٥٠+",
      label: "حلقة منشورة",
    },
    {
      icon: TrendingUp,
      value: totalViews > 0 ? formatNumber(totalViews) : "١٠٠K+",
      label: "مشاهدة واستماع",
    },
    {
      icon: Globe,
      value: "١٥+",
      label: "دولة يصلها المحتوى",
    },
    {
      icon: BarChart3,
      value: "١٨-٣٥",
      label: "الفئة العمرية الأساسية",
    },
  ]

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

            <SponsorHeroCTA />
          </div>
        </div>
      </section>

      {/* Audience Metrics */}
      <section className="py-12 border-y border-border/50 bg-card/50">
        <div className="container mx-auto px-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 max-w-4xl mx-auto">
            {metrics.map((metric) => (
              <div key={metric.label} className="text-center">
                <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
                  <metric.icon className="h-6 w-6 text-primary" />
                </div>
                <div className="text-3xl md:text-4xl font-bold text-foreground mb-1">
                  {metric.value}
                </div>
                <div className="text-sm text-muted-foreground">
                  {metric.label}
                </div>
              </div>
            ))}
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

      {/* Why Partner With Khat */}
      <section className="py-16 bg-secondary/20">
        <div className="container mx-auto px-4">
          <div className="text-center mb-10">
            <Badge variant="outline" className="mb-4">
              <Star className="w-3 h-3 me-1.5" />
              لماذا خط؟
            </Badge>
            <h2 className="text-3xl font-bold mb-4">
              ليس مجرد إعلان — إنه حضور
            </h2>
          </div>
          <div className="grid md:grid-cols-3 gap-6 max-w-4xl mx-auto">
            <div className="rounded-2xl border border-border/50 bg-card p-6 text-center">
              <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
                <Users className="h-6 w-6 text-primary" />
              </div>
              <h3 className="font-semibold mb-2">جمهور مؤثر</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                مستمعون من صنّاع القرار والمهنيين الشباب في الخليج والعالم العربي.
              </p>
            </div>
            <div className="rounded-2xl border border-border/50 bg-card p-6 text-center">
              <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
                <TrendingUp className="h-6 w-6 text-primary" />
              </div>
              <h3 className="font-semibold mb-2">نمو مستمر</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                معدل نمو متصاعد في المشاهدات والمتابعين عبر جميع المنصات.
              </p>
            </div>
            <div className="rounded-2xl border border-border/50 bg-card p-6 text-center">
              <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
                <Headphones className="h-6 w-6 text-primary" />
              </div>
              <h3 className="font-semibold mb-2">تفاعل عميق</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                متوسط استماع يتجاوز ٧٠٪ من الحلقة — جمهور مهتم ومتفاعل بعمق.
              </p>
            </div>
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

      {/* Trusted Partners */}
      {partners.length > 0 && (
        <section className="py-16 bg-secondary/30">
          <div className="container mx-auto px-4">
            <div className="text-center mb-10">
              <Badge variant="outline" className="mb-4">
                <Handshake className="w-3 h-3 me-1.5" />
                جهات وثقت بالحوار
              </Badge>
              <h2 className="text-3xl font-bold mb-4">
                شركاؤنا في الرحلة
              </h2>
              <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
                جهات ومؤسسات اختارت أن تكون جزءًا من المحادثة
              </p>
            </div>

            <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-6 max-w-4xl mx-auto">
              {partners.map((partner) => (
                <div
                  key={partner.id}
                  className="group rounded-2xl border border-border/50 bg-card/50 p-6 text-center transition-all hover:shadow-lg hover:-translate-y-0.5"
                >
                  {partner.logo_url ? (
                    <div className="mb-4 flex justify-center">
                      <Image
                        src={partner.logo_url}
                        alt={partner.name}
                        width={80}
                        height={80}
                        className="h-16 w-auto object-contain"
                      />
                    </div>
                  ) : (
                    <div className="mb-4 flex justify-center">
                      <div className="h-16 w-16 rounded-xl bg-primary/10 flex items-center justify-center">
                        <Handshake className="h-8 w-8 text-primary" />
                      </div>
                    </div>
                  )}
                  <h3 className="font-semibold mb-1">{partner.name}</h3>
                  {partner.description && (
                    <p className="text-sm text-muted-foreground leading-relaxed mb-3">
                      {partner.description}
                    </p>
                  )}
                  {partner.website_url && (
                    <a
                      href={partner.website_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                    >
                      زيارة الموقع
                      <span className="text-[10px]">&#8599;</span>
                    </a>
                  )}
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

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
