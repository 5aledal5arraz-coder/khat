"use client"

import { useState } from "react"
import Link from "next/link"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Bookmark, Quote, Clock, Trash2, Headphones } from "lucide-react"
import { getSavedItems, removeSavedItem, SavedItem } from "@/lib/saved"

function EmptyState({ type }: { type: string }) {
  const messages: Record<string, { icon: typeof Bookmark; text: string }> = {
    episodes: { icon: Headphones, text: "لم تحفظ أي حلقات بعد" },
    quotes: { icon: Quote, text: "لم تحفظ أي اقتباسات بعد" },
    timestamps: { icon: Clock, text: "لم تحفظ أي لحظات بعد" },
  }

  const { icon: Icon, text } = messages[type] || messages.episodes

  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-secondary">
        <Icon className="h-8 w-8 text-muted-foreground" />
      </div>
      <p className="mt-4 text-muted-foreground">{text}</p>
      <Link href="/episodes" className="mt-4">
        <Button variant="outline">تصفح الحلقات</Button>
      </Link>
    </div>
  )
}

export default function SavedPage() {
  const [savedItems, setSavedItems] = useState<SavedItem[]>(() => {
    if (typeof window === "undefined") return []
    return getSavedItems()
  })
  const [activeTab, setActiveTab] = useState("episodes")

  const handleRemove = (id: string, type: SavedItem["type"]) => {
    removeSavedItem(id, type)
    setSavedItems(getSavedItems())
  }

  const episodes = savedItems.filter((item) => item.type === "episode")
  const quotes = savedItems.filter((item) => item.type === "quote")
  const timestamps = savedItems.filter((item) => item.type === "timestamp")

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold">المحفوظات</h1>
        <p className="mt-2 text-muted-foreground">
          الحلقات والاقتباسات واللحظات التي حفظتها
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="mb-6">
          <TabsTrigger value="episodes" className="gap-2">
            <Headphones className="h-4 w-4" />
            الحلقات ({episodes.length})
          </TabsTrigger>
          <TabsTrigger value="quotes" className="gap-2">
            <Quote className="h-4 w-4" />
            الاقتباسات ({quotes.length})
          </TabsTrigger>
          <TabsTrigger value="timestamps" className="gap-2">
            <Clock className="h-4 w-4" />
            اللحظات ({timestamps.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="episodes">
          {episodes.length === 0 ? (
            <EmptyState type="episodes" />
          ) : (
            <div className="space-y-4">
              {episodes.map((item) => (
                <Card key={item.id}>
                  <CardContent className="flex items-center justify-between p-4">
                    <Link href={`/episodes/${item.slug}`} className="flex-1">
                      <h3 className="font-semibold hover:text-primary">
                        {item.title}
                      </h3>
                      {item.subtitle && (
                        <p className="text-sm text-muted-foreground">
                          {item.subtitle}
                        </p>
                      )}
                    </Link>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleRemove(item.id, "episode")}
                    >
                      <Trash2 className="h-4 w-4 text-muted-foreground hover:text-destructive" />
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="quotes">
          {quotes.length === 0 ? (
            <EmptyState type="quotes" />
          ) : (
            <div className="space-y-4">
              {quotes.map((item) => (
                <Card key={item.id}>
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <blockquote className="text-lg">&ldquo;{item.title}&rdquo;</blockquote>
                        {item.subtitle && (
                          <p className="mt-2 text-sm text-muted-foreground">
                            — {item.subtitle}
                          </p>
                        )}
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleRemove(item.id, "quote")}
                      >
                        <Trash2 className="h-4 w-4 text-muted-foreground hover:text-destructive" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="timestamps">
          {timestamps.length === 0 ? (
            <EmptyState type="timestamps" />
          ) : (
            <div className="space-y-4">
              {timestamps.map((item) => (
                <Card key={item.id}>
                  <CardContent className="flex items-center justify-between p-4">
                    <div className="flex-1">
                      <h3 className="font-semibold">{item.title}</h3>
                      {item.subtitle && (
                        <p className="text-sm text-muted-foreground">
                          {item.subtitle}
                        </p>
                      )}
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleRemove(item.id, "timestamp")}
                    >
                      <Trash2 className="h-4 w-4 text-muted-foreground hover:text-destructive" />
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}
