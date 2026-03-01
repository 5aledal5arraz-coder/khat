"use client"

import { useState, useEffect, useRef } from "react"
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
  Bot,
  Send,
  Download,
  Loader2,
  Flag,
} from "lucide-react"
import {
  isArticleLiked,
  toggleArticleLike,
  isThoughtLiked,
  toggleThoughtLike,
} from "@/lib/space-storage"
import { toggleLike, createReply as apiCreateReply, createReport } from "@/lib/space-api"
import { useAuth } from "@/components/providers/auth-provider"
import { toast } from "@/lib/use-toast"
import { formatArabicCount } from "@/lib/utils"
import type { FeedItem, Article, Thought } from "@/types/space"

interface FeedCardProps {
  item: FeedItem
}

// Format date consistently for SSR (no relative time to avoid hydration mismatch)
function formatDate(dateString: string): string {
  const date = new Date(dateString)
  const day = String(date.getDate()).padStart(2, "0")
  const month = String(date.getMonth() + 1).padStart(2, "0")
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

    const arTime = (n: number, singular: string): string => {
      const forms = { "دقيقة": ["دقيقة", "دقيقتين", "دقائق"], "ساعة": ["ساعة", "ساعتين", "ساعات"], "يوم": ["يوم", "يومين", "أيام"] } as const
      const [sing, dual, plural] = forms[singular as keyof typeof forms]
      if (n === 1) return sing
      if (n === 2) return dual
      if (n <= 10) return `${n} ${plural}`
      return `${n} ${sing}`
    }

    let result: string
    if (diffMins < 1) result = "الآن"
    else if (diffMins < 60) result = `منذ ${arTime(diffMins, "دقيقة")}`
    else if (diffHours < 24) result = `منذ ${arTime(diffHours, "ساعة")}`
    else if (diffDays < 7) result = `منذ ${arTime(diffDays, "يوم")}`
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
                  <p className="font-medium text-sm flex items-center gap-1.5">
                    {article.author.name}
                    {article.author.isBot && (
                      <Bot className="h-3.5 w-3.5 text-primary" aria-label="كاتب آلي" />
                    )}
                  </p>
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
              <span className="text-xs text-muted-foreground flex items-center gap-1">
                {article.author.name}
                {article.author.isBot && <Bot className="h-3 w-3 text-primary" />}
              </span>
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
  const { user } = useAuth()
  const [liked, setLiked] = useState(false)
  const [likeCount, setLikeCount] = useState(thought.likes)
  const [showReplies, setShowReplies] = useState(false)
  const [showReplyInput, setShowReplyInput] = useState(false)
  const [replyContent, setReplyContent] = useState("")
  const [replies, setReplies] = useState(thought.replies)
  const [isCapturing, setIsCapturing] = useState(false)
  const cardRef = useRef<HTMLDivElement>(null)

  const MAX_REPLY_LENGTH = 280

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLiked(isThoughtLiked(thought.id))
  }, [thought.id])

  const handleAddReply = async () => {
    if (!replyContent.trim() || replyContent.length > MAX_REPLY_LENGTH) return

    // If logged in, use API
    if (user) {
      const { error } = await apiCreateReply(thought.id, { content: replyContent.trim() })
      if (error) {
        toast({ title: "خطأ", description: error, variant: "destructive", duration: 3000 })
        return
      }
    }

    const displayName = user?.displayName || user?.email?.split("@")[0] || "أنت"

    const newReply = {
      id: `reply-${crypto.randomUUID()}`,
      authorName: displayName,
      content: replyContent.trim(),
      date: new Date().toISOString(),
      likes: 0,
    }

    setReplies((prev) => [...prev, newReply])
    setReplyContent("")
    setShowReplyInput(false)
    setShowReplies(true)
    toast({
      title: "تم إضافة ردك",
      variant: "success",
      duration: 2000,
    })
  }

  const handleReport = async () => {
    if (!user) {
      toast({ title: "سجّل دخولك أولاً", variant: "destructive", duration: 2000 })
      return
    }
    const { error } = await createReport({
      target_type: "thought",
      target_id: thought.id,
      reason: "inappropriate",
    })
    if (error) {
      toast({ title: "خطأ", description: error, variant: "destructive", duration: 3000 })
      return
    }
    toast({ title: "تم إرسال البلاغ", description: "شكراً لمساعدتك في تحسين المجتمع", variant: "success", duration: 2000 })
  }

  // Get author profile link
  const authorProfileLink = `/space/author/${thought.author.id}`

  const handleLike = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    const newLiked = toggleThoughtLike(thought.id)
    setLiked(newLiked)
    setLikeCount((prev) => (newLiked ? prev + 1 : prev - 1))
    // Also call API if logged in (optimistic UI)
    if (user) {
      toggleLike("thought", thought.id).catch(() => {})
    }
    toast({
      title: newLiked ? "تم الإعجاب" : "تم إزالة الإعجاب",
      variant: "success",
      duration: 2000,
    })
  }

  // Capture thought card as image with Khat branding
  const captureAndShare = async (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()

    if (!cardRef.current || isCapturing) return

    setIsCapturing(true)

    try {
      // Clone the actual card element from the page (fonts already applied)
      const originalCard = cardRef.current
      const cardClone = originalCard.cloneNode(true) as HTMLElement

      // Remove interactive elements and replies from clone
      const replySection = cardClone.querySelector('[class*="mt-4 space-y-3 border-t"]')
      if (replySection) replySection.remove()

      // Remove action buttons
      const buttons = cardClone.querySelectorAll('button')
      buttons.forEach(btn => btn.remove())

      // Create wrapper with branding
      const wrapper = document.createElement("div")
      const isDark = document.documentElement.classList.contains("dark")
      wrapper.style.cssText = `
        position: fixed;
        left: 0;
        top: 0;
        background: ${isDark ? "linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)" : "linear-gradient(135deg, #f8f9fa 0%, #e9ecef 100%)"};
        padding: 24px;
        border-radius: 16px;
        width: 420px;
        direction: rtl;
        z-index: 99999;
        pointer-events: none;
      `

      // Style the cloned card
      cardClone.style.cssText = `
        background: ${isDark ? "hsl(212 30% 10%)" : "hsl(0 0% 100%)"};
        border-radius: 12px;
        border: 1px solid ${isDark ? "hsl(213 31% 19%)" : "hsl(0 0% 87%)"};
        padding: 16px;
        color: ${isDark ? "hsl(0 0% 95%)" : "hsl(0 0% 10%)"};
      `

      // Add Khat branding footer
      const branding = document.createElement("div")
      branding.style.cssText = `
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-top: 16px;
        padding-top: 12px;
        color: ${isDark ? "rgba(255,255,255,0.9)" : "rgba(0,0,0,0.8)"};
        font-family: inherit;
      `
      branding.innerHTML = `
        <div style="display: flex; align-items: center;">
          <img src="/logo.png" alt="KHAT" style="width: 48px; height: 48px; border-radius: 8px; object-fit: cover;" />
        </div>
        <span style="font-size: 14px; color: ${isDark ? "hsl(36 5% 54%)" : "hsl(0 0% 40%)"};">khatpodcast.com</span>
      `

      wrapper.appendChild(cardClone)
      wrapper.appendChild(branding)
      document.body.appendChild(wrapper)

      // Small delay to ensure rendering
      await new Promise(resolve => setTimeout(resolve, 50))

      // Capture the screenshot using modern-screenshot (better font support)
      const { domToPng } = await import("modern-screenshot")
      const dataUrl = await domToPng(wrapper, {
        scale: 2,
        quality: 1,
      })

      // Clean up
      document.body.removeChild(wrapper)

      // Convert data URL to blob
      const response = await fetch(dataUrl)
      const blob = await response.blob()

      const file = new File([blob], `khat-thought-${thought.id}.png`, { type: "image/png" })

      // Try Web Share API first (works on mobile)
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        try {
          await navigator.share({
            files: [file],
            title: "خاطرة من حبر",
            text: thought.content.substring(0, 100) + (thought.content.length > 100 ? "..." : ""),
          })
          toast({
            title: "تم المشاركة بنجاح",
            variant: "success",
            duration: 2000,
          })
        } catch (err) {
          if (err instanceof Error && err.name !== "AbortError") {
            // Fallback to download
            downloadImage(dataUrl)
          }
        }
      } else {
        // Fallback: download the image
        downloadImage(dataUrl)
      }
    } catch (error) {
      console.error("Screenshot failed:", error)
      toast({
        title: "حدث خطأ في إنشاء الصورة",
        variant: "destructive",
        duration: 2000,
      })
    } finally {
      setIsCapturing(false)
    }
  }

  const downloadImage = (dataUrl: string) => {
    const link = document.createElement("a")
    link.download = `khat-thought-${thought.id}.png`
    link.href = dataUrl
    link.click()
    toast({
      title: "تم تحميل الصورة",
      description: "يمكنك الآن مشاركتها على أي منصة",
      variant: "success",
      duration: 3000,
    })
  }

  return (
    <Card ref={cardRef} className="transition-all hover:border-primary/20">
      <CardContent className="p-4">
        {/* Author Header */}
        <div className="flex items-center gap-3 mb-3">
          <Link href={authorProfileLink} className="relative h-10 w-10 shrink-0 overflow-hidden rounded-full bg-muted hover:ring-2 hover:ring-primary/50 transition-all">
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
          </Link>
          <div className="flex-1 min-w-0">
            <Link href={authorProfileLink} className="font-medium text-sm flex items-center gap-1.5 hover:text-primary transition-colors w-fit">
              {thought.author.name}
              {thought.author.isBot && (
                <Bot className="h-3.5 w-3.5 text-primary" aria-label="كاتب آلي" />
              )}
            </Link>
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

            {/* Reply button - always visible */}
            <button
              onClick={() => {
                if (replies.length > 0) {
                  setShowReplies(!showReplies)
                } else {
                  setShowReplyInput(!showReplyInput)
                }
              }}
              className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-primary transition-colors"
            >
              <MessageCircle className="h-4 w-4" />
              <span>{replies.length > 0 ? formatArabicCount(replies.length, "رد") : "رد"}</span>
              {replies.length > 0 && (
                showReplies ? (
                  <ChevronUp className="h-3 w-3" />
                ) : (
                  <ChevronDown className="h-3 w-3" />
                )
              )}
            </button>
          </div>

          <div className="flex items-center gap-1">
            {user && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleReport}
                className="text-muted-foreground hover:text-destructive px-2"
                title="إبلاغ"
              >
                <Flag className="h-4 w-4" />
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={captureAndShare}
              className="text-muted-foreground hover:text-primary"
            >
              <Share2 className="h-4 w-4 me-1" />
              مشاركة
            </Button>
          </div>
        </div>

        {/* Replies Section */}
        {(showReplies || showReplyInput) && (
          <div className="mt-4 space-y-3 border-t pt-4">
            {/* Existing Replies */}
            {replies.map((reply) => (
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
                    <span className="text-sm font-medium flex items-center gap-1">
                      {reply.authorName}
                      {/* Show bot indicator if avatar URL contains 'bot-' */}
                      {reply.authorAvatar?.includes("bot-") && (
                        <Bot className="h-3 w-3 text-primary" aria-label="كاتب آلي" />
                      )}
                    </span>
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

            {/* Reply Input */}
            <div className="flex gap-3">
              <div className="relative h-8 w-8 shrink-0 overflow-hidden rounded-full bg-primary/10">
                <div className="flex h-full w-full items-center justify-center text-xs font-bold text-primary">
                  أ
                </div>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={replyContent}
                    onChange={(e) => setReplyContent(e.target.value)}
                    placeholder="اكتب رداً..."
                    className="flex-1 rounded-full border bg-background px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                    maxLength={MAX_REPLY_LENGTH}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault()
                        handleAddReply()
                      }
                    }}
                  />
                  <Button
                    size="sm"
                    onClick={handleAddReply}
                    disabled={!replyContent.trim() || replyContent.length > MAX_REPLY_LENGTH}
                    className="rounded-full px-3"
                  >
                    <Send className="h-4 w-4" />
                  </Button>
                </div>
                {replyContent.length > 0 && (
                  <p className={`mt-1 text-xs ${replyContent.length > MAX_REPLY_LENGTH ? "text-red-500" : "text-muted-foreground"}`}>
                    {replyContent.length}/{MAX_REPLY_LENGTH}
                  </p>
                )}
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
