"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import Image from "next/image"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Heart,
  MessageCircle,
  Share2,
  ChevronDown,
  ChevronUp,
  Play,
} from "lucide-react"
import {
  isArticleLiked,
  toggleArticleLike,
  isThoughtLiked,
  toggleThoughtLike,
} from "@/lib/space-storage"
import { toast } from "@/lib/use-toast"
import type { FeedItem, Article, Thought } from "@/types/space"

interface FeedCardProps {
  item: FeedItem
}

// Format date consistently for SSR (no relative time to avoid hydration mismatch)
function formatDate(dateString: string): string {
  const date = new Date(dateString)
  const day = date.getDate()
  const month = date.getMonth() + 1
  const year = date.getFullYear()
  return `${day}/${month}/${year}`
}

// Component for hydration-safe relative time display
function RelativeTime({ date }: { date: string }) {
  const [displayTime, setDisplayTime] = useState(() => formatDate(date))

  // Hydration: Update to relative time after mount to avoid SSR mismatch
  useEffect(() => {
    const dateObj = new Date(date)
    const now = new Date()
    const diffMs = now.getTime() - dateObj.getTime()
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMs / 3600000)
    const diffDays = Math.floor(diffMs / 86400000)

    let result: string
    if (diffMins < 1) result = "الآن"
    else if (diffMins < 60) result = `منذ ${diffMins} دقيقة`
    else if (diffHours < 24) result = `منذ ${diffHours} ساعة`
    else if (diffDays < 7) result = `منذ ${diffDays} يوم`
    else result = formatDate(date)

    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDisplayTime(result)
  }, [date])

  return <>{displayTime}</>
}

export function FeedCard({ item }: FeedCardProps) {
  if (item.type === "article") {
    return <ArticleFeedCard item={item} />
  }
  return <ThoughtFeedCard item={item} />
}

// Article Card Component
function ArticleFeedCard({ item }: { item: FeedItem }) {
  const article = item.data as Article
  const [liked, setLiked] = useState(false)
  const [likeCount, setLikeCount] = useState(article.likes)

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLiked(isArticleLiked(article.id))
  }, [article.id])

  const handleLike = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    const newLiked = toggleArticleLike(article.id)
    setLiked(newLiked)
    setLikeCount((prev) => (newLiked ? prev + 1 : prev - 1))
    toast({
      title: newLiked ? "تم الإعجاب" : "تم إزالة الإعجاب",
      variant: "success",
      duration: 2000,
    })
  }

  const handleShare = async (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (navigator.share) {
      try {
        await navigator.share({
          title: article.title,
          text: article.excerpt,
          url: `/space/${article.id}`,
        })
      } catch (err) {
        if (err instanceof Error && err.name !== "AbortError") {
          console.error("Share failed:", err)
        }
      }
    } else {
      navigator.clipboard.writeText(`${window.location.origin}/space/${article.id}`)
      toast({
        title: "تم نسخ الرابط",
        variant: "success",
        duration: 2000,
      })
    }
  }

  // Featured Article - Hero Style
  if (item.featured) {
    return (
      <Link href={`/space/${article.id}`}>
        <Card className="group overflow-hidden border-primary/30 bg-gradient-to-br from-primary/5 to-transparent transition-all hover:border-primary/50 hover:shadow-lg">
          <div className="flex flex-col md:flex-row">
            {/* Cover Image */}
            {article.coverImage && (
              <div className="relative aspect-[16/9] md:aspect-auto md:w-2/5 overflow-hidden">
                <Image
                  src={article.coverImage}
                  alt={article.title}
                  fill
                  className="object-cover transition-transform group-hover:scale-105"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/20 to-transparent md:bg-gradient-to-l" />
                <Badge className="absolute top-3 start-3 bg-primary text-primary-foreground">
                  مميز
                </Badge>
              </div>
            )}

            {/* Content */}
            <CardContent className="flex-1 p-5 md:p-6">
              <div className="flex items-center gap-3 mb-3">
                <div className="relative h-10 w-10 overflow-hidden rounded-full bg-muted">
                  {article.author.avatar ? (
                    <Image
                      src={article.author.avatar}
                      alt={article.author.name}
                      fill
                      className="object-cover"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center font-bold text-muted-foreground">
                      {article.author.name.charAt(0)}
                    </div>
                  )}
                </div>
                <div>
                  <p className="font-medium text-sm">{article.author.name}</p>
                  <p className="text-xs text-muted-foreground">
                    <RelativeTime date={article.date} /> · {article.readTime}
                  </p>
                </div>
              </div>

              <h3 className="text-xl font-bold mb-2 group-hover:text-primary transition-colors line-clamp-2">
                {article.title}
              </h3>
              <p className="text-muted-foreground text-sm line-clamp-2 mb-4">
                {article.excerpt}
              </p>

              {/* Episode Link */}
              {article.episodeTitle && (
                <div className="flex items-center gap-2 rounded-lg bg-muted/50 px-3 py-2 mb-4 w-fit">
                  <Play className="h-4 w-4 text-primary" />
                  <span className="text-xs">مستوحى من: {article.episodeTitle}</span>
                </div>
              )}

              {/* Actions */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <button
                    onClick={handleLike}
                    className={`flex items-center gap-1.5 text-sm transition-colors ${
                      liked ? "text-red-500" : "text-muted-foreground hover:text-red-500"
                    }`}
                  >
                    <Heart className={`h-4 w-4 ${liked ? "fill-current" : ""}`} />
                    <span>{likeCount}</span>
                  </button>
                  <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
                    <MessageCircle className="h-4 w-4" />
                    <span>{article.comments.length}</span>
                  </span>
                </div>
                <Button variant="ghost" size="sm" onClick={handleShare}>
                  <Share2 className="h-4 w-4 me-1" />
                  مشاركة
                </Button>
              </div>
            </CardContent>
          </div>
        </Card>
      </Link>
    )
  }

  // Regular Article Card
  return (
    <Link href={`/space/${article.id}`}>
      <Card className="group overflow-hidden transition-all hover:border-primary/30">
        <CardContent className="flex gap-4 p-4">
          {/* Thumbnail */}
          {article.coverImage && (
            <div className="relative h-24 w-28 shrink-0 overflow-hidden rounded-lg bg-muted">
              <Image
                src={article.coverImage}
                alt={article.title}
                fill
                className="object-cover"
              />
            </div>
          )}

          {/* Content */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <div className="relative h-6 w-6 overflow-hidden rounded-full bg-muted">
                {article.author.avatar ? (
                  <Image
                    src={article.author.avatar}
                    alt={article.author.name}
                    fill
                    className="object-cover"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-xs">
                    {article.author.name.charAt(0)}
                  </div>
                )}
              </div>
              <span className="text-xs text-muted-foreground">{article.author.name}</span>
              <span className="text-xs text-muted-foreground">·</span>
              <span className="text-xs text-muted-foreground"><RelativeTime date={article.date} /></span>
            </div>

            <h3 className="font-semibold group-hover:text-primary transition-colors line-clamp-1 mb-1">
              {article.title}
            </h3>
            <p className="text-sm text-muted-foreground line-clamp-1">
              {article.excerpt}
            </p>

            {/* Tags & Stats */}
            <div className="flex items-center justify-between mt-2">
              <div className="flex items-center gap-2">
                {article.tags.slice(0, 2).map((tag) => (
                  <Badge key={tag} variant="secondary" className="text-xs">
                    {tag}
                  </Badge>
                ))}
              </div>
              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                <button
                  onClick={handleLike}
                  className={`flex items-center gap-1 transition-colors ${
                    liked ? "text-red-500" : "hover:text-red-500"
                  }`}
                >
                  <Heart className={`h-3.5 w-3.5 ${liked ? "fill-current" : ""}`} />
                  {likeCount}
                </button>
                <span className="flex items-center gap-1">
                  <MessageCircle className="h-3.5 w-3.5" />
                  {article.comments.length}
                </span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </Link>
  )
}

// Thought Card Component
function ThoughtFeedCard({ item }: { item: FeedItem }) {
  const thought = item.data as Thought
  const [liked, setLiked] = useState(false)
  const [likeCount, setLikeCount] = useState(thought.likes)
  const [showReplies, setShowReplies] = useState(false)

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLiked(isThoughtLiked(thought.id))
  }, [thought.id])

  const handleLike = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    const newLiked = toggleThoughtLike(thought.id)
    setLiked(newLiked)
    setLikeCount((prev) => (newLiked ? prev + 1 : prev - 1))
    toast({
      title: newLiked ? "تم الإعجاب" : "تم إزالة الإعجاب",
      variant: "success",
      duration: 2000,
    })
  }

  const handleShare = async (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (navigator.share) {
      try {
        await navigator.share({
          text: thought.content,
          url: window.location.href,
        })
      } catch (err) {
        if (err instanceof Error && err.name !== "AbortError") {
          console.error("Share failed:", err)
        }
      }
    } else {
      navigator.clipboard.writeText(thought.content)
      toast({
        title: "تم نسخ الخاطرة",
        variant: "success",
        duration: 2000,
      })
    }
  }

  return (
    <Card className="transition-all hover:border-primary/20">
      <CardContent className="p-4">
        {/* Author Header */}
        <div className="flex items-center gap-3 mb-3">
          <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-full bg-muted">
            {thought.author.avatar ? (
              <Image
                src={thought.author.avatar}
                alt={thought.author.name}
                fill
                className="object-cover"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-sm font-bold text-muted-foreground">
                {thought.author.name.charAt(0)}
              </div>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-medium text-sm">{thought.author.name}</p>
            <p className="text-xs text-muted-foreground">
              <RelativeTime date={thought.date} />
            </p>
          </div>
          <Badge variant="outline" className="text-xs shrink-0">
            خاطرة
          </Badge>
        </div>

        {/* Content */}
        <p className="text-sm leading-relaxed whitespace-pre-wrap mb-3">
          {thought.content}
        </p>

        {/* Tags */}
        {thought.tags && thought.tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-3">
            {thought.tags.map((tag) => (
              <Badge key={tag} variant="secondary" className="text-xs">
                #{tag}
              </Badge>
            ))}
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center justify-between border-t pt-3">
          <div className="flex items-center gap-4">
            <button
              onClick={handleLike}
              className={`flex items-center gap-1.5 text-sm transition-colors ${
                liked ? "text-red-500" : "text-muted-foreground hover:text-red-500"
              }`}
            >
              <Heart className={`h-4 w-4 ${liked ? "fill-current" : ""}`} />
              <span>{likeCount}</span>
            </button>

            {thought.replies.length > 0 && (
              <button
                onClick={() => setShowReplies(!showReplies)}
                className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-primary transition-colors"
              >
                <MessageCircle className="h-4 w-4" />
                <span>{thought.replies.length}</span>
                {showReplies ? (
                  <ChevronUp className="h-3 w-3" />
                ) : (
                  <ChevronDown className="h-3 w-3" />
                )}
              </button>
            )}
          </div>

          <Button
            variant="ghost"
            size="sm"
            onClick={handleShare}
            className="text-muted-foreground hover:text-primary"
          >
            <Share2 className="h-4 w-4 me-1" />
            مشاركة
          </Button>
        </div>

        {/* Replies */}
        {showReplies && thought.replies.length > 0 && (
          <div className="mt-4 space-y-3 border-t pt-4">
            {thought.replies.map((reply) => (
              <div key={reply.id} className="flex gap-3">
                <div className="relative h-8 w-8 shrink-0 overflow-hidden rounded-full bg-muted">
                  {reply.authorAvatar ? (
                    <Image
                      src={reply.authorAvatar}
                      alt={reply.authorName}
                      fill
                      className="object-cover"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-xs font-bold text-muted-foreground">
                      {reply.authorName.charAt(0)}
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0 rounded-lg bg-muted/50 p-3">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{reply.authorName}</span>
                    <span className="text-xs text-muted-foreground">
                      <RelativeTime date={reply.date} />
                    </span>
                  </div>
                  <p className="mt-1 text-sm">{reply.content}</p>
                  <div className="mt-2 flex items-center gap-1 text-xs text-muted-foreground">
                    <Heart className="h-3 w-3" />
                    <span>{reply.likes}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
