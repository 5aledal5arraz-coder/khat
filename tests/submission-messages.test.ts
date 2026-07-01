/**
 * Unit coverage for the submission outreach templates — now that they live in a
 * module (extracted from the 3k-line submissions-tabs.tsx) they can be tested
 * directly: name interpolation + the formal/warm tone branch.
 */

import { describe, expect, it } from "vitest"
import {
  timeAgo,
  generateAcceptanceMessage,
  generateRejectionMessage,
  generateSponsorResponseMessage,
  generateSponsorDeclineMessage,
  type MessageTone,
} from "@/app/admin/submissions/submission-messages"

const GENERATORS = [
  generateAcceptanceMessage,
  generateRejectionMessage,
  generateSponsorResponseMessage,
  generateSponsorDeclineMessage,
]

describe("submission message templates", () => {
  it("interpolate the recipient name in both tones", () => {
    for (const gen of GENERATORS) {
      for (const tone of ["formal", "warm"] as MessageTone[]) {
        const msg = gen("سارة", tone)
        expect(msg).toContain("سارة")
        expect(msg.length).toBeGreaterThan(20)
        expect(msg).toContain("خط")
      }
    }
  })

  it("produce distinct copy for formal vs warm", () => {
    for (const gen of GENERATORS) {
      expect(gen("Name", "formal")).not.toBe(gen("Name", "warm"))
    }
  })

  it("acceptance and rejection are different messages", () => {
    expect(generateAcceptanceMessage("A", "warm")).not.toBe(
      generateRejectionMessage("A", "warm"),
    )
  })
})

describe("timeAgo", () => {
  it("labels today / yesterday and falls back for old dates", () => {
    const now = new Date()
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000)
    expect(timeAgo(now.toISOString())).toBe("اليوم")
    expect(timeAgo(yesterday.toISOString())).toBe("أمس")
    // ~10 days ago → "منذ N أيام" is only for <7; 10 days → weeks bucket
    const tenDaysAgo = new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000)
    expect(timeAgo(tenDaysAgo.toISOString())).toContain("أسابيع")
  })
})
