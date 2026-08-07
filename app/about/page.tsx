import type { Metadata } from "next"
import Image from "next/image"
import Link from "next/link"
import { KhatLogo } from "@/components/brand/khat-logo"
import { GuestPortrait } from "@/components/media/guest-portrait"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  Youtube,
  Instagram,
  Mail,
  Play,
  Mic,
  Heart,
  Sparkles,
  Users,
  Quote,
  Globe,
  Zap,
  Star,
  BookOpen,
  Lightbulb,
  Brain,
  Compass,
  Flame,
  Award,
} from "lucide-react"
import { XIcon } from "@/components/icons/x-icon"
import { getAboutContent } from "@/lib/content/static-content"
import { getSiteSettings, resolveContactEmail } from "@/lib/site-settings"
import { AboutVideo } from "./about-video"
import { YouTubeEmbed } from "@/components/episodes/youtube-embed"
import { cn } from "@/lib/utils"
import { PlatformIcon } from "@/components/platforms/platform-icon"
import type { TeamMember } from "@/types/static-content"

// Map icon string names to Lucide components
const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  Heart, Sparkles, Users, Youtube, Instagram, Mail, Globe, Zap, Star,
  BookOpen, Mic, Lightbulb, Brain, Compass, Flame, Award,
  X: XIcon,
}

function getIcon(name: string) {
  return iconMap[name] || Heart
}

/**
 * Validate value colour classes — this stops arbitrary class injection from
 * config, and now also stops OFF-PALETTE colour from arriving that way.
 *
 * The old pattern demanded a NUMERIC Tailwind shade (`from-red-500/20`), which
 * meant the only classes it would accept were stock-palette ones, and the only
 * classes it rejected were the brand tokens. The three cards on this page were
 * red / yellow / blue because of it. Now the shade is optional, so a token name
 * passes, and the allow-list below is the identity's four inks — nothing else
 * reaches `className` no matter what the config or the DB says.
 *
 * The guard reads from the DB (`static_content`), not just the committed JSON,
 * so it has to hold at render time rather than at seed time.
 */
const ALLOWED_TOKENS = ["primary", "accent", "accent-strong", "muted-foreground"] as const
const ALLOWED_COLOR_PATTERN = new RegExp(
  `^from-(?:${ALLOWED_TOKENS.join("|")})\\/\\d+\\s+to-(?:${ALLOWED_TOKENS.join("|")})\\/\\d+$`,
)
function safeColor(color: string): string {
  return ALLOWED_COLOR_PATTERN.test(color) ? color : "from-primary/20 to-primary/5"
}

export const metadata: Metadata = {
  title: "عن خط",
  description: "تعرّف على خط — قصتنا، قيمنا، والفريق ورا كل حلقة",
}

export default async function AboutPage() {
  const [content, settings] = await Promise.all([
    getAboutContent(),
    // `.catch` because a missing settings row must not take out the whole
    // page — the member buttons simply do not render, which is the same
    // outcome the page had before any of them existed.
    getSiteSettings().catch(() => null),
  ])
  const contactEmail = resolveContactEmail(settings)

  return (
    <div className="min-h-screen">
      {/* Hero Section with Host */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-primary/10 via-transparent to-transparent" />

        <div className="container mx-auto px-4 py-16 relative">
          <div className="flex flex-col lg:flex-row items-center gap-12 lg:gap-16">
            {/* Host Photo */}
            <div className="relative group">
              <div className="absolute -inset-1 bg-gradient-to-r from-primary via-accent to-primary rounded-full blur-lg opacity-50 group-hover:opacity-75 transition-opacity animate-pulse" />
              <div className="relative w-64 h-64 lg:w-80 lg:h-80 rounded-full overflow-hidden border-4 border-background shadow-2xl">
                {(content.hostImageUrl?.trim() || content.hostPhoto?.trim()) ? (
                  <Image
                    src={(content.hostImageUrl?.trim() || content.hostPhoto?.trim())!}
                    alt={content.hostName}
                    fill
                    className="object-cover"
                  />
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-primary/20 to-accent/20 text-title font-bold text-muted-foreground">
                    خ
                  </div>
                )}
              </div>
              <div className="absolute -bottom-2 inset-x-0 flex justify-center">
                <Badge className="bg-primary text-primary-foreground px-4 py-1.5 text-caption font-medium shadow-lg">
                  <Mic className="w-3.5 h-3.5 me-1.5" />
                  Podcast Host
                </Badge>
              </div>
            </div>

            {/* Host Info */}
            <div className="flex-1 text-center lg:text-start">
              <div className="inline-flex items-center gap-2 mb-4">
                <span className="text-caption text-muted-foreground">مرحباً، أنا</span>
              </div>
              <h1 className="text-heading lg:text-title font-bold mb-4">
                {content.hostName}
              </h1>
              <p className="text-lead text-primary font-medium mb-6">
                {content.hostTitle}
              </p>
              <p className="text-lead text-muted-foreground max-w-xl">
                {content.hostDescription}
              </p>

              {/* Social Links */}
              {content.socialLinks.length > 0 && (
                <div className="flex flex-wrap gap-3 mt-8 justify-center lg:justify-start">
                  {content.socialLinks.map((link) => {
                    const Icon = getIcon(link.icon)
                    return (
                      <a
                        key={link.name}
                        href={link.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label={link.name}
                        className="flex items-center justify-center w-11 h-11 rounded-full bg-secondary hover:bg-primary hover:text-primary-foreground transition-all duration-300 hover:scale-110"
                      >
                        <Icon className="h-5 w-5" />
                      </a>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Welcome Video Section */}
      <AboutVideo
        videoId={content.welcomeVideoId}
        welcomeVideoUrl={content.welcomeVideoUrl}
        welcomeVideoPosterUrl={content.welcomeVideoPosterUrl}
      />

      {/* Mission & Values */}
      <section className="py-16">
        <div className="container mx-auto px-4">
          <div className="max-w-4xl mx-auto">
            {/* Quote */}
            {content.missionQuote && (
              <div className="relative mb-16">
                <Quote className="absolute -top-4 -start-4 w-12 h-12 text-primary/20" />
                <blockquote className="text-subhead lg:text-heading font-medium text-center py-8 px-6">
                  {content.missionQuote}
                </blockquote>
                <Quote className="absolute -bottom-4 -end-4 w-12 h-12 text-primary/20 rotate-180" />
              </div>
            )}

            {/* Values Grid */}
            {content.values.length > 0 && (
              <div className="grid md:grid-cols-3 gap-6">
                {content.values
                  .sort((a, b) => a.order - b.order)
                  .map((value) => {
                    const Icon = getIcon(value.icon)
                    return (
                      <Card
                        key={value.id}
                        className="group hover:shadow-xl transition-all duration-300 hover:-translate-y-1 overflow-hidden"
                      >
                        <CardContent className="p-6 relative">
                          <div className={`absolute inset-0 bg-gradient-to-br ${safeColor(value.color)} opacity-0 group-hover:opacity-100 transition-opacity`} />
                          <div className="relative">
                            <div className="flex items-center justify-center w-14 h-14 rounded-2xl bg-primary/10 text-primary mb-4 group-hover:scale-110 transition-transform duration-300">
                              <Icon className="w-7 h-7" />
                            </div>
                            <h3 className="text-lead font-bold mb-2">{value.title}</h3>
                            <p className="text-muted-foreground">{value.description}</p>
                          </div>
                        </CardContent>
                      </Card>
                    )
                  })}
              </div>
            )}
          </div>
        </div>
      </section>

      {/* ── THE TEAM ──────────────────────────────────────────────────────
          Khaled, 2026-08-06: every member gets a photo, a name, a bio, HIS OWN
          MESSAGE, and optionally a video — «ابي التصميم يكون متناسق جميل ويملك
          روح بودكاست خط بكل تفاصيله».

          IT WAS THREE SMALL CARDS IN A GRID: portrait, name, role badge, two
          lines. That is the layout every site uses for a team, which is the
          problem — it says "here are some people" and nothing more, and it
          gives the founder the same 250px as a caption.

          Each person is now a full-width ROW, alternating side. That buys room
          for the thing that makes the page خط's: HIS LINE, set as a pull quote
          with the KHAT rule under it. The brand's premise is «كالعبارات التي
          تضع تحتها خطًّا» — a phrase worth underlining — so the page underlines
          one sentence from each of the three people who make the show. The
          identity as STRUCTURE, not as decoration, which is what "روح خط" has
          to mean on a page about the people themselves.

          Every piece degrades on its own: no photo → the shared «ط» panel; no
          video → the portrait; no message → no quote and no orphaned rule. */}
      {content.teamMembers.length > 0 && (
        <section className="py-20">
          <div className="container mx-auto px-4">
            <div className="mx-auto max-w-5xl">
              <div className="flex flex-col items-center text-center">
                <span aria-hidden="true" className="block h-[3px] w-14 rounded-full bg-accent" />
                <h2 className="mt-5 text-heading font-bold sm:text-title">الفريق</h2>
                <p className="mt-4 max-w-measure text-lead text-muted-foreground">
                  ثلاثة يصنعون الحلقة — من الفكرة الأولى إلى آخر قصّة في المونتاج.
                </p>
              </div>

              <div className="mt-16 space-y-20">
                {content.teamMembers
                  .slice()
                  .sort((a, b) => a.order - b.order)
                  .map((member, i) => (
                    <TeamMemberRow
                      key={member.id}
                      member={member}
                      flip={i % 2 === 1}
                      contactEmail={contactEmail}
                    />
                  ))}
              </div>
            </div>
          </div>
        </section>
      )}

      {/* CTA Section */}
      <section className="py-16">
        <div className="container mx-auto px-4">
          <div className="max-w-2xl mx-auto text-center">
            {/* Was /logo.png — the RETIRED gold wordmark — behind a pulsing
                blurred gradient. Both had to go: wrong logo, and "no added
                effects" is a formal don't. */}
            <div className="mb-8 inline-block">
              <KhatLogo variant="mark" height={72} label={null} />
            </div>

            <h2 className="text-heading font-bold mb-4">{content.ctaTitle}</h2>
            <p className="mx-auto mb-8 max-w-measure text-lead text-muted-foreground">
              {content.ctaDescription}
            </p>

            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link href="/episodes">
                <Button size="lg" className="gap-2 w-full sm:w-auto">
                  <Play className="w-4 h-4" />
                  تصفّح الحلقات
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}

/**
 * One member of the team, as a full-width row.
 *
 * ── THE SHAPE, AND WHY IT IS NOT A CARD ────────────────────────────────────
 * Three people who make the whole show do not fit in three 250px tiles. The row
 * alternates side so the page has a rhythm rather than a stack, and gives each
 * person the width to carry a portrait (or a clip), a role, what he actually
 * does, and the one line that is his.
 *
 * ── THE QUOTE IS THE POINT ─────────────────────────────────────────────────
 * `message` is set as a pull quote with the KHAT rule under it — the same
 * gesture the homepage draws under its headline. «كالعبارات التي تضع تحتها
 * خطًّا» is the brand's premise, so the page about the people who make it
 * underlines one sentence from each of them. That is the identity used as
 * structure; a coloured badge would have been the identity used as paint.
 *
 * ── EVERY PIECE IS OPTIONAL, AND FAILS ALONE ───────────────────────────────
 * No video → the portrait. No photo → `GuestPortrait` renders the shared «ط»
 * panel with its own onError ladder. No message → no quote AND no rule, rather
 * than a bar floating under nothing. Khaled fills this in himself, so every
 * field has to look deliberate while it is still empty.
 */
function TeamMemberRow({
  member,
  flip,
  contactEmail,
}: {
  member: TeamMember
  flip: boolean
  contactEmail: string
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center gap-8 md:items-start md:gap-12",
        flip ? "md:flex-row-reverse" : "md:flex-row",
      )}
    >
      {/* Portrait, or a clip if there is one */}
      <div className="w-full max-w-[280px] shrink-0 md:w-[200px]">
        {member.videoUrl ? (
          <div className="overflow-hidden rounded-2xl">
            <YouTubeEmbed url={member.videoUrl} title={member.name} />
          </div>
        ) : (
          <GuestPortrait
            name={member.name}
            photoUrl={member.image}
            /* `page` is the 200px rung — the largest the shared portrait
               offers, and the one the guest's own page uses. A team row is the
               same weight of surface, so it takes the same size rather than
               growing a fourth variant nobody else would use. */
            variant="page"
          />
        )}
      </div>

      <div className={cn("flex-1 text-center", flip ? "md:text-end" : "md:text-start")}>
        <h3 className="text-subhead font-bold text-foreground sm:text-heading">{member.name}</h3>

        {/* The role in KHAT Orange. At `text-body` semibold this is normal-size
            text and the brand orange only reaches 3.03:1 — so it is the ink,
            and the orange stays on the rule below, where it is a mark and not a
            word. Same rule the rest of the site follows. */}
        {member.role && (
          <p className="mt-1.5 text-body font-semibold text-primary">{member.role}</p>
        )}

        {member.description && (
          <p className="mx-auto mt-5 max-w-measure text-pretty text-lead leading-prose text-muted-foreground md:mx-0">
            {member.description}
          </p>
        )}

        {/* ── HOW TO REACH HIM ────────────────────────────────────────────
            ONE ADDRESS, AND THE SUBJECT SAYS WHO IT IS FOR.

            This used to print each member's own address. Khaled filled his in
            with a personal `@hotmail`, saw it published, and said «لا شيل
            الايميل وخله تواصل مع فريق خط» — then asked the question that
            actually shapes this: «شلون نعرف بالإيميل انها رساله ل خالد وليش
            فيصل او شاهين؟»

            A shared inbox with no marking loses that, so the recipient is the
            team address and the SUBJECT carries the name: the message arrives
            already labelled «رسالة إلى خالد», and a mail rule can file it
            without anyone reading it first. Three men, three buttons, one
            published address — and no personal inbox on a public page for a
            scraper to harvest.

            The address is `site_settings.metadata.contactEmail`, the same row
            /contact reads, so the site never disagrees with itself about where
            mail goes. `encodeURIComponent` on the subject because it is Arabic
            and a raw one breaks the mailto in some clients.

            The socials are his OWN accounts, not خط's; the icons come from the
            same `PlatformIcon` map the footer uses. */}
        {(contactEmail || (member.socials?.length ?? 0) > 0) && (
          <div
            className={cn(
              "mt-6 flex flex-wrap items-center gap-2",
              flip ? "justify-center md:justify-end" : "justify-center md:justify-start",
            )}
          >
            {contactEmail && (
              <a
                href={`mailto:${contactEmail}?subject=${encodeURIComponent(
                  `رسالة إلى ${member.name} — من موقع خط`,
                )}`}
                className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-4 py-2 text-caption font-medium text-foreground transition-colors hover:border-primary hover:text-primary"
              >
                <Mail className="h-3.5 w-3.5" />
                راسل {member.name}
              </a>
            )}
            {(member.socials ?? []).map((s) => (
              <a
                key={`${s.platform}-${s.url}`}
                href={s.url}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`${member.name} — ${s.platform}`}
                title={s.platform}
                className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-border text-muted-foreground transition-colors hover:border-primary hover:text-primary"
              >
                <PlatformIcon iconName={s.platform} className="h-4 w-4" />
              </a>
            ))}
          </div>
        )}

        {member.message && (
          <figure className="mt-8">
            <blockquote className="text-balance text-subhead font-bold leading-title text-foreground">
              {member.message}
            </blockquote>
            <span
              aria-hidden="true"
              className={cn(
                "mt-4 block h-[3px] w-12 rounded-full bg-accent",
                flip ? "mx-auto md:ms-auto md:me-0" : "mx-auto md:mx-0",
              )}
            />
          </figure>
        )}
      </div>
    </div>
  )
}
