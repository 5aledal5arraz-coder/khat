import { Sparkles, UserPlus, Lightbulb, MessageCircleQuestion, Wand2 } from "lucide-react"
import { getCommunityWall, type CommunityWallEntry } from "@/lib/community/queries"

const TYPE_META: Record<string, { label: string; icon: React.ElementType }> = {
  guest: { label: "ضيف", icon: UserPlus },
  topic: { label: "فكرة حلقة", icon: Lightbulb },
  question: { label: "سؤال", icon: MessageCircleQuestion },
  concept: { label: "فكرة محتوى", icon: Sparkles },
  improvement: { label: "تحسين", icon: Wand2 },
}

/** What became of it — a warm, non-technical outcome line. */
function outcomeLabel(e: CommunityWallEntry): string | null {
  if (e.routed_kind === "guest_candidate") return "صار مرشّحًا في قائمة ضيوفنا"
  if (e.routed_kind === "market_signal") return "دخل رادار خط للمواضيع"
  if (e.routed_kind === "eir") return "في طريقه إلى حلقة"
  if (e.status === "routed") return "انتقل إلى الإنتاج"
  return null
}

/** First name only — warmer, and a lighter privacy footprint than the full name. */
function displayName(name: string | null): string {
  if (!name || !name.trim()) return "من مجتمع خط"
  return name.trim().split(/\s+/)[0]
}

/**
 * Public recognition wall — "صُنع مع المجتمع". Renders only contributions the
 * operator opted to credit. Returns null when empty so the page stays clean.
 */
export async function CommunityWall() {
  const entries = await getCommunityWall(24)
  if (entries.length === 0) return null

  return (
    <section className="mt-20 border-t border-border/60 pt-14">
      <div className="text-center">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/20 bg-primary/5 px-3 py-1 text-[12px] font-medium text-primary">
          <Sparkles className="h-3.5 w-3.5" />
          صُنع مع المجتمع
        </span>
        <h2 className="mt-4 text-2xl font-bold tracking-tight text-foreground">أفكار بدأت منكم</h2>
        <p className="mx-auto mt-3 max-w-lg text-[14px] leading-relaxed text-muted-foreground">
          هذه بعض المساهمات التي وصلتنا منكم وأخذناها معنا في رحلة خط. شكرًا لكل من شارك.
        </p>
      </div>

      <div className="mt-9 grid grid-cols-1 gap-3 sm:grid-cols-2">
        {entries.map((e) => {
          const tm = TYPE_META[e.type] || { label: e.type, icon: Sparkles }
          const Icon = tm.icon
          const outcome = outcomeLabel(e)
          return (
            <div
              key={e.id}
              className="rounded-2xl border border-border/70 bg-card p-4 transition-colors hover:border-primary/30"
            >
              <div className="flex items-center gap-1.5">
                <span className="inline-flex items-center gap-1 rounded-md bg-muted px-1.5 py-0.5 text-[10.5px] text-muted-foreground">
                  <Icon className="h-2.5 w-2.5" /> {tm.label}
                </span>
                {outcome && (
                  <span className="inline-flex items-center gap-1 rounded-md bg-primary/5 px-1.5 py-0.5 text-[10.5px] font-medium text-primary">
                    {outcome}
                  </span>
                )}
              </div>
              <p className="mt-2 line-clamp-2 text-[14px] font-semibold leading-snug text-foreground">{e.title}</p>
              <p className="mt-2 text-[12px] text-muted-foreground">
                <span className="text-foreground/70">{displayName(e.contributor_name)}</span>
              </p>
            </div>
          )
        })}
      </div>
    </section>
  )
}
