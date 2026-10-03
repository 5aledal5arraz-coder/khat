import Link from "next/link"

import { requireAdmin } from "@/lib/api-utils"
import { notFound } from "next/navigation"
import { isPodcastUniverseEnabled } from "@/lib/podcast-universe/flag"
import { AdminPageHeader } from "@/app/admin/components/admin-page-header"
import { KitCard } from "@/app/admin/components/ui-kit"
import { GUEST_PAGE_SIZE, guestEmptyState, listChannelOptions, parseGuestFilters, searchGuests } from "@/lib/podcast-universe/queries"
import { formatCompactNumber, formatDateCompact } from "@/lib/shared/formatters"
import { cn } from "@/lib/utils"
import { kuwaitContextLabel } from "@/lib/podcast-universe/kuwait-context"
import {
  EVIDENCE_LABEL,
  EVIDENCE_TONE,
  GENDER_LABEL,
  IDENTITY_LABEL,
  NO_APPEARANCE_TEXT,
  TONE_BADGE,
  countryLabel,
} from "../labels"

/**
 * Podcast Universe — guest registry (docs/podcast-universe-plan-v1.md §B15).
 *
 * Views are shown as «التعرّض» (exposure), never popularity or quality (D11),
 * and there is no rehost score in M1. «كويتي مؤكَّد» requires VERIFIED states;
 * «محتمل» is metadata-only evidence (Decision 3).
 */
export const dynamic = "force-dynamic"

type SP = Record<string, string | undefined>

function Badge({ tone, children }: { tone: keyof typeof TONE_BADGE; children: React.ReactNode }) {
  return <span className={cn("inline-block rounded-md px-1.5 py-0.5 text-[11px] font-medium", TONE_BADGE[tone])}>{children}</span>
}

export default async function PodcastGuestsPage({ searchParams }: { searchParams: Promise<SP> }) {
  await requireAdmin()
  if (!isPodcastUniverseEnabled()) notFound()
  const sp = await searchParams
  const filters = parseGuestFilters(sp)
  const filtered = Boolean(filters.nationality || filters.gender || filters.identity || filters.channelId || filters.minAppearances || filters.lastFrom || filters.lastTo)
  const [{ rows, total }, channels] = await Promise.all([searchGuests(filters), listChannelOptions()])
  // Decision 12 wording ONLY when the name matches nobody at all — not when a
  // filter merely excluded the person (noura 2026-10-03).
  const nameOnlyTotal =
    rows.length === 0 && filters.q
      ? filtered
        ? (await searchGuests({ q: filters.q, page: 1 })).total
        : total
      : null
  const empty = guestEmptyState({ q: filters.q, total, nameOnlyTotal })
  const page = filters.page ?? 1
  const pages = Math.max(1, Math.ceil(total / GUEST_PAGE_SIZE))
  const qs = (p: number) => {
    const u = new URLSearchParams()
    for (const [k, v] of Object.entries(sp)) if (v && k !== "page") u.set(k, v)
    u.set("page", String(p))
    return `?${u.toString()}`
  }
  const select = "rounded-md border border-input bg-background px-2 py-1.5 text-[13px]"

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="عالم البودكاست — سجل الضيوف"
        description="من ظهر ضيفاً في البودكاستات المفهرسة. الجنسية والجنس حالات دليل، لا تخمين."
        actions={
          <Link href="/admin/podcast-universe/guests/review" className="text-[12px] font-medium text-primary hover:underline">
            مراجعة الجنسية ←
          </Link>
        }
      />

      <KitCard title="بحث وتصفية">
        <form method="get" className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="text-[12px] text-muted-foreground lg:col-span-2">
            الاسم أو الاسم البديل
            <input name="q" defaultValue={sp.q ?? ""} className={cn(select, "mt-1 block w-full")} placeholder="مثال: د. فلان الفلاني" />
          </label>
          <label className="text-[12px] text-muted-foreground">
            الجنسية
            <select name="nat" defaultValue={filters.nationality} className={cn(select, "mt-1 block w-full")}>
              <option value="">الكل</option>
              <option value="verified_kw">كويتي مؤكَّد</option>
              <option value="probable_kw">كويتي محتمل</option>
              <option value="unknown">غير معروف / متعارض</option>
              <option value="other">جنسية أخرى</option>
            </select>
          </label>
          <label className="text-[12px] text-muted-foreground">
            الجنس
            <select name="gender" defaultValue={filters.gender} className={cn(select, "mt-1 block w-full")}>
              <option value="">الكل</option>
              <option value="verified_male">ذكر مؤكَّد</option>
              <option value="probable_male">ذكر محتمل</option>
              <option value="unknown">غير معروف</option>
            </select>
          </label>
          <label className="text-[12px] text-muted-foreground">
            الكويت (ثلاثة فلاتر منفصلة)
            <select name="kw" defaultValue={filters.kw} className={cn(select, "mt-1 block w-full")}>
              <option value="">بلا</option>
              <option value="verified_men">كويتيون مؤكدون (رجال)</option>
              <option value="context_men">سياق كويتي — الجنسية غير متحققة</option>
              <option value="kw_podcast_men">كل من ظهر في بودكاست كويتي</option>
            </select>
          </label>
          <label className="text-[12px] text-muted-foreground">
            الهوية
            <select name="identity" defaultValue={filters.identity} className={cn(select, "mt-1 block w-full")}>
              <option value="">الكل</option>
              <option value="verified">مؤكَّدة</option>
              <option value="probable">محتملة</option>
              <option value="unverified">غير متحقَّق</option>
              <option value="review">تحتاج مراجعة</option>
            </select>
          </label>
          <label className="text-[12px] text-muted-foreground">
            القناة
            <select name="channel" defaultValue={sp.channel ?? ""} className={cn(select, "mt-1 block w-full")}>
              <option value="">كل القنوات</option>
              {channels.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label className="text-[12px] text-muted-foreground">
            ظهورات على الأقل
            <input name="min" type="number" min={1} defaultValue={sp.min ?? ""} dir="ltr" className={cn(select, "mt-1 block w-full")} />
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label className="text-[12px] text-muted-foreground">
              آخر ظهور من
              <input name="from" type="date" defaultValue={sp.from ?? ""} className={cn(select, "mt-1 block w-full")} />
            </label>
            <label className="text-[12px] text-muted-foreground">
              إلى
              <input name="to" type="date" defaultValue={sp.to ?? ""} className={cn(select, "mt-1 block w-full")} />
            </label>
          </div>
          <div className="flex items-end gap-2 lg:col-span-4">
            <button type="submit" className="h-10 rounded-md bg-primary px-4 text-[13px] font-medium text-primary-foreground">
              بحث
            </button>
            <Link href="/admin/podcast-universe/guests" className="text-[12px] text-muted-foreground underline-offset-4 hover:underline">
              مسح التصفية
            </Link>
            <span className="ms-auto text-[12px] text-muted-foreground tabular-nums">{total.toLocaleString("en-US")} شخص</span>
          </div>
        </form>
      </KitCard>

      <KitCard title="الأشخاص" subtitle="«التعرّض» = مجموع مشاهدات حلقاتهم المفهرسة وقت آخر قراءة — مؤشر انتشار، لا جودة.">
        {rows.length === 0 ? (
          <p className="text-muted-foreground">
            {empty === "no_indexed_appearance" ? `«${filters.q}» — ${NO_APPEARANCE_TEXT}.` : "لا نتائج بهذه التصفية."}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1100px] text-[13px]">
              <thead className="text-[11.5px] text-muted-foreground">
                <tr>
                  <th className="py-2 pe-3 text-start font-medium">الشخص</th>
                  <th className="py-2 pe-3 text-start font-medium">الجنسية</th>
                  <th className="py-2 pe-3 text-start font-medium">الجنس</th>
                  <th className="py-2 pe-3 text-start font-medium">الهوية</th>
                  <th className="py-2 pe-3 text-start font-medium">ظهورات</th>
                  <th className="py-2 pe-3 text-start font-medium">قنوات</th>
                  <th className="py-2 pe-3 text-start font-medium">أول ظهور</th>
                  <th className="py-2 pe-3 text-start font-medium">آخر ظهور</th>
                  <th className="py-2 pe-3 text-start font-medium">آخر قناة / حلقة</th>
                  <th className="py-2 pe-3 text-start font-medium">التعرّض</th>
                  <th className="py-2 pe-3 text-start font-medium">ربط خط</th>
                  <th className="py-2 text-start font-medium">مراجعة</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-t border-border/60 align-top">
                    <td className="py-2 pe-3">
                      <Link href={`/admin/podcast-universe/guests/${r.id}`} className="font-semibold text-foreground hover:text-primary">
                        {r.canonical_name}
                      </Link>
                    </td>
                    <td className="py-2 pe-3">
                      <div>{countryLabel(r.nationality_code)}</div>
                      <Badge tone={EVIDENCE_TONE[r.nationality_status]}>{EVIDENCE_LABEL[r.nationality_status]}</Badge>
                      {(() => {
                        // Context badge — derived, never a nationality claim.
                        const label = kuwaitContextLabel(r.kw_apps >= 2 ? "strong" : r.kw_apps === 1 ? "weak" : "none", r.nationality_status === "verified")
                        return label ? <div className="mt-1"><Badge tone="purple">{label}</Badge></div> : null
                      })()}
                    </td>
                    <td className="py-2 pe-3">
                      <div>{GENDER_LABEL[r.gender_marker]}</div>
                      <Badge tone={EVIDENCE_TONE[r.gender_status]}>{EVIDENCE_LABEL[r.gender_status]}</Badge>
                    </td>
                    <td className="py-2 pe-3 text-[12px]">{IDENTITY_LABEL[r.identity_status] ?? r.identity_status}</td>
                    <td className="py-2 pe-3 tabular-nums">{r.appearances}</td>
                    <td className="py-2 pe-3 tabular-nums">{r.channels}</td>
                    <td className="py-2 pe-3 text-[12px]">{r.first_appearance ? formatDateCompact(r.first_appearance) : "—"}</td>
                    <td className="py-2 pe-3 text-[12px]">{r.last_appearance ? formatDateCompact(r.last_appearance) : "—"}</td>
                    <td className="max-w-[16rem] py-2 pe-3 text-[12px]">
                      <div className="text-muted-foreground">{r.latest_channel ?? "—"}</div>
                      <div className="truncate" title={r.latest_episode_title ?? ""}>
                        {r.latest_episode_title ?? ""}
                      </div>
                    </td>
                    <td className="py-2 pe-3 tabular-nums" dir="ltr">
                      {r.exposure != null ? formatCompactNumber(r.exposure) : "—"}
                    </td>
                    <td className="py-2 pe-3 text-[12px]">
                      {r.khat_guest_id ? "ضيف خط" : r.khat_guest_candidate_id ? "مرشح" : "—"}
                    </td>
                    <td className="py-2 text-[12px]">{r.needs_identity_review ? <Badge tone="warning">تحتاج مراجعة</Badge> : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {pages > 1 ? (
          <nav className="mt-4 flex items-center gap-3 text-[12px]" aria-label="الصفحات">
            {page > 1 ? <Link href={qs(page - 1)} className="text-primary">السابق</Link> : null}
            <span className="tabular-nums text-muted-foreground">
              {page} / {pages}
            </span>
            {page < pages ? <Link href={qs(page + 1)} className="text-primary">التالي</Link> : null}
          </nav>
        ) : null}
      </KitCard>
    </div>
  )
}
