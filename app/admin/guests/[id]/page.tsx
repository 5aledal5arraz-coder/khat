/**
 * Khat Brain Phase 6 — admin guest detail page.
 *
 * Shows the canonical guest + identity profile (signals from
 * discovery, applications, studio, prep) + linked discovery candidates.
 * Intentionally minimal — no edit forms; this is a visibility surface.
 */

import { notFound } from "next/navigation"
import Link from "next/link"
import { eq, desc } from "drizzle-orm"
import { Empty } from "../../components/ui-kit"
import {
  ArrowRight,
  ExternalLink,
  Sparkles,
  AlertTriangle,
  BookOpen,
  Users,
  Activity,
} from "lucide-react"
import { db } from "@/lib/db"
import { guests } from "@/lib/db/schema/guests"
import {
  guestIdentityProfiles,
  guestDiscoveryLinks,
  type GuestSocialAccounts,
} from "@/lib/db/schema/guest-identity"
import { guestDiscoveryCandidates } from "@/lib/db/schema/discovery"
import { formatDateTime } from "@/lib/shared/formatters"
import { GuestKnowledgePanel } from "./knowledge-panel"
import type { GuestPublicKnowledge } from "@/lib/db/schema/guest-identity"

export const dynamic = "force-dynamic"

type Params = { id: string }

export default async function AdminGuestDetailPage({
  params,
}: {
  params: Promise<Params>
}) {
  const { id } = await params

  const guestRows = await db!.select().from(guests).where(eq(guests.id, id)).limit(1)
  const guest = guestRows[0]
  if (!guest) notFound()

  const [profileRows, links] = await Promise.all([
    db!
      .select()
      .from(guestIdentityProfiles)
      .where(eq(guestIdentityProfiles.guest_id, id))
      .limit(1),
    db!
      .select({
        id: guestDiscoveryLinks.id,
        discovery_candidate_id: guestDiscoveryLinks.discovery_candidate_id,
        discovery_run_id: guestDiscoveryLinks.discovery_run_id,
        link_type: guestDiscoveryLinks.link_type,
        confidence_score: guestDiscoveryLinks.confidence_score,
        created_at: guestDiscoveryLinks.created_at,
      })
      .from(guestDiscoveryLinks)
      .where(eq(guestDiscoveryLinks.guest_id, id))
      .orderBy(desc(guestDiscoveryLinks.created_at)),
  ])
  const profile = profileRows[0] ?? null

  // Resolve linked candidate names for display.
  const candIds = links
    .map((l) => l.discovery_candidate_id)
    .filter((x): x is string => Boolean(x))
  const candidateLookup = new Map<string, { name: string | null; status: string }>()
  if (candIds.length > 0) {
    const cands = await db!
      .select({
        id: guestDiscoveryCandidates.id,
        proposed_name: guestDiscoveryCandidates.proposed_name,
        status: guestDiscoveryCandidates.status,
      })
      .from(guestDiscoveryCandidates)
    for (const c of cands) {
      if (candIds.includes(c.id)) {
        candidateLookup.set(c.id, {
          name: c.proposed_name,
          status: c.status as string,
        })
      }
    }
  }

  const social = (profile?.social_accounts ?? {}) as GuestSocialAccounts
  const externalLinks = (guest.external_links ?? {}) as Record<string, string>

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      <Link
        href="/admin/guests"
        className="inline-flex items-center gap-1.5 text-[12px] text-muted-foreground hover:text-foreground"
      >
        <ArrowRight className="h-3.5 w-3.5" />
        كل الضيوف
      </Link>

      {/* Header */}
      <div className="rounded-2xl border border-border/40 bg-card/40 p-5">
        <div className="flex flex-wrap items-start gap-4">
          {guest.photo_url && (
            <img
              src={guest.photo_url}
              alt={guest.name}
              className="h-16 w-16 rounded-full object-cover"
            />
          )}
          <div className="min-w-0 flex-1">
            <h1 className="text-xl font-bold">{guest.name}</h1>
            <div className="mt-1 text-[11px] text-muted-foreground" dir="ltr">
              slug: {guest.slug} · id: <code>{guest.id.slice(0, 12)}…</code>
            </div>
            {guest.bio && (
              <p className="mt-2 max-w-2xl text-[12.5px] leading-relaxed text-foreground/80">
                {guest.bio}
              </p>
            )}
            {/* Canonical external links from the guests row */}
            {Object.keys(externalLinks).length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {Object.entries(externalLinks).map(([k, v]) =>
                  v ? (
                    <a
                      key={k}
                      href={v}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 rounded-md border border-border/40 bg-background/40 px-2 py-0.5 text-[10px] text-muted-foreground hover:text-foreground"
                      dir="ltr"
                    >
                      <ExternalLink className="h-2.5 w-2.5" />
                      {k}
                    </a>
                  ) : null,
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Public guest knowledge (Studio redesign, Goal 2) */}
      <GuestKnowledgePanel
        guestId={guest.id}
        initial={(profile?.public_knowledge as GuestPublicKnowledge | null) ?? null}
      />

      {/* Identity profile */}
      {!profile ? (
        <Empty text="لا يوجد ملفّ هوية بعد. رقّ مرشّحاً من سطح اكتشاف الضيوف لإنشاء ملف هوية، أو انتظر دورة إعادة البناء التالية." />
      ) : (
        <>
          <Section title="ملخص المصادر" icon={<Activity className="h-4 w-4" />}>
            {profile.source_summary ? (
              <pre
                className="overflow-x-auto rounded-md bg-muted/20 p-3 text-[11px] text-muted-foreground"
                dir="ltr"
              >
                {JSON.stringify(profile.source_summary, null, 2)}
              </pre>
            ) : (
              <p className="text-[12px] text-muted-foreground">—</p>
            )}
          </Section>

          {profile.discovery_evidence && (
            <Section title="أدلة الاكتشاف" icon={<Sparkles className="h-4 w-4" />}>
              <DiscoveryEvidenceBlock evidence={profile.discovery_evidence as never} />
            </Section>
          )}

          {profile.story_arcs && (
            <Section title="أقواس القصة" icon={<BookOpen className="h-4 w-4" />}>
              <StringList obj={profile.story_arcs as Record<string, string[] | undefined>} />
            </Section>
          )}

          {profile.risk_map && (
            <Section title="خريطة المخاطر" icon={<AlertTriangle className="h-4 w-4" />}>
              <StringList obj={profile.risk_map as Record<string, string[] | undefined>} />
            </Section>
          )}

          {profile.suggested_angles && Array.isArray(profile.suggested_angles) && (
            <Section title="زوايا مقترحة">
              <ul className="list-inside list-disc text-[12.5px] text-foreground/80">
                {(profile.suggested_angles as string[]).map((a, i) => (
                  <li key={i}>{a}</li>
                ))}
              </ul>
            </Section>
          )}

          {profile.extraction_questions &&
            Array.isArray(profile.extraction_questions) &&
            (profile.extraction_questions as string[]).length > 0 && (
              <Section title="أسئلة استخراجية">
                <ul className="list-inside list-disc text-[12.5px] text-foreground/80">
                  {(profile.extraction_questions as string[]).map((q, i) => (
                    <li key={i}>{q}</li>
                  ))}
                </ul>
              </Section>
            )}

          {profile.fit_scores && (
            <Section title="تقييمات الملاءمة">
              <pre className="overflow-x-auto rounded-md bg-muted/20 p-3 text-[11px]" dir="ltr">
                {JSON.stringify(profile.fit_scores, null, 2)}
              </pre>
            </Section>
          )}

          {profile.studio_signals && (
            <Section title="إشارات الاستوديو">
              <pre className="overflow-x-auto rounded-md bg-muted/20 p-3 text-[11px]" dir="ltr">
                {JSON.stringify(profile.studio_signals, null, 2)}
              </pre>
            </Section>
          )}

          {Object.keys(social).length > 0 && (
            <Section title="حسابات اجتماعية">
              <div className="flex flex-wrap gap-2 text-[11px]" dir="ltr">
                {Object.entries(social).map(([k, v]) =>
                  typeof v === "string" && v ? (
                    <a
                      key={k}
                      href={v}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 rounded-md border border-border/40 bg-background/40 px-2 py-0.5 text-muted-foreground hover:text-foreground"
                    >
                      <ExternalLink className="h-2.5 w-2.5" />
                      {k}: {v}
                    </a>
                  ) : null,
                )}
              </div>
            </Section>
          )}
        </>
      )}

      {/* Linked discovery candidates */}
      <Section title="مرشّحون مرتبطون بالاكتشاف" icon={<Users className="h-4 w-4" />}>
        {links.length === 0 ? (
          <p className="text-[12px] text-muted-foreground">لم يُربط أي مرشّح بعد.</p>
        ) : (
          <div className="divide-y divide-border/30 rounded-xl border border-border/30 bg-card/40">
            {links.map((l) => {
              const lookup: { name: string | null; status: string } | null =
                l.discovery_candidate_id
                  ? (candidateLookup.get(l.discovery_candidate_id) ?? null)
                  : null
              return (
                <div key={l.id} className="px-4 py-3 text-[12px]">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{lookup?.name ?? "(unnamed candidate)"}</span>
                    <span className="rounded-md border border-border/40 bg-background/40 px-1.5 py-0.5 text-[10px] text-muted-foreground">
                      {l.link_type}
                    </span>
                    {l.confidence_score !== null && (
                      <span className="text-[10px] text-muted-foreground" dir="ltr">
                        confidence: {Number(l.confidence_score).toFixed(2)}
                      </span>
                    )}
                  </div>
                  <div
                    className="mt-0.5 flex flex-wrap gap-2 text-[10px] text-muted-foreground"
                    dir="ltr"
                  >
                    {lookup && <span>status: {lookup.status}</span>}
                    {l.discovery_run_id && (
                      <span>run: {l.discovery_run_id.slice(0, 8)}</span>
                    )}
                    <span>{formatDateTime(l.created_at.toISOString())}</span>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </Section>

      <div className="text-[10px] text-muted-foreground" dir="ltr">
        Last analyzed:{" "}
        {profile?.last_analyzed_at ? formatDateTime(profile.last_analyzed_at.toISOString()) : "—"}
      </div>
    </div>
  )
}

function Section({
  title,
  icon,
  children,
}: {
  title: string
  icon?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <section>
      <h2 className="mb-2 flex items-center gap-2 text-[13px] font-semibold text-muted-foreground">
        {icon}
        {title}
      </h2>
      {children}
    </section>
  )
}

function StringList({ obj }: { obj: Record<string, string[] | undefined> }) {
  const entries = Object.entries(obj).filter(([, v]) => Array.isArray(v) && v.length > 0)
  if (entries.length === 0) return <p className="text-[12px] text-muted-foreground">—</p>
  return (
    <div className="space-y-2">
      {entries.map(([k, v]) => (
        <div key={k}>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{k}</div>
          <div className="mt-1 flex flex-wrap gap-1">
            {v!.map((s, i) => (
              <span
                key={i}
                className="rounded-md bg-muted/30 px-1.5 py-0.5 text-[11px] text-muted-foreground"
              >
                {s}
              </span>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

function DiscoveryEvidenceBlock({
  evidence,
}: {
  evidence: {
    urls?: Array<{ platform: string; url: string; title?: string | null; snippet?: string | null }>
    best_scores?: {
      composite?: number | null
      editorial_fit?: number | null
      hiddenness?: number | null
      novelty?: number | null
      evidence_strength?: number | null
    }
    matched_archetype?: { id: string; name: string } | null
  }
}) {
  return (
    <div className="space-y-3">
      {evidence.matched_archetype && (
        <div className="text-[12px]">
          <span className="text-muted-foreground">النمط: </span>
          <span className="font-medium">{evidence.matched_archetype.name}</span>
        </div>
      )}
      {evidence.best_scores && (
        <div
          className="flex flex-wrap gap-3 text-[10px] text-muted-foreground"
          dir="ltr"
        >
          {Object.entries(evidence.best_scores).map(([k, v]) =>
            v !== null && v !== undefined ? (
              <span key={k}>
                {k}: {Number(v).toFixed(2)}
              </span>
            ) : null,
          )}
        </div>
      )}
      {evidence.urls && evidence.urls.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {evidence.urls.slice(0, 8).map((u, i) => (
            <a
              key={i}
              href={u.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 rounded-md border border-border/40 bg-background/40 px-2 py-0.5 text-[10px] text-muted-foreground hover:text-foreground"
              dir="ltr"
            >
              <ExternalLink className="h-2.5 w-2.5" />
              {u.platform}
            </a>
          ))}
        </div>
      )}
    </div>
  )
}
