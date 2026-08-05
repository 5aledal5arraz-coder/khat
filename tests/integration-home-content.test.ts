/**
 * Integration tests: Homepage content — home quotes, daily reflections, static content.
 */
import { describe, it, expect, vi, beforeEach } from "vitest"

import { mockDb, mockSelectResult, resetMock } from "./db-mock"
vi.mock("@/lib/db", () => ({ db: mockDb, pool: {}, USE_DB: true }))

// Home Quotes

// Daily Reflections

// Static Content
import {
  getAboutContent,
  saveAboutContent,
} from "@/lib/content/static-content"

describe("Static Content — About Page", () => {
  beforeEach(() => resetMock())

  it("getAboutContent returns defaults when no DB row", async () => {
    mockSelectResult([]) // no row

    const about = await getAboutContent()

    expect(about.hostName).toBe("بودكاست خط")
    expect(about.missionQuote).toBeTruthy()
  })

  it("getAboutContent returns DB content when row exists", async () => {
    mockSelectResult([
      {
        key: "about",
        content: {
          hostName: "Custom Host",
          hostTitle: "Custom Title",
          hostDescription: "Custom Desc",
          hostPhoto: "",
          hostImageUrl: "",
          welcomeVideoId: "",
          welcomeVideoUrl: "",
          welcomeVideoPosterUrl: "",
          missionQuote: "Custom mission",
          ctaTitle: "CTA",
          ctaDescription: "CTA desc",
          socialLinks: [],
          values: [],
          teamMembers: [],
        },
        updated_at: new Date(),
      },
    ])

    const about = await getAboutContent()
    expect(about.hostName).toBe("Custom Host")
    expect(about.missionQuote).toBe("Custom mission")
  })

  it("saveAboutContent calls insert with upsert", async () => {
    await saveAboutContent({
      hostName: "Test",
      hostTitle: "T",
      hostDescription: "D",
      hostPhoto: "",
      hostImageUrl: "",
      welcomeVideoId: "",
      welcomeVideoUrl: "",
      welcomeVideoPosterUrl: "",
      missionQuote: "M",
      ctaTitle: "C",
      ctaDescription: "CD",
      socialLinks: [],
      values: [],
      teamMembers: [],
    })

    expect(mockDb.insert).toHaveBeenCalled()
  })
})
