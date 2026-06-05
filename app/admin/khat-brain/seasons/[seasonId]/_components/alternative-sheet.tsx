"use client"

import { X, UserRound, RefreshCw, XCircle, Sparkles } from "lucide-react"
import type { AlternativeMode } from "../../actions"

export interface AltOption {
  key: AlternativeMode
  label: string
  description: string
  hint?: string
  icon: typeof UserRound
  requiresGuest?: boolean
}

export const ALT_OPTIONS: AltOption[] = [
  {
    key: "keep_topic_change_guest",
    label: "احتفظ بالموضوع — غيّر الضيف",
    description: "الموضوع مناسب، لكن الضيف المقترح غير مناسب.",
    hint: "سنقترح ضيفاً بديلاً في الدفعة التالية.",
    icon: UserRound,
    requiresGuest: true,
  },
  {
    key: "keep_guest_generate_new_topic",
    label: "احتفظ بالضيف — ولّد موضوعاً جديداً",
    description: "الضيف ممتاز، لكن الموضوع لا يبرز قوته.",
    hint: "سنولّد موضوعاً بديلاً مباشرة — قد يستغرق بضع ثوان.",
    icon: Sparkles,
    requiresGuest: true,
  },
  {
    key: "replace_both",
    label: "استبدل الاثنين",
    description: "لا الموضوع ولا الضيف مناسبان.",
    hint: "سيظهر بديل في الدفعة التالية.",
    icon: RefreshCw,
  },
  {
    key: "reject_both",
    label: "ارفض الاثنين (بلا بديل)",
    description: "ارفض الاقتراح واستفد منه كإشارة تعلّم فقط.",
    icon: XCircle,
  },
]

export function AlternativeSheet({
  open,
  hasGuest,
  onClose,
  onChoose,
  pending,
}: {
  open: boolean
  hasGuest: boolean
  onClose: () => void
  onChoose: (mode: AlternativeMode) => void
  pending: boolean
}) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm sm:items-center sm:p-4">
      <div className="w-full max-w-lg rounded-t-3xl border border-border/40 bg-card p-5 shadow-2xl sm:rounded-3xl">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-[0.15em] text-muted-foreground">
              ماذا تريد أن تفعل؟
            </div>
            <h3 className="mt-1 text-base font-bold">اختر البديل المناسب</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={pending}
            className="rounded-md p-1 text-muted-foreground hover:bg-muted/40 hover:text-foreground disabled:opacity-50"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="grid gap-2">
          {ALT_OPTIONS.map((opt) => {
            const Icon = opt.icon
            const disabled = (opt.requiresGuest && !hasGuest) || pending
            return (
              <button
                key={opt.key}
                type="button"
                onClick={() => onChoose(opt.key)}
                disabled={disabled}
                className="group rounded-xl border border-border/60 bg-background/40 p-3 text-right transition-colors hover:border-primary/40 hover:bg-primary/5 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <div className="flex items-start gap-3">
                  <div className="rounded-lg bg-muted/40 p-1.5 text-muted-foreground group-hover:bg-primary/10 group-hover:text-primary">
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-[13px] font-semibold">{opt.label}</div>
                    <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">
                      {opt.description}
                    </p>
                    {opt.hint && (
                      <p className="mt-1 text-[10.5px] text-muted-foreground/70">
                        {opt.hint}
                      </p>
                    )}
                    {opt.requiresGuest && !hasGuest && (
                      <p className="mt-1 text-[10.5px] text-rose-400/80">
                        يتطلب وجود ضيف مقترح.
                      </p>
                    )}
                  </div>
                </div>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
