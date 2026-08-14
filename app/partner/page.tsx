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
import { KhatDiamond } from "@/components/brand/khat-icon"
import { getActivePartners } from "@/lib/queries/partnerships"
import { fetchAllEpisodes, fetchChannelInfo } from "@/lib/youtube/queries"
import { audienceFacts, audienceMetrics, buildDemographics } from "@/lib/partnerships/audience"
import { latestSnapshot, type AgeShare, type CountryShare } from "@/lib/youtube/analytics"
import { getCachedPublicEpisodes } from "@/lib/cache"
import { filterLane } from "@/lib/episodes/programs"
import type { Episode } from "@/types/database"
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
  /**
   * WHAT IT COSTS, ON THE PAGE, BEFORE THE FORM.
   *
   * The form makes «نطاق الميزانية» a REQUIRED field while the site named no
   * price anywhere — it asked a company to price itself in the dark. Worse,
   * the lowest option is «أقل من 500 د.ك», so a company thinking 300 reads
   * itself as unqualified and leaves without ever telling us.
   *
   * The bands below are the SAME four Khaled already wrote into the form's
   * budget options, so the page and the form finally agree with each other.
   * THE NUMBERS ARE HIS TO CONFIRM — they are here to be corrected, not
   * asserted as fact.
   */
  investment: string
  investmentNote?: string
  /**
   * How many of `deliverables` are the shared floor. Everything after this
   * index is what THIS tier adds, and the card draws it in KHAT Orange — so a
   * company reading the season card sees what the extra 2,400 د.ك buys rather
   * than diffing two ten-item lists in its head.
   */
  baseCount?: number
  /**
   * Not a tier — something bought ON TOP of one. It spans the grid so it reads
   * as an addition rather than as a fifth thing to choose between, and so four
   * tiers keep their 2×2 without an orphan card under them.
   */
  addOn?: boolean
}

/**
 * WHAT EVERY SPONSORSHIP INCLUDES — the floor, not the whole offer.
 *
 * ── THE LAST LINE IS THE PRODUCT, NOT A DISCLAIMER ──────────────────────
 * Khaled, 2026-08-05: «محتوى الحلقه يخلو من ذكر الرعاة». Nothing is read out,
 * nothing is endorsed, the conversation is never interrupted. That is why
 * every global benchmark researched for this page — $15–30 CPM audio
 * host-read, $25–65 video mid-roll, $40+ dedicated YouTube — prices a
 * DIFFERENT product: all of them pay for the host's voice, and this one
 * deliberately withholds it. What is sold instead is presence and permanence:
 * a 45-second read is 0.6% of a two-hour episode; a logo and a product on the
 * table is 100% of it, and the episode keeps being watched for years.
 */
const SPONSORSHIP_INCLUDES = [
  "شعار شركتكم داخل الحلقة",
  "رابط موقعكم وحساباتكم في وصف الحلقة على يوتيوب",
  "حضور دائم على موقع خط",
  "منتجكم حاضر على الطاولة أثناء التصوير — إن كان لكم منتج",
  "محتوى الحلقة يخلو من أي ذكر للرعاة — وهذا ما يحفظ قيمة حضوركم",
]

/**
 * ── THE TIERS HAD IDENTICAL DELIVERABLES, AND THAT WAS THE PROBLEM ───────
 * Khaled: «المبلغ زين ولكن يحتاج شرح ليش ادفع هذا المبلغ». He was right, and
 * the fault was mine: I gave all three tiers one shared list, so the only
 * difference a company could see between 350 د.ك and 4,750 د.ك was a number of
 * episodes. Thirteen times the price for thirteen times the same thing is a
 * quantity discount, not a partnership — and it invites the obvious reply,
 * "then I will take one episode and see".
 *
 * What actually scales with commitment is REACH BEYOND THE EPISODE. A season
 * partner is not buying more minutes; they are entering خط's own marketing —
 * every poster, every platform, for a whole season, plus an announcement that
 * says the partnership exists at all. None of that is available for one
 * episode, and that is what the 4,750 is buying.
 *
 * Each tier's list is the base PLUS its own additions, composed here so the
 * shared floor cannot drift between three copies.
 */
const THREE_EPISODE_ADDS = [
  "شعاركم على بوسترات تسويق الحلقات الثلاث — إنستقرام وتيك توك وإكس",
]

const FIVE_EPISODE_ADDS = [
  "شعاركم على بوسترات تسويق الحلقات الخمس — إنستقرام وتيك توك وإكس",
  "منشور تعريفي بالشراكة على حسابات خط",
]

const SEASON_ADDS = [
  "فيديو توقيع الشراكة — يُصوَّر وينشر على حساباتنا وحساباتكم",
  "شعاركم على كل بوسترات تسويق الموسم — إنستقرام وتيك توك وإكس، طوال الموسم",
  "منشورات متكررة تعرّف بالشراكة عبر منصات خط",
  "ذكر الشراكة في الإعلان عن الموسم وفي التيزر",
  "حضور مميّز في صفحة الموسم على الموقع",
  "أولوية الحجز في الموسم التالي قبل طرحه",
]

/**
 * ── THE CARD IS PRICED FOR THE SECOND SEASON: TEN EPISODES ─────────────────
 * Khaled, 2026-08-06: «الموسم الاول ١٩ حلقة اما الموسم الثاني القادم لم يتم
 * تصويره الى الان سيكون ١٠ حلقات». Both halves of that matter here.
 *
 * The nineteen are the FIRST season — filmed, published, and unsellable: a
 * logo cannot be planted inside an episode after it is shot. They are the
 * evidence (110,074 average views each), not the goods. Everything on this
 * card is a PRE-SALE of a season that does not exist yet.
 *
 * ── WHAT THE OLD NUMBERS GOT WRONG ────────────────────────────────────────
 * The season tier read «19 حلقة · 250 د.ك للحلقة» at 4,750 — the archive
 * count borrowed as if it were a season length. Divided by the real ten it
 * came to 475 per episode, ABOVE the 350 single, so the card's own «أفضل
 * قيمة» tier was its most expensive one and any company could see that with
 * one division. A rate card that loses an argument to a calculator is worse
 * than no rate card.
 *
 * ── THE LADDER, AND WHY IT DESCENDS ───────────────────────────────────────
 *   350 → 320 → 300 → 275 per episode. Every larger commitment is cheaper per
 *   episode than the one below it, which is the only shape that survives a
 *   company doing the arithmetic — and they do.
 *
 * The 350 entry did NOT move. It is researched, published, and the price the
 * first partner signed against; raising it to 400 would earn roughly 150 د.ك
 * across a whole season, which is not what a settled price is worth.
 *
 * At Khaled's stated all-in cost of 100 د.ك per episode (2026-08-06) the
 * season clears 1,750 د.ك on 1,000 of cost. The cost sets the floor; the
 * price comes from the audience — 275/episode is ≈$8 per thousand views
 * against a published $25–65 for video mid-roll, and the gap is the host's
 * voice, which this deliberately does not sell.
 *
 * The tiers still differ in WHAT, not only in how many (Khaled: «يحتاج شرح
 * ليش ادفع هذا المبلغ»), which is what `baseCount` draws in KHAT Orange.
 */
const PACKAGES: PartnerPackage[] = [
  {
    icon: Mic,
    name: "رعاية حلقة",
    nameEn: "Single Episode",
    positioning: "حضورك في حلقة واحدة — نقطة دخول لتجربة الشراكة.",
    investment: "350 د.ك",
    investmentNote: "للحلقة الواحدة",
    deliverables: SPONSORSHIP_INCLUDES,
    bestFor: "لحظة إطلاق محددة، أو أول تجربة معنا.",
  },
  {
    icon: Layers,
    name: "رعاية ثلاث حلقات",
    nameEn: "Three Episodes",
    positioning: "ثلاث محادثات يتكرر فيها اسمك — أول درجة يبدأ عندها التذكّر.",
    investment: "960 د.ك",
    investmentNote: "320 د.ك للحلقة",
    deliverables: [...SPONSORSHIP_INCLUDES, ...THREE_EPISODE_ADDS],
    baseCount: SPONSORSHIP_INCLUDES.length,
    bestFor: "تجربة أوسع من حلقة، دون التزام بنصف الموسم.",
  },
  {
    icon: Layers,
    name: "نصف الموسم",
    nameEn: "Half a Season",
    positioning: "خمس حلقات من عشر — حضور متكرر يبني تذكّرًا لا تصنعه مرة واحدة.",
    investment: "1,500 د.ك",
    investmentNote: "خمس حلقات · 300 د.ك للحلقة",
    deliverables: [...SPONSORSHIP_INCLUDES, ...FIVE_EPISODE_ADDS],
    baseCount: SPONSORSHIP_INCLUDES.length,
    bestFor: "علامة تريد أن تُرى أكثر من مرة قبل أن تُذكر.",
  },
  {
    icon: Award,
    name: "شريك الموسم",
    nameEn: "Season Partner",
    positioning: "اسمك مع الموسم الثاني كله — لا في حلقة، بل في عمل يبقى.",
    investment: "2,750 د.ك",
    investmentNote: "عشر حلقات · 275 د.ك للحلقة — أفضل قيمة",
    deliverables: [...SPONSORSHIP_INCLUDES, ...SEASON_ADDS],
    baseCount: SPONSORSHIP_INCLUDES.length,
    bestFor: "شريك حقيقي في بناء موسم يترك أثرًا، لا حملة تمر.",
    featured: true,
  },
  {
    icon: Sparkles,
    name: "إضافة: فيديو دعائي",
    nameEn: "In-Episode Promo Video",
    positioning: "فيديو من إنتاجكم يُعرض مرة واحدة داخل الحلقة.",
    investment: "+1,500 د.ك",
    investmentNote: "تُضاف على أي باقة، للحلقة الواحدة",
    deliverables: [
      "فيديو دعائي كامل من إنتاجكم يُعرض مرة واحدة داخل الحلقة",
      "كل ما تتضمنه الباقة الأساسية",
      "متاح لعدد محدود من الشراكات في الموسم",
    ],
    bestFor: "إطلاق يستحق أن يُرى، لا أن يُذكر فقط.",
    addOn: true,
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
    /**
     * ── THIS SENTENCE NOW SITS ABOVE A TABLE THAT CAN CONTRADICT IT ────────
     * It was written when nothing on the page was measured. The «مَن يستمع»
     * section below now prints the real shares, and two words no longer
     * survived the comparison:
     *
     *   «العراق» — 3.8%, BELOW الإمارات at 4.5%. Naming the smaller and
     *   omitting the larger, directly above a table showing both, reads as
     *   either carelessness or selection. الإمارات replaces it.
     *
     *   «شباب» — 18–24 is 10.7%. The mass is 25–44 at 72.5%. The word
     *   undersold the audience in the one direction that costs money: a
     *   sponsor pays more to reach people with budgets, and this page was
     *   telling them the opposite of what the data says.
     *
     * The claim itself is now EVIDENCED rather than asserted — السعودية +
     * الكويت alone are 71.1% — which is why it stays at all. I had proposed
     * deleting it as unverifiable before the measurement existed.
     */
    body: "جمهور أساسه السعودية والكويت والإمارات والخليج — صنّاع قرار ومهنيون.",
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
  const [partners, episodes, ownEpisodes, channel] = await Promise.all([
    getActivePartners(),
    fetchAllEpisodes().catch(() => [] as Episode[]),
    // The DATABASE's own episodes — the only source that knows which videos are
    // خط's and which are «سالفة» or a clip. YouTube rows carry no category.
    //
    // `.filter((e) => e.category)` IS NOT REDUNDANT next to `filterLane`.
    // filterLane resolves an episode with NO category to the DEFAULT lane,
    // which is خط — so an uncategorised row counts as an episode here. Locally
    // that is exactly what happened: the smoke fixture pushed the tile from 19
    // to 20 while both databases hold 19 real ones. On a page whose whole
    // purpose is a number a company can verify, "close enough" is the failure.
    getCachedPublicEpisodes()
      .then((all) => filterLane(all.filter((e) => e.category), "khat"))
      .catch(() => [] as Episode[]),
    // Subscribers come from the channel itself. `fetchTotalViews()` is gone:
    // it summed EVERY video on the channel, shorts included, and that total
    // was being presented to a sponsor as the podcast's reach.
    fetchChannelInfo().catch(() => null),
  ])

  /* ── EVERY NUMBER IS DERIVED NOW, OR IT IS NOT SHOWN ────────────────────
     This block used to read:

       totalEpisodes > 0 ? `${totalEpisodes}+` : "50+"
       totalViews    > 0 ? formatNumber(totalViews) : "100K+"
       "15+"    دولة يصلها المحتوى
       "18–35"  الفئة العمرية الأساسية

     Two of the four were literals typed into the page, derived from nothing.
     `totalEpisodes` was every video on the YouTube channel — 77 — against the
     19 خط episodes the site's own archive lists, so a company that clicked
     «الحلقات» to check could count the difference itself. And the fallbacks
     invented numbers outright whenever YouTube was unreachable.

     Country mix and age band ARE real data — they live in YouTube Analytics,
     which needs an OAuth grant this app does not have. Until it does they are
     not claims we can make, so they are gone rather than guessed.

     The truth is also the better pitch: those 19 episodes carry 2,091,402
     views between them, averaging 110,074 each (measured 2026-08-05).
     «متوسط ١١٠ ألف مشاهدة للحلقة» outsells «٧٧ حلقة», and it survives being
     checked. See lib/partnerships/audience.ts. */
  const facts = audienceFacts(ownEpisodes, episodes, channel?.subscriberCount ?? null)
  const metrics = audienceMetrics(facts)

  /* WHO listens, not just how many. Read from the STORED snapshot rather than
     the live Analytics API: this page must not go blank because Google had a
     bad minute, and a stored row is the only thing that can say WHEN it was
     true. Measured in /admin/youtube-analytics; `.catch` so a missing table or
     an unconnected grant renders nothing instead of taking out the page. */
  const [countrySnap, ageSnap] = await Promise.all([
    latestSnapshot<CountryShare>("countries").catch(() => null),
    latestSnapshot<AgeShare>("age_gender").catch(() => null),
  ])
  const demographics = buildDemographics(
    countrySnap && {
      rows: countrySnap.rows.map((r) => ({ label: r.label, percent: r.percent })),
      periodStart: countrySnap.periodStart,
      periodEnd: countrySnap.periodEnd,
    },
    ageSnap && {
      rows: ageSnap.rows.map((r) => ({ label: r.band, percent: r.percent })),
      periodStart: ageSnap.periodStart,
      periodEnd: ageSnap.periodEnd,
    }
  )
  const countriesMeasured = countrySnap?.rows.length ?? 0

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
            {/* Every tile names where its number came from. A figure a company
                  can trace is worth more than a bigger one it cannot, and on
                  this page the reader is actively looking for reasons to doubt
                  us. The icon is gone: decoration competing with the only
                  thing in the tile that matters. */}
              {metrics.map((m) => (
                <div key={m.label} className="text-center">
                  <div className="text-title font-bold text-accent">{m.value}</div>
                  <div className="mt-1 text-body font-semibold text-foreground">{m.label}</div>
                  <div className="mt-1 text-micro text-muted-foreground">{m.source}</div>
                </div>
              ))}
          </div>
        </div>
      </section>

      {/* ── WHO listens ─────────────────────────────────────────────────────
          The two figures this page had to DELETE, now measured.

          «١٥+ دولة» and «١٨–٣٥» were literals derived from nothing; they were
          removed on 2026-08-05 rather than guessed at, because YouTube
          Analytics needs an OAuth grant the app did not have. It has one now,
          and the measurement is a better pitch than the fabrication was:
          18–24 is 10.7%, and 25–44 is 72.5% — an audience with budgets, not
          the young skew the invented band implied.

          Renders only when a measurement exists. No placeholder, no "قريباً" —
          the same rule every other number on this page follows. */}
      {demographics && (
        <section className="py-16">
          <div className="container mx-auto px-4">
            <div className="mx-auto max-w-4xl">
              <div className="flex flex-col items-center text-center">
                <span aria-hidden="true" className="block h-[3px] w-14 rounded-full bg-accent" />
                <h2 className="mt-5 text-heading font-bold">مَن يستمع</h2>
                {/* The window, printed. A share without its period is not a
                    fact, and this is the page where a reader is looking for
                    reasons to doubt us. */}
                <p className="mt-3 text-caption text-muted-foreground">
                  من YouTube Analytics — قياس الفترة من {demographics.periodStart} إلى{" "}
                  {demographics.periodEnd}
                  {countriesMeasured > 0 ? ` · شمل ${countriesMeasured} دولة` : ""}
                </p>
              </div>

              <div className="mt-10 grid gap-5 md:grid-cols-2">
                {demographics.countries.length > 0 && (
                  <div className="rounded-2xl border border-border bg-card p-7">
                    <h3 className="text-lead font-bold">أين هم</h3>
                    <ul className="mt-5 space-y-3.5">
                      {demographics.countries.map((r) => (
                        <ShareRow key={r.label} label={r.label} percent={r.percent} />
                      ))}
                    </ul>
                  </div>
                )}
                {demographics.ages.length > 0 && (
                  <div className="rounded-2xl border border-border bg-card p-7">
                    <h3 className="text-lead font-bold">كم أعمارهم</h3>
                    <ul className="mt-5 space-y-3.5">
                      {demographics.ages.map((r) => (
                        <ShareRow key={r.label} label={r.label} percent={r.percent} />
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </div>
          </div>
        </section>
      )}

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
              {/* THE SUBHEAD CONTRADICTED THE CARDS BELOW IT: «والسعر يُحدَّد بعد فهم
                  أهدافك ضمن مقترح مخصّص» — written when no price was shown, and left
                  standing directly above four printed prices. A company read the
                  sentence, then read 350 د.ك, and had to guess which one we meant. */}
              الأسعار معلنة، لا تُطلب. اختر مدة الحضور — أما ما تحصل عليه فواحد في كل
              الباقات: حضور كامل داخل الحلقة، وبلا أي مقاطعة لمحتواها.
            </p>
            {/* WHICH SEASON IS ON SALE — the page never said, and the archive it
                shows above holds nineteen episodes while the card sells ten. A
                company that reads «الموسم» here and counts «الموسم الاول» on the
                site would find two different seasons and no sentence connecting
                them. The first season is the evidence; the second is the goods,
                and it is not filmed yet — which is the reason to sign now, so it
                is said plainly rather than buried. */}
            <p className="mx-auto mt-4 max-w-measure text-body text-foreground">
              الباقات أدناه للموسم الثاني — <span className="font-semibold">عشر حلقات، لم تُصوَّر بعد</span>.
              الشركاء الذين ينضمون قبل التصوير يُذكرون في الإعلان عن الموسم وفي التيزر.
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
                } ${pkg.addOn ? "md:col-span-2" : ""}`}
              >
                {pkg.featured && (
                  <div className="absolute inset-x-0 top-0 bg-primary py-1.5 text-center text-micro font-medium text-primary-foreground">
                    <KhatDiamond size={10} className="me-1 inline-block align-middle" />
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
                      {/* THE PRICE, ABOVE THE DELIVERABLES, NOT BURIED UNDER
                          THEM. A company scanning four cards is deciding which
                          one it can afford before it reads what any of them
                          include; making that answer easy is what stops a
                          qualified lead from bouncing and an unqualified one
                          from filling in eighteen fields. KHAT Orange at
                          `text-subhead` is large text, so 3.66:1 on the card
                          clears the bar the palette allows it. */}
                      <p className="mt-3 text-subhead font-bold text-accent">{pkg.investment}</p>
                      {pkg.investmentNote ? (
                        <p className="text-micro text-muted-foreground">{pkg.investmentNote}</p>
                      ) : null}
                    </div>
                  </div>
                  <ul className="mb-5 space-y-2.5 border-t border-border/40 pt-5">
                    {/* An item this tier ADDS is drawn in KHAT Orange and at full
                          weight; the shared floor stays in indigo. A company
                          reading the season card can then see what the extra
                          4,400 د.ك buys, instead of diffing two ten-item lists
                          in its head — which is what «يحتاج شرح ليش ادفع هذا
                          المبلغ» was actually asking for. */}
                    {pkg.deliverables.map((d, i) => {
                        const isAdd = pkg.baseCount !== undefined && i >= pkg.baseCount
                        return (
                          <li key={d} className="flex items-start gap-2.5">
                            <Check className={`mt-0.5 h-4 w-4 shrink-0 ${isAdd ? "text-accent" : "text-primary"}`} />
                            <span className={`text-caption ${isAdd ? "font-semibold text-foreground" : "text-foreground/85"}`}>
                              {d}
                            </span>
                          </li>
                        )
                      })}
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

/**
 * One share, as a labelled bar.
 *
 * The bar is `--accent/25` filled against the card, not KHAT Orange at full
 * strength: six saturated bars in a column would be the loudest thing on a
 * page whose whole argument is restraint, and the number beside it is what
 * actually carries the information. `aria-hidden` on the bar because the
 * figure is already read out — a screen reader does not need the decoration
 * announced twice.
 */
function ShareRow({ label, percent }: { label: string; percent: number }) {
  return (
    <li>
      <div className="flex items-baseline justify-between gap-4">
        <span className="text-body font-medium text-foreground">{label}</span>
        <span className="text-body font-bold text-accent-strong">{percent}%</span>
      </div>
      <div
        aria-hidden="true"
        className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted"
      >
        <div
          className="h-full rounded-full bg-accent/40"
          style={{ width: `${Math.min(100, percent)}%` }}
        />
      </div>
    </li>
  )
}
