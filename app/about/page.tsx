"use client"

import { useState } from "react"
import Image from "next/image"
import Link from "next/link"
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
} from "lucide-react"
import { XIcon } from "@/components/icons/x-icon"

const socialLinks = [
  { name: "YouTube", href: "https://youtube.com/@khatpodcast", icon: Youtube },
  { name: "X", href: "https://x.com/khatpodcast", icon: XIcon },
  { name: "Instagram", href: "https://instagram.com/khatpodcast", icon: Instagram },
  { name: "البريد", href: "mailto:hello@khatpodcast.com", icon: Mail },
]

const teamMembers: { name: string; role: string; image: string | null; description: string }[] = [
  // Add team members here when ready:
  // { name: "الاسم", role: "الدور", image: null, description: "الوصف" },
]

const values = [
  {
    icon: Heart,
    title: "الأصالة",
    description: "محادثات حقيقية بدون تصنع أو أقنعة",
    color: "from-red-500/20 to-red-500/5",
  },
  {
    icon: Sparkles,
    title: "الإلهام",
    description: "محتوى يُلهم ويُحفز على التغيير",
    color: "from-yellow-500/20 to-yellow-500/5",
  },
  {
    icon: Users,
    title: "المجتمع",
    description: "بناء مجتمع متصل ومتفاعل",
    color: "from-blue-500/20 to-blue-500/5",
  },
]

export default function AboutPage() {
  const [isVideoPlaying, setIsVideoPlaying] = useState(false)

  // TODO: Replace with actual welcome video YouTube ID
  const welcomeVideoId = ""

  return (
    <div className="min-h-screen">
      {/* Hero Section with Host */}
      <section className="relative overflow-hidden">
        {/* Background gradient */}
        <div className="absolute inset-0 bg-gradient-to-b from-primary/10 via-transparent to-transparent" />

        <div className="container mx-auto px-4 py-16 relative">
          <div className="flex flex-col lg:flex-row items-center gap-12 lg:gap-16">
            {/* Host Photo */}
            <div className="relative group">
              <div className="absolute -inset-1 bg-gradient-to-r from-primary via-accent to-primary rounded-full blur-lg opacity-50 group-hover:opacity-75 transition-opacity animate-pulse" />
              <div className="relative w-64 h-64 lg:w-80 lg:h-80 rounded-full overflow-hidden border-4 border-background shadow-2xl">
                {/* TODO: Add host photo to /public/host-photo.jpg and uncomment the Image below */}
                <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-primary/20 to-accent/20 text-6xl font-bold text-muted-foreground">
                  خ
                </div>
              </div>
              {/* Floating badge */}
              <div className="absolute -bottom-2 left-1/2 -translate-x-1/2">
                <Badge className="bg-primary text-primary-foreground px-4 py-1.5 text-sm font-medium shadow-lg">
                  <Mic className="w-3.5 h-3.5 me-1.5" />
                  Podcast Host
                </Badge>
              </div>
            </div>

            {/* Host Info */}
            <div className="flex-1 text-center lg:text-start">
              <div className="inline-flex items-center gap-2 mb-4">
                <span className="text-sm text-muted-foreground">مرحباً، أنا</span>
              </div>
              <h1 className="text-4xl lg:text-5xl font-bold mb-4">
                بودكاست خط
              </h1>
              <p className="text-xl text-primary font-medium mb-6">
                مؤسس ومقدم بودكاست خط
              </p>
              <p className="text-lg text-muted-foreground leading-relaxed max-w-xl">
                بودكاست يستكشف القصص الإنسانية والتجارب الحياتية من خلال حوارات عميقة مع ضيوف ملهمين.
              </p>

              {/* Social Links */}
              <div className="flex flex-wrap gap-3 mt-8 justify-center lg:justify-start">
                {socialLinks.map((link) => (
                  <a
                    key={link.name}
                    href={link.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-center w-11 h-11 rounded-full bg-secondary hover:bg-primary hover:text-primary-foreground transition-all duration-300 hover:scale-110"
                  >
                    <link.icon className="h-5 w-5" />
                  </a>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Welcome Video Section */}
      {welcomeVideoId && <section className="py-16 bg-secondary/30">
        <div className="container mx-auto px-4">
          <div className="max-w-4xl mx-auto">
            <div className="text-center mb-10">
              <Badge variant="outline" className="mb-4">
                <Play className="w-3 h-3 me-1.5" />
                رسالة ترحيبية
              </Badge>
              <h2 className="text-3xl font-bold mb-4">تعرف على خط</h2>
              <p className="text-muted-foreground">
                شاهد هذا الفيديو القصير لتتعرف على البودكاست ورؤيتنا
              </p>
            </div>

            {/* Video Player */}
            <div className="relative aspect-video rounded-2xl overflow-hidden shadow-2xl border border-border/50 group">
              {!isVideoPlaying ? (
                <>
                  {/* Video Thumbnail */}
                  <div className="absolute inset-0 bg-gradient-to-br from-primary/20 via-background to-accent/20">
                    {/* TODO: Add video thumbnail to /public/video-thumbnail.jpg */}
                  </div>

                  {/* Play Button */}
                  <button
                    onClick={() => setIsVideoPlaying(true)}
                    className="absolute inset-0 flex items-center justify-center group/btn"
                  >
                    <div className="relative">
                      <div className="absolute inset-0 bg-primary rounded-full blur-xl opacity-50 group-hover/btn:opacity-75 transition-opacity animate-pulse" />
                      <div className="relative flex items-center justify-center w-20 h-20 lg:w-24 lg:h-24 rounded-full bg-primary text-primary-foreground shadow-xl group-hover/btn:scale-110 transition-transform duration-300">
                        <Play className="w-8 h-8 lg:w-10 lg:h-10 ms-1" fill="currentColor" />
                      </div>
                    </div>
                  </button>

                  {/* Decorative elements */}
                  <div className="absolute bottom-4 left-4 right-4 flex items-center justify-between text-white/80 text-sm">
                    <span>فيديو ترحيبي</span>
                    <span>2:30</span>
                  </div>
                </>
              ) : (
                <iframe
                  src={`https://www.youtube.com/embed/${welcomeVideoId}?autoplay=1&rel=0`}
                  title="Welcome Video"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                  className="absolute inset-0 w-full h-full"
                />
              )}
            </div>
          </div>
        </div>
      </section>}

      {/* Mission & Values */}
      <section className="py-16">
        <div className="container mx-auto px-4">
          <div className="max-w-4xl mx-auto">
            {/* Quote */}
            <div className="relative mb-16">
              <Quote className="absolute -top-4 -start-4 w-12 h-12 text-primary/20" />
              <blockquote className="text-2xl lg:text-3xl font-medium text-center leading-relaxed py-8 px-6">
                نؤمن بأن كل إنسان يحمل قصة تستحق أن تُروى
              </blockquote>
              <Quote className="absolute -bottom-4 -end-4 w-12 h-12 text-primary/20 rotate-180" />
            </div>

            {/* Values Grid */}
            <div className="grid md:grid-cols-3 gap-6">
              {values.map((value, index) => (
                <Card
                  key={value.title}
                  className="group hover:shadow-xl transition-all duration-300 hover:-translate-y-1 overflow-hidden"
                >
                  <CardContent className="p-6 relative">
                    <div className={`absolute inset-0 bg-gradient-to-br ${value.color} opacity-0 group-hover:opacity-100 transition-opacity`} />
                    <div className="relative">
                      <div className="flex items-center justify-center w-14 h-14 rounded-2xl bg-primary/10 text-primary mb-4 group-hover:scale-110 transition-transform duration-300">
                        <value.icon className="w-7 h-7" />
                      </div>
                      <h3 className="text-xl font-bold mb-2">{value.title}</h3>
                      <p className="text-muted-foreground">{value.description}</p>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Team Section */}
      {teamMembers.length > 0 && <section className="py-16 bg-secondary/30">
        <div className="container mx-auto px-4">
          <div className="max-w-4xl mx-auto">
            <div className="text-center mb-12">
              <Badge variant="outline" className="mb-4">
                <Users className="w-3 h-3 me-1.5" />
                فريق العمل
              </Badge>
              <h2 className="text-3xl font-bold mb-4">فريق بودكاست خط</h2>
              <p className="text-muted-foreground max-w-xl mx-auto">
                خلف كل حلقة فريق متميز يعمل بشغف لتقديم أفضل محتوى
              </p>
            </div>

            <div className="grid md:grid-cols-3 gap-6">
              {teamMembers.map((member, index) => (
                <Card
                  key={index}
                  className="group hover:shadow-xl transition-all duration-300 hover:-translate-y-1 text-center overflow-hidden"
                >
                  <CardContent className="p-6">
                    {/* Member Photo */}
                    <div className="relative w-24 h-24 mx-auto mb-4 rounded-full overflow-hidden bg-gradient-to-br from-primary/20 to-accent/20 group-hover:scale-105 transition-transform duration-300">
                      {member.image ? (
                        <Image
                          src={member.image}
                          alt={member.name}
                          fill
                          className="object-cover"
                        />
                      ) : (
                        <div className="flex items-center justify-center h-full text-2xl font-bold text-muted-foreground">
                          {member.name.charAt(0)}
                        </div>
                      )}
                    </div>

                    <h3 className="text-lg font-bold mb-1">{member.name}</h3>
                    <Badge variant="secondary" className="mb-3">{member.role}</Badge>
                    <p className="text-sm text-muted-foreground">{member.description}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </div>
      </section>}

      {/* CTA Section */}
      <section className="py-16">
        <div className="container mx-auto px-4">
          <div className="max-w-2xl mx-auto text-center">
            <div className="relative inline-block mb-8">
              <div className="absolute inset-0 bg-gradient-to-r from-primary to-accent rounded-full blur-2xl opacity-30 animate-pulse" />
              <Image
                src="/logo.png"
                alt="KHAT"
                width={80}
                height={80}
                className="relative rounded-2xl"
              />
            </div>

            <h2 className="text-3xl font-bold mb-4">انضم لرحلتنا</h2>
            <p className="text-lg text-muted-foreground mb-8">
              كن جزءاً من مجتمع خط واستمع لقصص ملهمة تغير نظرتك للحياة
            </p>

            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link href="/episodes">
                <Button size="lg" className="gap-2 w-full sm:w-auto">
                  <Play className="w-4 h-4" />
                  استمع للحلقات
                </Button>
              </Link>
              <Link href="/space">
                <Button size="lg" variant="outline" className="gap-2 w-full sm:w-auto">
                  <Users className="w-4 h-4" />
                  انضم لحبر
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}
