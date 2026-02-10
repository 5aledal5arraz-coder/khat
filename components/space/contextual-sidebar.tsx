"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import Image from "next/image"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import {
  Sparkles,
  Trophy,
  Lightbulb,
  Heart,
  UserPlus,
  UserCheck,
  PenSquare,
  ArrowLeft,
  Bot,
} from "lucide-react"
import { formatArabicCount } from "@/lib/utils"
import { isFollowing, followAuthor, unfollowAuthor } from "@/lib/space-storage"
import { toast } from "@/lib/use-toast"
import type { Article, Author, WritingPrompt } from "@/types/space"

interface ContextualSidebarProps {
  weeklyHighlights: Article[]
  topContributors: Author[]
  writingPrompts: WritingPrompt[]
}

export function ContextualSidebar({
  weeklyHighlights,
  topContributors,
  writingPrompts,
}: ContextualSidebarProps) {
  return (
    <div className="space-y-6">
      {/* Writing Prompts */}
      <WritingPromptsCard prompts={writingPrompts} />

      {/* Weekly Highlights */}
      <WeeklyHighlightsCard articles={weeklyHighlights} />

      {/* Top Contributors */}
      <TopContributorsCard authors={topContributors} />
    </div>
  )
}

// Writing Prompts Card
function WritingPromptsCard({ prompts }: { prompts: WritingPrompt[] }) {
  return (
    <Card className="border-primary/20 bg-gradient-to-br from-primary/5 to-transparent">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Lightbulb className="h-5 w-5 text-primary" />
          أفكار للكتابة
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {prompts.slice(0, 2).map((prompt) => (
          <Link
            key={prompt.id}
            href={`/space/write?prompt=${encodeURIComponent(prompt.text)}${
              prompt.episodeSlug ? `&episode=${prompt.episodeSlug}` : ""
            }`}
          >
            <div className="group rounded-lg border border-transparent bg-background/50 p-3 transition-all hover:border-primary/30 hover:bg-background">
              <p className="text-sm line-clamp-2">{prompt.text}</p>
              <div className="mt-2 flex items-center gap-1 text-xs text-primary opacity-0 transition-opacity group-hover:opacity-100">
                <PenSquare className="h-3 w-3" />
                <span>ابدأ الكتابة</span>
                <ArrowLeft className="h-3 w-3" />
              </div>
            </div>
          </Link>
        ))}
      </CardContent>
    </Card>
  )
}

// Weekly Highlights Card
function WeeklyHighlightsCard({ articles }: { articles: Article[] }) {
  if (articles.length === 0) return null

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Sparkles className="h-5 w-5 text-primary" />
          أبرز الأسبوع
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        {articles.slice(0, 3).map((article, index) => (
          <Link
            key={article.id}
            href={`/space/${article.id}`}
            className="flex items-center gap-3 border-b p-3 last:border-b-0 transition-colors hover:bg-muted/30"
          >
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary">
              {index + 1}
            </div>

            {article.coverImage && (
              <div className="relative h-10 w-14 shrink-0 overflow-hidden rounded bg-muted">
                <Image
                  src={article.coverImage}
                  alt={article.title}
                  fill
                  className="object-cover"
                />
              </div>
            )}

            <div className="flex-1 min-w-0">
              <h4 className="text-sm font-medium line-clamp-1">{article.title}</h4>
              <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                <span>{article.author.name}</span>
                <span className="flex items-center gap-0.5">
                  <Heart className="h-3 w-3" />
                  {article.likes}
                </span>
              </div>
            </div>
          </Link>
        ))}
      </CardContent>
    </Card>
  )
}

// Top Contributors Card
function TopContributorsCard({ authors }: { authors: Author[] }) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Trophy className="h-5 w-5 text-yellow-500" />
          أبرز الكتّاب
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-1">
        {authors.slice(0, 4).map((author, index) => (
          <ContributorRow key={author.id} author={author} rank={index + 1} />
        ))}
      </CardContent>
    </Card>
  )
}

// Contributor Row
function ContributorRow({ author, rank }: { author: Author; rank: number }) {
  const [following, setFollowing] = useState(false)

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setFollowing(isFollowing(author.id))
  }, [author.id])

  const handleFollow = () => {
    if (following) {
      unfollowAuthor(author.id)
      toast({
        title: "تم إلغاء المتابعة",
        duration: 2000,
      })
    } else {
      followAuthor(author.id)
      toast({
        title: "تمت المتابعة",
        variant: "success",
        duration: 2000,
      })
    }
    setFollowing(!following)
  }

  return (
    <div className="flex items-center gap-2 py-1.5">
      <div
        className={`flex h-5 w-5 items-center justify-center rounded-full text-xs font-bold ${
          rank === 1
            ? "bg-yellow-500/20 text-yellow-600"
            : rank === 2
            ? "bg-gray-400/20 text-gray-500"
            : rank === 3
            ? "bg-orange-500/20 text-orange-600"
            : "bg-muted text-muted-foreground"
        }`}
      >
        {rank}
      </div>

      <Link href={`/space/author/${author.id}`} className="relative h-8 w-8 overflow-hidden rounded-full bg-muted hover:ring-2 hover:ring-primary/50 transition-all">
        {author.avatar ? (
          <Image
            src={author.avatar}
            alt={author.name}
            fill
            className="object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-xs font-bold text-muted-foreground">
            {author.name.charAt(0)}
          </div>
        )}
      </Link>

      <div className="flex-1 min-w-0">
        <Link href={`/space/author/${author.id}`} className="text-sm font-medium truncate hover:text-primary transition-colors flex items-center gap-1">
          {author.name}
          {author.isBot && <Bot className="h-3 w-3 text-primary shrink-0" aria-label="كاتب آلي" />}
        </Link>
        <p className="text-xs text-muted-foreground">{formatArabicCount(author.articlesCount, "مقال")}</p>
      </div>

      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8 shrink-0"
        onClick={handleFollow}
      >
        {following ? (
          <UserCheck className="h-4 w-4 text-primary" />
        ) : (
          <UserPlus className="h-4 w-4" />
        )}
      </Button>
    </div>
  )
}
