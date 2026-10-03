import Link from "next/link"
import { notFound } from "next/navigation"

import { requireAdmin } from "@/lib/api-utils"
import { isPodcastUniverseEnabled } from "@/lib/podcast-universe/flag"
import { AdminPageHeader } from "@/app/admin/components/admin-page-header"
import { KitCard } from "@/app/admin/components/ui-kit"
import { getPersonDetail } from "@/lib/podcast-universe/queries"
import { formatCompactNumber, formatDateCompact, formatTimeSeconds } from "@/lib/shared/formatters"
import { cn } from "@/lib/utils"
import {
  APPEARANCE_STATUS_LABEL,
  BASIS_LABEL,
  EVIDENCE_LABEL,
  EVIDENCE_TONE,
  GENDER_LABEL,
  IDENTITY_LABEL,
  NO_APPEARANCE_TEXT,
  TONE_BADGE,
  countryLabel,
} from "../../labels"
import { IdentityActions, UnlinkButton } from "./person-actions"

/**
 * Podcast Universe — person detail (docs/podcast-universe-plan-v1.md §B16).
 * Every number shown answers D9: which data (evidence excerpt), which rule
 * (basis), which model/version (ai_run + prompt version on the run), and what
 * is still uncertain (status badges). Corrections are audited; nothing is deleted.
 */
export const dynamic = "force-dynamic"

function Badge({ tone, children }: { tone: keyof typeof TONE_BADGE; children: React.ReactNode }) {
  return <span className={cn("inline-block rounded-md px-1.5 py-0.5 text-[11px] font-medium", TONE_BADGE[tone])}>{children}</span>
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-[11.5px] text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 text-[13px] text-foreground">{children}</dd>
    </div>
  )
}

const LIFE_LABEL: Record<string, string> = { alive: "على قيد الحياة", deceased: "متوفى", unknown: "غير معروف" }

export default async function PodcastPersonPage({ params }: { params: Promise<{ personId: string }> }) {
  await requireAdmin()
  if (!isPodcastUniverseEnabled()) notFound()
  const { personId } = await params
  const detail = await getPersonDetail(personId)
  if (!detail) notFound()
  const p = detail.person as Record<string, string | boolean | null>
  const s = (k: string) => (p[k] == null ? null : String(p[k]))

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title={String(p.canonical_name)}
        description="سجل عالم البودكاست — هذا ليس ضيف خط إلا إذا رُبط صراحة."
        actions={
          <Link href="/admin/podcast-universe/guests" className="text-[12px] text-muted-foreground hover:text-primary">
            ← سجل الضيوف
          </Link>
        }
      />

      {p.merged_into_person_id ? (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-[13px] text-amber-700">
          هذا السجل مدموج في{" "}
          <Link className="underline" href={`/admin/podcast-universe/guests/${s("merged_into_person_id")}`}>
            {s("merged_into_name") ?? "شخص آخر"}
          </Link>
          .
        </div>
      ) : null}

      <KitCard title="الهوية">
        <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="الاسم المعتمد">{s("canonical_name")}</Field>
          <Field label="الأسماء البديلة">
            {detail.aliases.length ? detail.aliases.map((a) => a.alias).join(" · ") : "—"}
          </Field>
          <Field label="الجنسية">
            {countryLabel(s("nationality_code"))}{" "}
            <Badge tone={EVIDENCE_TONE[s("nationality_status") ?? "unknown"]}>{EVIDENCE_LABEL[s("nationality_status") ?? "unknown"]}</Badge>
            <div className="text-[11px] text-muted-foreground">المصدر: {BASIS_LABEL[s("nationality_basis") ?? "none"]}</div>
          </Field>
          <Field label="الجنس">
            {GENDER_LABEL[s("gender_marker") ?? "unknown"]}{" "}
            <Badge tone={EVIDENCE_TONE[s("gender_status") ?? "unknown"]}>{EVIDENCE_LABEL[s("gender_status") ?? "unknown"]}</Badge>
            <div className="text-[11px] text-muted-foreground">المصدر: {BASIS_LABEL[s("gender_basis") ?? "none"]}</div>
          </Field>
          <Field label="الحالة الحياتية">{LIFE_LABEL[s("life_status") ?? "unknown"]}</Field>
          <Field label="Wikidata">{s("wikidata_id") ?? "—"}</Field>
          <Field label="ربط خط">
            {p.khat_guest_id ? `ضيف خط: ${s("khat_guest_name") ?? s("khat_guest_id")}` : null}
            {p.khat_guest_id && p.khat_guest_candidate_id ? <br /> : null}
            {p.khat_guest_candidate_id ? (
              <Link className="text-primary" href={`/admin/guest-candidates/${s("khat_guest_candidate_id")}`}>
                مرشح: {s("khat_candidate_name") ?? s("khat_guest_candidate_id")}
              </Link>
            ) : null}
            {!p.khat_guest_id && !p.khat_guest_candidate_id ? "—" : null}
          </Field>
          <Field label="حالة الدليل">
            {IDENTITY_LABEL[s("identity_status") ?? "unverified"]}
            {p.needs_identity_review ? (
              <div className="mt-1">
                <Badge tone="warning">تحتاج مراجعة هوية</Badge>
              </div>
            ) : null}
            {s("identity_notes") ? <div className="text-[11px] text-muted-foreground">{s("identity_notes")}</div> : null}
          </Field>
        </dl>
      </KitCard>

      <KitCard title="الظهور في البودكاستات" subtitle="كل ظهور معه نص الدليل كما ورد حرفياً في العنوان أو الوصف.">
        {detail.appearances.length === 0 ? (
          <p className="text-muted-foreground">{NO_APPEARANCE_TEXT}.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1000px] text-[12.5px]">
              <thead className="text-[11.5px] text-muted-foreground">
                <tr>
                  <th className="py-2 pe-3 text-start font-medium">التاريخ</th>
                  <th className="py-2 pe-3 text-start font-medium">القناة / الحلقة</th>
                  <th className="py-2 pe-3 text-start font-medium">المدة</th>
                  <th className="py-2 pe-3 text-start font-medium">التعرّض (لقطة)</th>
                  <th className="py-2 pe-3 text-start font-medium">ضيف رئيسي؟</th>
                  <th className="py-2 pe-3 text-start font-medium">الصفة</th>
                  <th className="py-2 pe-3 text-start font-medium">الثقة</th>
                  <th className="py-2 pe-3 text-start font-medium">الدليل</th>
                  <th className="py-2 pe-3 text-start font-medium">الحالة</th>
                  <th className="py-2 text-start font-medium" />
                </tr>
              </thead>
              <tbody>
                {detail.appearances.map((a) => {
                  const rejected = a.verification_status === "rejected" || a.verification_status === "superseded"
                  return (
                    <tr key={String(a.id)} className={cn("border-t border-border/60 align-top", rejected && "opacity-60")}>
                      <td className="py-2 pe-3">{formatDateCompact(a.published_at as Date)}</td>
                      <td className="max-w-[18rem] py-2 pe-3">
                        <div className="text-muted-foreground">{String(a.channel_name)}</div>
                        <a
                          className="text-primary hover:underline"
                          href={`https://www.youtube.com/watch?v=${encodeURIComponent(String(a.youtube_video_id))}`}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          {String(a.title)}
                        </a>
                      </td>
                      <td className="py-2 pe-3 tabular-nums" dir="ltr">
                        {formatTimeSeconds(Number(a.duration_seconds))}
                      </td>
                      <td className="py-2 pe-3 tabular-nums" dir="ltr">
                        {a.view_count != null ? formatCompactNumber(Number(a.view_count)) : "—"}
                      </td>
                      <td className="py-2 pe-3">{a.is_primary_guest ? "نعم" : "لا"}</td>
                      <td className="py-2 pe-3">{a.role_text ? String(a.role_text) : "—"}</td>
                      <td className="py-2 pe-3 tabular-nums">{Number(a.extraction_confidence).toFixed(2)}</td>
                      <td className="max-w-[20rem] py-2 pe-3 text-[12px]">
                        <q className="text-foreground">{String(a.evidence_text ?? "")}</q>
                        <div className="text-[11px] text-muted-foreground">
                          من {a.evidence_field === "title" ? "العنوان" : "الوصف"}
                          {a.nationality_claim_text ? ` · جنسية: «${String(a.nationality_claim_text)}»` : ""}
                          {a.gender_evidence_text ? ` · جنس: «${String(a.gender_evidence_text)}»` : ""}
                        </div>
                      </td>
                      <td className="py-2 pe-3">{APPEARANCE_STATUS_LABEL[String(a.verification_status)] ?? String(a.verification_status)}</td>
                      <td className="py-2">
                        {!rejected ? <UnlinkButton personId={personId} appearanceId={String(a.id)} /> : null}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </KitCard>

      <KitCard title="مراجعة الهوية" subtitle="كل تعديل يُسجَّل باسم من نفّذه. لا حذف — الفصل والدمج بالحالة.">
        <IdentityActions
          personId={personId}
          merged={Boolean(p.merged_into_person_id)}
          appearances={detail.appearances
            .filter((a) => a.verification_status !== "rejected" && a.verification_status !== "superseded")
            .map((a) => ({ id: String(a.id), label: `${formatDateCompact(a.published_at as Date)} — ${String(a.title).slice(0, 60)}` }))}
        />
      </KitCard>

      <KitCard title="سجل التعديلات">
        {detail.events.length === 0 ? (
          <p className="text-muted-foreground">لا تعديلات.</p>
        ) : (
          <ul className="space-y-1.5 text-[12px]">
            {detail.events.map((e) => (
              <li key={String(e.id)} className="flex flex-wrap gap-2">
                <span className="tabular-nums text-muted-foreground">{formatDateCompact(e.created_at as Date)}</span>
                <span className="font-medium" dir="ltr">{String(e.action)}</span>
                <span className="text-muted-foreground" dir="ltr">{String(e.actor_id ?? "")}</span>
                {e.note ? <span>— {String(e.note)}</span> : null}
              </li>
            ))}
          </ul>
        )}
      </KitCard>
    </div>
  )
}
