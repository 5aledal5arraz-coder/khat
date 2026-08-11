/**
 * Who gets told about a new submission, and what happens when nobody would be.
 *
 * The bug this pins: four call sites each carried
 * `env.ADMIN_NOTIFY_EMAIL || "khatpodcast@hotmail.com"`, the variable was never
 * set on the droplet, and every guest application, sponsor application,
 * candidate prep submission and partner digest went to a hotmail address
 * instead. Nothing failed, so nothing said so.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { readdirSync, readFileSync, statSync } from "node:fs"
import { join } from "node:path"

import {
  adminNotifyRecipients,
  candidateNotifyRecipients,
} from "@/lib/email/recipients"

const ORIGINAL = {
  admin: process.env.ADMIN_NOTIFY_EMAIL,
  candidate: process.env.CANDIDATE_NOTIFY_EMAIL,
}

beforeEach(() => {
  delete process.env.ADMIN_NOTIFY_EMAIL
  delete process.env.CANDIDATE_NOTIFY_EMAIL
})

afterEach(() => {
  if (ORIGINAL.admin === undefined) delete process.env.ADMIN_NOTIFY_EMAIL
  else process.env.ADMIN_NOTIFY_EMAIL = ORIGINAL.admin
  if (ORIGINAL.candidate === undefined) delete process.env.CANDIDATE_NOTIFY_EMAIL
  else process.env.CANDIDATE_NOTIFY_EMAIL = ORIGINAL.candidate
})

describe("adminNotifyRecipients", () => {
  it("returns EMPTY when unset — never a hardcoded address", () => {
    expect(adminNotifyRecipients()).toEqual([])
  })

  it("reads a comma-separated list, which is how Khaled takes both copies", () => {
    process.env.ADMIN_NOTIFY_EMAIL = "khaled@khatpodcast.com, 5aled.al5arraz@gmail.com"
    expect(adminNotifyRecipients()).toEqual([
      "khaled@khatpodcast.com",
      "5aled.al5arraz@gmail.com",
    ])
  })

  it("tolerates semicolons, newlines and stray separators", () => {
    process.env.ADMIN_NOTIFY_EMAIL = " a@x.com;\n b@y.com , "
    expect(adminNotifyRecipients()).toEqual(["a@x.com", "b@y.com"])
  })

  it("drops entries that are not address-shaped instead of mailing them", () => {
    process.env.ADMIN_NOTIFY_EMAIL = "good@x.com, not-an-address, also@@bad.com, @nope.com"
    expect(adminNotifyRecipients()).toEqual(["good@x.com"])
  })

  it("de-duplicates case-insensitively so nobody gets two copies", () => {
    process.env.ADMIN_NOTIFY_EMAIL = "A@x.com, a@X.com"
    expect(adminNotifyRecipients()).toEqual(["A@x.com"])
  })

  it("tracks a LATER env change — the const it replaced froze at import", () => {
    process.env.ADMIN_NOTIFY_EMAIL = "first@x.com"
    expect(adminNotifyRecipients()).toEqual(["first@x.com"])
    process.env.ADMIN_NOTIFY_EMAIL = "second@x.com"
    expect(adminNotifyRecipients()).toEqual(["second@x.com"])
  })
})

describe("candidateNotifyRecipients", () => {
  it("falls back to the admin list when CANDIDATE_NOTIFY_EMAIL is unset", () => {
    process.env.ADMIN_NOTIFY_EMAIL = "admin@x.com"
    expect(candidateNotifyRecipients()).toEqual(["admin@x.com"])
  })

  it("overrides the admin list when set", () => {
    process.env.ADMIN_NOTIFY_EMAIL = "admin@x.com"
    process.env.CANDIDATE_NOTIFY_EMAIL = "casting@x.com"
    expect(candidateNotifyRecipients()).toEqual(["casting@x.com"])
  })

  it("is empty when neither is set, so the caller can refuse to send", () => {
    expect(candidateNotifyRecipients()).toEqual([])
  })
})

describe("no notification address is written into the code", () => {
  const SKIP = new Set(["node_modules", ".next", ".git"])

  function walk(dir: string, out: string[] = []): string[] {
    for (const entry of readdirSync(dir)) {
      if (SKIP.has(entry)) continue
      const full = join(dir, entry)
      if (statSync(full).isDirectory()) walk(full, out)
      else if (/\.tsx?$/.test(entry)) out.push(full)
    }
    return out
  }

  it("has no hardcoded recipient fallback left in app/ or lib/", () => {
    // `lib/email/recipients.ts` names the old address in its header — that is
    // the history of the bug, not a fallback. Everything else must be clean.
    const offenders = ["lib", "app"]
      .flatMap((r) => walk(r))
      .filter((f) => f !== join("lib", "email", "recipients.ts"))
      .filter((f) => /khatpodcast@hotmail|ADMIN_NOTIFY_EMAIL\s*\|\|/.test(readFileSync(f, "utf8")))

    expect(offenders, `hardcoded notification address in: ${offenders.join(", ")}`).toEqual([])
  })
})

describe("the submission-notify handler", () => {
  it("refuses to run when nobody is configured, so the job fails visibly", async () => {
    vi.resetModules()
    const send = {
      sendGuestApplicationAdmin: vi.fn(),
      sendGuestApplicationConfirm: vi.fn(),
      sendSponsorApplicationAdmin: vi.fn(),
      sendSponsorApplicationConfirm: vi.fn(),
    }
    vi.doMock("@/lib/email/send", () => send)

    await import("@/lib/jobs/handlers/submission-notify")
    const { getHandler } = await import("@/lib/jobs/registry")
    const handler = getHandler("email.notify_submission")!

    await expect(
      handler(
        { kind: "guest_application", reference: "G-1", name: "س", email: "a@b.com", phone: "1", country: "KW" },
        { workerId: "test", jobId: "j1", attempt: 1 } as never,
      ),
    ).rejects.toThrow(/ADMIN_NOTIFY_EMAIL/)

    // Nothing was mailed to anyone.
    expect(send.sendGuestApplicationAdmin).not.toHaveBeenCalled()
    expect(send.sendGuestApplicationConfirm).not.toHaveBeenCalled()
    vi.doUnmock("@/lib/email/send")
  })

  it("mails every admin and stamps idempotency keys so a retry cannot double-send", async () => {
    vi.resetModules()
    process.env.ADMIN_NOTIFY_EMAIL = "a@x.com, b@y.com"
    const send = {
      sendGuestApplicationAdmin: vi.fn().mockResolvedValue({}),
      sendGuestApplicationConfirm: vi.fn().mockResolvedValue({}),
      sendSponsorApplicationAdmin: vi.fn().mockResolvedValue({}),
      sendSponsorApplicationConfirm: vi.fn().mockResolvedValue({}),
    }
    vi.doMock("@/lib/email/send", () => send)

    await import("@/lib/jobs/handlers/submission-notify")
    const { getHandler } = await import("@/lib/jobs/registry")
    const handler = getHandler("email.notify_submission")!

    const result = await handler(
      { kind: "guest_application", reference: "G-42", name: "سارة", email: "s@b.com", phone: "1", country: "KW" },
      { workerId: "test", jobId: "j1", attempt: 1 } as never,
    )

    expect(send.sendGuestApplicationAdmin).toHaveBeenCalledWith(
      ["a@x.com", "b@y.com"],
      expect.objectContaining({ name: "سارة" }),
      "guest-admin-G-42",
    )
    expect(send.sendGuestApplicationConfirm).toHaveBeenCalledWith(
      "s@b.com",
      "سارة",
      "G-42",
      "guest-confirm-G-42",
    )
    expect(result).toMatchObject({ recipients: 2, reference: "G-42" })
    vi.doUnmock("@/lib/email/send")
  })
})
