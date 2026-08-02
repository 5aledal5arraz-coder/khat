import { Metadata } from "next"
import Image from "next/image"
import { PartnerApplicationForm } from "@/components/forms/partner-application-form"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { PartnerHeroCTA } from "./partner-hero-cta"
import { formatCompactNumber } from "@/lib/shared/formatters"
import {
  Mic,
  Layers,
  Sparkles,
  Users,
  TrendingUp,
  Headphones,
  Globe,
  BarChart3,
  Shield,
  Handshake,
  Star,
  Check,
  Megaphone,
  Search,
  FileText,
  Rocket,
  LineChart,
  Repeat,
  Award,
  type LucideIcon,
} from "lucide-react"
import { getActivePartners } from "@/lib/queries/partnerships"
import { fetchAllEpisodes, fetchTotalViews } from "@/lib/youtube/queries"
import { resolveDefaultOgImage } from "@/lib/seo/og"

// A page-level `openGraph` block replaces the root layout's rather than merging
// into it, so this must carry `images` itself — without them the site's most
// important commercial page shared as a blank `summary_large_image` card.
export async function generateMetadata(): Promise<Metadata> {
  return {
    title: "كن شريكًا في المحادثة",
    description:
      "شراكة محتوى طويلة المدى مع بودكاست خط — لسنا منصة إعلانات، بل مساحة حضور داخل محادثات تُشكّل وعي جيل في الخليج والعالم العربي.",
    openGraph: {
      title: "كن شريكًا في المحادثة — بودكاست خط",
      description:
        "شراكة محتوى تُصمَّم على مقاسك مع بودكاست خط — حضور أصيل داخل محتوى يُنصت إليه باهتمام، لا إعلان عابر.",
      images: [await resolveDefaultOgImage()],
    },
  }
}

// ─── Partnership packages (no pricing — value, deliverables, flexibility) ──────

interface PartnerPackage {
  icon: LucideIcon
  name: string
  nameEn: string
  positioning: string
  deliverables: string[]
  bestFor: string
  featured?: boolean
}

const PACKAGES: PartnerPackage[] = [
  {
    icon: Mic,
    name: "شريك الحلقة",
    nameEn: "Episode Partner",
    positioning: "حضور مدروس في حلقة واحدة — نقطة دخول مثالية.",
    deliverables: [
      "إدماج صوتي بصوت المُقدّم (لا فاصل إعلاني)",
      "ذكر العلامة في وصف الحلقة وتعليق مثبّت",
      "منشور تعريفي عبر منصّاتنا",
      "لقطة أداء مختصرة بعد النشر",
    ],
    bestFor: "لحظة إطلاق محددة، أو تجربة أولى للشراكة.",
  },
  {
    icon: Layers,
    name: "شريك الموسم",
    nameEn: "Season Partner",
    positioning: "حضور متّصل عبر الموسم كله يبني ارتباطًا يدوم.",
    deliverables: [
      "حضور متكرر في كل حلقات الموسم",
      "شعارك ضمن هوية الفيديو",
      "إدماج على المنصّات طوال الموسم",
      "مساحة مخصّصة على موقع خط",
      "تقارير أداء دورية",
      "أولوية لمواضيع تلامس مجالك",
    ],
    bestFor: "بناء ارتباط ذهني مستمر بين علامتك والمحتوى.",
  },
  {
    icon: Sparkles,
    name: "حلقة بتوقيع مشترك",
    nameEn: "Co-Created Signature Episode",
    positioning: "حلقة كاملة تُبنى حول قصة تخدم رسالتك.",
    deliverables: [
      "حلقة تُصمَّم حول موضوع يلتقي مع علامتك",
      "ضيف من قيادتكم أو خبرائكم",
      "تعاون تحريري على السرد — مع احتفاظ خط باستقلاليته",
      "ترويج موسّع قبل النشر وبعده",
      "محتوى دائم القيمة تعيدون استخدامه",
    ],
    bestFor: "الريادة الفكرية، استقطاب المواهب، أو سرد عميق للعلامة.",
  },
  {
    icon: Award,
    name: "شراكة استراتيجية مخصّصة",
    nameEn: "Bespoke Strategic Partnership",
    positioning: "برنامج متكامل طويل المدى يُصمَّم من الصفر.",
    deliverables: [
      "مزيج مصمّم: حلقات + فعاليات + محتوى رقمي + منصّات",
      "مبادرات بعلامة مشتركة",
      "خارطة محتوى طويلة المدى",
      "شريك حساب مخصّص يرافقكم خطوة بخطوة",
    ],
    bestFor: "العلامات الباحثة عن علاقة عميقة ومستمرة، لا حملة عابرة.",
    featured: true,
  },
]

// ─── Partner vs advertiser contrast ───────────────────────────────────────────

const ADVERTISER_POINTS = [
  "فاصل إعلاني يتخطّاه المستمع",
  "حضور لحظي سرعان ما يُنسى",
  "رسالة مُقحَمة على المحتوى",
  "قالب واحد يُفرض على الجميع",
]
const PARTNER_POINTS = [
  "حضور داخل محتوى يُنصت إليه باهتمام",
  "ارتباط يدوم ما دامت قيمة الحلقة",
  "قصّة تُروى بصوت موثوق",
  "شراكة تُفصَّل على مقاسك أنت",
]

// ─── Why Khat ─────────────────────────────────────────────────────────────────

const VALUE_PROPS: { icon: LucideIcon; title: string; body: string }[] = [
  {
    icon: Headphones,
    title: "جمهور يُصغي بعمق",
    body: "مستمعون يتابعون الحلقة حتى نهايتها — انتباه نادر لا توفّره ومضات الإعلانات.",
  },
  {
    icon: Award,
    title: "مصداقية تنتقل إليك",
    body: "حين تظهر علامتك داخل محتوى موثوق، تستعير جزءًا من الثقة التي بناها خط مع جمهوره.",
  },
  {
    icon: Repeat,
    title: "محتوى يدوم",
    body: "الحلقة تبقى تُشاهَد لسنوات — حضورك فيها يظلّ يعمل لصالحك بعد انتهاء أي حملة.",
  },
  {
    icon: Globe,
    title: "وصول خليجي مؤثّر",
    body: "جمهور أساسه السعودية والكويت والعراق والخليج — صنّاع قرار ومهنيون شباب.",
  },
]

// ─── How it works ─────────────────────────────────────────────────────────────

const PROCESS: { icon: LucideIcon; title: string; body: string }[] = [
  { icon: FileText, title: "قدّم طلبك", body: "أخبرنا عن علامتك وأهدافك وجمهورك." },
  { icon: Search, title: "نفهم ونبحث", body: "يدرس فريقنا علامتك ومكانتها وما يناسب جمهورها." },
  { icon: Sparkles, title: "نصمّم مقترحًا", body: "خطة شراكة وعدد حلقات ونطاقًا مفصّلًا على مقاسك." },
  { icon: Rocket, title: "نتفق وننطلق", body: "ننسّق المحتوى — مع احتفاظ خط باستقلاليته التحريرية." },
  { icon: LineChart, title: "نقيس ونطوّر", body: "تقارير أداء وتحسين مستمر طوال الشراكة." },
]

export default async function PartnerPage() {
  const [partners, episodes, totalViews] = await Promise.all([
    getActivePartners(),
    fetchAllEpisodes().catch(() => []),
    fetchTotalViews().catch(() => 0),
  ])

  const totalEpisodes = episodes.length
  const formatNumber = (n: number): string => formatCompactNumber(n, { plus: true })

  // One numeral script per row. These four tiles render side by side, and the
  // first two are DATA — they come from `formatCompactNumber`, which builds
  // its output from raw JS numbers and is therefore always Latin ("77+",
  // "2.4M+"). The last two were hand-written in Arabic-Indic, so with live
  // data the row read "77+ · 2.4M+ · ١٥+ · ١٨–٣٥": two scripts, one row.
  // It only showed up with data present, which is why it survived local
  // review on an empty DB.
  //
  // Resolved toward Latin rather than Arabic-Indic because Latin is already
  // the de-facto house style for digits — dates, counts and every
  // `lib/shared/formatters.ts` output are Latin — so converting these two
  // literals is a two-line change, while converting the formatters would
  // change digits across the entire site.
  const metrics = [
    { icon: Headphones, value: totalEpisodes > 0 ? `${totalEpisodes}+` : "50+", label: "حلقة منشورة" },
    { icon: TrendingUp, value: totalViews > 0 ? formatNumber(totalViews) : "100K+", label: "مشاهدة واستماع" },
    { icon: Globe, value: "15+", label: "دولة يصلها المحتوى" },
    { icon: BarChart3, value: "18–35", label: "الفئة العمرية الأساسية" },
  ]

  return (
    <div className="min-h-screen">
      {/* ── Hero ── */}
      <section className="relative overflow-hidden py-24">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/15 via-background to-accent/10" />
        <div className="absolute start-10 top-20 h-72 w-72 rounded-full bg-primary/20 blur-3xl" />
        <div className="absolute bottom-20 end-10 h-96 w-96 rounded-full bg-accent/10 blur-3xl" />
        <div className="container relative mx-auto px-4">
          <div className="mx-auto max-w-3xl text-center">
            <Badge variant="outline" className="mb-6 border-primary/30 bg-primary/5 text-primary">
              <Handshake className="me-1.5 h-3 w-3" />
              شراكات خط
            </Badge>
            <h1 className="mb-6 text-heading font-bold md:text-title">
              كن شريكًا
              <span className="mt-2 block text-primary">في المحادثة</span>
            </h1>
            <p className="mx-auto mb-9 max-w-measure text-lead text-muted-foreground md:text-subhead">
              نحن لا نبحث عن مُعلِنين، بل عن شركاء محتوى يشاركوننا الرؤية —
              <span className="font-medium text-foreground"> حضور أصيل داخل محادثات تُشكّل وعي جيل، لا إعلان عابر يُتخطّى.</span>
            </p>
            <PartnerHeroCTA />
          </div>
        </div>
      </section>

      {/* ── Audience metrics ── */}
      <section className="border-y border-border/50 bg-card/50 py-12">
        <div className="container mx-auto px-4">
          <div className="mx-auto grid max-w-4xl grid-cols-2 gap-8 md:grid-cols-4">
            {metrics.map((m) => (
              <div key={m.label} className="text-center">
                <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
                  <m.icon className="h-6 w-6 text-primary" />
                </div>
                <div className="mb-1 text-heading font-bold text-foreground">{m.value}</div>
                <div className="text-caption text-muted-foreground">{m.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Partner, not advertiser ── */}
      <section className="py-20">
        <div className="container mx-auto px-4">
          <div className="mx-auto mb-12 max-w-2xl text-center">
            <Badge variant="outline" className="mb-4">
              <Megaphone className="me-1.5 h-3 w-3" />
              الفرق الجوهري
            </Badge>
            <h2 className="mb-4 text-heading font-bold">شريك، لا مُعلِن</h2>
            <p className="mx-auto max-w-measure text-lead text-muted-foreground">
              الإعلان التقليدي يقاطع التجربة. الشراكة مع خط جزءٌ منها — تنمو قيمتها مع قيمة المحتوى نفسه.
            </p>
          </div>
          <div className="mx-auto grid max-w-4xl gap-5 md:grid-cols-2">
            <div className="rounded-2xl border border-border/60 bg-muted/20 p-7">
              <div className="mb-4 text-caption font-semibold uppercase text-muted-foreground">
                الإعلان التقليدي
              </div>
              <ul className="space-y-3">
                {ADVERTISER_POINTS.map((p) => (
                  <li key={p} className="flex items-start gap-3 text-muted-foreground">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-muted-foreground/40" />
                    <span className="text-body">{p}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="rounded-2xl border-2 border-primary/40 bg-primary/[0.04] p-7 shadow-sm">
              <div className="mb-4 text-caption font-semibold uppercase text-primary">
                الشراكة مع خط
              </div>
              <ul className="space-y-3">
                {PARTNER_POINTS.map((p) => (
                  <li key={p} className="flex items-start gap-3">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                    <span className="text-body font-medium text-foreground">{p}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* ── Why Khat ── */}
      <section className="bg-secondary/20 py-20">
        <div className="container mx-auto px-4">
          <div className="mb-12 text-center">
            <Badge variant="outline" className="mb-4">
              <Star className="me-1.5 h-3 w-3" />
              لماذا خط؟
            </Badge>
            <h2 className="mb-4 text-heading font-bold">حضورٌ يعمل، لا مجرّد ظهور</h2>
            <p className="mx-auto max-w-measure text-lead text-muted-foreground">
              أربعة أسباب تجعل الشراكة مع خط استثمارًا في العلامة، لا تكلفة إعلانية.
            </p>
          </div>
          <div className="mx-auto grid max-w-5xl gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {VALUE_PROPS.map((v) => (
              <div key={v.title} className="rounded-2xl border border-border/50 bg-card p-6">
                <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
                  <v.icon className="h-6 w-6 text-primary" />
                </div>
                <h3 className="mb-2 font-semibold">{v.title}</h3>
                <p className="text-caption text-muted-foreground">{v.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Packages ── */}
      <section id="packages" className="py-20">
        <div className="container mx-auto px-4">
          <div className="mb-12 text-center">
            <Badge variant="outline" className="mb-4">
              <Layers className="me-1.5 h-3 w-3" />
              باقات الشراكة
            </Badge>
            <h2 className="mb-4 text-heading font-bold">طرق متعددة للحضور</h2>
            <p className="mx-auto max-w-measure text-lead text-muted-foreground">
              نقاط انطلاق نبني عليها معًا. كل باقة قابلة للتفصيل — والسعر يُحدَّد بعد فهم أهدافك ضمن مقترح مخصّص.
            </p>
          </div>
          <div className="mx-auto grid max-w-5xl gap-6 md:grid-cols-2">
            {PACKAGES.map((pkg) => (
              <Card
                key={pkg.name}
                className={`group relative overflow-hidden transition-all duration-300 hover:-translate-y-1 hover:shadow-xl ${
                  pkg.featured
                    ? "border-2 border-primary ring-2 ring-primary/20"
                    : "border-border hover:border-primary/50"
                }`}
              >
                {pkg.featured && (
                  <div className="absolute inset-x-0 top-0 bg-primary py-1.5 text-center text-micro font-medium text-primary-foreground">
                    <Sparkles className="me-1 inline h-3 w-3" />
                    الأكثر تكاملًا ومرونة
                  </div>
                )}
                <CardContent className={`p-7 ${pkg.featured ? "pt-12" : ""}`}>
                  <div className="mb-4 flex items-start gap-4">
                    <div className="shrink-0 rounded-xl bg-primary/10 p-3 text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
                      <pkg.icon className="h-6 w-6" />
                    </div>
                    <div>
                      <h3 className="text-lead font-bold">{pkg.name}</h3>
                      <p className="mb-1.5 text-micro text-muted-foreground/60">{pkg.nameEn}</p>
                      <p className="text-caption text-muted-foreground">{pkg.positioning}</p>
                    </div>
                  </div>
                  <ul className="mb-5 space-y-2.5 border-t border-border/40 pt-5">
                    {pkg.deliverables.map((d) => (
                      <li key={d} className="flex items-start gap-2.5">
                        <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                        <span className="text-caption text-foreground/85">{d}</span>
                      </li>
                    ))}
                  </ul>
                  <div className="rounded-xl bg-muted/30 px-4 py-3">
                    <span className="text-micro font-semibold uppercase text-muted-foreground">
                      الأنسب لـ
                    </span>
                    <p className="mt-0.5 text-caption text-foreground/80">{pkg.bestFor}</p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
          <p className="mx-auto mt-8 max-w-xl text-center text-caption text-muted-foreground">
            لا ترى ما يناسبك تمامًا؟ هذا أفضل سبب للتواصل — نصمّم شراكات لا توجد في أي قائمة.
          </p>
        </div>
      </section>

      {/* ── How it works ── */}
      <section className="bg-secondary/20 py-20">
        <div className="container mx-auto px-4">
          <div className="mb-12 text-center">
            <Badge variant="outline" className="mb-4">
              <Repeat className="me-1.5 h-3 w-3" />
              كيف تعمل الشراكة
            </Badge>
            <h2 className="mb-4 text-heading font-bold">من الطلب إلى الأثر — خمس خطوات</h2>
          </div>
          <div className="mx-auto grid max-w-5xl gap-4 md:grid-cols-5">
            {PROCESS.map((p, i) => (
              <div key={p.title} className="relative rounded-2xl border border-border/50 bg-card p-5 text-center">
                <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <p.icon className="h-5 w-5" />
                </div>
                {/* Was `٠{i + 1}` — an Arabic-Indic zero (U+0660) glued to a
                    Latin digit from JS, rendering "٠1".."٠5": two scripts
                    inside a single two-character token, on all five steps.
                    Latin to match the metrics row above. */}
                <div className="mb-1 text-micro font-bold text-primary">
                  {String(i + 1).padStart(2, "0")}
                </div>
                <h3 className="mb-1.5 text-caption font-semibold">{p.title}</h3>
                <p className="text-micro text-muted-foreground">{p.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Editorial integrity ── */}
      <section className="py-14">
        <div className="container mx-auto px-4">
          <div className="mx-auto max-w-2xl">
            <div className="flex items-start gap-4 rounded-2xl border border-border/50 bg-secondary/30 p-6">
              <Shield className="mt-0.5 h-6 w-6 shrink-0 text-primary" />
              <div>
                <h3 className="mb-1 font-semibold">استقلالية تحريرية كاملة</h3>
                <p className="max-w-measure text-caption text-muted-foreground">
                  يحتفظ خط بالتحكم التحريري الكامل في محتواه. الشراكة تعني حضورًا إلى جانب محتوى أصيل — لا
                  تدخّلًا فيه. هذه الاستقلالية هي بالضبط ما يجعل حضورك ذا قيمة.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Trusted partners (live) ── */}
      {partners.length > 0 && (
        <section className="bg-secondary/30 py-20">
          <div className="container mx-auto px-4">
            <div className="mb-10 text-center">
              <Badge variant="outline" className="mb-4">
                <Handshake className="me-1.5 h-3 w-3" />
                جهات وثقت بالحوار
              </Badge>
              <h2 className="mb-4 text-heading font-bold">شركاؤنا في الرحلة</h2>
            </div>
            <div className="mx-auto grid max-w-4xl gap-6 sm:grid-cols-2 md:grid-cols-3">
              {partners.map((partner) => (
                <div
                  key={partner.id}
                  className="group rounded-2xl border border-border/50 bg-card/50 p-6 text-center transition-all hover:-translate-y-0.5 hover:shadow-lg"
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
                      <div className="flex h-16 w-16 items-center justify-center rounded-xl bg-primary/10">
                        <Handshake className="h-8 w-8 text-primary" />
                      </div>
                    </div>
                  )}
                  <h3 className="mb-1 font-semibold">{partner.name}</h3>
                  {partner.description && (
                    <p className="mb-3 text-caption text-muted-foreground">{partner.description}</p>
                  )}
                  {partner.website_url && (
                    <a
                      href={partner.website_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-micro text-primary hover:underline"
                    >
                      زيارة الموقع
                      <span className="text-micro">↗</span>
                    </a>
                  )}
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ── Application form ── */}
      <section
        id="partnership-form"
        className="bg-gradient-to-br from-primary/10 via-background to-accent/10 py-20"
      >
        <div className="container mx-auto px-4">
          <div className="mx-auto max-w-2xl">
            <div className="mb-10 text-center">
              <Badge variant="outline" className="mb-4">
                <Users className="me-1.5 h-3 w-3" />
                طلب شراكة
              </Badge>
              <h2 className="mb-4 text-heading font-bold">لنبدأ المحادثة</h2>
              <p className="mx-auto max-w-measure text-lead text-muted-foreground">
                أخبرنا عن علامتك وأهدافك — وسنعود إليك بمقترح شراكة مصمّم حولك. كلما عرفنا أكثر، كان المقترح أدق.
              </p>
            </div>
            <Card className="border-2">
              <CardContent className="p-6 sm:p-8">
                <PartnerApplicationForm />
              </CardContent>
            </Card>
          </div>
        </div>
      </section>
    </div>
  )
}
