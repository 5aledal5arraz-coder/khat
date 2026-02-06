"use client"

import { useState, useEffect, useCallback } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Check, X, Eye, EyeOff, Loader2, AlertTriangle, Shield } from "lucide-react"
import { getModerationQueue, moderateContent } from "@/lib/space-api"
import { toast } from "@/lib/use-toast"

interface ModerationItem {
  id: string
  _type?: string
  title?: string
  content?: string
  moderation_status?: string
  created_at: string
  profiles?: { id: string; display_name: string | null; avatar_url: string | null }
  // Report fields
  target_type?: string
  target_id?: string
  reason?: string
  details?: string
  status?: string
}

export default function ModerationPage() {
  const [tab, setTab] = useState("pending")
  const [items, setItems] = useState<ModerationItem[]>([])
  const [total, setTotal] = useState(0)
  const [isLoading, setIsLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState<string | null>(null)

  const fetchQueue = useCallback(async () => {
    setIsLoading(true)
    const { data, error } = await getModerationQueue(tab) as { data?: { items: ModerationItem[]; total: number }; error?: string }
    if (error) {
      toast({ title: "خطأ", description: error, variant: "destructive" })
    } else if (data) {
      setItems(data.items || [])
      setTotal(data.total || 0)
    }
    setIsLoading(false)
  }, [tab])

  useEffect(() => {
    fetchQueue()
  }, [fetchQueue])

  const handleAction = async (itemId: string, action: string, targetType: string) => {
    setActionLoading(itemId)
    const { error } = await moderateContent(itemId, { action, target_type: targetType })
    if (error) {
      toast({ title: "خطأ", description: error, variant: "destructive" })
    } else {
      toast({ title: "تم تنفيذ الإجراء", variant: "success", duration: 2000 })
      setItems((prev) => prev.filter((item) => item.id !== itemId))
      setTotal((prev) => prev - 1)
    }
    setActionLoading(null)
  }

  const getItemType = (item: ModerationItem) => {
    if (tab === "reports") return "report"
    return item._type || "article"
  }

  const reasonLabels: Record<string, string> = {
    spam: "سبام",
    harassment: "تحرش",
    inappropriate: "محتوى غير لائق",
    misinformation: "معلومات مضللة",
    other: "أخرى",
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Shield className="h-6 w-6 text-primary" />
            الإشراف على المحتوى
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            {total} عنصر في الانتظار
          </p>
        </div>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="pending">قيد المراجعة</TabsTrigger>
          <TabsTrigger value="flagged">مُبلَّغ تلقائياً</TabsTrigger>
          <TabsTrigger value="reports">بلاغات المستخدمين</TabsTrigger>
        </TabsList>
      </Tabs>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : items.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Check className="h-12 w-12 text-green-500 mb-4" />
            <p className="text-lg font-medium">لا توجد عناصر في الانتظار</p>
            <p className="text-muted-foreground text-sm mt-1">كل المحتوى تمت مراجعته</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {items.map((item) => {
            const itemType = getItemType(item)
            const isReport = tab === "reports"
            const isProcessing = actionLoading === item.id

            return (
              <Card key={item.id} className="overflow-hidden">
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Badge variant={isReport ? "destructive" : item.moderation_status === "auto_flagged" ? "destructive" : "secondary"}>
                        {isReport ? "بلاغ" : itemType === "article" ? "مقال" : "خاطرة"}
                      </Badge>
                      {item.moderation_status === "auto_flagged" && (
                        <Badge variant="outline" className="gap-1">
                          <AlertTriangle className="h-3 w-3" />
                          مُبلَّغ تلقائياً
                        </Badge>
                      )}
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {new Date(item.created_at).toLocaleDateString("ar-SA")}
                    </span>
                  </div>
                  {!isReport && (
                    <CardTitle className="text-base mt-2">
                      {item.title || item.content?.substring(0, 80)}
                    </CardTitle>
                  )}
                </CardHeader>
                <CardContent className="space-y-3">
                  {/* Author info */}
                  {item.profiles && (
                    <p className="text-sm text-muted-foreground">
                      بواسطة: {item.profiles.display_name || "مجهول"}
                    </p>
                  )}

                  {/* Content preview */}
                  {!isReport && item.content && (
                    <div className="rounded-lg bg-muted/50 p-3 text-sm max-h-32 overflow-y-auto whitespace-pre-wrap">
                      {item.content.substring(0, 500)}
                      {(item.content.length || 0) > 500 && "..."}
                    </div>
                  )}

                  {/* Report details */}
                  {isReport && (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 text-sm">
                        <span className="text-muted-foreground">السبب:</span>
                        <Badge variant="outline">{reasonLabels[item.reason || ""] || item.reason}</Badge>
                      </div>
                      {item.details && (
                        <p className="text-sm text-muted-foreground">{item.details}</p>
                      )}
                      <p className="text-xs text-muted-foreground">
                        نوع المحتوى: {item.target_type} | المعرف: {item.target_id?.substring(0, 8)}...
                      </p>
                    </div>
                  )}

                  {/* Actions */}
                  <div className="flex items-center gap-2 pt-2 border-t">
                    <Button
                      size="sm"
                      onClick={() => handleAction(item.id, "approve", itemType)}
                      disabled={isProcessing}
                      className="gap-1"
                    >
                      {isProcessing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                      {isReport ? "تم حلها" : "قبول"}
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => handleAction(item.id, "reject", itemType)}
                      disabled={isProcessing}
                      className="gap-1"
                    >
                      <X className="h-4 w-4" />
                      {isReport ? "رفض" : "رفض"}
                    </Button>
                    {!isReport && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleAction(item.id, "hide", itemType)}
                        disabled={isProcessing}
                        className="gap-1"
                      >
                        <EyeOff className="h-4 w-4" />
                        إخفاء
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
