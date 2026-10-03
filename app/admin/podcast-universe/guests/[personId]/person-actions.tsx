"use client"

import { useState, useTransition } from "react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { runAction } from "@/app/admin/components/run-action"
import type { PodcastEvidenceStatus, PodcastGenderMarker } from "@/lib/db/schema/podcast-universe"
import {
  addAliasAction,
  linkCandidateAction,
  linkKhatGuestAction,
  markReviewedAction,
  mergeIntoAction,
  setGenderAction,
  setNationalityAction,
  splitAction,
  unlinkAppearanceAction,
  type PuActionResult,
} from "../../actions"

function useAction() {
  const [pending, start] = useTransition()
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const run = (fn: () => Promise<PuActionResult>) =>
    start(async () => {
      // runAction never rejects, so a dropped request cannot leave the
      // transition (and every button disabled on it) stuck pending.
      const outcome = await runAction(fn)
      if (!outcome.ok) return setMsg({ ok: false, text: outcome.message })
      const r = outcome.data
      setMsg(r.ok ? { ok: true, text: r.message } : { ok: false, text: r.error })
    })
  return { pending, msg, run }
}

function Feedback({ msg }: { msg: { ok: boolean; text: string } | null }) {
  if (!msg) return null
  return (
    <p role="status" className={cn("mt-1 text-[11.5px]", msg.ok ? "text-emerald-700" : "text-destructive")}>
      {msg.text}
    </p>
  )
}

const input = "mt-1 block w-full rounded-md border border-input bg-background px-2 py-1.5 text-[13px] text-foreground"

export function UnlinkButton({ personId, appearanceId }: { personId: string; appearanceId: string }) {
  const { pending, msg, run } = useAction()
  return (
    <div>
      <Button
        size="sm"
        variant="ghost"
        disabled={pending}
        onClick={() => {
          const note = window.prompt("سبب فصل هذا الظهور عن الشخص؟")
          if (note) run(() => unlinkAppearanceAction(personId, appearanceId, note))
        }}
      >
        فصل
      </Button>
      <Feedback msg={msg} />
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border/60 p-3">
      <h3 className="mb-2 text-[12.5px] font-bold text-foreground">{title}</h3>
      {children}
    </div>
  )
}

export function IdentityActions({
  personId,
  merged,
  appearances,
}: {
  personId: string
  merged: boolean
  appearances: Array<{ id: string; label: string }>
}) {
  const { pending, msg, run } = useAction()
  const [alias, setAlias] = useState("")
  const [natCode, setNatCode] = useState("KW")
  const [natStatus, setNatStatus] = useState<PodcastEvidenceStatus>("verified")
  const [natNote, setNatNote] = useState("")
  const [gender, setGender] = useState<PodcastGenderMarker>("male")
  const [genderStatus, setGenderStatus] = useState<PodcastEvidenceStatus>("verified")
  const [genderNote, setGenderNote] = useState("")
  const [guestId, setGuestId] = useState("")
  const [candidateId, setCandidateId] = useState("")
  const [mergeTarget, setMergeTarget] = useState("")
  const [mergeNote, setMergeNote] = useState("")
  const [splitIds, setSplitIds] = useState<string[]>([])
  const [splitName, setSplitName] = useState("")
  const [splitNote, setSplitNote] = useState("")
  const [reviewNote, setReviewNote] = useState("")

  if (merged) return <p className="text-muted-foreground">سجل مدموج — عدّل الشخص الذي دُمج فيه.</p>

  return (
    <div>
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <Section title="إضافة اسم بديل">
          <input className={input} value={alias} onChange={(e) => setAlias(e.target.value)} placeholder="مثال: د. فلان الفلاني" />
          <Button className="mt-2" size="sm" variant="outline" disabled={pending || !alias.trim()} onClick={() => run(() => addAliasAction(personId, alias))}>
            إضافة
          </Button>
        </Section>

        <Section title="الجنسية (قرار يدوي)">
          <div className="grid grid-cols-2 gap-2">
            <label className="text-[12px] text-muted-foreground">
              رمز الدولة
              <input className={input} dir="ltr" maxLength={2} value={natCode} onChange={(e) => setNatCode(e.target.value.toUpperCase())} />
            </label>
            <label className="text-[12px] text-muted-foreground">
              الحالة
              <select className={input} value={natStatus} onChange={(e) => setNatStatus(e.target.value as PodcastEvidenceStatus)}>
                <option value="verified">مؤكَّد</option>
                <option value="probable">محتمل</option>
                <option value="unknown">غير معروف</option>
                <option value="conflicted">متعارض</option>
              </select>
            </label>
          </div>
          <input className={input} value={natNote} onChange={(e) => setNatNote(e.target.value)} placeholder="المصدر (إلزامي للتأكيد): رابط سيرة رسمية…" />
          <Button className="mt-2" size="sm" variant="outline" disabled={pending} onClick={() => run(() => setNationalityAction(personId, natCode, natStatus, natNote))}>
            حفظ الجنسية
          </Button>
        </Section>

        <Section title="الجنس (قرار يدوي)">
          <div className="grid grid-cols-2 gap-2">
            <label className="text-[12px] text-muted-foreground">
              القيمة
              <select className={input} value={gender} onChange={(e) => setGender(e.target.value as PodcastGenderMarker)}>
                <option value="male">ذكر</option>
                <option value="female">أنثى</option>
                <option value="unknown">غير معروف</option>
              </select>
            </label>
            <label className="text-[12px] text-muted-foreground">
              الحالة
              <select className={input} value={genderStatus} onChange={(e) => setGenderStatus(e.target.value as PodcastEvidenceStatus)}>
                <option value="verified">مؤكَّد</option>
                <option value="probable">محتمل</option>
                <option value="unknown">غير معروف</option>
                <option value="conflicted">متعارض</option>
              </select>
            </label>
          </div>
          <input className={input} value={genderNote} onChange={(e) => setGenderNote(e.target.value)} placeholder="المصدر (إلزامي للتأكيد)" />
          <Button className="mt-2" size="sm" variant="outline" disabled={pending} onClick={() => run(() => setGenderAction(personId, gender, genderStatus, genderNote))}>
            حفظ الجنس
          </Button>
        </Section>

        <Section title="ربط بسجلات خط">
          <label className="text-[12px] text-muted-foreground">
            معرّف ضيف خط (فارغ = إلغاء الربط)
            <input className={input} dir="ltr" value={guestId} onChange={(e) => setGuestId(e.target.value)} />
          </label>
          <Button className="mt-2" size="sm" variant="outline" disabled={pending} onClick={() => run(() => linkKhatGuestAction(personId, guestId))}>
            ربط بضيف خط
          </Button>
          <label className="mt-3 block text-[12px] text-muted-foreground">
            معرّف المرشح (فارغ = إلغاء الربط)
            <input className={input} dir="ltr" value={candidateId} onChange={(e) => setCandidateId(e.target.value)} />
          </label>
          <Button className="mt-2" size="sm" variant="outline" disabled={pending} onClick={() => run(() => linkCandidateAction(personId, candidateId))}>
            ربط بمرشح
          </Button>
        </Section>

        <Section title="دمج مكرر مؤكَّد في شخص آخر">
          <input className={input} dir="ltr" value={mergeTarget} onChange={(e) => setMergeTarget(e.target.value)} placeholder="معرّف الشخص الهدف (UUID)" />
          <input className={input} value={mergeNote} onChange={(e) => setMergeNote(e.target.value)} placeholder="الدليل أنهما نفس الشخص (إلزامي)" />
          <Button
            className="mt-2"
            size="sm"
            variant="outline"
            disabled={pending || !mergeTarget.trim() || !mergeNote.trim()}
            onClick={() => {
              if (window.confirm("دمج هذا السجل في الشخص الهدف؟ تنتقل الظهورات ويبقى هذا السجل مُعلَّماً كمدموج.")) {
                run(() => mergeIntoAction(personId, mergeTarget, mergeNote))
              }
            }}
          >
            دمج
          </Button>
        </Section>

        <Section title="فصل هوية خاطئة (نقل ظهورات لشخص جديد)">
          <div className="max-h-40 space-y-1 overflow-y-auto">
            {appearances.map((a) => (
              <label key={a.id} className="flex items-start gap-2 text-[12px]">
                <input
                  type="checkbox"
                  checked={splitIds.includes(a.id)}
                  onChange={(e) => setSplitIds((s) => (e.target.checked ? [...s, a.id] : s.filter((x) => x !== a.id)))}
                />
                <span>{a.label}</span>
              </label>
            ))}
          </div>
          <input className={input} value={splitName} onChange={(e) => setSplitName(e.target.value)} placeholder="اسم الشخص الجديد (اختياري)" />
          <input className={input} value={splitNote} onChange={(e) => setSplitNote(e.target.value)} placeholder="السبب (إلزامي)" />
          <Button
            className="mt-2"
            size="sm"
            variant="outline"
            disabled={pending || splitIds.length === 0 || !splitNote.trim()}
            onClick={() => run(() => splitAction(personId, splitIds, splitName, splitNote))}
          >
            فصل إلى شخص جديد
          </Button>
        </Section>

        <Section title="إنهاء مراجعة الهوية">
          <input className={input} value={reviewNote} onChange={(e) => setReviewNote(e.target.value)} placeholder="نتيجة المراجعة (إلزامي)" />
          <Button className="mt-2" size="sm" variant="outline" disabled={pending || !reviewNote.trim()} onClick={() => run(() => markReviewedAction(personId, reviewNote))}>
            تمت المراجعة
          </Button>
        </Section>
      </div>
      <Feedback msg={msg} />
    </div>
  )
}
