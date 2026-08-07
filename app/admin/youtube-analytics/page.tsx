import { requireAdmin } from "@/lib/api-utils"
import { latestSnapshot, type AgeShare, type CountryShare } from "@/lib/youtube/analytics"
import { loadGrantStatus, oauthConfigProblem } from "@/lib/youtube/oauth"
import { encryptionKeyStatus } from "@/lib/youtube/token-crypto"

import { ConnectPanel, type SnapshotView } from "./connect-panel"

/**
 * YouTube Analytics — the one screen that can reach the channel's own numbers.
 *
 * ── WHY THIS SCREEN EXISTS ────────────────────────────────────────────────
 * Khalid, 2026-08-06: «عندي داتا كامله عن الجمهور الاعمار الدول فترات الذروه
 * كل شي مسجل عندي يوتيوب». He is right, and the site could not see any of it.
 * Everything YouTube-shaped in this app authenticates with `YOUTUBE_API_KEY`,
 * a public key against the Data API, which returns views, subscribers and
 * video metadata and NOTHING about who watched. Age bands, country mix and
 * peak hours belong to the channel owner; Google serves them only to a caller
 * acting as that owner, over OAuth. That is the entire gap this closes.
 *
 * The numbers land in `youtube_audience_snapshots` with the window that
 * produced them, and `/partner` reads the stored snapshot rather than the live
 * API — a page that quotes figures to sponsors must not go blank because
 * Google had a bad minute, and a stored row can say when it was true.
 */
export const dynamic = "force-dynamic"

function fmt(d: Date | null): string | null {
  return d ? new Date(d).toISOString().slice(0, 16).replace("T", " ") : null
}

export default async function YouTubeAnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{ connected?: string; error?: string }>
}) {
  await requireAdmin()
  const sp = await searchParams

  const [grant, countries, ages] = await Promise.all([
    loadGrantStatus().catch(() => null),
    latestSnapshot<CountryShare>("countries").catch(() => null),
    latestSnapshot<AgeShare>("age_gender").catch(() => null),
  ])

  const snapshots: SnapshotView[] = []
  if (countries) {
    snapshots.push({
      report: "countries",
      periodStart: countries.periodStart,
      periodEnd: countries.periodEnd,
      measuredAt: fmt(countries.measuredAt) ?? "",
      top: countries.rows.slice(0, 6).map((r) => ({ label: r.label, percent: r.percent })),
    })
  }
  if (ages) {
    snapshots.push({
      report: "age_gender",
      periodStart: ages.periodStart,
      periodEnd: ages.periodEnd,
      measuredAt: fmt(ages.measuredAt) ?? "",
      top: ages.rows.slice(0, 6).map((r) => ({ label: r.band, percent: r.percent })),
    })
  }

  const keyStatus = encryptionKeyStatus()

  return (
    <div className="mx-auto max-w-4xl p-6" dir="rtl">
      <header className="mb-6">
        <h1 className="text-heading font-bold">YouTube Analytics</h1>
        <p className="mt-1.5 text-caption text-muted-foreground">
          الأعمار والدول — أرقام القناة الخاصة. مفتاح الـ API العام لا يرجعها مهما كان،
          فهي تحتاج موافقة من حساب جوجل المالك للقناة.
        </p>
      </header>

      {/* The callback comes back here with its outcome in the URL rather than
          rendering its own page — one screen owns this feature, and the
          operator ends where they started. */}
      {sp.connected ? (
        <p className="mb-5 rounded-lg bg-primary/5 p-3 text-caption text-primary">
          تم الربط بنجاح مع {sp.connected}
        </p>
      ) : null}
      {sp.error ? (
        <p className="mb-5 rounded-lg bg-accent/5 p-3 text-caption text-accent-strong">
          {sp.error}
        </p>
      ) : null}

      <ConnectPanel
        configProblem={oauthConfigProblem()}
        keyProblem={keyStatus.ok ? null : (keyStatus.reason ?? "مفتاح التشفير غير مضبوط")}
        grant={
          grant
            ? {
                channelId: grant.channel_id,
                account: grant.google_account_email,
                connectedBy: grant.connected_by,
                connectedAt: fmt(grant.connected_at),
                lastUsedAt: fmt(grant.last_used_at),
                lastError: grant.last_error,
                lastErrorAt: fmt(grant.last_error_at),
              }
            : null
        }
        snapshots={snapshots}
      />
    </div>
  )
}
