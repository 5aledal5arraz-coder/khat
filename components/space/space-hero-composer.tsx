"use client"

import { useState } from "react"
import Link from "next/link"
import Image from "next/image"
import { useRouter } from "next/navigation"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { PenSquare, Send, LogIn } from "lucide-react"
import { toast } from "@/lib/use-toast"
import { useAuth } from "@/components/providers/auth-provider"
import { createThought } from "@/lib/space-api"

const MAX_CHARACTERS = 280

interface SpaceHeroComposerProps {
  onPost?: (content: string) => void
}

export function SpaceHeroComposer({ onPost }: SpaceHeroComposerProps) {
  const { user, profile, isLoading } = useAuth()
  const router = useRouter()
  const [content, setContent] = useState("")
  const [isPosting, setIsPosting] = useState(false)
  const [isFocused, setIsFocused] = useState(false)

  const charactersLeft = MAX_CHARACTERS - content.length
  const isOverLimit = charactersLeft < 0
  const isEmpty = content.trim().length === 0

  const displayName = profile?.display_name || user?.email?.split("@")[0] || "مستخدم"
  const avatarUrl = profile?.avatar_url

  const handlePost = async () => {
    if (!user) {
      router.push("/auth/login?redirect=/space")
      return
    }

    if (isEmpty || isOverLimit) return

    setIsPosting(true)

    const { error } = await createThought({ content: content.trim() })

    if (error) {
      toast({
        title: "خطأ",
        description: error,
        variant: "destructive",
        duration: 3000,
      })
      setIsPosting(false)
      return
    }

    onPost?.(content)
    setContent("")
    setIsFocused(false)
    setIsPosting(false)

    toast({
      title: "تم نشر خاطرتك",
      description: "شكراً لمشاركتك مع المجتمع",
      variant: "success",
      duration: 2000,
    })

    router.refresh()
  }

  const getCharacterCountColor = () => {
    if (isOverLimit) return "text-red-500"
    if (charactersLeft <= 20) return "text-amber-500"
    return "text-muted-foreground"
  }

  // Not logged in state
  if (!isLoading && !user) {
    return (
      <Card className="border-primary/20 bg-gradient-to-br from-primary/5 via-transparent to-transparent">
        <CardContent className="p-5">
          <div className="flex items-center justify-between gap-4">
            <p className="text-muted-foreground text-sm">
              سجّل دخولك لمشاركة أفكارك مع المجتمع
            </p>
            <div className="flex items-center gap-2">
              <Link href="/auth/login?redirect=/space">
                <Button size="sm" className="gap-2">
                  <LogIn className="h-4 w-4" />
                  تسجيل الدخول
                </Button>
              </Link>
            </div>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="border-primary/20 bg-gradient-to-br from-primary/5 via-transparent to-transparent">
      <CardContent className="p-5">
        <div className="flex gap-4">
          {/* Avatar */}
          <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-full bg-muted ring-2 ring-primary/20">
            {avatarUrl ? (
              <Image
                src={avatarUrl}
                alt={displayName}
                fill
                className="object-cover"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-lg font-bold text-muted-foreground">
                {displayName.charAt(0)}
              </div>
            )}
          </div>

          {/* Input Area */}
          <div className="flex-1 min-w-0">
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              onFocus={() => setIsFocused(true)}
              placeholder="شارك فكرة مع المجتمع..."
              className="w-full resize-none border-0 bg-transparent p-0 text-base placeholder:text-muted-foreground focus:outline-none focus:ring-0"
              rows={isFocused || content ? 3 : 1}
              dir="rtl"
            />

            {/* Footer - Always visible but expands on focus */}
            <div className={`flex items-center justify-between border-t pt-3 mt-3 transition-opacity ${
              isFocused || content ? "opacity-100" : "opacity-60"
            }`}>
              <div className="flex items-center gap-3">
                {/* Character count */}
                <span className={`text-xs tabular-nums ${getCharacterCountColor()}`}>
                  {content.length > 0 && `${content.length}/${MAX_CHARACTERS}`}
                </span>
              </div>

              <div className="flex items-center gap-2">
                {/* Write Article Link */}
                <Link href="/space/write">
                  <Button variant="outline" size="sm" className="gap-2">
                    <PenSquare className="h-4 w-4" />
                    <span className="hidden sm:inline">مقال مفصّل</span>
                    <span className="sm:hidden">مقال</span>
                  </Button>
                </Link>

                {/* Post Thought Button */}
                <Button
                  size="sm"
                  onClick={handlePost}
                  disabled={isEmpty || isOverLimit || isPosting}
                  className="gap-2"
                >
                  <Send className="h-4 w-4" />
                  {isPosting ? "جارٍ النشر..." : "نشر"}
                </Button>
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
