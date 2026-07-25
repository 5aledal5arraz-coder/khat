/**
 * Role-gate refusal panel for the `/admin/ops` pages.
 *
 * Rendered INSTEAD of a redirect (see `checkPageRole` in
 * `lib/api-utils.ts`): `/admin/ops` is the admin home, so bouncing a
 * user away from it would loop. Carries no operational data — the whole
 * point of the gate is that this user must not see any.
 *
 * Scoped to this route group on purpose; it is not a general admin
 * primitive yet.
 */

import { ShieldAlert } from "lucide-react"

export function NoAccess({ roleLabelAr }: { roleLabelAr: string }) {
  return (
    <div dir="rtl" lang="ar">
      <div className="mx-auto max-w-xl rounded-2xl border border-border bg-card p-8 text-center shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
        <span className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
          <ShieldAlert className="h-6 w-6" />
        </span>
        <h1 className="text-[18px] font-semibold tracking-tight text-foreground">
          ما عندك صلاحية لهالصفحة
        </h1>
        <p className="mt-2 text-[13px] text-muted-foreground">
          هالقسم متاح لصلاحية {roleLabelAr} فما فوق. إذا تحتاج وصول، كلّم مالك
          الحساب (<span dir="ltr">OWNER</span>).
        </p>
      </div>
    </div>
  )
}
