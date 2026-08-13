/**
 * A REFUSAL FROM RESEND MUST BE VISIBLE.
 *
 * `emails.send()` does not reject when the API says no — it RESOLVES with
 * `{ data: null, error }`. Eleven of the twelve sends in lib/email/send.ts
 * returned that object untouched, so a message the provider never accepted was
 * indistinguishable from one it did: the job went green, the operator saw
 * «تم الإرسال», and `sent_at` / `outcome_emailed_at` were stamped for
 * deliveries that do not exist.
 *
 * Two kinds of test here, because either alone goes blind:
 *
 *   1. BEHAVIOURAL, over every exported send — a refusal rejects, and a success
 *      still resolves. The second half matters as much as the first: the bug
 *      would be "fixed" by throwing on everything, which would take down paths
 *      that work today.
 *   2. STRUCTURAL — the next send added to the file must go through the same
 *      chokepoint. A behavioural test only covers the sends somebody remembered
 *      to write a test for, which is how eleven of them shipped unchecked.
 *
 * Nothing reaches api.resend.com: the transport is replaced by a spy.
 */
import { describe, it, expect, beforeEach, vi } from "vitest"
import { readFileSync, readdirSync, statSync } from "node:fs"
import { join } from "node:path"

const sendSpy = vi.fn()

vi.mock("@/lib/email/resend", () => ({
  getResend: () => ({ emails: { send: sendSpy } }),
  FROM_EMAIL: "noreply@khatpodcast.com",
  FROM_DISPLAY: "بودكاست خط <noreply@khatpodcast.com>",
  REPLY_TO: "hello@khatpodcast.com",
  APP_URL: "https://khatpodcast.com",
  WEBHOOK_SECRET: "",
}))

// The real constant, but without the database read the live version does.
vi.mock("@/lib/email/social", async () => {
  const templates = await vi.importActual<typeof import("@/lib/email/templates")>(
    "@/lib/email/templates",
  )
  return { getEmailSocialLinks: async () => templates.EMAIL_SOCIAL_LINKS }
})

import * as send from "@/lib/email/send"

const ACCEPTED = { data: { id: "resend-msg-1" }, error: null }
const REFUSED = {
  data: null,
  error: { message: "domain is not verified", name: "validation_error" },
}

/** Every exported send, with the minimum arguments it needs to build a message. */
const SENDS: [name: string, invoke: () => Promise<unknown>][] = [
  ["sendNewsletterWelcome", () => send.sendNewsletterWelcome("a@b.example", "https://x/unsub")],
  ["sendDirectEmail", () => send.sendDirectEmail("a@b.example", "فلان", "موضوع", "نص", "إدارة خط")],
  [
    "sendGuestApplicationAdmin",
    () =>
      send.sendGuestApplicationAdmin(["admin@b.example"], {
        name: "فلان",
        email: "a@b.example",
        phone: "+965",
        country: "الكويت",
      }),
  ],
  ["sendGuestApplicationConfirm", () => send.sendGuestApplicationConfirm("a@b.example", "فلان", "REF-1")],
  [
    "sendCommunityContributionConfirm",
    () => send.sendCommunityContributionConfirm("a@b.example", "فلان", "فكرة الحلقة", "REF-1"),
  ],
  [
    "sendCommunityOutcome",
    () => send.sendCommunityOutcome("a@b.example", "فلان", "فكرة الحلقة", "accepted", "REF-1"),
  ],
  ["sendGuestPrepConfirm", () => send.sendGuestPrepConfirm("a@b.example", "فلان")],
  [
    "sendSponsorApplicationAdmin",
    () =>
      send.sendSponsorApplicationAdmin(["admin@b.example"], {
        company: "شركة",
        contact: "فلان",
        email: "a@b.example",
        budget: "5000",
        reference: "REF-1",
      }),
  ],
  [
    "sendPartnershipOffer",
    () =>
      send.sendPartnershipOffer("a@b.example", {
        companyName: "شركة",
        contactName: "فلان",
        offerUrl: "https://khatpodcast.com/offer/tok",
        passwordProtected: false,
      }),
  ],
  [
    "sendPartnerTaskReminder",
    () =>
      send.sendPartnerTaskReminder("a@b.example", [
        {
          company: "شركة",
          title: "متابعة",
          dueLabel: "اليوم",
          overdue: false,
          priority: "high",
          leadId: "lead-1",
        },
      ]),
  ],
  [
    "sendPrepSubmittedAdmin",
    () =>
      send.sendPrepSubmittedAdmin(["admin@b.example"], {
        candidateName: "فلان",
        category: null,
        completionPercent: 100,
        candidateId: "cand-1",
      }),
  ],
  ["sendSponsorApplicationConfirm", () => send.sendSponsorApplicationConfirm("a@b.example", "فلان", "REF-1")],
]

beforeEach(() => {
  sendSpy.mockReset()
})

describe("the table itself is not blind", () => {
  it("covers every send exported from lib/email/send.ts", () => {
    const src = readFileSync(join("lib", "email", "send.ts"), "utf8")
    const exported = [...src.matchAll(/export async function (send\w+)/g)].map((m) => m[1]).sort()

    // Guard the guard: if the regex stops matching, the comparison below is
    // two empty arrays and every assertion in this file becomes vacuous.
    expect(exported.length).toBeGreaterThanOrEqual(12)
    expect(SENDS.map(([n]) => n).sort()).toEqual(exported)
  })
})

describe("a provider refusal is seen", () => {
  it.each(SENDS)("%s rejects when Resend resolves with an error", async (_name, invoke) => {
    sendSpy.mockResolvedValue(REFUSED)
    await expect(invoke()).rejects.toThrow(/domain is not verified/)
  })

  it.each(SENDS)("%s carries the provider's reason, not a generic one", async (_name, invoke) => {
    sendSpy.mockResolvedValue(REFUSED)
    // The reason is what makes a failed job row or a log line actionable —
    // "email failed" alone would send Khaled to the Resend dashboard to guess.
    await expect(invoke()).rejects.toThrow(/\[email:[a-z-]+\]/)
  })
})

describe("success still succeeds", () => {
  it.each(SENDS)("%s resolves and calls the provider exactly once", async (_name, invoke) => {
    sendSpy.mockResolvedValue(ACCEPTED)
    await expect(invoke()).resolves.toMatchObject({ data: { id: "resend-msg-1" } })
    expect(sendSpy).toHaveBeenCalledTimes(1)
  })

  it.each(SENDS)("%s still addresses a recipient and a replyTo", async (_name, invoke) => {
    sendSpy.mockResolvedValue(ACCEPTED)
    await invoke()
    const payload = sendSpy.mock.calls[0][0] as Record<string, unknown>
    expect(payload.to).toBeTruthy()
    expect(payload.replyTo).toBe("hello@khatpodcast.com")
  })
})

describe("a transport rejection is still an error (unchanged behaviour)", () => {
  it.each(SENDS)("%s propagates a thrown network error", async (_name, invoke) => {
    sendSpy.mockRejectedValue(new Error("ECONNRESET"))
    await expect(invoke()).rejects.toThrow(/ECONNRESET/)
  })
})

// ── Structural: the chokepoint cannot be bypassed by the next send added ─────

/**
 * Comments in this file QUOTE the very call they warn about, so a naive scan
 * counts the warning as an offence. Strip them before looking at code.
 */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "")
}

/** Names of exported sends in `src` whose body never reaches `sendOrThrow`. */
function sendsBypassingChokepoint(src: string): string[] {
  const chunks = src.split("export async function ").slice(1)
  return chunks
    .filter((chunk) => !chunk.includes("sendOrThrow("))
    .map((chunk) => chunk.slice(0, chunk.indexOf("(")))
}

describe("every send in lib/email/send.ts goes through sendOrThrow", () => {
  const SRC = stripComments(readFileSync(join("lib", "email", "send.ts"), "utf8"))

  it("CONTROL: the real source has no bypass", () => {
    expect(sendsBypassingChokepoint(SRC)).toEqual([])
  })

  it("the raw transport is called in exactly one place", () => {
    // More than one means somebody added a send beside the chokepoint rather
    // than through it.
    expect(SRC.split("getResend().emails.send(").length - 1).toBe(1)
  })

  it("MUTATION: the scan sees a send that bypasses it", () => {
    // Proving the control above is not green merely because the scan stopped
    // looking. Put a raw send back into one function and the scan must name it.
    const mutated = SRC.replace("return sendOrThrow('direct', {", "return getResend().emails.send({")
    expect(mutated, "mutation did not apply — the scan proves nothing").not.toBe(SRC)
    expect(sendsBypassingChokepoint(mutated)).toEqual(["sendDirectEmail"])
  })
})

// ── Structural: the sends that live outside lib/email/send.ts ────────────────

describe("every emails.send() in the codebase checks the error", () => {
  const SKIP = new Set(["node_modules", ".next", ".git", "worktrees"])

  function walk(dir: string, out: string[] = []): string[] {
    for (const entry of readdirSync(dir)) {
      if (SKIP.has(entry)) continue
      const full = join(dir, entry)
      if (statSync(full).isDirectory()) walk(full, out)
      else if (/\.tsx?$/.test(entry)) out.push(full)
    }
    return out
  }

  const files = ["lib", "app"]
    .flatMap((r) => walk(r))
    .filter((f) => readFileSync(f, "utf8").includes("emails.send("))

  it("finds the known send sites (the scan itself is not blind)", () => {
    // Three today: the chokepoint, the campaign sender, and the preview route.
    // A drop to zero would make the assertion below pass vacuously.
    expect(files.length).toBeGreaterThanOrEqual(3)
  })

  it.each(files.map((f) => [f]))("%s reads result.error", (file) => {
    // Comments explaining the trap must not be what satisfies the check.
    const src = stripComments(readFileSync(file, "utf8"))
    // Each of these files awaits a send and must branch on `.error` before
    // treating it as delivered. This is a coarse check on purpose: it catches
    // the whole class (a send whose result is never inspected) without pinning
    // the exact shape of each caller's handling.
    expect(/result\.error|\.error\b/.test(src), `${file}: send result never inspected`).toBe(true)
  })
})
