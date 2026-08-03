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
import { AboutVideo } from "./about-video"

// Map icon string names to Lucide components
const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  Heart, Sparkles, Users, Youtube, Instagram, Mail, Globe, Zap, Star,
  BookOpen, Mic, Lightbulb, Brain, Compass, Flame, Award,
  X: XIcon,
}

function getIcon(name: string) {
  return iconMap[name] || Heart
}

// Validate value color classes to prevent arbitrary class injection from config
const ALLOWED_COLOR_PATTERN = /^from-[a-z]+-\d+\/\d+\s+to-[a-z]+-\d+\/\d+$/
function safeColor(color: string): string {
  return ALLOWED_COLOR_PATTERN.test(color) ? color : "from-primary/20 to-primary/5"
}

export const metadata: Metadata = {
  title: "عن خط",
  description: "تعرّف على خط — قصتنا، قيمنا، والفريق ورا كل حلقة",
}

export default async function AboutPage() {
  const content = await getAboutContent()

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

      {/* Team Section */}
      {content.teamMembers.length > 0 && (
        <section className="py-16 bg-secondary/30">
          <div className="container mx-auto px-4">
            <div className="max-w-4xl mx-auto">
              <div className="text-center mb-12">
                <Badge variant="outline" className="mb-4">
                  <Users className="w-3 h-3 me-1.5" />
                  فريق العمل
                </Badge>
                <h2 className="text-heading font-bold mb-4">فريق بودكاست خط</h2>
                <p className="text-muted-foreground max-w-xl mx-auto">
                  ورا كل حلقة فريق يشتغل بشغف عشان يقدّم لك أفضل محتوى
                </p>
              </div>

              <div className="grid md:grid-cols-3 gap-6">
                {content.teamMembers
                  .sort((a, b) => a.order - b.order)
                  .map((member) => (
                    <Card
                      key={member.id}
                      className="group hover:shadow-xl transition-all duration-300 hover:-translate-y-1 text-center overflow-hidden"
                    >
                      <CardContent className="p-6">
                        {/* Was a hand-rolled avatar: a `rounded-full` gradient
                            box falling back to `{member.name.charAt(0)}`. Both
                            halves broke a rule this wave settled. The circle is
                            the shape the identity does not own, and the initial
                            is the deleted `guestInitials` rebuilt inline — it
                            renders «ا» for every Arabic name that opens with
                            «ال», which is most of them. The 96px rung of the
                            shared portrait is the same box, with the «ط» panel
                            and the onError ladder already in it. */}
                        <GuestPortrait
                          name={member.name}
                          photoUrl={member.image}
                          variant="episode"
                          className="mx-auto mb-4 group-hover:scale-105 transition-transform duration-300"
                        />
                        <h3 className="text-lead font-bold mb-1">{member.name}</h3>
                        {member.role && <Badge variant="secondary" className="mb-3">{member.role}</Badge>}
                        <p className="text-caption text-muted-foreground">{member.description}</p>
                      </CardContent>
                    </Card>
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
