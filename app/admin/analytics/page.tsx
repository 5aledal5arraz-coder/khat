"use client"

import { useState, useEffect } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Youtube,
  Twitter,
  Instagram,
  Music2,
  Users,
  FileText,
  ExternalLink,
  Save,
} from "lucide-react"
import type { AnalyticsConfig, PlatformStats } from "@/types/ads"

const defaultConfig: AnalyticsConfig = {
  youtube: { followers: 0, posts: 0, engagement: "0%", url: "" },
  x: { followers: 0, posts: 0, engagement: "0%", url: "" },
  tiktok: { followers: 0, posts: 0, engagement: "0%", url: "" },
  instagram: { followers: 0, posts: 0, engagement: "0%", url: "" },
}

const platforms = [
  {
    key: "youtube" as const,
    label: "YouTube",
    icon: Youtube,
    color: "#FF0000",
    followersLabel: "مشتركين",
    postsLabel: "فيديو",
  },
  {
    key: "x" as const,
    label: "X (Twitter)",
    icon: Twitter,
    color: "#1DA1F2",
    followersLabel: "متابعين",
    postsLabel: "تغريدة",
  },
  {
    key: "tiktok" as const,
    label: "TikTok",
    icon: Music2,
    color: "#00f2ea",
    followersLabel: "متابعين",
    postsLabel: "فيديو",
  },
  {
    key: "instagram" as const,
    label: "Instagram",
    icon: Instagram,
    color: "#E4405F",
    followersLabel: "متابعين",
    postsLabel: "منشور",
  },
]

function formatNumber(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M"
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "K"
  return n.toLocaleString()
}

function PlatformCard({
  platform,
  stats,
  onChange,
}: {
  platform: (typeof platforms)[number]
  stats: PlatformStats
  onChange: (stats: PlatformStats) => void
}) {
  const Icon = platform.icon

  return (
    <Card>
      <CardContent className="p-6">
        <div className="mb-4 flex items-center gap-3">
          <div
            className="flex h-10 w-10 items-center justify-center rounded-lg"
            style={{ backgroundColor: platform.color + "20" }}
          >
            <Icon className="h-5 w-5" style={{ color: platform.color }} />
          </div>
          <h3 className="text-lg font-bold">{platform.label}</h3>
          {stats.url && (
            <a
              href={stats.url}
              target="_blank"
              rel="noopener noreferrer"
              className="ms-auto text-muted-foreground hover:text-foreground"
            >
              <ExternalLink className="h-4 w-4" />
            </a>
          )}
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">
              {platform.followersLabel}
            </label>
            <Input
              type="number"
              value={stats.followers}
              onChange={(e) =>
                onChange({ ...stats, followers: parseInt(e.target.value) || 0 })
              }
              className="text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">
              {platform.postsLabel}
            </label>
            <Input
              type="number"
              value={stats.posts}
              onChange={(e) =>
                onChange({ ...stats, posts: parseInt(e.target.value) || 0 })
              }
              className="text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">
              نسبة التفاعل
            </label>
            <Input
              value={stats.engagement}
              onChange={(e) =>
                onChange({ ...stats, engagement: e.target.value })
              }
              placeholder="مثال: 4.5%"
              className="text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">
              رابط الحساب
            </label>
            <Input
              value={stats.url}
              onChange={(e) => onChange({ ...stats, url: e.target.value })}
              placeholder="https://..."
              className="text-sm"
              dir="ltr"
            />
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

export default function AnalyticsPage() {
  const [config, setConfig] = useState<AnalyticsConfig>(defaultConfig)
  const [saving, setSaving] = useState(false)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    fetch("/api/admin/analytics")
      .then((r) => r.json())
      .then((data) => {
        setConfig(data)
        setLoaded(true)
      })
      .catch(() => setLoaded(true))
  }, [])

  const handleSave = async () => {
    setSaving(true)
    await fetch("/api/admin/analytics", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(config),
    })
    setSaving(false)
  }

  const totalFollowers = platforms.reduce(
    (sum, p) => sum + (config[p.key]?.followers || 0),
    0
  )
  const totalPosts = platforms.reduce(
    (sum, p) => sum + (config[p.key]?.posts || 0),
    0
  )

  if (!loaded) {
    return (
      <div className="flex items-center justify-center py-20 text-muted-foreground">
        جارٍ التحميل...
      </div>
    )
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">الإحصائيات</h1>
          <p className="mt-1 text-muted-foreground">
            إحصائيات منصات التواصل الاجتماعي لبودكاست خط
          </p>
        </div>
        <Button onClick={handleSave} disabled={saving}>
          <Save className="me-2 h-4 w-4" />
          {saving ? "جارٍ الحفظ..." : "حفظ التغييرات"}
        </Button>
      </div>

      {/* Combined summary */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Card>
          <CardContent className="flex items-center gap-4 p-6">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
              <Users className="h-6 w-6 text-primary" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">إجمالي المتابعين</p>
              <p className="text-2xl font-bold">{formatNumber(totalFollowers)}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-4 p-6">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
              <FileText className="h-6 w-6 text-primary" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">إجمالي المنشورات</p>
              <p className="text-2xl font-bold">{formatNumber(totalPosts)}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Platform cards */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {platforms.map((platform) => (
          <PlatformCard
            key={platform.key}
            platform={platform}
            stats={config[platform.key]}
            onChange={(stats) =>
              setConfig((prev) => ({ ...prev, [platform.key]: stats }))
            }
          />
        ))}
      </div>
    </div>
  )
}
