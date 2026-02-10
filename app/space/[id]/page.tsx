"use client"

import { useState, useEffect, useRef, useCallback, useMemo } from "react"
import DOMPurify from "dompurify"
import { useParams } from "next/navigation"
import Link from "next/link"
import Image from "next/image"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Textarea } from "@/components/ui/textarea"
import {
  ArrowRight,
  Heart,
  MessageCircle,
  Share2,
  Bookmark,
  BookmarkCheck,
  UserPlus,
  UserCheck,
  Play,
  Clock,
  Calendar,
  Send,
} from "lucide-react"
import {
  isArticleLiked,
  toggleArticleLike,
  isFollowing,
  followAuthor,
  unfollowAuthor,
  isBookmarked,
  toggleBookmark,
  setArticleProgress,
  getArticleProgress,
} from "@/lib/space-storage"
import { toast } from "@/lib/use-toast"
import { getRelatedArticles, getArticleById } from "@/lib/space-data"
import { EmojiReactions } from "@/components/space/emoji-reactions"
import { formatArabicCount } from "@/lib/utils"
import type { Article, Comment } from "@/types/space"

const MAX_COMMENT_LENGTH = 500 // Character limit for comments

export default function ArticleDetailPage() {
  const params = useParams()
  const articleId = params.id as string

  const [article, setArticle] = useState<Article | null>(null)
  const [mounted, setMounted] = useState(false)
  const [liked, setLiked] = useState(false)
  const [likeCount, setLikeCount] = useState(0)
  const [bookmarked, setBookmarked] = useState(false)
  const [following, setFollowing] = useState(false)
  const [newComment, setNewComment] = useState("")
  const [comments, setComments] = useState<Comment[]>([])
  const [relatedArticles, setRelatedArticles] = useState<Article[]>([])
  const [readingProgress, setReadingProgress] = useState(0)
  const articleRef = useRef<HTMLElement>(null)

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true)

    const foundArticle = getArticleById(articleId)
    if (foundArticle) {
      setArticle(foundArticle)
      setLikeCount(foundArticle.likes)
      setComments(foundArticle.comments)
      setRelatedArticles(getRelatedArticles(articleId, foundArticle.tags))
      setLiked(isArticleLiked(articleId))
      setBookmarked(isBookmarked(articleId))
      setFollowing(isFollowing(foundArticle.author.id))
    }
  }, [articleId])

  // Track reading progress
  const updateProgress = useCallback(() => {
    if (!articleRef.current || !articleId) return

    const article = articleRef.current
    const articleRect = article.getBoundingClientRect()
    const articleTop = articleRect.top + window.scrollY
    const articleHeight = article.offsetHeight
    const windowHeight = window.innerHeight
    const scrollY = window.scrollY

    // Calculate how much of the article has been scrolled past
    const scrolledPast = scrollY + windowHeight - articleTop
    const progress = Math.max(0, Math.min(100, (scrolledPast / articleHeight) * 100))

    setReadingProgress(Math.round(progress))
    setArticleProgress(articleId, progress)
  }, [articleId])

  useEffect(() => {
    if (!mounted) return

    // Set initial progress from storage
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setReadingProgress(getArticleProgress(articleId))

    window.addEventListener("scroll", updateProgress)
    window.addEventListener("resize", updateProgress)
    // Initial calculation
    updateProgress()

    return () => {
      window.removeEventListener("scroll", updateProgress)
      window.removeEventListener("resize", updateProgress)
    }
  }, [mounted, articleId, updateProgress])

  if (!mounted) {
    return (
      <div className="container mx-auto flex min-h-[60vh] items-center justify-center px-4 py-8">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    )
  }

  if (!article) {
    return (
      <div className="container mx-auto px-4 py-8 text-center">
        <h1 className="text-2xl font-bold">المقال غير موجود</h1>
        <p className="mt-2 text-muted-foreground">عذراً، لم نتمكن من العثور على هذا المقال</p>
        <Link href="/space" className="mt-4 inline-block">
          <Button>العودة لحبر</Button>
        </Link>
      </div>
    )
  }

  const handleLike = () => {
    const newLiked = toggleArticleLike(article.id)
    setLiked(newLiked)
    setLikeCount((prev) => (newLiked ? prev + 1 : prev - 1))
    toast({
      title: newLiked ? "تم الإعجاب" : "تم إزالة الإعجاب",
      variant: "success",
      duration: 2000,
    })
  }

  const handleBookmark = () => {
    const newBookmarked = toggleBookmark(article.id)
    setBookmarked(newBookmarked)
    toast({
      title: newBookmarked ? "تم الحفظ" : "تم إزالة الحفظ",
      description: newBookmarked ? "تمت إضافة المقال للمحفوظات" : "تمت إزالة المقال من المحفوظات",
      variant: "success",
      duration: 2000,
    })
  }

  const handleFollow = () => {
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

  const handleShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: article.title,
          text: article.excerpt,
          url: window.location.href,
        })
      } catch (err) {
        // User cancelled the share dialog - this is expected behavior
        if (err instanceof Error && err.name !== "AbortError") {
          console.error("Share failed:", err)
        }
      }
    } else {
      navigator.clipboard.writeText(window.location.href)
      toast({
        title: "تم نسخ الرابط",
        variant: "success",
        duration: 2000,
      })
    }
  }

  const handleAddComment = () => {
    if (!newComment.trim()) return

    if (newComment.length > MAX_COMMENT_LENGTH) {
      toast({
        title: "التعليق طويل جداً",
        description: `الحد الأقصى ${MAX_COMMENT_LENGTH} حرف`,
        variant: "destructive",
        duration: 2000,
      })
      return
    }

    const comment: Comment = {
      id: `comment-${Date.now()}`,
      authorName: "أنت",
      text: newComment.trim(),
      date: new Date().toISOString().split("T")[0],
      likes: 0,
    }

    setComments((prev) => [comment, ...prev])
    setNewComment("")
    toast({
      title: "تم إضافة التعليق",
      variant: "success",
      duration: 2000,
    })
  }

  const isCommentOverLimit = newComment.length > MAX_COMMENT_LENGTH
  const commentCharsLeft = MAX_COMMENT_LENGTH - newComment.length

  return (
    <>
      {/* Reading Progress Bar - Fixed at top */}
      <div className="fixed top-0 start-0 end-0 z-50 h-1 bg-muted">
        <div
          className="h-full bg-primary transition-all duration-150"
          style={{ width: `${readingProgress}%` }}
        />
      </div>

      <div className="container mx-auto px-4 py-8">
        {/* Header */}
      <div className="mb-6">
        <Link href="/space">
          <Button variant="ghost" size="sm" className="gap-2">
            <ArrowRight className="h-4 w-4" />
            العودة لحبر
          </Button>
        </Link>
      </div>

      <div className="flex flex-col gap-8 lg:flex-row">
        {/* Main Content */}
        <article ref={articleRef} className="flex-1 min-w-0">
          {/* Cover Image */}
          {article.coverImage && (
            <div className="relative mb-6 aspect-[21/9] overflow-hidden rounded-xl">
              <Image
                src={article.coverImage}
                alt={article.title}
                fill
                className="object-cover"
                priority
              />
            </div>
          )}

          {/* Title */}
          <h1 className="text-3xl font-bold leading-tight md:text-4xl">
            {article.title}
          </h1>

          {/* Meta */}
          <div className="mt-4 flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
            <span className="flex items-center gap-1">
              <Calendar className="h-4 w-4" />
              {article.date}
            </span>
            <span className="flex items-center gap-1">
              <Clock className="h-4 w-4" />
              {article.readTime}
            </span>
          </div>

          {/* Episode Link */}
          {article.episodeTitle && (
            <Link
              href={`/episodes/${article.episodeSlug}`}
              className="mt-4 flex items-center gap-3 rounded-lg border border-primary/30 bg-primary/5 p-4 transition-colors hover:bg-primary/10"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/20">
                <Play className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">مستوحى من حلقة</p>
                <p className="font-medium">{article.episodeTitle}</p>
              </div>
            </Link>
          )}

          {/* Tags */}
          <div className="mt-4 flex flex-wrap gap-2">
            {article.tags.map((tag) => (
              <Link key={tag} href={`/space?tag=${encodeURIComponent(tag)}`}>
                <Badge variant="secondary" className="cursor-pointer hover:bg-secondary/80">
                  {tag}
                </Badge>
              </Link>
            ))}
          </div>

          {/* Content */}
          <div className="prose prose-lg prose-invert mt-8 max-w-none">
            {article.content ? (
              <div dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(article.content) }} />
            ) : (
              article.excerpt.split("\n").map((paragraph, i) => (
                <p key={i} className="mb-4 leading-relaxed">
                  {paragraph}
                </p>
              ))
            )}
          </div>

          {/* Emoji Reactions */}
          <div className="mt-8 rounded-lg border bg-muted/30 p-4">
            <EmojiReactions articleId={article.id} />
          </div>

          {/* Actions Bar */}
          <div className="mt-4 flex items-center justify-between border-t border-b py-4">
            <div className="flex items-center gap-4">
              <button
                onClick={handleLike}
                className={`flex items-center gap-2 rounded-full px-4 py-2 transition-colors ${
                  liked
                    ? "bg-red-500/10 text-red-500"
                    : "bg-muted hover:bg-muted/80 text-muted-foreground"
                }`}
              >
                <Heart className={`h-5 w-5 ${liked ? "fill-current" : ""}`} />
                <span>{likeCount}</span>
              </button>

              <button
                onClick={handleBookmark}
                className={`flex items-center gap-2 rounded-full px-4 py-2 transition-colors ${
                  bookmarked
                    ? "bg-primary/10 text-primary"
                    : "bg-muted hover:bg-muted/80 text-muted-foreground"
                }`}
              >
                {bookmarked ? (
                  <BookmarkCheck className="h-5 w-5" />
                ) : (
                  <Bookmark className="h-5 w-5" />
                )}
                <span>{bookmarked ? "محفوظ" : "حفظ"}</span>
              </button>
            </div>

            <Button variant="outline" onClick={handleShare} className="gap-2">
              <Share2 className="h-4 w-4" />
              مشاركة
            </Button>
          </div>

          {/* Author Card */}
          <Card className="mt-8">
            <CardContent className="flex items-center gap-4 p-6">
              <Link href={`/space/author/${article.author.id}`}>
                <div className="relative h-16 w-16 overflow-hidden rounded-full bg-muted">
                  {article.author.avatar ? (
                    <Image
                      src={article.author.avatar}
                      alt={article.author.name}
                      fill
                      className="object-cover"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-2xl font-bold text-muted-foreground">
                      {article.author.name.charAt(0)}
                    </div>
                  )}
                </div>
              </Link>
              <div className="flex-1">
                <Link href={`/space/author/${article.author.id}`}>
                  <h3 className="font-semibold hover:text-primary transition-colors">
                    {article.author.name}
                  </h3>
                </Link>
                {article.author.bio && (
                  <p className="mt-1 text-sm text-muted-foreground line-clamp-2">
                    {article.author.bio}
                  </p>
                )}
                <p className="mt-1 text-xs text-muted-foreground">
                  {formatArabicCount(article.author.articlesCount, "مقال")} • {formatArabicCount(article.author.followersCount, "متابع")}
                </p>
              </div>
              <Button
                variant={following ? "secondary" : "default"}
                onClick={handleFollow}
                className="gap-2"
              >
                {following ? (
                  <>
                    <UserCheck className="h-4 w-4" />
                    متابَع
                  </>
                ) : (
                  <>
                    <UserPlus className="h-4 w-4" />
                    متابعة
                  </>
                )}
              </Button>
            </CardContent>
          </Card>

          {/* Comments Section */}
          <section className="mt-8">
            <h2 className="flex items-center gap-2 text-xl font-semibold">
              <MessageCircle className="h-5 w-5" />
              التعليقات ({formatArabicCount(comments.length, "تعليق")})
            </h2>

            {/* Add Comment */}
            <div className="mt-4 space-y-3">
              <Textarea
                value={newComment}
                onChange={(e) => setNewComment(e.target.value)}
                placeholder="شاركنا رأيك..."
                className={`min-h-[100px] resize-none ${isCommentOverLimit ? "border-red-500 focus-visible:ring-red-500" : ""}`}
                maxLength={MAX_COMMENT_LENGTH}
              />
              <div className="flex items-center justify-between">
                {/* Character Counter */}
                <span className={`text-xs tabular-nums ${
                  isCommentOverLimit
                    ? "text-red-500"
                    : commentCharsLeft <= 50
                      ? "text-amber-500"
                      : "text-muted-foreground"
                }`}>
                  {newComment.length > 0 && `${newComment.length}/${MAX_COMMENT_LENGTH}`}
                </span>
                <Button
                  onClick={handleAddComment}
                  disabled={!newComment.trim() || isCommentOverLimit}
                  className="gap-2"
                >
                  <Send className="h-4 w-4" />
                  إرسال
                </Button>
              </div>
            </div>

            {/* Comments List */}
            <div className="mt-6 space-y-4">
              {comments.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">
                  كن أول من يعلق على هذا المقال
                </p>
              ) : (
                comments.map((comment) => (
                  <Card key={comment.id}>
                    <CardContent className="p-4">
                      <div className="flex items-start gap-3">
                        <div className="h-10 w-10 shrink-0 overflow-hidden rounded-full bg-muted">
                          {comment.authorAvatar ? (
                            <Image
                              src={comment.authorAvatar}
                              alt={comment.authorName}
                              width={40}
                              height={40}
                              className="object-cover"
                            />
                          ) : (
                            <div className="flex h-full w-full items-center justify-center font-bold text-muted-foreground">
                              {comment.authorName.charAt(0)}
                            </div>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-medium">{comment.authorName}</span>
                            <span className="text-xs text-muted-foreground">{comment.date}</span>
                          </div>
                          <p className="mt-1 text-muted-foreground">{comment.text}</p>
                          <button className="mt-2 flex items-center gap-1 text-xs text-muted-foreground hover:text-red-500 transition-colors">
                            <Heart className="h-3 w-3" />
                            {comment.likes}
                          </button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))
              )}
            </div>
          </section>
        </article>

        {/* Sidebar */}
        <aside className="w-full shrink-0 space-y-6 lg:w-80">
          {/* Related Articles */}
          {relatedArticles.length > 0 && (
            <Card>
              <CardContent className="p-4">
                <h3 className="mb-4 font-semibold">مقالات ذات صلة</h3>
                <div className="space-y-4">
                  {relatedArticles.map((related) => (
                    <Link
                      key={related.id}
                      href={`/space/${related.id}`}
                      className="flex gap-3 group"
                    >
                      {related.coverImage && (
                        <div className="relative h-16 w-20 shrink-0 overflow-hidden rounded-lg bg-muted">
                          <Image
                            src={related.coverImage}
                            alt={related.title}
                            fill
                            className="object-cover"
                          />
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <h4 className="font-medium line-clamp-2 group-hover:text-primary transition-colors">
                          {related.title}
                        </h4>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {related.author.name}
                        </p>
                      </div>
                    </Link>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Share Card */}
          <Card className="border-primary/20 bg-primary/5">
            <CardContent className="p-4 text-center">
              <h3 className="font-semibold">أعجبك المقال؟</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                شاركه مع أصدقائك
              </p>
              <Button onClick={handleShare} className="mt-3 w-full gap-2">
                <Share2 className="h-4 w-4" />
                مشاركة المقال
              </Button>
            </CardContent>
          </Card>
        </aside>
        </div>
      </div>
    </>
  )
}
