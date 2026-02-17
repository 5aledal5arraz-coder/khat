"use client"

import { useState, useMemo } from "react"
import Link from "next/link"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Select } from "@/components/ui/select"
import { BookOpen, Link as LinkIcon, ExternalLink, Search } from "lucide-react"

export interface Resource {
  id: string
  title: string
  author: string
  type: "book" | "article" | "link"
  url: string
  episodes: string[]
  topics: string[]
}

interface ResourcesClientProps {
  resources: Resource[]
}

const typeLabels: Record<string, string> = {
  book: "كتاب",
  article: "مقال",
  link: "رابط",
}

export function ResourcesClient({ resources }: ResourcesClientProps) {
  const [search, setSearch] = useState("")
  const [typeFilter, setTypeFilter] = useState("")
  const [topicFilter, setTopicFilter] = useState("")

  const allTopics = useMemo(() => {
    const topics = new Set<string>()
    resources.forEach((r) => r.topics.forEach((t) => topics.add(t)))
    return Array.from(topics).sort()
  }, [resources])

  const filtered = useMemo(() => {
    return resources.filter((r) => {
      if (search) {
        const q = search.toLowerCase()
        if (!r.title.toLowerCase().includes(q) && !r.author.toLowerCase().includes(q)) return false
      }
      if (typeFilter && r.type !== typeFilter) return false
      if (topicFilter && !r.topics.includes(topicFilter)) return false
      return true
    })
  }, [resources, search, typeFilter, topicFilter])

  const bookCount = resources.filter((r) => r.type === "book").length
  const articleCount = resources.filter((r) => r.type === "article").length
  const linkCount = resources.filter((r) => r.type === "link").length

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold">الموارد</h1>
        <p className="mt-2 text-muted-foreground">
          كتب وروابط مذكورة في حلقات البودكاست
        </p>
      </div>

      {/* Filters */}
      <div className="mb-8 flex flex-col gap-4 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input
            placeholder="ابحث عن كتاب أو مقال..."
            className="ps-10"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="بحث في الموارد"
          />
        </div>
        <Select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          aria-label="تصفية حسب النوع"
        >
          <option value="">جميع الأنواع</option>
          <option value="book">كتب</option>
          <option value="article">مقالات</option>
          <option value="link">روابط</option>
        </Select>
        <Select
          value={topicFilter}
          onChange={(e) => setTopicFilter(e.target.value)}
          aria-label="تصفية حسب الموضوع"
        >
          <option value="">جميع المواضيع</option>
          {allTopics.map((topic) => (
            <option key={topic} value={topic}>{topic}</option>
          ))}
        </Select>
      </div>

      {/* Stats */}
      <div className="mb-8 grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/20">
              <BookOpen className="h-5 w-5 text-primary" aria-hidden="true" />
            </div>
            <div>
              <p className="text-2xl font-bold">{bookCount}</p>
              <p className="text-xs text-muted-foreground">كتاب</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-accent/20">
              <LinkIcon className="h-5 w-5 text-accent" aria-hidden="true" />
            </div>
            <div>
              <p className="text-2xl font-bold">{articleCount}</p>
              <p className="text-xs text-muted-foreground">مقال</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-secondary">
              <ExternalLink className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
            </div>
            <div>
              <p className="text-2xl font-bold">{linkCount}</p>
              <p className="text-xs text-muted-foreground">رابط</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Resources Grid */}
      {filtered.length === 0 ? (
        <div className="rounded-lg border border-dashed p-8 text-center">
          <p className="text-muted-foreground">لا توجد نتائج مطابقة للبحث</p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filtered.map((resource) => (
            <Card key={resource.id} className="transition-all hover:border-primary/50">
              <CardContent className="p-4">
                <div className="flex items-start justify-between">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-secondary">
                    {resource.type === "book" ? (
                      <BookOpen className="h-5 w-5 text-primary" aria-hidden="true" />
                    ) : resource.type === "link" ? (
                      <ExternalLink className="h-5 w-5 text-accent" aria-hidden="true" />
                    ) : (
                      <LinkIcon className="h-5 w-5 text-accent" aria-hidden="true" />
                    )}
                  </div>
                  <Badge variant="outline">
                    {typeLabels[resource.type] || resource.type}
                  </Badge>
                </div>
                <h3 className="mt-3 font-semibold">{resource.title}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{resource.author}</p>
                <div className="mt-3 flex flex-wrap gap-1">
                  {resource.topics.map((topic) => (
                    <Badge key={topic} variant="secondary" className="text-xs">
                      {topic}
                    </Badge>
                  ))}
                </div>
                <div className="mt-3 border-t pt-3">
                  <p className="text-xs text-muted-foreground">ذُكر في:</p>
                  <ul className="mt-1 space-y-1">
                    {resource.episodes.map((ep) => (
                      <li key={ep} className="text-xs text-primary hover:underline">
                        <Link href={`/episodes?q=${encodeURIComponent(ep)}`}>{ep}</Link>
                      </li>
                    ))}
                  </ul>
                </div>
                <a
                  href={resource.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-3 flex items-center gap-1 text-sm text-primary hover:underline"
                  aria-label={`زيارة ${resource.title}`}
                >
                  <ExternalLink className="h-3 w-3" aria-hidden="true" />
                  زيارة المصدر
                </a>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
