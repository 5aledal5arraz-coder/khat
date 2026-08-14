"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import {
  MapPin, Scissors, Sparkles, Quote, Timer, AlertTriangle,
  Play, Square, Upload, Clock, CheckCircle2, RefreshCw,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { formatTimeSeconds } from "@/lib/shared/formatters"
import type {
  EpisodeMap, EpisodeMapBreak, EpisodeMapHook, PlatformFitLevel,
} from "@/lib/ai/episode-map"
import type { GapLabel, HookOpensWith } from "@/lib/ai/prompts/episode-map"
import { useSession, useEpisodeMap } from "../contexts"
import { TranscriptionProgressBar } from "./transcription-progress-bar"

// ─── User-facing Arabic labels (code enums → Khaled's language) ──────────────

const GAP_LABEL_AR: Record<GapLabel, { text: string; className: string }> = {
  break: { text: "قطع / سوالف", className: "bg-rose-500/10 text-rose-700" },
  pre_roll_silence: { text: "صمت ما قبل البداية", className: "bg-slate-500/10 text-slate-700" },
  dead_air: { text: "فراغ ميّت", className: "bg-amber-500/10 text-amber-700" },
  content_pause: { text: "وقفة مقصودة — لا تُقطع", className: "bg-emerald-500/10 text-emerald-700" },
}

const OPENS_WITH_AR: Record<HookOpensWith, string> = {
  stake: "يفتح بمكسب/رهان",
  direct_you: "خطاب مباشر (أنت)",
  guest_name: "يبدأ باسم الضيف",
  context: "سياق وتمهيد",
}

const PLATFORM_AR: Record<"tiktok" | "youtube" | "instagram", string> = {
  tiktok: "تيك توك",
  youtube: "يوتيوب",
  instagram: "إنستغرام",
}

const FIT_LEVEL_AR: Record<PlatformFitLevel, { text: string; className: string }> = {
  strong: { text: "قوي", className: "bg-emerald-500/10 text-emerald-700 ring-1 ring-emerald-500/30" },
  moderate: { text: "متوسط", className: "bg-amber-500/10 text-amber-700" },
  weak: { text: "ضعيف", className: "bg-muted text-muted-foreground" },
}

/**
 * Only a POINT anchor gets a run-up. «بداية الحلقة الفعلية» is a boundary
 * claim — "the episode really starts here" — and you cannot check a boundary
 * without hearing the moment before it.
 */
export const SEEK_PRE_ROLL_SECONDS = 3

/**
 * How long one "اسمع" press plays.
 *
 * Khaled's call (2026-08-04): five seconds, and no more. The button answers
 * one question — "does this land where it says?" — and the opening seconds
 * answer it. It is not a player, and playing a hook clip end to end (a first
 * attempt at this) makes verifying four clips take ten minutes.
 */
export const SEEK_PLAY_SECONDS = 5

/**
 * What one "اسمع" press should do — the whole decision, as data.
 *
 * Pulled out of the hook so it can be tested in the node environment: this
 * repo has no jsdom/component-test setup, and an untested branch here is how
 * the wrong sampling silently became the only behaviour.
 *
 * @param atSeconds  the card's in-point
 * @param endSeconds the card's out-point; its presence marks this as a RANGE
 *   (a hook clip) rather than a point anchor. It bounds playback but does not
 *   extend it — a 5-second sample of a 3-second clip stops with the clip.
 */
export function resolvePlayback(
  atSeconds: number,
  endSeconds?: number,
): { startAt: number; stopAt: number | null; playSeconds: number } {
  const isRange = typeof endSeconds === "number" && endSeconds > atSeconds
  if (isRange) {
    // No run-up here: the question is how the CLIP opens, so a pre-roll would
    // spend the first seconds on audio that is not part of it.
    return {
      startAt: atSeconds,
      stopAt: Math.min(endSeconds, atSeconds + SEEK_PLAY_SECONDS),
      playSeconds: Math.min(SEEK_PLAY_SECONDS, endSeconds - atSeconds),
    }
  }
  return {
    startAt: Math.max(0, atSeconds - SEEK_PRE_ROLL_SECONDS),
    stopAt: null,
    playSeconds: SEEK_PLAY_SECONDS,
  }
}

/** Honest expectation set BEFORE the click — transcription is minutes, not seconds. */
const EXPECTED_COPY =
  "يفرّغ التسجيل كاملاً بالتوقيتات ثم يحلّله — يستغرق عادةً عدة دقائق لتسجيل بطول ساعتين. لا تغلق الصفحة."

// ─── One shared <audio> seeker for all "اسمع" buttons ────────────────────────

function useAudioSeeker(sessionId: string) {
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  /** End of the range currently playing; null while a point anchor plays. */
  const stopAtRef = useRef<number | null>(null)
  const [playingKey, setPlayingKey] = useState<string | null>(null)

  const stop = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
    stopAtRef.current = null
    const el = audioRef.current
    if (el) el.pause()
    setPlayingKey(null)
  }, [])

  /**
   * @param atSeconds  where playback starts
   * @param endSeconds end of a RANGE. Given ⇒ play the clip whole, start to
   *   end, with no pre-roll — the range start is already the intended in-point.
   *   Omitted ⇒ the legacy point-anchor taste (3s early, 8s long).
   *
   *   Why the range case exists: a hook clip is minutes long and its summary
   *   describes ALL of it, so an 8-second sample of the opening could not
   *   match what the card promises — it reads as a wrong timestamp when the
   *   timestamp is in fact correct.
   */
  const play = useCallback(
    (key: string, atSeconds: number, endSeconds?: number) => {
      const el = audioRef.current
      if (!el) return
      // Toggle off if this same row is already playing.
      if (playingKey === key) {
        stop()
        return
      }
      if (timerRef.current) clearTimeout(timerRef.current)
      const { startAt, stopAt, playSeconds } = resolvePlayback(
        atSeconds,
        endSeconds,
      )
      stopAtRef.current = stopAt
      el.currentTime = startAt
      if (stopAt == null) {
        // Point anchor: a wall-clock timer is enough for a fixed short taste.
        timerRef.current = setTimeout(() => {
          el.pause()
          setPlayingKey(null)
          timerRef.current = null
        }, playSeconds * 1000)
      }
      // A range ends on `timeupdate` instead, so a slow seek or a stalled
      // buffer cannot truncate the clip.
      void el.play().catch(() => {}) // autoplay/format failures are non-fatal
      setPlayingKey(key)
    },
    [playingKey, stop],
  )

  /** Range out-point. Point anchors leave `stopAtRef` null and are unaffected. */
  const handleTimeUpdate = useCallback(() => {
    const el = audioRef.current
    const stopAt = stopAtRef.current
    if (!el || stopAt == null) return
    if (el.currentTime >= stopAt) stop()
  }, [stop])

  useEffect(() => stop, [stop]) // cleanup on unmount

  const audioEl = (
    <audio
      ref={audioRef}
      src={`/api/admin/studio/${sessionId}/audio`}
      preload="none"
      onTimeUpdate={handleTimeUpdate}
      onEnded={() => setPlayingKey(null)}
    />
  )

  return { play, playingKey, audioEl }
}

/**
 * Honest transcript-health banner: when Phase 1 FILTERED whisper-loop garbage, the
 * map has HOLES the editor must know about — a silent gap is exactly the dishonesty
 * this pipeline refuses (Wave-1.5 #7). Renders only when there is something to say;
 * defensive against older persisted maps that predate `transcript_health`.
 */
function TranscriptHealthBanner({ map }: { map: EpisodeMap }) {
  const health = map.transcript_health
  if (!health) return null
  const hasDrops = health.dropped_seconds > 0 || health.dropped_intervals?.length > 0
  const suspect = health.suspect_run
  if (!hasDrops && !suspect) return null

  return (
    <div className="rounded-2xl border border-amber-500/40 bg-amber-500/5 p-4">
      <div className="inline-flex items-center gap-2 text-[12px] font-semibold text-amber-700">
        <AlertTriangle className="h-4 w-4" />
        تنبيه أمانة: أُزيلت مناطق تكرار غير طبيعي من التفريغ
      </div>
      {hasDrops && (
        <p className="mt-2 text-[11.5px] leading-relaxed text-foreground/85">
          حُذف {Math.round(health.dropped_seconds)} ثانية ({health.dropped_segments} مقطع) بسبب
          تكرار غير طبيعي في التفريغ (غالباً تشويش/صمت طويل). بُنيت الخريطة على الباقي النظيف،
          لكن هذه الفترات <span className="font-semibold">فجوات</span> لا يوثق بمحتواها:
        </p>
      )}
      {hasDrops && health.dropped_intervals?.length > 0 && (
        <ul className="mt-1.5 flex flex-wrap gap-1.5">
          {health.dropped_intervals.map((iv, i) => (
            <li
              key={`hole-${i}`}
              className="rounded-md bg-amber-500/10 px-2 py-0.5 text-[10.5px] font-medium tabular-nums text-amber-700"
              dir="ltr"
            >
              {formatTimeSeconds(iv.start)} – {formatTimeSeconds(iv.end)}
            </li>
          ))}
        </ul>
      )}
      {suspect && (
        <p className="mt-2 text-[11px] leading-relaxed text-amber-700/90">
          منطقة مشبوهة (تكرار حدّي لم يُحذف) عند{" "}
          <span className="font-semibold tabular-nums" dir="ltr">
            {formatTimeSeconds(suspect.start_seconds)} – {formatTimeSeconds(suspect.end_seconds)}
          </span>{" "}
          — راجعها بالأذن قبل الاعتماد عليها.
        </p>
      )}
    </div>
  )
}

function ListenButton({
  active,
  onClick,
  title = "اسمع ٥ ثوانٍ حول هذا التوقيت للتأكد بالأذن",
}: {
  active: boolean
  onClick: () => void
  /** Clips say they start on the in-point; the default describes the anchor. */
  title?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[11px] font-medium transition-colors",
        active
          ? "border-purple-400 bg-purple-600 text-white"
          : "border-purple-300/60 bg-white text-purple-700 hover:bg-purple-50",
      )}
      title={title}
    >
      {active ? <Square className="h-3 w-3" /> : <Play className="h-3 w-3" />}
      {active ? "إيقاف" : "اسمع"}
    </button>
  )
}

// ─── Presentational map (pure — takes the map as a prop) ─────────────────────

export function EpisodeMapView({
  map,
  sessionId,
}: {
  map: EpisodeMap
  sessionId: string
}) {
  const { play, playingKey, audioEl } = useAudioSeeker(sessionId)

  return (
    <div className="space-y-4">
      {audioEl}

      {/* ── Honesty banner: filtered-out (garbage) holes the map skips over ── */}
      <TranscriptHealthBanner map={map} />

      {/* ── True start — the headline number, trusted via its proof sentence ── */}
      <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="inline-flex items-center gap-2 text-[12px] font-semibold text-emerald-700">
            <MapPin className="h-4 w-4" />
            بداية الحلقة الفعلية
          </div>
          <ListenButton
            active={playingKey === "true_start"}
            onClick={() => play("true_start", map.episode_true_start)}
          />
        </div>
        <div className="mt-2 flex items-baseline gap-2">
          <span
            className="text-3xl font-bold tabular-nums text-emerald-700"
            dir="ltr"
          >
            {formatTimeSeconds(map.episode_true_start)}
          </span>
          <span className="text-[11px] text-muted-foreground">
            ابدأ المونتاج من هنا
          </span>
        </div>

        {/* The proof — how Khaled trusts the number without opening the editor. */}
        <div className="mt-3 rounded-xl border border-emerald-500/20 bg-white/70 p-3 dark:bg-emerald-950/10">
          <div className="mb-1 inline-flex items-center gap-1.5 text-[10.5px] font-medium text-emerald-700/80">
            <Quote className="h-3 w-3" />
            أول جملة حقيقية (منسوخة حرفياً من التفريغ)
          </div>
          <p className="text-[13px] leading-relaxed text-foreground" dir="rtl">
            «{map.first_real_sentence}»
          </p>
        </div>

        {map.pre_roll_summary && (
          <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
            ما قبلها: {map.pre_roll_summary}
          </p>
        )}
      </div>

      {/* ── Breaks ─────────────────────────────────────────────────────────── */}
      <section className="space-y-2">
        <div className="flex items-center gap-2 px-1 text-[12px] font-semibold text-foreground">
          <Scissors className="h-4 w-4 text-rose-700" />
          فترات القطع والصمت
          <span className="rounded-md bg-muted px-1.5 py-0.5 text-[10.5px] font-medium text-muted-foreground">
            {map.breaks.length}
          </span>
        </div>
        {map.breaks.length === 0 ? (
          <p className="rounded-xl border border-border/40 bg-card/40 px-3 py-2.5 text-[11.5px] text-muted-foreground">
            لم يرصد النظام أي فجوات صمت طويلة.
          </p>
        ) : (
          <ul className="space-y-2">
            {map.breaks.map((b: EpisodeMapBreak, i) => {
              const label = GAP_LABEL_AR[b.label]
              const key = `break-${i}`
              return (
                <li
                  key={key}
                  className="rounded-xl border border-border/40 bg-card/40 p-3"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="inline-flex items-center gap-2">
                      <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="text-[12.5px] font-medium tabular-nums" dir="ltr">
                        {formatTimeSeconds(b.start_seconds)} – {formatTimeSeconds(b.end_seconds)}
                      </span>
                      <span className="text-[10.5px] text-muted-foreground">
                        ({Math.round(b.duration_seconds)}s)
                      </span>
                    </div>
                    <div className="inline-flex items-center gap-2">
                      <span
                        className={cn(
                          "rounded-md px-2 py-0.5 text-[10.5px] font-medium",
                          label.className,
                        )}
                      >
                        {label.text}
                      </span>
                      <ListenButton
                        active={playingKey === key}
                        onClick={() => play(key, b.start_seconds)}
                      />
                    </div>
                  </div>
                  {b.label_reason && (
                    <p className="mt-1.5 text-[11px] leading-relaxed text-muted-foreground">
                      {b.label_reason}
                    </p>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </section>

      {/* ── Hook candidates ────────────────────────────────────────────────── */}
      <section className="space-y-2">
        <div className="flex items-center gap-2 px-1 text-[12px] font-semibold text-foreground">
          <Sparkles className="h-4 w-4 text-primary" />
          مقاطع الهوك المرشّحة
          <span className="rounded-md bg-muted px-1.5 py-0.5 text-[10.5px] font-medium text-muted-foreground">
            {map.hook_candidates.length}
          </span>
        </div>
        {map.hook_candidates.length === 0 ? (
          <p className="rounded-xl border border-border/40 bg-card/40 px-3 py-2.5 text-[11.5px] text-muted-foreground">
            لم يُقترح أي مقطع هوك.
          </p>
        ) : (
          <ul className="space-y-2">
            {map.hook_candidates.map((h: EpisodeMapHook, i) => {
              const key = `hook-${i}`
              return (
                <li
                  key={key}
                  className="rounded-xl border border-primary/20 bg-primary/5 p-3"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="inline-flex items-center gap-2">
                      <span className="flex h-5 w-5 items-center justify-center rounded-md bg-primary text-[10.5px] font-bold text-white tabular-nums">
                        {h.rank}
                      </span>
                      <span className="text-[12.5px] font-medium tabular-nums" dir="ltr">
                        {formatTimeSeconds(h.start_seconds)} – {formatTimeSeconds(h.end_seconds)}
                      </span>
                      <span className="rounded-md bg-primary/10 px-2 py-0.5 text-[10.5px] font-medium text-primary">
                        {OPENS_WITH_AR[h.opens_with]}
                      </span>
                    </div>
                    <ListenButton
                      active={playingKey === key}
                      onClick={() => play(key, h.start_seconds, h.end_seconds)}
                      title="اسمع أول ٥ ثوانٍ من المقطع — من بدايته بالضبط"
                    />
                  </div>

                  {h.why && (
                    <p className="mt-1.5 text-[11px] leading-relaxed text-muted-foreground">
                      {h.why}
                    </p>
                  )}

                  {/* Platform fit — code-derived, per marzouq's finding. */}
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    {(["tiktok", "youtube", "instagram"] as const).map((p) => {
                      const level = h.platform_fit[p]
                      const fit = FIT_LEVEL_AR[level]
                      const recommended = h.platform_fit.recommended.includes(p)
                      return (
                        <span
                          key={p}
                          className={cn(
                            "inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[10.5px] font-medium",
                            fit.className,
                          )}
                        >
                          {recommended && <CheckCircle2 className="h-3 w-3" />}
                          {PLATFORM_AR[p]}: {fit.text}
                        </span>
                      )
                    })}
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </section>

      {/* Provenance — quiet, but present. */}
      <p className="px-1 text-[10px] text-muted-foreground">
        وُلّدت عبر {map.model_name} · {map.prompt_version}
      </p>
    </div>
  )
}

// ─── Stage container — trigger / poll / map (Studio Wave 2, Stage 1) ─────────

export function StageEpisodeMap() {
  const { sessionId } = useSession()
  const { map, status, error, elapsedSeconds, progress, generate } = useEpisodeMap()

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3 px-1">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-100 dark:bg-emerald-950/40">
          <MapPin className="h-4 w-4 text-emerald-700 dark:text-emerald-400" />
        </div>
        <div>
          <h2 className="text-[13px] font-semibold">الخريطة الزمنية للتسجيل الخام</h2>
          <span className="text-[11px] text-muted-foreground">
            بداية الحلقة الفعلية · فترات القطع · مقاطع الهوك
          </span>
        </div>
      </div>

      <div className="rounded-2xl border border-border/40 bg-card/50 p-4">
        {/* No map yet, idle → trigger. */}
        {status === "idle" && !map && (
          <div className="space-y-3">
            <p className="inline-flex items-start gap-1.5 text-[11.5px] leading-relaxed text-muted-foreground">
              <Timer className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
              <span>{EXPECTED_COPY}</span>
            </p>
            <button
              type="button"
              onClick={generate}
              className="inline-flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-2 text-[12px] font-medium text-emerald-700 hover:bg-emerald-500/20"
            >
              <MapPin className="h-4 w-4" />
              توليد الخريطة الزمنية
            </button>
          </div>
        )}

        {/* Running → determinate progress bar (stage · % · chunk · ETA), with the
            elapsed counter kept as its quiet secondary line. */}
        {status === "running" && (
          <TranscriptionProgressBar
            progress={progress}
            elapsedSeconds={elapsedSeconds}
            accent="emerald"
          />
        )}

        {/* Error. */}
        {status === "error" && (
          <div className="space-y-3">
            <div className="rounded-xl border border-rose-500/30 bg-rose-500/5 p-3 text-[12px] text-rose-700">
              <div className="inline-flex items-center gap-1.5 font-semibold">
                <AlertTriangle className="h-3.5 w-3.5" />
                تعذّر توليد الخريطة
              </div>
              <p className="mt-1 text-foreground/85">{error}</p>
            </div>
            <button
              type="button"
              onClick={generate}
              className="inline-flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-2 text-[12px] font-medium text-emerald-700 hover:bg-emerald-500/20"
            >
              <RefreshCw className="h-4 w-4" />
              إعادة المحاولة
            </button>
          </div>
        )}

        {/* Ready → the map + a low-emphasis re-generate. */}
        {status === "ready" && map && (
          <div className="space-y-4">
            <EpisodeMapView map={map} sessionId={sessionId} />
            <StageTwoLink rawSessionId={sessionId} />
            <button
              type="button"
              onClick={generate}
              className="inline-flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground hover:text-foreground"
            >
              <RefreshCw className="h-3 w-3" />
              إعادة توليد الخريطة
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

/**
 * The bridge to Stage 2 — once the map is applied and Khaled has his edited cut,
 * this starts the full publishing pipeline. A deliberate HARD navigation to the
 * studio home with the audio upload pre-opened on "edited": it lands on a fresh
 * list view regardless of the current in-session SPA state, and works no matter
 * how many raw maps were viewed first. This is an intentional stage transition,
 * not a hot path, so a full reload is the right, simplest behaviour.
 *
 * The raw session id rides along as `?raw=` so the edited upload links back to
 * the SAME episode project instead of orphaning a disconnected session.
 */
function StageTwoLink({ rawSessionId }: { rawSessionId: string }) {
  return (
    <button
      type="button"
      onClick={() =>
        window.location.assign(
          `/admin/studio?upload=edited&raw=${encodeURIComponent(rawSessionId)}`,
        )
      }
      className="flex w-full items-center justify-between gap-3 rounded-xl border border-purple-300/60 bg-purple-50/60 px-4 py-3 text-start text-purple-700 transition-colors hover:bg-purple-100/60 dark:border-purple-900/40 dark:bg-purple-950/20"
    >
      <span className="min-w-0">
        <span className="block text-[12.5px] font-semibold">
          المرحلة ٢: ارفع النسخة بعد المونتاج
        </span>
        <span className="mt-0.5 block text-[11px] leading-relaxed text-purple-700/70">
          بعد تطبيق الخريطة على المونتاج، ارفع الصوت النهائي لتوليد حزمة النشر.
        </span>
      </span>
      <Upload className="h-4 w-4 shrink-0" />
    </button>
  )
}
