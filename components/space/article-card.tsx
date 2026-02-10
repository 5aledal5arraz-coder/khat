"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import Image from "next/image"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Heart, MessageCircle, Share2, Play, UserPlus, UserCheck, Bookmark, BookmarkCheck } from "lucide-react"
import { isArticleLiked, toggleArticleLike, isFollowing, followAuthor, unfollowAuthor, isBookmarked, toggleBookmark, getArticleProgress } from "@/lib/space-storage"
import { toast } from "@/lib/use-toast"
import { EmojiReactions } from "./emoji-reactions"
import type { Article } from "@/types/space"

interface ArticleCardProps {
  article: Article
  variant?: "featured" | "default" | "compact"
}

export function ArticleCard({ article, variant = "default" }: ArticleCardProps) {
  const [liked, setLiked] = useState(false)
  const [likeCount, setLikeCount] = useState(article.likes)
  const [following, setFollowing] = useState(false)
  const [bookmarked, setBookmarked] = useState(false)
  const [readingProgress, setReadingProgress] = useState(0)

  // Hydration: Load client-side localStorage state after mount
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLiked(isArticleLiked(article.id))
    setFollowing(isFollowing(article.author.id))
    setBookmarked(isBookmarked(article.id))
    setReadingProgress(getArticleProgress(article.id))
  }, [article.id, article.author.id])

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

  const handleFollow = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (following) {
      unfollowAuthor(article.author.id)
      toast({
        title: "تم إلغاء المتابعة",
        description: `لم تعد تتابع ${article.author.name}`,
        duration: 2000,
      })
    } else {
      followAuthor(article.author.id)
      toast({
        title: "تمت المتابعة",
        description: `أنت الآن تتابع ${article.author.name}`,
        variant: "success",
        duration: 2000,
      })
    }
    setFollowing(!following)
  }

  const handleBookmark = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    const newBookmarked = toggleBookmark(article.id)
    setBookmarked(newBookmarked)
    toast({
      title: newBookmarked ? "تم الحفظ" : "تم إزالة الحفظ",
      description: newBookmarked ? "تمت إضافة المقال للمحفوظات" : "تمت إزالة المقال من المحفوظات",
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
        // User cancelled the share dialog - this is expected behavior
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

  if (variant === "featured") {
    return (
      <Link href={`/space/${article.id}`}>
        <Card className="group h-full overflow-hidden transition-all hover:border-primary/50 hover:shadow-lg">
          {/* Cover Image */}
          {article.coverImage && (
            <div className="relative aspect-[16/9] overflow-hidden">
              <Image
                src={article.coverImage}
                alt={article.title}
                fill
                className="object-cover transition-transform group-hover:scale-105"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
              <div className="absolute top-3 start-3 flex items-center gap-2">
                <Badge className="bg-primary text-primary-foreground">
                  مميز
                </Badge>
                <span className="rounded-full bg-black/50 px-2 py-0.5 text-xs text-white">
                  {article.readTime}
                </span>
              </div>
            </div>
          )}

          <CardContent className="p-5">
            <h3 className="text-xl font-bold group-hover:text-primary transition-colors">
              {article.title}
            </h3>
            <p className="mt-2 line-clamp-2 text-muted-foreground">
              {article.excerpt}
            </p>

            {/* Episode Link */}
            {article.episodeTitle && (
              <div className="mt-3 flex items-center gap-2 rounded-lg bg-muted/50 px-3 py-2">
                <Play className="h-4 w-4 text-primary" />
                <span className="text-xs text-muted-foreground">مستوحى من:</span>
                <span className="text-xs font-medium">{article.episodeTitle}</span>
              </div>
            )}

            {/* Author */}
            <div className="mt-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="relative h-8 w-8 overflow-hidden rounded-full bg-muted">
                  {article.author.avatar ? (
                    <Image
                      src={article.author.avatar}
                      alt={article.author.name}
                      fill
                      className="object-cover"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-sm font-bold text-muted-foreground">
                      {article.author.name.charAt(0)}
                    </div>
                  )}
                </div>
                <div>
                  <p className="text-sm font-medium">{article.author.name}</p>
                  <p className="text-xs text-muted-foreground">{article.date}</p>
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleFollow}
                className={`opacity-0 transition-opacity group-hover:opacity-100 ${following ? "text-primary opacity-100" : ""}`}
              >
                {following ? (
                  <UserCheck className="h-4 w-4" />
                ) : (
                  <UserPlus className="h-4 w-4" />
                )}
              </Button>
            </div>

            {/* Stats & Actions */}
            <div className="mt-4 flex items-center justify-between border-t pt-4">
              <div className="flex items-center gap-4">
                <button
                  onClick={handleLike}
                  className={`flex items-center gap-1 text-sm transition-colors ${
                    liked ? "text-red-500" : "text-muted-foreground hover:text-red-500"
                  }`}
                >
                  <Heart className={`h-4 w-4 ${liked ? "fill-current" : ""}`} />
                  {likeCount}
                </button>
                <span className="flex items-center gap-1 text-sm text-muted-foreground">
                  <MessageCircle className="h-4 w-4" />
                  {article.comments.length}
                </span>
              </div>
              <div className="flex items-center gap-1">
                <EmojiReactions articleId={article.id} compact />
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleBookmark}
                  className={bookmarked ? "text-primary" : ""}
                >
                  {bookmarked ? (
                    <BookmarkCheck className="h-4 w-4" />
                  ) : (
                    <Bookmark className="h-4 w-4" />
                  )}
                </Button>
                <Button variant="ghost" size="icon" onClick={handleShare}>
                  <Share2 className="h-4 w-4" />
                </Button>
              </div>
            </div>

            {/* Tags - show only first 3 */}
            {article.tags.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {article.tags.slice(0, 3).map((tag) => (
                  <Badge key={tag} variant="outline" className="text-xs">
                    {tag}
                  </Badge>
                ))}
                {article.tags.length > 3 && (
                  <span className="text-xs text-muted-foreground">
                    +{article.tags.length - 3}
                  </span>
                )}
              </div>
            )}

            {/* Reading Progress */}
            {readingProgress > 0 && (
              <div className="mt-3">
                <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
                  <span>{readingProgress === 100 ? "مقروء" : "قرأت"}</span>
                  <span>{readingProgress}%</span>
                </div>
                <div className="h-1 w-full rounded-full bg-muted overflow-hidden">
                  <div
                    className={`h-full transition-all ${readingProgress === 100 ? "bg-green-500" : "bg-primary"}`}
                    style={{ width: `${readingProgress}%` }}
                  />
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </Link>
    )
  }

  // Default/Compact variant
  return (
    <Link href={`/space/${article.id}`}>
      <Card className="group overflow-hidden transition-all hover:border-primary/50 relative">
        {/* Reading Progress Bar at bottom of card */}
        {readingProgress > 0 && (
          <div className="absolute bottom-0 start-0 end-0 h-1 bg-muted">
            <div
              className={`h-full transition-all ${readingProgress === 100 ? "bg-green-500" : "bg-primary"}`}
              style={{ width: `${readingProgress}%` }}
            />
          </div>
        )}
        <CardContent className="flex gap-4 p-4">
          {/* Thumbnail */}
          {article.coverImage && variant !== "compact" && (
            <div className="relative h-24 w-32 shrink-0 overflow-hidden rounded-lg bg-muted">
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
            <h3 className="font-semibold group-hover:text-primary transition-colors line-clamp-1">
              {article.title}
            </h3>
            <p className="mt-1 text-sm text-muted-foreground line-clamp-1">
              {article.excerpt}
            </p>

            <div className="mt-2 flex items-center gap-3">
              {/* Author Avatar */}
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
              <span className="text-xs text-muted-foreground">{article.date}</span>
              <span className="text-xs text-muted-foreground">{article.readTime}</span>
              {readingProgress > 0 && readingProgress < 100 && (
                <span className="text-xs text-primary font-medium">متابعة القراءة</span>
              )}
              {readingProgress === 100 && (
                <span className="text-xs text-green-500 font-medium">✓ مقروء</span>
              )}
            </div>
          </div>

          {/* Actions */}
          <div className="flex flex-col items-end justify-between">
            <button
              onClick={handleLike}
              className={`flex items-center gap-1 text-sm transition-colors ${
                liked ? "text-red-500" : "text-muted-foreground hover:text-red-500"
              }`}
            >
              <Heart className={`h-4 w-4 ${liked ? "fill-current" : ""}`} />
              {likeCount}
            </button>
            <div className="flex items-center">
              <EmojiReactions articleId={article.id} compact />
              <Button
                variant="ghost"
                size="icon"
                className={`h-11 w-11 ${bookmarked ? "text-primary" : ""}`}
                onClick={handleBookmark}
              >
                {bookmarked ? (
                  <BookmarkCheck className="h-4 w-4" />
                ) : (
                  <Bookmark className="h-4 w-4" />
                )}
              </Button>
              <Button variant="ghost" size="icon" className="h-11 w-11" onClick={handleShare}>
                <Share2 className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </Link>
  )
}
