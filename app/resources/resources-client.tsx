"use client"

import { useState, useMemo } from "react"
import Link from "next/link"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { NewsletterForm } from "@/components/forms/newsletter-form"
import {
  BookOpen,
  FileText,
  ExternalLink,
  Search,
  ArrowLeft,
  Newspaper,
  Mail,
  Sparkles,
} from "lucide-react"

export interface Resource {
  id: string
  title: string
  author: string
  description: string
  type: "book" | "article" | "link"
  url: string
  topics: string[]
  approvedAt: string
}

interface ResourcesClientProps {
  resources: Resource[]
}

const typeConfig: Record<string, { label: string; labelPlural: string; icon: typeof BookOpen; color: string; bg: string }> = {
  book: { label: "كتاب", labelPlural: "كتب", icon: BookOpen, color: "text-primary", bg: "bg-primary/10" },
  article: { label: "مقال", labelPlural: "مقالات", icon: FileText, color: "text-accent", bg: "bg-accent/10" },
  link: { label: "رابط", labelPlural: "روابط", icon: ExternalLink, color: "text-purple-500", bg: "bg-purple-500/10" },
}

function getWeekNumber(): number {
  const now = new Date()
  const start = new Date(now.getFullYear(), 0, 1)
  const diff = now.getTime() - start.getTime()
  return Math.ceil(diff / (7 * 24 * 60 * 60 * 1000))
}

function isThisWeek(dateStr: string): boolean {
  if (!dateStr) return false
  const date = new Date(dateStr)
  const now = new Date()
  const diff = now.getTime() - date.getTime()
  return diff < 7 * 24 * 60 * 60 * 1000
}

export function ResourcesClient({ resources }: ResourcesClientProps) {
  const [search, setSearch] = useState("")
  const [typeFilter, setTypeFilter] = useState<string>("")

  // Split resources into editorial sections
  const { featured, thisWeek, archive } = useMemo(() => {
    if (resources.length === 0) return { featured: null, thisWeek: [], archive: [] }

    const feat = resources[0] // most recently approved (already sorted desc)
    const rest = resources.slice(1)
    const week: Resource[] = []
    const arch: Resource[] = []

    for (const r of rest) {
      if (isThisWeek(r.approvedAt)) week.push(r)
      else arch.push(r)
    }

    return { featured: feat, thisWeek: week, archive: arch }
  }, [resources])

  // Filter archive by type and search
  const filteredArchive = useMemo(() => {
    return archive.filter((r) => {
      if (typeFilter && r.type !== typeFilter) return false
      if (search) {
        const q = search.toLowerCase()
        if (!r.title.toLowerCase().includes(q) && !r.author.toLowerCase().includes(q)) return false
      }
      return true
    })
  }, [archive, typeFilter, search])

  const typeCounts = useMemo(() => ({
    book: resources.filter((r) => r.type === "book").length,
    article: resources.filter((r) => r.type === "article").length,
    link: resources.filter((r) => r.type === "link").length,
  }), [resources])

  const weekNum = getWeekNumber()

  // ── Empty state ──
  if (resources.length === 0) {
    return (
      <div className="container mx-auto px-4">
        <div className="flex min-h-[60vh] flex-col items-center justify-center text-center">
          <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
            <Newspaper className="h-8 w-8 text-primary" />
          </div>
          <h1 className="text-2xl font-bold md:text-3xl">المجلة قيد التحضير</h1>
          <p className="mt-3 max-w-md text-muted-foreground">
            نعمل على اختيار أفضل الكتب والمقالات والروابط لتكمل رحلة الاستماع. عُد قريباً!
          </p>
          <Link href="/episodes" className="mt-6">
            <Button variant="outline" className="gap-2">
              تصفّح الحلقات
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="container mx-auto px-4">
      {/* ── Section 1: Magazine Header ── */}
      <section className="relative flex flex-col items-center justify-center px-4 py-16 text-center">
        <div className="absolute inset-0 bg-gradient-to-b from-primary/5 via-transparent to-transparent" />
        <div className="relative z-10 mx-auto max-w-2xl space-y-4">
          <span className="inline-block rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
            العدد {weekNum}
          </span>
          <h1 className="text-3xl font-bold md:text-4xl">خطوط</h1>
          <p className="text-base text-muted-foreground md:text-lg">
            اختيارات أسبوعية من كتب ومقالات وروابط تُكمل رحلة الاستماع
          </p>
          <div className="mx-auto h-px w-16 bg-primary/30" />
        </div>
      </section>

      {/* ── Section 2: Featured Pick ── */}
      {featured && (
        <section className="py-8">
          <div className="mb-5 flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            <h2 className="text-xl font-bold">اختيار الأسبوع</h2>
          </div>

          <Card className="border-primary/20 bg-gradient-to-br from-primary/5 via-transparent to-accent/5">
            <CardContent className="space-y-5 p-6 md:p-8">
              <div className="flex flex-wrap items-center gap-2">
                {(() => {
                  const tc = typeConfig[featured.type] || typeConfig.link
                  const TypeIcon = tc.icon
                  return (
                    <span className={`flex items-center gap-1.5 rounded-full ${tc.bg} px-3 py-1 text-xs font-medium ${tc.color}`}>
                      <TypeIcon className="h-3.5 w-3.5" />
                      {tc.label}
                    </span>
                  )
                })()}
                {featured.topics.map((t) => (
                  <span key={t} className="rounded-full bg-muted px-3 py-1 text-xs font-medium text-muted-foreground">
                    {t}
                  </span>
                ))}
              </div>

              <h3 className="text-xl font-bold leading-relaxed md:text-2xl">
                {featured.title}
              </h3>

              {featured.author && (
                <p className="text-sm text-muted-foreground">
                  {featured.author}
                </p>
              )}

              {featured.description && (
                <p className="text-sm leading-relaxed text-foreground/80 md:text-base">
                  {featured.description}
                </p>
              )}

              <a
                href={featured.url}
                target="_blank"
                rel="noopener noreferrer"
              >
                <Button variant="outline" className="gap-2">
                  <ExternalLink className="h-4 w-4" />
                  اقرأ المصدر
                </Button>
              </a>
            </CardContent>
          </Card>
        </section>
      )}

      {/* ── Section 3: This Week's Picks ── */}
      {thisWeek.length > 0 && (
        <section className="py-8">
          <div className="mb-5 flex items-center gap-2">
            <Newspaper className="h-5 w-5 text-primary" />
            <h2 className="text-xl font-bold">اختيارات هذا الأسبوع</h2>
          </div>

          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {thisWeek.map((resource) => (
              <ResourceCard key={resource.id} resource={resource} showDescription />
            ))}
          </div>
        </section>
      )}

      {/* ── Section 4: Browse by Type ── */}
      {archive.length > 0 && (
        <section className="py-8">
          <div className="mb-5 flex items-center gap-2">
            <BookOpen className="h-5 w-5 text-primary" />
            <h2 className="text-xl font-bold">الأرشيف</h2>
          </div>

          {/* Type filter pills */}
          <div className="mb-5 flex flex-wrap gap-2">
            <button
              onClick={() => setTypeFilter("")}
              className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
                !typeFilter
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "border border-border text-muted-foreground hover:bg-muted hover:text-foreground"
              }`}
            >
              الكل
              <span className="ms-1.5 text-xs opacity-70">{resources.length}</span>
            </button>
            {(["book", "article", "link"] as const).map((t) => {
              const tc = typeConfig[t]
              const count = typeCounts[t]
              if (count === 0) return null
              return (
                <button
                  key={t}
                  onClick={() => setTypeFilter(typeFilter === t ? "" : t)}
                  className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
                    typeFilter === t
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "border border-border text-muted-foreground hover:bg-muted hover:text-foreground"
                  }`}
                >
                  {tc.labelPlural}
                  <span className="ms-1.5 text-xs opacity-70">{count}</span>
                </button>
              )
            })}
          </div>

          {/* Search */}
          <div className="relative mb-5 max-w-md">
            <Search className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="ابحث في الأرشيف..."
              className="ps-10"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label="بحث في الأرشيف"
            />
          </div>

          {/* Archive grid */}
          {filteredArchive.length === 0 ? (
            <div className="rounded-xl border border-dashed p-8 text-center text-muted-foreground">
              لا توجد نتائج مطابقة
            </div>
          ) : (
            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
              {filteredArchive.map((resource) => (
                <ResourceCard key={resource.id} resource={resource} />
              ))}
            </div>
          )}
        </section>
      )}

      {/* ── Section 5: Newsletter CTA ── */}
      <section className="py-12">
        <div className="mx-auto max-w-md rounded-2xl border border-primary/10 bg-gradient-to-br from-primary/5 via-transparent to-accent/5 p-8 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
            <Mail className="h-6 w-6 text-primary" />
          </div>
          <h2 className="text-xl font-bold">لا تفوّت العدد القادم</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            نرسل لك اختيارات المجلة مع أحدث الحلقات والتأملات — كل أسبوع.
          </p>
          <div className="mt-6">
            <NewsletterForm />
          </div>
        </div>
      </section>
    </div>
  )
}

// ── Resource Card Component ──

function ResourceCard({ resource, showDescription }: { resource: Resource; showDescription?: boolean }) {
  const tc = typeConfig[resource.type] || typeConfig.link
  const TypeIcon = tc.icon

  return (
    <a
      href={resource.url}
      target="_blank"
      rel="noopener noreferrer"
      className="group block"
    >
      <Card className="h-full transition-all hover:border-primary/50 hover:shadow-lg">
        <CardContent className="flex h-full flex-col p-4">
          {/* Header: icon + badges */}
          <div className="mb-3 flex items-center gap-2">
            <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${tc.bg}`}>
              <TypeIcon className={`h-4 w-4 ${tc.color}`} />
            </div>
            <span className={`rounded-full ${tc.bg} px-2 py-0.5 text-[10px] font-medium ${tc.color}`}>
              {tc.label}
            </span>
            {resource.topics.map((t) => (
              <span key={t} className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                {t}
              </span>
            ))}
          </div>

          {/* Title + author */}
          <h3 className="font-semibold leading-snug group-hover:text-primary transition-colors">
            {resource.title}
          </h3>
          {resource.author && (
            <p className="mt-1 text-xs text-muted-foreground">{resource.author}</p>
          )}

          {/* Description (optional) */}
          {showDescription && resource.description && (
            <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
              {resource.description}
            </p>
          )}

          {/* Spacer + link */}
          <div className="mt-auto pt-3">
            <span className="flex items-center gap-1 text-xs text-primary opacity-0 transition-opacity group-hover:opacity-100">
              <ExternalLink className="h-3 w-3" />
              زيارة المصدر
            </span>
          </div>
        </CardContent>
      </Card>
    </a>
  )
}
