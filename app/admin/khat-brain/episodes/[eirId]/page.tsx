/**
 * UX-3a → UX-3b — Episode Workspace.
 *
 *   /admin/khat-brain/episodes/[eirId]?tab=…
 *
 * Hosts every per-episode tab. UX-3b implements all eight:
 *   overview · topic · guest · preparation · recording · studio · publish · performance.
 * The placeholder fallback is retained for safety (rendered only when a
 * future tab is registered as `implemented=false`).
 */

import Link from "next/link"
import { notFound } from "next/navigation"
import {
  Brain,
  ArrowLeft,
  ExternalLink,
  AlertTriangle,
  CheckCircle2,
  Sparkles,
  Compass,
  ListChecks,
  UserPlus,
  Telescope,
} from "lucide-react"
import { requireAdmin } from "@/lib/api-utils"
import { loadEpisodeWorkspace } from "@/lib/khat-brain/episode-workspace"
import { nextActionFor, type NextActionTone } from "@/lib/khat-brain/next-action"
import { formatDateTime } from "@/lib/shared/formatters"
import {
  TABS,
  TAB_KEYS,
  computeTabStates,
  defaultTabForPhase,
  parseTabKey,
  currentPhaseGroup,
  PHASE_GROUP_LABEL,
  PHASE_GROUP_ORDER,
  type TabKey,
  type TabStatus,
  type PhaseGroup,
} from "./tabs"
import type { EpisodePhase } from "@/lib/db/schema/eir"
import {
  getRoomSummaryForEir,
  getPreparationForEir,
  getStudioSummaryForEir,
  getMarkersForRoom,
  getEpisodeForEir,
  getPerformanceForEir,
} from "@/lib/khat-brain/workspace-tabs"
import { getPushPreview } from "@/lib/khat-brain/push-preview"
import { PreparationTab } from "./tab-preparation"
import { RecordingTab } from "./tab-recording"
import { StudioTab } from "./tab-studio"
import { PublishTab } from "./tab-publish"
import { PerformanceTab } from "./tab-performance"
import { TranscriptTab } from "./tab-transcript"
import { ChaptersTab } from "./tab-chapters"
import { ClipsTab } from "./tab-clips"
import { AssignGuestForm } from "./assign-guest-form"
import { getAllGuests } from "@/lib/admin/queries"

export const dynamic = "force-dynamic"

const PHASE_LABEL: Record<EpisodePhase, string> = {
  idea: "فكرة",
  guest_discovery: "اكتشاف ضيف",
  guest_assigned: "ضيف معيّن",
  approved: "معتمدة",
  researching: "قيد البحث",
  prepared: "إعداد جاهز",
  ready_to_record: "جاهزة للتسجيل",
  recording: "قيد التسجيل",
  recorded: "مسجّلة",
  producing: "إنتاج",
  ready_to_publish: "جاهزة للنشر",
  published: "منشورة",
  analyzing: "تحليل",
  learned: "تم التعلّم",
  archived: "مؤرشفة",
}

interface SearchParamsShape {
  tab?: string
  /** UX-4 — `?success=room_created` / `?success=pushed` etc. drives an
   *  inline confirmation banner. Cleared on the next navigation. */
  success?: string
  fields?: string
}

export default async function EpisodeWorkspacePage({
  params,
  searchParams,
}: {
  params: Promise<{ eirId: string }>
  searchParams: Promise<SearchParamsShape>
}) {
  await requireAdmin()
  const { eirId } = await params
  const { tab: rawTab, success, fields: pushedFieldsRaw } = await searchParams
  const snap = await loadEpisodeWorkspace(eirId)
  if (!snap) notFound()

  const requested = parseTabKey(rawTab)
  const selected: TabKey = requested ?? defaultTabForPhase(snap.eir.phase)
  const tabStates = computeTabStates(snap.eir.phase, selected)
  const action = nextActionFor(snap.eir.phase)

  // UX-3b — load the data each tab needs in parallel. Cheap because
  // each helper is a single small query; safe because every helper
  // returns null/empty when the linked record doesn't exist.
  const [room, prep, studio, episode, perf, pushPreview, allGuests] =
    await Promise.all([
      getRoomSummaryForEir(eirId),
      getPreparationForEir(eirId),
      getStudioSummaryForEir(eirId),
      getEpisodeForEir(eirId),
      getPerformanceForEir(eirId),
      getPushPreview(eirId),
      getAllGuests(),
    ])
  const markers = room ? await getMarkersForRoom(room.id, 30) : []
  const guestOptions = allGuests.map((g) => ({ id: g.id, name: g.name }))

  return (
    <div className="mx-auto max-w-6xl space-y-5 p-6">
      {/* ── Breadcrumb ─────────────────────────────────────── */}
      <div className="flex items-center gap-2 text-[11.5px] text-muted-foreground">
        <Link
          href="/admin/khat-brain"
          className="hover:text-foreground"
        >
          مركز القيادة
        </Link>
        <span>/</span>
        <Link
          href="/admin/khat-brain/episodes"
          className="hover:text-foreground"
        >
          الحلقات
        </Link>
        <span>/</span>
        <span className="text-foreground/80">
          {snap.eir.working_title.slice(0, 40)}
        </span>
      </div>

      {/* ── Header ────────────────────────────────────────── */}
      <header className="rounded-3xl border border-primary/15 bg-gradient-to-br from-primary/5 via-violet-500/5 to-transparent p-5">
        <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-2.5 py-0.5 text-[10.5px] font-medium text-primary">
          <Brain className="h-3 w-3" /> مساحة عمل الحلقة
        </div>
        <h1 className="text-xl font-bold leading-tight">
          {snap.eir.working_title}
        </h1>
        {snap.eir.final_title && (
          <div className="mt-0.5 text-[12px] text-muted-foreground">
            عنوان نهائي: {snap.eir.final_title}
          </div>
        )}
        <div className="mt-2 flex flex-wrap items-center gap-2 text-[11.5px]">
          <span className="rounded-full bg-muted/30 px-2 py-0.5 text-[10.5px] uppercase tracking-wider text-muted-foreground">
            {PHASE_LABEL[snap.eir.phase]}
          </span>
          <span className="text-[10.5px] text-muted-foreground/60" dir="ltr">
            {snap.eir.phase}
          </span>
          {snap.eir.season_name && (
            <span className="rounded-full border border-border/40 px-2 py-0.5 text-[10.5px] text-muted-foreground">
              {snap.eir.season_name}
            </span>
          )}
          {snap.guest && (
            <span className="text-muted-foreground">
              <span className="text-foreground">ضيف:</span> {snap.guest.name}
            </span>
          )}
          <span className="text-muted-foreground/60" dir="ltr">
            تحديث {formatDateTime(snap.eir.updated_at)}
          </span>
        </div>
      </header>

      {/* ── Phase timeline ────────────────────────────────── */}
      {snap.transitions.length > 0 && (
        <PhaseTimeline transitions={snap.transitions} currentPhase={snap.eir.phase} />
      )}

      {/* ── Phase 6 — 3-phase workflow header + grouped tab nav ──
           Three phase groups (قبل / أثناء / بعد) with the current one
           highlighted. Sub-tabs underneath are grouped by phase_group.
           Unimplemented "قريباً" tabs are filtered out — they remain
           reachable via direct URL through legacy_fallback_href so old
           bookmarks don't break. */}
      {(() => {
        const activeGroup: PhaseGroup = currentPhaseGroup(snap.eir.phase)
        const selectedGroup: PhaseGroup = TABS[selected].phase_group
        return (
          <div className="space-y-2.5 border-b border-border/40 pb-2">
            {/* Phase indicator row */}
            <div className="flex flex-wrap items-center gap-1.5">
              {PHASE_GROUP_ORDER.map((g, i) => {
                const isActive = g === activeGroup
                const isSelected = g === selectedGroup
                return (
                  <span key={g} className="flex items-center gap-1.5">
                    {i > 0 && (
                      <span className="text-[10px] text-muted-foreground/40">
                        ←
                      </span>
                    )}
                    <span
                      data-phase-group={g}
                      data-active={isActive}
                      data-selected={isSelected}
                      className={
                        isSelected
                          ? "rounded-full bg-primary/15 px-2.5 py-0.5 text-[11px] font-medium text-primary"
                          : isActive
                            ? "rounded-full bg-primary/8 px-2.5 py-0.5 text-[11px] font-medium text-primary/80"
                            : "rounded-full px-2.5 py-0.5 text-[11px] text-muted-foreground"
                      }
                    >
                      {PHASE_GROUP_LABEL[g]}
                    </span>
                  </span>
                )
              })}
            </div>
            {/* Grouped sub-tabs — render each phase group with a thin
                separator. Unimplemented tabs filtered. */}
            <nav className="flex flex-wrap items-center gap-1">
              {PHASE_GROUP_ORDER.map((g, gi) => {
                const keysInGroup = TAB_KEYS.filter(
                  (k) => TABS[k].phase_group === g && TABS[k].implemented,
                )
                if (keysInGroup.length === 0) return null
                return (
                  <span key={g} className="flex items-center gap-1">
                    {gi > 0 && (
                      <span
                        aria-hidden="true"
                        className="mx-1 h-3 w-px bg-border/40"
                      />
                    )}
                    {keysInGroup.map((key) => (
                      <TabLink
                        key={key}
                        tabKey={key}
                        eirId={snap.eir.id}
                        status={tabStates[key]}
                        implemented={TABS[key].implemented}
                        label={TABS[key].label_ar}
                        requiredPhase={TABS[key].available_from}
                        currentPhase={snap.eir.phase}
                      />
                    ))}
                  </span>
                )
              })}
            </nav>
          </div>
        )
      })()}

      {/* ── UX-4 — success confirmation banner ─────────────── */}
      {success && <SuccessBanner code={success} fields={pushedFieldsRaw ?? null} />}

      {/* ── Tab content ───────────────────────────────────── */}
      <main>
        {selected === "overview" && (
          <OverviewTab snap={snap} action={action} />
        )}
        {selected === "topic" && <TopicTab snap={snap} />}
        {selected === "guest" && (
          <GuestTab snap={snap} guestOptions={guestOptions} />
        )}
        {selected === "preparation" && (
          <PreparationTab
            prep={prep}
            room={room}
            eirId={eirId}
            seasonId={snap.eir.season_id}
            guestOptions={guestOptions}
            currentGuestId={snap.guest?.id ?? null}
          />
        )}
        {selected === "recording" && (
          /* RecordingTab is async (loads LiveV2 snapshot) — Next renders
             server components transparently. */
          <RecordingTab eirId={eirId} room={room} prep={prep} />
        )}
        {selected === "studio" && (
          <StudioTab
            eirId={eirId}
            studio={studio}
            markers={markers}
            currentPhase={snap.eir.phase}
          />
        )}
        {selected === "transcript" && (
          <TranscriptTab
            eirId={eirId}
            studioSessionId={snap.links.studio_session_id}
            currentPhase={snap.eir.phase}
          />
        )}
        {selected === "chapters" && (
          <ChaptersTab
            eirId={eirId}
            studioSessionId={snap.links.studio_session_id}
            currentPhase={snap.eir.phase}
          />
        )}
        {selected === "clips" && (
          <ClipsTab
            eirId={eirId}
            studioSessionId={snap.links.studio_session_id}
            currentPhase={snap.eir.phase}
          />
        )}
        {selected === "intelligence" && (
          <PlaceholderTab snap={snap} tabKey={selected} />
        )}
        {selected === "publish" && (
          <PublishTab
            episode={episode}
            studio={studio}
            currentPhase={snap.eir.phase}
            eirId={eirId}
            pushPreview={pushPreview}
          />
        )}
        {selected === "performance" && (
          <PerformanceTab
            perf={perf}
            episodeId={snap.links.episode_id}
            eirId={eirId}
          />
        )}
      </main>
    </div>
  )
}

// ─── Tab nav link ──────────────────────────────────────────────────────

function TabLink({
  tabKey,
  eirId,
  status,
  implemented,
  label,
  requiredPhase,
  currentPhase,
}: {
  tabKey: TabKey
  eirId: string
  status: TabStatus
  implemented: boolean
  label: string
  requiredPhase: EpisodePhase
  currentPhase: EpisodePhase
}) {
  const base =
    "inline-flex items-center gap-1.5 rounded-t-xl border-b-2 px-3 py-1.5 text-[12px] transition-colors "
  const stateClass =
    status === "current"
      ? "border-violet-400 text-violet-200"
      : status === "unavailable"
        ? "border-transparent text-muted-foreground/40 cursor-not-allowed"
        : "border-transparent text-muted-foreground hover:text-foreground"
  const futureMark = implemented ? null : (
    <span
      className="rounded-md bg-amber-500/10 px-1 py-0.5 text-[9px] uppercase tracking-wider text-amber-300"
      title="غير متاح بعد"
    >
      قريباً
    </span>
  )

  if (status === "unavailable") {
    const title = `يتطلب الوصول إلى مرحلة «${PHASE_LABEL[requiredPhase]}» (الحالية: «${PHASE_LABEL[currentPhase]}»).`
    return (
      <span
        className={base + stateClass}
        title={title}
        aria-disabled="true"
        data-tab-unavailable
        data-required-phase={requiredPhase}
      >
        {label} {futureMark}
      </span>
    )
  }
  return (
    <Link
      href={`/admin/khat-brain/episodes/${eirId}?tab=${tabKey}`}
      className={base + stateClass}
    >
      {label} {futureMark}
    </Link>
  )
}

// ─── Phase timeline ────────────────────────────────────────────────────

function PhaseTimeline({
  transitions,
  currentPhase,
}: {
  transitions: Awaited<ReturnType<typeof loadEpisodeWorkspace>> extends infer S
    ? S extends { transitions: infer T }
      ? T
      : never
    : never
  currentPhase: EpisodePhase
}) {
  return (
    <div className="rounded-2xl border border-border/40 bg-card/30 p-3">
      <div className="mb-1.5 inline-flex items-center gap-1.5 text-[10.5px] uppercase tracking-wider text-muted-foreground">
        <ListChecks className="h-3 w-3" /> آخر التحولات
      </div>
      <ol className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px]">
        {transitions
          .slice()
          .reverse()
          .map((t, i, arr) => {
            const isLast = i === arr.length - 1
            return (
              <li key={t.id} className="inline-flex items-center gap-1.5">
                {t.from_phase ? (
                  <span className="text-muted-foreground/70">
                    {PHASE_LABEL[t.from_phase]}
                  </span>
                ) : (
                  <span className="text-muted-foreground/50">—</span>
                )}
                <span className="text-muted-foreground/40">→</span>
                <span
                  className={
                    isLast && t.to_phase === currentPhase
                      ? "font-medium text-violet-200"
                      : "font-medium text-foreground/85"
                  }
                >
                  {PHASE_LABEL[t.to_phase]}
                </span>
                {!isLast && <span className="text-muted-foreground/40">·</span>}
              </li>
            )
          })}
      </ol>
    </div>
  )
}

// ─── Overview tab ──────────────────────────────────────────────────────

function OverviewTab({
  snap,
  action,
}: {
  snap: NonNullable<Awaited<ReturnType<typeof loadEpisodeWorkspace>>>
  action: ReturnType<typeof nextActionFor>
}) {
  const toneCta = toneClasses(action.tone)
  return (
    <div className="space-y-4">
      {/* Next action card */}
      <Link
        href={action.href(snap.eir.id)}
        className={
          "block rounded-2xl border p-4 transition-colors " +
          (action.tone === "urgent"
            ? "border-rose-500/30 bg-rose-500/5"
            : action.tone === "warning"
              ? "border-amber-500/30 bg-amber-500/5"
              : "border-violet-500/25 bg-violet-500/5")
        }
      >
        <div className="mb-1 inline-flex items-center gap-1.5 text-[10.5px] uppercase tracking-wider text-muted-foreground">
          <Sparkles className="h-3 w-3" /> الإجراء التالي
        </div>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <h3 className="text-[14px] font-semibold leading-tight">
              {action.label}
            </h3>
            <p className="mt-1 text-[12px] leading-relaxed text-foreground/85">
              {action.description}
            </p>
          </div>
          <span
            className={
              "shrink-0 rounded-xl border px-3 py-1.5 text-[11.5px] font-medium " +
              toneCta
            }
          >
            افتح ←
          </span>
        </div>
      </Link>

      {/* Linked artifacts */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <LinkPill
          label="موسم"
          present={Boolean(snap.eir.season_id)}
          value={snap.eir.season_name}
          href={
            snap.eir.season_id
              ? `/admin/khat-brain/seasons/${snap.eir.season_id}`
              : null
          }
        />
        <LinkPill
          label="ضيف"
          present={Boolean(snap.guest)}
          value={snap.guest?.name ?? null}
          href={snap.guest ? `/admin/guests/${snap.guest.id}` : null}
        />
        <LinkPill
          label="إعداد"
          present={snap.has_preparation}
          value={snap.has_preparation ? "موجود" : null}
          href={
            snap.links.preparation_id
              ? `/admin/preparation/${snap.links.preparation_id}`
              : null
          }
        />
        <LinkPill
          label="استديو"
          present={snap.has_studio_session}
          value={snap.has_studio_session ? "موجود" : null}
          href={
            snap.links.studio_session_id
              ? `/admin/studio/${snap.links.studio_session_id}`
              : null
          }
        />
      </div>

      {/* Warnings */}
      <Warnings snap={snap} />

      {/* Meta */}
      <div className="rounded-2xl border border-border/40 bg-card/30 p-4">
        <div className="mb-1 text-[10.5px] uppercase tracking-wider text-muted-foreground">
          ملخّص
        </div>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-[12px]">
          <Field label="المرحلة" value={`${PHASE_LABEL[snap.eir.phase]} (${snap.eir.phase})`} />
          <Field label="نوع الحلقة" value={snap.eir.episode_type ?? "—"} />
          <Field label="مجال الموضوع" value={snap.eir.topic_domain ?? "—"} />
          <Field label="مستوى الخطورة" value={snap.eir.risk_level ?? "—"} />
          <Field label="مستوى الجهد" value={snap.eir.effort_level ?? "—"} />
          <Field label="آخر تحديث" value={formatDateTime(snap.eir.updated_at)} dir="ltr" />
        </dl>
      </div>
    </div>
  )
}

function Warnings({
  snap,
}: {
  snap: NonNullable<Awaited<ReturnType<typeof loadEpisodeWorkspace>>>
}) {
  const items: string[] = []
  if (!snap.guest && phaseAtLeast(snap.eir.phase, "guest_assigned")) {
    items.push("لا يوجد ضيف مرتبط رغم أنّ المرحلة بعد «اكتشاف الضيف».")
  }
  if (!snap.has_preparation && phaseAtLeast(snap.eir.phase, "approved")) {
    items.push("لا توجد سجلّ إعداد رغم أنّ الحلقة معتمدة.")
  }
  if (!snap.has_studio_session && phaseAtLeast(snap.eir.phase, "recorded")) {
    items.push("لا توجد جلسة استوديو رغم أنّ الحلقة مسجّلة.")
  }
  if (!snap.has_episode && phaseAtLeast(snap.eir.phase, "ready_to_publish")) {
    items.push("لا يوجد سجلّ حلقة رغم أنّها جاهزة للنشر.")
  }
  if (items.length === 0) return null
  return (
    <div className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-3">
      <div className="mb-1 inline-flex items-center gap-1.5 text-[11px] font-semibold text-amber-300">
        <AlertTriangle className="h-3 w-3" /> روابط ناقصة
      </div>
      <ul className="list-inside list-disc space-y-0.5 text-[11.5px] text-foreground/85">
        {items.map((m) => (
          <li key={m}>{m}</li>
        ))}
      </ul>
    </div>
  )
}

// ─── Topic tab ─────────────────────────────────────────────────────────

function TopicTab({
  snap,
}: {
  snap: NonNullable<Awaited<ReturnType<typeof loadEpisodeWorkspace>>>
}) {
  const intent = (snap.eir.editorial_intent ?? {}) as Record<string, unknown>
  const hook = stringOrNull(intent.hook)
  const why_matters = stringOrNull(intent.why_matters)
  const why_now = stringOrNull(intent.why_now)
  const goal = stringOrNull(intent.goal)
  const description = stringOrNull(intent.description)
  const main_axes = stringArray(intent.main_axes)
  const suggested_questions = stringArray(intent.suggested_questions)
  const production_notes = stringOrNull(intent.production_notes)

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-border/40 bg-card/30 p-4">
        <h2 className="mb-1 text-[14px] font-semibold leading-tight">
          {snap.eir.working_title}
        </h2>
        <div className="mb-3 flex flex-wrap gap-2 text-[11px] text-muted-foreground">
          {snap.eir.topic_domain && (
            <span className="rounded-full border border-border/40 px-2 py-0.5">
              مجال: {snap.eir.topic_domain}
            </span>
          )}
          {snap.eir.episode_type && (
            <span className="rounded-full border border-border/40 px-2 py-0.5">
              نوع: {snap.eir.episode_type}
            </span>
          )}
          {snap.eir.topic_angle_code && (
            <span
              className="rounded-full border border-border/40 px-2 py-0.5"
              dir="ltr"
            >
              {snap.eir.topic_angle_code}
            </span>
          )}
        </div>
        <div className="space-y-3 text-[12.5px] leading-relaxed text-foreground/90">
          <Block label="الخطاف" value={hook} />
          <Block label="لماذا يهم" value={why_matters} />
          <Block label="لماذا الآن" value={why_now} />
          <Block label="الهدف" value={goal} />
          <Block label="الوصف" value={description} />
        </div>
        {main_axes.length > 0 && (
          <Section title="المحاور الرئيسية">
            <ul className="list-inside list-disc space-y-0.5">
              {main_axes.map((m, i) => (
                <li key={i}>{m}</li>
              ))}
            </ul>
          </Section>
        )}
        {suggested_questions.length > 0 && (
          <Section title="أسئلة مقترحة">
            <ul className="list-inside list-disc space-y-0.5">
              {suggested_questions.map((q, i) => (
                <li key={i}>{q}</li>
              ))}
            </ul>
          </Section>
        )}
        {production_notes && (
          <Section title="ملاحظات الإنتاج">
            <p className="whitespace-pre-wrap">{production_notes}</p>
          </Section>
        )}
      </div>

      {/* Hybrid provenance card */}
      {snap.hybrid_provenance && (
        <div className="rounded-2xl border border-violet-500/25 bg-violet-500/5 p-4">
          <div className="mb-1 inline-flex items-center gap-1.5 text-[11px] font-semibold text-violet-200">
            <Compass className="h-3 w-3" /> أصل المولّد الهجين
          </div>
          <dl className="grid grid-cols-1 gap-x-4 gap-y-2 sm:grid-cols-2 text-[12px]">
            <Field
              label="إلهام السوق"
              value={snap.hybrid_provenance.market_inspiration ?? "—"}
            />
            <Field
              label="عدسة أصلية"
              value={snap.hybrid_provenance.original_lens ?? "—"}
              dir="ltr"
            />
            <Field
              label="درجة القوة"
              value={
                snap.hybrid_provenance.strength_score !== null
                  ? snap.hybrid_provenance.strength_score.toFixed(2)
                  : "—"
              }
              dir="ltr"
            />
          </dl>
        </div>
      )}
    </div>
  )
}

// ─── Guest tab ─────────────────────────────────────────────────────────

function GuestTab({
  snap,
  guestOptions,
}: {
  snap: NonNullable<Awaited<ReturnType<typeof loadEpisodeWorkspace>>>
  guestOptions: { id: string; name: string }[]
}) {
  if (!snap.guest) {
    return <GuestEmpty eirId={snap.eir.id} guestOptions={guestOptions} />
  }
  const id = snap.guest.identity ?? {}
  const social_accounts = (id.social_accounts ?? null) as Record<string, string> | null
  const story_arcs = (id.story_arcs ?? null) as Record<string, unknown> | null
  const risk_map = (id.risk_map ?? null) as Record<string, unknown> | null
  const suggested_angles = stringArray((id.suggested_angles ?? null) as unknown)
  const extraction_questions = stringArray(
    (id.extraction_questions ?? null) as unknown,
  )
  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-border/40 bg-card/30 p-4">
        <div className="flex items-start gap-4">
          {snap.guest.photo_url ? (
            <img
              src={snap.guest.photo_url}
              alt={snap.guest.name}
              className="h-16 w-16 rounded-2xl border border-border/40 object-cover"
            />
          ) : (
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-border/40 bg-muted/30 text-muted-foreground">
              <UserPlus className="h-5 w-5" />
            </div>
          )}
          <div className="min-w-0 flex-1">
            <h2 className="text-[15px] font-semibold leading-tight">
              {snap.guest.name}
            </h2>
            <div className="mt-0.5 text-[10.5px] text-muted-foreground/70" dir="ltr">
              {snap.guest.slug}
            </div>
            <Link
              href={`/admin/guests/${snap.guest.id}`}
              className="mt-1 inline-flex items-center gap-1 text-[11.5px] text-violet-200 hover:underline"
            >
              فتح ملف الضيف <ExternalLink className="h-3 w-3" />
            </Link>
          </div>
        </div>
        {snap.guest.bio && (
          <p className="mt-3 text-[12.5px] leading-relaxed text-foreground/90">
            {snap.guest.bio}
          </p>
        )}
        {social_accounts && Object.keys(social_accounts).length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {Object.entries(social_accounts).map(([platform, handle]) => (
              <span
                key={platform}
                className="rounded-full border border-border/40 px-2 py-0.5 text-[10.5px] text-muted-foreground"
                dir="ltr"
              >
                {platform}: {handle}
              </span>
            ))}
          </div>
        )}
      </div>

      {suggested_angles.length > 0 && (
        <Section title="زوايا مقترحة">
          <ul className="list-inside list-disc space-y-0.5 text-[12px]">
            {suggested_angles.map((a, i) => (
              <li key={i}>{a}</li>
            ))}
          </ul>
        </Section>
      )}
      {extraction_questions.length > 0 && (
        <Section title="أسئلة استخراج">
          <ul className="list-inside list-disc space-y-0.5 text-[12px]">
            {extraction_questions.map((q, i) => (
              <li key={i}>{q}</li>
            ))}
          </ul>
        </Section>
      )}
      {story_arcs && Object.keys(story_arcs).length > 0 && (
        <Section title="أقواس القصة">
          <pre className="overflow-x-auto rounded-xl bg-background/40 p-3 text-[10.5px]" dir="ltr">
            {JSON.stringify(story_arcs, null, 2)}
          </pre>
        </Section>
      )}
      {risk_map && Object.keys(risk_map).length > 0 && (
        <Section title="مخاطر">
          <pre className="overflow-x-auto rounded-xl bg-background/40 p-3 text-[10.5px]" dir="ltr">
            {JSON.stringify(risk_map, null, 2)}
          </pre>
        </Section>
      )}
    </div>
  )
}

function GuestEmpty({
  eirId,
  guestOptions,
}: {
  eirId: string
  guestOptions: { id: string; name: string }[]
}) {
  return (
    <div className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-6 text-center">
      <Telescope className="mx-auto h-6 w-6 text-amber-300" />
      <h3 className="mt-2 text-[13px] font-semibold">لم يتم ربط ضيف بعد</h3>
      <p className="mx-auto mt-1 max-w-md text-[12px] leading-relaxed text-foreground/80">
        اختر ضيفاً موجوداً لربطه بهذه الحلقة، أو استخدم أحد المسارات أدناه.
      </p>
      <div className="mt-4 mx-auto max-w-md">
        <AssignGuestForm
          eirId={eirId}
          guests={guestOptions}
          currentGuestId={null}
        />
      </div>
      <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
        <Link
          href="/admin/guests"
          className="inline-flex items-center gap-1.5 rounded-xl border border-border/50 bg-background/40 px-3 py-1.5 text-[12px] hover:bg-background/60"
        >
          إدارة الضيوف
        </Link>
        <Link
          href="/admin/discovery-v2"
          className="inline-flex items-center gap-1.5 rounded-xl border border-violet-500/40 bg-violet-500/10 px-3 py-1.5 text-[12px] text-violet-200 hover:bg-violet-500/20"
        >
          تشغيل اكتشاف لهذه الحلقة
        </Link>
        <Link
          href="/admin/guest-candidates"
          className="inline-flex items-center gap-1.5 rounded-xl border border-border/50 bg-background/40 px-3 py-1.5 text-[12px] hover:bg-background/60"
        >
          ترشيحات الضيوف
        </Link>
      </div>
    </div>
  )
}

// ─── Fallback for any tab whose `implemented` flag is false ───────────

function PlaceholderTab({
  snap,
  tabKey,
}: {
  snap: NonNullable<Awaited<ReturnType<typeof loadEpisodeWorkspace>>>
  tabKey: TabKey
}) {
  const def = TABS[tabKey]
  const fallbackHref = def.legacy_fallback_href?.(snap.eir.id, snap.links) ?? null
  return (
    <div className="rounded-2xl border border-border/40 bg-card/20 p-6 text-center">
      <Brain className="mx-auto h-6 w-6 text-muted-foreground" />
      <h3 className="mt-2 text-[13px] font-semibold">
        قسم «{def.label_ar}» غير متاح داخل مساحة العمل بعد
      </h3>
      <p className="mx-auto mt-1 max-w-md text-[11.5px] leading-relaxed text-muted-foreground">
        افتح الصفحة الكاملة المقابلة حتى يصل هذا القسم إلى مساحة العمل.
      </p>
      {fallbackHref ? (
        <Link
          href={fallbackHref}
          className="mt-4 inline-flex items-center gap-1.5 rounded-xl border border-violet-500/40 bg-violet-500/10 px-3 py-1.5 text-[12px] text-violet-200 hover:bg-violet-500/20"
        >
          فتح الصفحة الكاملة <ExternalLink className="h-3 w-3" />
        </Link>
      ) : (
        <div className="mt-4 inline-flex items-center gap-1.5 rounded-xl border border-dashed border-border/40 bg-background/30 px-3 py-1.5 text-[11.5px] text-muted-foreground">
          لا يوجد سجلّ مرتبط حتى الآن لهذه الحلقة.
        </div>
      )}
    </div>
  )
}

// ─── Helpers + small components ────────────────────────────────────────

function LinkPill({
  label,
  present,
  value,
  href,
}: {
  label: string
  present: boolean
  value: string | null
  href: string | null
}) {
  const cls = present
    ? "border-emerald-500/30 bg-emerald-500/5 text-foreground"
    : "border-border/40 bg-card/20 text-muted-foreground"
  const inner = (
    <div className={"rounded-2xl border p-3 " + cls}>
      <div className="text-[10.5px] uppercase tracking-wider text-muted-foreground/80">
        {label}
      </div>
      <div className="mt-0.5 truncate text-[12px] font-medium">
        {present ? (
          <span className="inline-flex items-center gap-1">
            <CheckCircle2 className="h-3 w-3 text-emerald-400" />
            {value ?? "موجود"}
          </span>
        ) : (
          "—"
        )}
      </div>
    </div>
  )
  if (href && present) {
    return (
      <Link href={href} className="block transition-opacity hover:opacity-90">
        {inner}
      </Link>
    )
  }
  return inner
}

function Field({
  label,
  value,
  dir,
}: {
  label: string
  value: string
  dir?: "ltr" | "rtl"
}) {
  return (
    <div>
      <dt className="text-[10.5px] uppercase tracking-wider text-muted-foreground">
        {label}
      </dt>
      <dd className="mt-0.5 text-[12px] text-foreground/90" dir={dir}>
        {value}
      </dd>
    </div>
  )
}

function Block({ label, value }: { label: string; value: string | null }) {
  if (!value) return null
  return (
    <div>
      <div className="text-[10.5px] uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <p className="mt-0.5 whitespace-pre-wrap">{value}</p>
    </div>
  )
}

function Section({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <div className="mt-3">
      <div className="mb-1 text-[10.5px] uppercase tracking-wider text-muted-foreground">
        {title}
      </div>
      {children}
    </div>
  )
}

function toneClasses(tone: NextActionTone): string {
  switch (tone) {
    case "urgent":
      return "border-rose-500/40 bg-rose-500/10 text-rose-200 hover:bg-rose-500/20"
    case "warning":
      return "border-amber-500/40 bg-amber-500/10 text-amber-200 hover:bg-amber-500/20"
    default:
      return "border-violet-500/40 bg-violet-500/10 text-violet-200 hover:bg-violet-500/20"
  }
}

function stringOrNull(v: unknown): string | null {
  if (typeof v === "string" && v.trim().length > 0) return v
  return null
}
function stringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return []
  return v.filter((x): x is string => typeof x === "string" && x.trim().length > 0)
}

const PHASE_ORDER: EpisodePhase[] = [
  "idea",
  "guest_discovery",
  "guest_assigned",
  "approved",
  "researching",
  "prepared",
  "ready_to_record",
  "recording",
  "recorded",
  "producing",
  "ready_to_publish",
  "published",
  "analyzing",
  "learned",
  "archived",
]
function phaseAtLeast(actual: EpisodePhase, threshold: EpisodePhase): boolean {
  return PHASE_ORDER.indexOf(actual) >= PHASE_ORDER.indexOf(threshold)
}

function SuccessBanner({ code, fields }: { code: string; fields: string | null }) {
  let message: string
  switch (code) {
    case "room_created":
      message = "تم إنشاء غرفة التسجيل."
      break
    case "pushed":
      message = fields
        ? `تم دفع الحزمة إلى الحلقة (${fields.split(",").filter(Boolean).length} حقل).`
        : "تم دفع الحزمة إلى الحلقة."
      break
    default:
      return null
  }
  return (
    <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-3 text-center text-[12px] text-emerald-200">
      <CheckCircle2 className="me-1.5 inline h-3.5 w-3.5" />
      {message}
    </div>
  )
}

void ArrowLeft
