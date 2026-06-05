"use client"

import { useState, useTransition } from "react"
import {
  X,
  Loader2,
  UserPlus,
  Globe,
  Instagram,
  Youtube,
  Linkedin,
} from "lucide-react"
import { XIcon } from "@/components/icons/x-icon"
import { TikTokIcon } from "@/components/icons/tiktok-icon"
import { FacebookIcon } from "@/components/icons/facebook-icon"
import { SnapchatIcon } from "@/components/icons/snapchat-icon"
import type { KhatMapGuestSocialAccounts } from "@/types/khat-map"
import type { BatchCard } from "@/lib/khat-map/v2/types"
import { injectGuestAction } from "../../actions"

/**
 * Floating "+ ضيف" affordance + bottom sheet. On submit it fires the
 * guest-first engine (3 tailored cards) and hands them back to the
 * wizard which prepends them to the review stack — matching the PR4
 * decision that injected guests jump to the top of the current batch.
 */
export function GuestInjectButton({
  seasonId,
  batchIndex,
  disabled,
  onInjected,
}: {
  seasonId: string
  batchIndex: number
  disabled?: boolean
  onInjected: (cards: BatchCard[]) => void
}) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={disabled}
        aria-label="أضف ضيفاً"
        className="fixed bottom-6 right-6 z-30 inline-flex h-12 items-center gap-2 rounded-full bg-foreground px-4 py-2 text-[13px] font-semibold text-background shadow-xl transition-transform hover:scale-[1.03] hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <UserPlus className="h-4 w-4" />
        ضيف
      </button>
      <GuestInjectSheet
        open={open}
        onClose={() => setOpen(false)}
        seasonId={seasonId}
        batchIndex={batchIndex}
        onInjected={(cards) => {
          onInjected(cards)
          setOpen(false)
        }}
      />
    </>
  )
}

function GuestInjectSheet({
  open,
  onClose,
  seasonId,
  batchIndex,
  onInjected,
}: {
  open: boolean
  onClose: () => void
  seasonId: string
  batchIndex: number
  onInjected: (cards: BatchCard[]) => void
}) {
  const [name, setName] = useState("")
  const [bio, setBio] = useState("")
  const [website, setWebsite] = useState("")
  const [socials, setSocials] = useState<KhatMapGuestSocialAccounts>({})
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)

  if (!open) return null

  const setSocial = (k: keyof KhatMapGuestSocialAccounts) => (v: string) => {
    setSocials((prev) => ({ ...prev, [k]: v.trim() || undefined }))
  }

  const handleSubmit = () => {
    if (!name.trim()) {
      setError("الاسم مطلوب")
      return
    }
    setError(null)
    start(async () => {
      const res = await injectGuestAction({
        seasonId,
        batchIndex,
        guest: {
          full_name: name.trim(),
          bio: bio.trim() || null,
          official_website: website.trim() || null,
          social_accounts: cleanSocials(socials),
        },
      })
      if (!res.success) {
        setError(res.error)
        return
      }
      onInjected(res.data.cards)
      // reset
      setName("")
      setBio("")
      setWebsite("")
      setSocials({})
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm sm:items-center sm:p-4">
      <div className="w-full max-w-lg rounded-t-3xl border border-border/40 bg-card p-5 shadow-2xl sm:rounded-3xl">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-[0.15em] text-muted-foreground">
              إضافة ضيف
            </div>
            <h3 className="mt-1 text-base font-bold">
              سنقترح ٣ مواضيع مخصّصة لهذا الضيف
            </h3>
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

        <div className="grid gap-3">
          <Labeled label="الاسم الكامل">
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="مثال: د. عمر الخطيب"
              disabled={pending}
              className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm focus:border-primary focus:outline-none"
            />
          </Labeled>

          <Labeled label="سيرة مختصرة (اختياري)">
            <textarea
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              placeholder="سطر أو سطران عن من هو ولماذا قد يكون مناسباً لخط."
              disabled={pending}
              rows={3}
              className="w-full resize-y rounded-lg border border-input bg-background p-2.5 text-sm focus:border-primary focus:outline-none"
            />
          </Labeled>

          <Labeled label="الموقع الرسمي (اختياري)">
            <div className="relative">
              <Globe className="pointer-events-none absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <input
                type="url"
                value={website}
                onChange={(e) => setWebsite(e.target.value)}
                placeholder="https://example.com"
                disabled={pending}
                className="h-10 w-full rounded-lg border border-input bg-background px-3 pr-9 text-sm focus:border-primary focus:outline-none"
                dir="ltr"
              />
            </div>
          </Labeled>

          <div className="rounded-xl border border-border/40 bg-background/40 p-3">
            <div className="mb-2 text-[10.5px] font-semibold uppercase tracking-[0.15em] text-muted-foreground">
              حسابات التواصل (اختياري)
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <SocialInput
                icon={XIcon}
                label="X / Twitter"
                value={socials.twitter ?? ""}
                onChange={setSocial("twitter")}
              />
              <SocialInput
                icon={Instagram}
                label="Instagram"
                value={socials.instagram ?? ""}
                onChange={setSocial("instagram")}
              />
              <SocialInput
                icon={Youtube}
                label="YouTube"
                value={socials.youtube ?? ""}
                onChange={setSocial("youtube")}
              />
              <SocialInput
                icon={TikTokIcon}
                label="TikTok"
                value={socials.tiktok ?? ""}
                onChange={setSocial("tiktok")}
              />
              <SocialInput
                icon={Linkedin}
                label="LinkedIn"
                value={socials.linkedin ?? ""}
                onChange={setSocial("linkedin")}
              />
              <SocialInput
                icon={FacebookIcon}
                label="Facebook"
                value={socials.facebook ?? ""}
                onChange={setSocial("facebook")}
              />
              <SocialInput
                icon={SnapchatIcon}
                label="Snapchat"
                value={socials.snapchat ?? ""}
                onChange={setSocial("snapchat")}
              />
            </div>
          </div>
        </div>

        {error && (
          <div className="mt-3 rounded-lg border border-rose-500/30 bg-rose-500/5 p-2.5 text-[11.5px] text-rose-400">
            {error}
          </div>
        )}

        <div className="mt-5 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={pending}
            className="rounded-lg px-3 py-2 text-[12px] text-muted-foreground hover:text-foreground disabled:opacity-50"
          >
            إلغاء
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={pending}
            className="inline-flex items-center gap-2 rounded-lg bg-foreground px-4 py-2 text-[13px] font-bold text-background hover:opacity-90 disabled:opacity-60"
          >
            {pending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                نحلّل الضيف…
              </>
            ) : (
              <>
                <UserPlus className="h-4 w-4" />
                ولّد ٣ مواضيع
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}

function Labeled({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div>
      <label className="mb-1 block text-[11px] font-semibold text-muted-foreground">
        {label}
      </label>
      {children}
    </div>
  )
}

function SocialInput({
  icon: Icon,
  label,
  value,
  onChange,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  value: string
  onChange: (v: string) => void
}) {
  return (
    <div>
      <div className="mb-1 flex items-center gap-1.5 text-[10.5px] text-muted-foreground">
        <Icon className="h-3 w-3" />
        {label}
      </div>
      <input
        type="url"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-9 w-full rounded-md border border-input bg-background px-2 text-[12px] focus:border-primary focus:outline-none"
        dir="ltr"
      />
    </div>
  )
}

function cleanSocials(
  s: KhatMapGuestSocialAccounts,
): KhatMapGuestSocialAccounts {
  const out: KhatMapGuestSocialAccounts = {}
  for (const [k, v] of Object.entries(s)) {
    if (k === "other" || typeof v !== "string") continue
    const t = v.trim()
    if (t) out[k as keyof KhatMapGuestSocialAccounts] = t as never
  }
  return out
}
