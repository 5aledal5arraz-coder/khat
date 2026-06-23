"use client"

import { useState } from "react"
import {
  TrendingUp, Loader2, AlertCircle, RefreshCw, Sparkles,
  ChevronDown, ChevronLeft, Rocket, Image as ImageIcon, Megaphone,
  Clock, CalendarClock, Eye, Share2, Scissors, Flame, Copy, Check, ClipboardList,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { useGrowth, useTranscript } from "../contexts"
import { CopyButton } from "./shared"
import type { GrowthPackage } from "@/lib/ai/growth/types"

// ---------------------------------------------------------------------------
// Local helpers
// ---------------------------------------------------------------------------

function copyText(text: string) {
  navigator.clipboard?.writeText(text).catch(() => {})
}

const AD_TYPE_LABELS: Record<string, string> = {
  pre_roll: "افتتاحي",
  mid_roll: "منتصف",
  post_roll: "ختامي",
}

const PLATFORM_LABELS: Record<string, string> = {
  x: "إكس (تويتر)",
  instagram: "إنستغرام",
  linkedin: "لينكدإن",
  youtube_community: "مجتمع يوتيوب",
  tiktok: "تيك توك",
  facebook: "فيسبوك",
}

function platformLabel(p: string): string {
  return PLATFORM_LABELS[p] ?? p
}

function SubSection({
  icon: Icon,
  iconColor,
  title,
  count,
  children,
  defaultOpen = false,
}: {
  icon: React.ElementType
  iconColor: string
  title: string
  count?: number
  children: React.ReactNode
  defaultOpen?: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="rounded-lg border border-border/30">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between p-3 text-start hover:bg-muted/40 transition-colors"
      >
        <div className="flex items-center gap-2">
          <Icon className={cn("h-4 w-4", iconColor)} />
          <h4 className="text-[13px] font-semibold">{title}</h4>
          {typeof count === "number" && (
            <span className="rounded-md bg-muted/60 px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">{count}</span>
          )}
        </div>
        {open ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronLeft className="h-3.5 w-3.5 text-muted-foreground" />}
      </button>
      {open && <div className="border-t border-border/30 px-4 py-3">{children}</div>}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Markdown serializer — powers "Copy All / Export"
// ---------------------------------------------------------------------------

export function growthToMarkdown(g: GrowthPackage): string {
  const out: string[] = ["# حزمة النمو والنشر", ""]

  if (g.marketing_strategy) {
    const m = g.marketing_strategy
    out.push("## الاستراتيجية التسويقية")
    if (m.summary) out.push(m.summary, "")
    if (m.positioning) out.push(`**الموضعة:** ${m.positioning}`)
    if (m.target_audience) out.push(`**الجمهور المستهدف:** ${m.target_audience}`)
    if (m.priority_actions.length) {
      out.push("", "**الأولويات التنفيذية:**")
      m.priority_actions.forEach((a, i) => out.push(`${i + 1}. ${a}`))
    }
    out.push("")
  }

  if (g.opening_hook) {
    out.push("## خطاف الافتتاح", g.opening_hook.hook_script)
    if (g.opening_hook.rationale) out.push(`> ${g.opening_hook.rationale}`)
    if (g.opening_hook.alt_hooks.length) {
      out.push("", "**بدائل:**")
      g.opening_hook.alt_hooks.forEach((h) => out.push(`- ${h}`))
    }
    out.push("")
  }

  if (g.thumbnail_concepts.length) {
    out.push("## مفاهيم الصورة المصغّرة")
    g.thumbnail_concepts.forEach((t, i) => {
      out.push(`### ${i + 1}. ${t.concept}`)
      if (t.focal_text) out.push(`- النص: ${t.focal_text}`)
      if (t.mood) out.push(`- المزاج: ${t.mood}`)
      if (t.color_palette) out.push(`- الألوان: ${t.color_palette}`)
      if (t.composition) out.push(`- التكوين: ${t.composition}`)
      if (t.image_prompt) out.push(`- Image prompt: ${t.image_prompt}`)
      out.push("")
    })
  }

  if (g.best_publish_time) {
    const b = g.best_publish_time
    out.push("## أفضل وقت للنشر", `${b.day} — ${b.time_window} (${b.timezone})`)
    if (b.rationale) out.push(b.rationale)
    if (b.alternatives.length) out.push(`بدائل: ${b.alternatives.join("، ")}`)
    out.push("")
  }

  if (g.sponsor_placements.length) {
    out.push("## مواضع الإعلانات")
    g.sponsor_placements.forEach((p) => {
      out.push(`- [${AD_TYPE_LABELS[p.type] ?? p.type}]${p.approx_timestamp ? ` ${p.approx_timestamp}` : ""} — ${p.position_label}${p.why ? ` (${p.why})` : ""}`)
    })
    out.push("")
  }

  if (g.retention_recommendations.length) {
    out.push("## توصيات الاحتفاظ")
    g.retention_recommendations.forEach((r) => out.push(`- ${r.risk_point ? `${r.risk_point}: ` : ""}${r.recommendation}`))
    out.push("")
  }

  if (g.social_posts.length) {
    out.push("## منشورات المنصات")
    g.social_posts.forEach((p) => {
      out.push(`### ${platformLabel(p.platform)}`, p.caption)
      if (p.hashtags.length) out.push(p.hashtags.map((h) => `#${h}`).join(" "))
      out.push("")
    })
  }

  if (g.short_form_ideas.length) {
    out.push("## أفكار المحتوى القصير")
    g.short_form_ideas.forEach((s) => {
      out.push(`- **${s.title}** — ${s.angle}${s.platforms.length ? ` [${s.platforms.join(", ")}]` : ""}`)
    })
    out.push("")
  }

  if (g.controversy_angles.length) {
    out.push("## زوايا جدلية / لافتة")
    g.controversy_angles.forEach((c) => out.push(`- ${c}`))
    out.push("")
  }

  return out.join("\n").trim()
}

function CopyAllButton({ g }: { g: GrowthPackage }) {
  const [copied, setCopied] = useState(false)
  return (
    <Button
      onClick={() => {
        copyText(growthToMarkdown(g))
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
      }}
      size="sm"
      variant="outline"
      className="gap-1.5 h-7 text-xs"
    >
      {copied ? <Check className="h-3 w-3 text-green-700" /> : <ClipboardList className="h-3 w-3" />}
      {copied ? "تم النسخ" : "نسخ الحزمة كاملة"}
    </Button>
  )
}

// ---------------------------------------------------------------------------
// Tab
// ---------------------------------------------------------------------------

export function TabGrowth() {
  const { growth, growthStatus, growthError, generateGrowth } = useGrowth()
  const { transcriptStatus } = useTranscript()

  if (transcriptStatus !== "ready") {
    return (
      <div className="py-8 text-center">
        <Rocket className="h-8 w-8 mx-auto text-muted-foreground/30 mb-3" />
        <p className="text-sm text-muted-foreground">يجب استخراج النص أولاً لتوليد حزمة النمو</p>
      </div>
    )
  }

  if (growthStatus === "idle" || (!growth && growthStatus !== "generating")) {
    return (
      <div className="py-8 text-center space-y-4">
        <TrendingUp className="h-10 w-10 mx-auto text-rose-700/60" />
        <div>
          <p className="text-sm font-medium">حزمة النمو والنشر — جاهزة للنسخ</p>
          <p className="text-xs text-muted-foreground mt-1 max-w-md mx-auto">
            صور مصغّرة، خطاف افتتاح، توقيت الإعلانات وأفضل وقت للنشر، توصيات الاحتفاظ،
            محتوى المنصات والمقاطع القصيرة، واستراتيجية تسويقية موحّدة
          </p>
        </div>
        <Button onClick={generateGrowth} size="sm" className="gap-2">
          <Sparkles className="h-3.5 w-3.5" />
          توليد حزمة النمو
        </Button>
      </div>
    )
  }

  if (growthStatus === "generating") {
    return (
      <div className="py-8 text-center space-y-3">
        <Loader2 className="h-8 w-8 mx-auto animate-spin text-rose-700" />
        <p className="text-sm text-muted-foreground">جارٍ توليد حزمة النمو... (قد يستغرق دقيقة)</p>
      </div>
    )
  }

  if (growthStatus === "error") {
    return (
      <div className="py-6 space-y-3">
        <div className="flex items-start gap-3 rounded-lg border border-red-500/20 bg-red-500/5 p-4">
          <AlertCircle className="h-4 w-4 shrink-0 text-red-700 mt-0.5" />
          <p className="text-sm text-red-700 dark:text-red-400">{growthError}</p>
        </div>
        <Button onClick={generateGrowth} variant="outline" size="sm" className="gap-2">
          <RefreshCw className="h-3.5 w-3.5" />
          إعادة المحاولة
        </Button>
      </div>
    )
  }

  const g = growth!

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-muted-foreground">حزمة جاهزة للنسخ والنشر</span>
        <div className="flex items-center gap-2">
          <CopyAllButton g={g} />
          <Button onClick={generateGrowth} variant="ghost" size="sm" className="gap-1.5 h-7 text-xs">
            <RefreshCw className="h-3 w-3" />
            إعادة التوليد
          </Button>
        </div>
      </div>

      {/* Marketing strategy — the synthesis, surfaced first */}
      {g.marketing_strategy && (
        <div className="rounded-lg border bg-rose-50/50 p-4 dark:bg-rose-950/20 space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-rose-700 dark:text-rose-400 flex items-center gap-1.5">
              <Megaphone className="h-3.5 w-3.5" /> الاستراتيجية التسويقية
            </p>
            <CopyButton onClick={() => copyText(growthToMarkdown(g))} />
          </div>
          {g.marketing_strategy.summary && <p className="text-sm leading-relaxed">{g.marketing_strategy.summary}</p>}
          {g.marketing_strategy.positioning && (
            <p className="text-xs text-muted-foreground"><span className="font-medium text-foreground">الموضعة:</span> {g.marketing_strategy.positioning}</p>
          )}
          {g.marketing_strategy.target_audience && (
            <p className="text-xs text-muted-foreground"><span className="font-medium text-foreground">الجمهور:</span> {g.marketing_strategy.target_audience}</p>
          )}
          {g.marketing_strategy.priority_actions.length > 0 && (
            <ol className="mt-2 space-y-1">
              {g.marketing_strategy.priority_actions.map((a, i) => (
                <li key={i} className="text-sm flex items-start gap-2">
                  <span className="shrink-0 mt-0.5 h-4 w-4 rounded-full bg-rose-200 text-rose-800 text-[10px] font-bold flex items-center justify-center dark:bg-rose-900/50 dark:text-rose-300">{i + 1}</span>
                  {a}
                </li>
              ))}
            </ol>
          )}
        </div>
      )}

      {/* Opening hook */}
      {g.opening_hook && (
        <SubSection icon={Flame} iconColor="text-orange-700" title="خطاف الافتتاح" defaultOpen>
          <div className="space-y-2">
            <div className="flex items-start justify-between gap-2">
              <p className="text-sm leading-relaxed">{g.opening_hook.hook_script}</p>
              <CopyButton onClick={() => copyText(g.opening_hook!.hook_script)} />
            </div>
            {g.opening_hook.rationale && (
              <p className="text-xs text-muted-foreground border-r-2 border-orange-300 pr-2">{g.opening_hook.rationale}</p>
            )}
            {g.opening_hook.alt_hooks.length > 0 && (
              <div className="space-y-1">
                <p className="text-[11px] font-medium text-muted-foreground">بدائل:</p>
                {g.opening_hook.alt_hooks.map((h, i) => (
                  <div key={i} className="flex items-start justify-between gap-2">
                    <p className="text-xs text-muted-foreground">• {h}</p>
                    <CopyButton onClick={() => copyText(h)} />
                  </div>
                ))}
              </div>
            )}
          </div>
        </SubSection>
      )}

      {/* Thumbnail concepts */}
      {g.thumbnail_concepts.length > 0 && (
        <SubSection icon={ImageIcon} iconColor="text-violet-700" title="مفاهيم الصورة المصغّرة" count={g.thumbnail_concepts.length} defaultOpen>
          <div className="space-y-3">
            {g.thumbnail_concepts.map((t, i) => (
              <div key={i} className="rounded-lg border p-3 space-y-1.5">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-violet-700 dark:text-violet-400">{t.concept}</p>
                  {t.focal_text && (
                    <span className="rounded bg-violet-100 px-2 py-0.5 text-xs font-bold text-violet-800 dark:bg-violet-950/40 dark:text-violet-300">{t.focal_text}</span>
                  )}
                </div>
                {t.mood && <p className="text-xs text-muted-foreground"><span className="font-medium">المزاج:</span> {t.mood}</p>}
                {t.color_palette && <p className="text-xs text-muted-foreground"><span className="font-medium">الألوان:</span> {t.color_palette}</p>}
                {t.composition && <p className="text-xs text-muted-foreground"><span className="font-medium">التكوين:</span> {t.composition}</p>}
                {t.image_prompt && (
                  <div className="flex items-start justify-between gap-2 rounded bg-muted/50 p-2">
                    <p className="text-[11px] font-mono text-muted-foreground" dir="ltr">{t.image_prompt}</p>
                    <button onClick={() => copyText(t.image_prompt)} className="shrink-0 rounded p-1 hover:bg-muted" title="نسخ الـ prompt">
                      <Copy className="h-3 w-3 text-muted-foreground" />
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </SubSection>
      )}

      {/* Best publish time */}
      {g.best_publish_time && (
        <SubSection icon={CalendarClock} iconColor="text-emerald-700" title="أفضل وقت للنشر">
          <div className="space-y-1">
            <p className="text-sm font-medium">{g.best_publish_time.day} — {g.best_publish_time.time_window}</p>
            <p className="text-xs text-muted-foreground">{g.best_publish_time.timezone}</p>
            {g.best_publish_time.rationale && <p className="text-xs text-muted-foreground mt-1">{g.best_publish_time.rationale}</p>}
            {g.best_publish_time.alternatives.length > 0 && (
              <p className="text-xs text-muted-foreground">بدائل: {g.best_publish_time.alternatives.join("، ")}</p>
            )}
          </div>
        </SubSection>
      )}

      {/* Sponsor placements */}
      {g.sponsor_placements.length > 0 && (
        <SubSection icon={Clock} iconColor="text-amber-700" title="مواضع الإعلانات" count={g.sponsor_placements.length}>
          <div className="space-y-2">
            {g.sponsor_placements.map((p, i) => (
              <div key={i} className="rounded-lg bg-muted/50 p-3 space-y-1">
                <div className="flex items-center gap-2">
                  <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">{AD_TYPE_LABELS[p.type] ?? p.type}</span>
                  {p.approx_timestamp && <span className="text-[11px] font-mono text-muted-foreground" dir="ltr">{p.approx_timestamp}</span>}
                </div>
                <p className="text-sm">{p.position_label}</p>
                {p.why && <p className="text-xs text-muted-foreground">{p.why}</p>}
              </div>
            ))}
          </div>
        </SubSection>
      )}

      {/* Retention recommendations */}
      {g.retention_recommendations.length > 0 && (
        <SubSection icon={Eye} iconColor="text-blue-700" title="توصيات الاحتفاظ" count={g.retention_recommendations.length}>
          <div className="space-y-2">
            {g.retention_recommendations.map((r, i) => (
              <div key={i} className="space-y-0.5">
                {r.risk_point && <p className="text-xs font-medium text-blue-700 dark:text-blue-400">{r.risk_point}</p>}
                <p className="text-sm text-muted-foreground">{r.recommendation}</p>
              </div>
            ))}
          </div>
        </SubSection>
      )}

      {/* Social posts */}
      {g.social_posts.length > 0 && (
        <SubSection icon={Share2} iconColor="text-cyan-700" title="منشورات المنصات" count={g.social_posts.length} defaultOpen>
          <div className="space-y-2">
            {g.social_posts.map((p, i) => (
              <div key={i} className="rounded-lg border p-3 space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="rounded-full bg-cyan-100 px-2.5 py-0.5 text-[11px] font-medium text-cyan-800 dark:bg-cyan-950/40 dark:text-cyan-300">{platformLabel(p.platform)}</span>
                  <CopyButton onClick={() => copyText(p.hashtags.length ? `${p.caption}\n\n${p.hashtags.map((h) => `#${h}`).join(" ")}` : p.caption)} />
                </div>
                <p className="text-sm whitespace-pre-wrap leading-relaxed">{p.caption}</p>
                {p.hashtags.length > 0 && (
                  <p className="text-xs text-cyan-700 dark:text-cyan-400">{p.hashtags.map((h) => `#${h}`).join(" ")}</p>
                )}
              </div>
            ))}
          </div>
        </SubSection>
      )}

      {/* Short-form ideas */}
      {g.short_form_ideas.length > 0 && (
        <SubSection icon={Scissors} iconColor="text-pink-700" title="أفكار المحتوى القصير" count={g.short_form_ideas.length}>
          <div className="space-y-2">
            {g.short_form_ideas.map((s, i) => (
              <div key={i} className="rounded-lg bg-muted/50 p-3 space-y-1">
                <p className="text-sm font-medium">{s.title}</p>
                {s.angle && <p className="text-xs text-muted-foreground">{s.angle}</p>}
                {s.source_moment && <p className="text-[11px] text-muted-foreground/80">المصدر: {s.source_moment}</p>}
                {s.platforms.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {s.platforms.map((pl, j) => (
                      <span key={j} className="rounded bg-pink-100 px-1.5 py-0.5 text-[10px] text-pink-700 dark:bg-pink-950/40 dark:text-pink-400">{platformLabel(pl)}</span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </SubSection>
      )}

      {/* Controversy angles */}
      {g.controversy_angles.length > 0 && (
        <SubSection icon={Flame} iconColor="text-red-700" title="زوايا جدلية / لافتة" count={g.controversy_angles.length}>
          <ul className="space-y-1.5">
            {g.controversy_angles.map((c, i) => (
              <li key={i} className="text-sm text-muted-foreground flex items-start gap-2">
                <Flame className="h-3 w-3 shrink-0 mt-1 text-red-600" />
                {c}
              </li>
            ))}
          </ul>
        </SubSection>
      )}
    </div>
  )
}
