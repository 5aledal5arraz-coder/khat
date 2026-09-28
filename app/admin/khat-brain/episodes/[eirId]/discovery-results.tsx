/**
 * The EIR's own discovery results, inline on the guest tab — each with
 * «رشّحه لهالحلقة». Before this the results lived only on the run page and
 * nothing led from them back to the episode (2026-09-28 end-to-end test).
 * Server component; renders nothing when no run was launched for this EIR.
 */

import Link from "next/link"
import { ExternalLink } from "lucide-react"
import { formatDateTime } from "@/lib/shared/formatters"
import { runStatusLabel } from "@/lib/operator-language"
import type { EirDiscoveryRun } from "@/lib/discovery/eir-results"
import { NominateCandidateButton } from "./nominate-candidate-button"

const DECISION_LABEL: Record<string, string> = {
  accepted: "مرشّح قويّ",
  needs_review: "تحتاج مراجعتك",
  shortlist: "قائمة مختصرة",
}

export function EirDiscoveryResults({ eirId, runs }: { eirId: string; runs: EirDiscoveryRun[] }) {
  if (runs.length === 0) return null
  return (
    <section className="rounded-2xl border border-border/40 bg-card/30 p-4 text-start">
      <h3 className="text-[13px] font-semibold">نتائج الاكتشاف لهذه الحلقة</h3>
      <p className="mt-0.5 text-[11px] text-muted-foreground">
        «رشّحه لهالحلقة» يضيفه لقائمة التواصل مربوطاً بالحلقة. ربطه بملف ضيف يبقى خطوة منفصلة
        من قائمة التواصل — وعندها يُعيَّن ضيفاً لهالحلقة تلقائياً.
      </p>
      <div className="mt-3 space-y-4">
        {runs.map((run) => (
          <div key={run.id}>
            <div className="mb-1.5 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
              <span>{runStatusLabel(run.status)}</span>
              <span>·</span>
              <span>{formatDateTime(run.created_at)}</span>
              <Link
                href={`/admin/discovery-v2/${run.id}`}
                className="inline-flex items-center gap-1 text-primary hover:underline"
              >
                التفاصيل الكاملة <ExternalLink className="h-3 w-3" />
              </Link>
            </div>
            {run.candidates.length === 0 ? (
              <p className="text-[11.5px] text-muted-foreground">لا مرشّحين (بعد) في هذا التشغيل.</p>
            ) : (
              <ul className="divide-y divide-border/40 rounded-xl border border-border/40">
                {run.candidates.map((c) => (
                  <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 p-2.5">
                    <div className="min-w-0">
                      <div className="text-[12.5px] font-medium text-foreground">
                        {c.name}
                        <span className="ms-2 rounded-full border border-border/50 px-1.5 py-0.5 text-[10px] font-normal text-muted-foreground">
                          {DECISION_LABEL[c.decision] ?? c.decision}
                        </span>
                      </div>
                      <div className="truncate text-[11px] text-muted-foreground">
                        {[c.role, c.reason].filter(Boolean).join(" · ")}
                      </div>
                    </div>
                    <NominateCandidateButton candidateId={c.id} eirId={eirId} nominated={c.nominated} />
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </div>
    </section>
  )
}
