"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { SmilePlus } from "lucide-react"
import {
  getArticleReactions,
  toggleReaction,
  type ReactionType,
} from "@/lib/space-storage"
import { toast } from "@/lib/use-toast"
import { cn } from "@/lib/utils"

interface EmojiReactionsProps {
  articleId: string
  compact?: boolean
}

const reactions: { type: ReactionType; emoji: string; label: string }[] = [
  { type: "clap", emoji: "👏", label: "تصفيق" },
  { type: "fire", emoji: "🔥", label: "رائع" },
  { type: "bulb", emoji: "💡", label: "ملهم" },
  { type: "heart", emoji: "❤️", label: "أحببته" },
]

export function EmojiReactions({ articleId, compact = false }: EmojiReactionsProps) {
  const [userReactions, setUserReactions] = useState<ReactionType[]>([])
  const [isOpen, setIsOpen] = useState(false)

  useEffect(() => {
    setUserReactions(getArticleReactions(articleId))
  }, [articleId])

  const handleReaction = (type: ReactionType, e?: React.MouseEvent) => {
    e?.preventDefault()
    e?.stopPropagation()

    const newReactions = toggleReaction(articleId, type)
    setUserReactions(newReactions)

    const reaction = reactions.find((r) => r.type === type)
    const added = newReactions.includes(type)

    toast({
      title: added ? `${reaction?.emoji} ${reaction?.label}` : "تم إزالة التفاعل",
      variant: "success",
      duration: 2000,
    })

    setIsOpen(false)
  }

  if (compact) {
    return (
      <Popover open={isOpen} onOpenChange={setIsOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="h-11 w-11"
            onClick={(e) => {
              e.preventDefault()
              e.stopPropagation()
            }}
          >
            {userReactions.length > 0 ? (
              <span className="text-sm">
                {reactions.find((r) => r.type === userReactions[0])?.emoji}
              </span>
            ) : (
              <SmilePlus className="h-4 w-4" />
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent
          className="w-auto p-2"
          align="end"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex gap-1">
            {reactions.map((reaction) => (
              <button
                key={reaction.type}
                onClick={(e) => handleReaction(reaction.type, e)}
                className={cn(
                  "flex h-11 w-11 items-center justify-center rounded-full text-lg transition-all hover:scale-110 hover:bg-muted",
                  userReactions.includes(reaction.type) && "bg-primary/10 ring-2 ring-primary"
                )}
                title={reaction.label}
                aria-label={reaction.label}
                aria-pressed={userReactions.includes(reaction.type)}
              >
                {reaction.emoji}
              </button>
            ))}
          </div>
        </PopoverContent>
      </Popover>
    )
  }

  return (
    <div className="flex items-center gap-2">
      <span className="text-sm text-muted-foreground">تفاعل:</span>
      <div className="flex gap-1">
        {reactions.map((reaction) => (
          <button
            key={reaction.type}
            onClick={(e) => handleReaction(reaction.type, e)}
            className={cn(
              "flex h-12 w-12 items-center justify-center rounded-full text-xl transition-all hover:scale-110 hover:bg-muted",
              userReactions.includes(reaction.type) && "bg-primary/10 ring-2 ring-primary"
            )}
            title={reaction.label}
            aria-label={reaction.label}
            aria-pressed={userReactions.includes(reaction.type)}
          >
            {reaction.emoji}
          </button>
        ))}
      </div>
    </div>
  )
}
