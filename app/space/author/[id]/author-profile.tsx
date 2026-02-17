"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import Image from "next/image"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  ArrowRight,
  UserPlus,
  UserCheck,
  FileText,
  Users,
  Heart,
  Bot,
} from "lucide-react"
import {
  isFollowing,
  followAuthor,
  unfollowAuthor,
} from "@/lib/space-storage"
import { toast } from "@/lib/use-toast"
import { ArticleCard } from "@/components/space/article-card"
import { formatArabicCount } from "@/lib/utils"
import type { Author, Article } from "@/types/space"

interface AuthorProfileProps {
  author: Author
  articles: Article[]
}

export function AuthorProfile({ author, articles }: AuthorProfileProps) {
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
        description: `لم تعد تتابع ${author.name}`,
        duration: 2000,
      })
    } else {
      followAuthor(author.id)
      toast({
        title: "تمت المتابعة",
        description: `أنت الآن تتابع ${author.name}`,
        variant: "success",
        duration: 2000,
      })
    }
    setFollowing(!following)
  }

  // Get unique tags from author's articles
  const authorTags = [...new Set(articles.flatMap((a) => a.tags))].slice(0, 5)
  const totalLikes = articles.reduce((sum, a) => sum + a.likes, 0)

  return (
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

      {/* Author Profile Card */}
      <Card className="mb-8 overflow-hidden">
        <div className="h-32 bg-gradient-to-r from-primary/20 to-primary/5" />
        <CardContent className="relative px-6 pb-6">
          {/* Avatar */}
          <div className="absolute -top-16 start-6">
            <div className="relative h-32 w-32 overflow-hidden rounded-full border-4 border-background bg-muted">
              {author.avatar ? (
                <Image
                  src={author.avatar}
                  alt={author.name}
                  fill
                  className="object-cover"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-4xl font-bold text-muted-foreground">
                  {author.name.charAt(0)}
                </div>
              )}
            </div>
          </div>

          {/* Follow Button - Top Right */}
          <div className="flex justify-end pt-2">
            <Button
              variant={following ? "secondary" : "default"}
              onClick={handleFollow}
              className="gap-2"
              aria-label={following ? `إلغاء متابعة ${author.name}` : `متابعة ${author.name}`}
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
          </div>

          {/* Author Info */}
          <div className="mt-8">
            <h1 className="text-2xl font-bold flex items-center gap-2">
              {author.name}
              {author.isBot && (
                <Bot className="h-5 w-5 text-primary" aria-label="كاتب آلي" />
              )}
            </h1>
            {author.bio && (
              <p className="mt-2 text-muted-foreground">{author.bio}</p>
            )}

            {/* Stats */}
            <div className="mt-4 flex flex-wrap gap-6">
              <div className="flex items-center gap-2">
                <FileText className="h-5 w-5 text-primary" />
                <span className="font-semibold">{formatArabicCount(articles.length, "مقال")}</span>
              </div>
              <div className="flex items-center gap-2">
                <Users className="h-5 w-5 text-primary" />
                <span className="font-semibold">{formatArabicCount(author.followersCount, "متابع")}</span>
              </div>
              <div className="flex items-center gap-2">
                <Heart className="h-5 w-5 text-primary" />
                <span className="font-semibold">{formatArabicCount(totalLikes, "إعجاب")}</span>
              </div>
            </div>

            {/* Tags */}
            {authorTags.length > 0 && (
              <div className="mt-4">
                <p className="mb-2 text-sm text-muted-foreground">يكتب عن:</p>
                <div className="flex flex-wrap gap-2">
                  {authorTags.map((tag) => (
                    <Link key={tag} href={`/space?tag=${encodeURIComponent(tag)}`}>
                      <Badge variant="secondary" className="cursor-pointer hover:bg-secondary/80">
                        {tag}
                      </Badge>
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Articles Section */}
      <section>
        <h2 className="mb-4 text-xl font-semibold">
          مقالات {author.name}
        </h2>

        {articles.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <p className="text-muted-foreground">لم ينشر هذا الكاتب أي مقالات بعد</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {articles.map((article) => (
              <ArticleCard key={article.id} article={article} />
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
